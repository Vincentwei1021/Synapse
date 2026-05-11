#!/usr/bin/env node

// Synapse CLI — Zero-dependency local mode
// Starts embedded PGlite + Next.js standalone server

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync, fork } from "child_process";
import { homedir } from "os";
import { createHash } from "crypto";
import { createConnection } from "net";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = resolve(__dirname, "..", "dist");
const PKG_ROOT = resolve(__dirname, "..");

// --- Parse CLI arguments ---
const args = process.argv.slice(2);
let port = 13000;
let dataDir = join(homedir(), ".synapse", "data");

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" && args[i + 1]) {
    port = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === "--data-dir" && args[i + 1]) {
    dataDir = resolve(args[i + 1]);
    i++;
  } else if (args[i] === "--help" || args[i] === "-h") {
    console.log(`
Synapse — AI Research Orchestration Platform

Usage:
  synapse [options]

Options:
  --port <number>      Port to listen on (default: 13000)
  --data-dir <path>    Data directory (default: ~/.synapse/data)
  --help, -h           Show this help message

Environment variables:
  DATABASE_URL         Use external PostgreSQL (skips embedded PGlite)
  REDIS_URL            Use external Redis (default: in-memory fallback)
  DEFAULT_USER         Default login email (default: admin@synapse.local)
  DEFAULT_PASSWORD     Default login password (default: synapse)
`);
    process.exit(0);
  }
}

// --- Banner ---
console.log("");
console.log("  Starting Synapse...");
console.log(`  Data directory: ${dataDir}`);

// --- Ensure data directory exists ---
mkdirSync(dataDir, { recursive: true });

// Clear env vars that may have been baked into the Next.js build from the build machine's .env
if (!process.env.REDIS_URL) delete process.env.REDIS_URL;
if (!process.env.REDIS_HOST) delete process.env.REDIS_HOST;

const useExternalDb = !!process.env.DATABASE_URL;
let pgliteProcess = null;

if (!useExternalDb) {
  // --- Start PGlite as a forked process ---
  console.log("  Starting embedded database...");

  const pgliteDir = join(dataDir, "pglite");
  mkdirSync(pgliteDir, { recursive: true });

  const pglitePort = port + 1000;

  // Fork the pglite-socket server script
  const serverScript = join(
    PKG_ROOT,
    "node_modules",
    "@electric-sql",
    "pglite-socket",
    "dist",
    "scripts",
    "server.js",
  );

  pgliteProcess = fork(serverScript, [
    `--db=${pgliteDir}`,
    `--port=${pglitePort}`,
    "--max-connections=10",
  ], {
    stdio: ["pipe", "pipe", "pipe", "ipc"],
  });

  // Wait for TCP to be ready
  await waitForTcp("127.0.0.1", pglitePort, 30000);
  console.log(`  Embedded database listening on port ${pglitePort}`);

  process.env.DATABASE_URL = `postgresql://postgres:postgres@localhost:${pglitePort}/postgres?sslmode=disable`;
  process.env.SYNAPSE_PGLITE = "1";
}

// --- Sync schema ---
// Zero-dependency CLI syncs the bundled schema.prisma directly against the
// local database via `prisma db push`. This is idempotent: new installs create
// tables, upgrades add missing columns/tables. We deliberately do not use
// `migrate deploy` because the repo's schema evolves via `db push` in dev and
// committed migrations lag behind the canonical schema.
console.log("  Syncing schema...");
const origSchemaPath = join(DIST_DIR, "prisma", "schema.prisma");
if (existsSync(origSchemaPath)) {
  // Prisma 7 requires datasource url in schema or config. Copy schema to a
  // writable temp dir and provide a prisma.config.js that injects DATABASE_URL.
  const tmpPrisma = join(dataDir, "_prisma_tmp");
  mkdirSync(tmpPrisma, { recursive: true });

  const { cpSync: cpFile } = await import("node:fs");
  cpFile(origSchemaPath, join(tmpPrisma, "schema.prisma"));

  writeFileSync(join(tmpPrisma, "prisma.config.js"), `
module.exports = {
  schema: "./schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
};
`);

  try {
    execSync(
      `npx prisma db push --accept-data-loss --config ${join(tmpPrisma, "prisma.config.js")}`,
      {
        cwd: tmpPrisma,
        stdio: "pipe",
        env: { ...process.env },
      },
    );
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    console.error("  Schema sync failed:", stderr);
    process.exit(1);
  }
} else {
  console.warn("  No schema.prisma found, skipping...");
}

// --- Default auth (auto-provisions on first login) ---
const defaultEmail = process.env.DEFAULT_USER || "admin@synapse.local";
const defaultPassword = process.env.DEFAULT_PASSWORD || "synapse";
process.env.DEFAULT_USER = defaultEmail;
process.env.DEFAULT_PASSWORD = defaultPassword;
console.log(`  Default login: ${defaultEmail} / ${defaultPassword}`);

// --- Start Next.js standalone server ---
const serverJs = join(DIST_DIR, "server.js");
if (!existsSync(serverJs)) {
  console.error("  Error: standalone server.js not found in dist/");
  console.error("  This package may not have been built correctly.");
  process.exit(1);
}

// .next/cache writability is ensured by postinstall script (chmod 777).
// If missing, try to create. Non-fatal if it fails.
const distCacheDir = join(DIST_DIR, ".next", "cache");
if (!existsSync(distCacheDir)) {
  try { mkdirSync(distCacheDir, { recursive: true }); } catch { /* non-fatal */ }
}

process.env.PORT = String(port);
process.env.HOSTNAME = "0.0.0.0";
process.env.NEXTAUTH_SECRET =
  process.env.NEXTAUTH_SECRET ||
  createHash("sha256").update(`synapse-local-${dataDir}`).digest("hex");
// Zero-dependency CLI mode always serves over HTTP. Browsers discard cookies
// with the Secure flag on HTTP, which logs users out on every request.
// Default to insecure cookies unless the operator explicitly opts in.
if (process.env.COOKIE_SECURE === undefined) {
  process.env.COOKIE_SECURE = "false";
}

const child = fork(serverJs, [], {
  cwd: DIST_DIR,
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code) => {
  if (pgliteProcess) pgliteProcess.kill();
  process.exit(code ?? 0);
});

console.log(`  Synapse is running at http://localhost:${port}`);
console.log("");

// Graceful shutdown
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    child.kill(sig);
    if (pgliteProcess) pgliteProcess.kill();
    process.exit(0);
  });
}

// --- Helpers ---
function waitForTcp(host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    function attempt() {
      const socket = createConnection({ host, port });
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`Timeout waiting for ${host}:${port}`));
        } else {
          setTimeout(attempt, 200);
        }
      });
    }
    attempt();
  });
}
