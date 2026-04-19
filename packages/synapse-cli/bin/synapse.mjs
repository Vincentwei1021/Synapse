#!/usr/bin/env node

// Synapse CLI — Zero-dependency local mode
// Starts embedded PGlite + Next.js standalone server

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync, fork } from "child_process";
import { homedir } from "os";
import { createHash, randomUUID } from "crypto";
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

// --- Run migrations ---
console.log("  Running migrations...");
const origSchemaPath = join(DIST_DIR, "prisma", "schema.prisma");
const migrationsDir = join(DIST_DIR, "prisma", "migrations");
if (existsSync(migrationsDir) && existsSync(origSchemaPath)) {
  // Prisma 7 requires datasource url in schema. Copy schema + migrations
  // to a writable temp dir and inject the url there.
  const tmpPrisma = join(dataDir, "_prisma_tmp");
  mkdirSync(join(tmpPrisma, "migrations"), { recursive: true });

  // Copy migrations
  const { cpSync } = await import("node:fs");
  cpSync(join(DIST_DIR, "prisma", "migrations"), join(tmpPrisma, "migrations"), { recursive: true });

  // Copy schema as-is
  const { cpSync: cpFile } = await import("node:fs");
  cpFile(origSchemaPath, join(tmpPrisma, "schema.prisma"));

  // Prisma 7 requires prisma.config.ts/js for the datasource URL
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
      `npx prisma migrate deploy --config ${join(tmpPrisma, "prisma.config.js")}`,
      {
        cwd: tmpPrisma,
        stdio: "pipe",
        env: { ...process.env },
      },
    );
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    console.error("  Migration failed:", stderr);
    process.exit(1);
  }
} else {
  console.warn("  No migrations directory found, skipping...");
}

// --- Seed default user if empty ---
const defaultEmail = process.env.DEFAULT_USER || "admin@synapse.local";
const defaultPassword = process.env.DEFAULT_PASSWORD || "synapse";

try {
  // Use pg to directly query and seed
  const pgMod = await import(join(DIST_DIR, "node_modules", "pg", "lib", "index.js"));
  const pg = pgMod.default || pgMod;
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  const { rows } = await pool.query('SELECT COUNT(*) as count FROM "Company"');
  const count = parseInt(rows[0].count, 10);

  if (count === 0) {
    const bcrypt = await import("bcrypt");
    const passwordHash = await bcrypt.hash(defaultPassword, 10);
    const companyUuid = randomUUID();
    const userUuid = randomUUID();

    await pool.query(
      `INSERT INTO "Company" (uuid, name, "createdAt", "updatedAt") VALUES ($1, $2, NOW(), NOW())`,
      [companyUuid, "Synapse Local"],
    );
    await pool.query(
      `INSERT INTO "User" (uuid, "companyUuid", email, "passwordHash", name, role, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [userUuid, companyUuid, defaultEmail, passwordHash, "Admin", "pi"],
    );
    console.log(`  Default login: ${defaultEmail} / ${defaultPassword}`);
  }

  await pool.end();
} catch (err) {
  console.warn("  Seed check skipped:", err.message);
}

// --- Start Next.js standalone server ---
const serverJs = join(DIST_DIR, "server.js");
if (!existsSync(serverJs)) {
  console.error("  Error: standalone server.js not found in dist/");
  console.error("  This package may not have been built correctly.");
  process.exit(1);
}

process.env.PORT = String(port);
process.env.HOSTNAME = "0.0.0.0";
process.env.NEXTAUTH_SECRET =
  process.env.NEXTAUTH_SECRET ||
  createHash("sha256").update(`synapse-local-${dataDir}`).digest("hex");

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
