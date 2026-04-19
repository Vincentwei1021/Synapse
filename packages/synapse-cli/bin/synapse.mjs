#!/usr/bin/env node

// Synapse CLI — Zero-dependency local mode
// Starts embedded PGlite + Next.js standalone server

import { existsSync, mkdirSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import { exec, fork } from "child_process";
import { promisify } from "util";
import { homedir } from "os";
import { createHash, randomUUID } from "crypto";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = resolve(__dirname, "..", "dist");

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
let pgliteDb = null;

if (!useExternalDb) {
  // --- Start PGlite ---
  console.log("  Starting embedded database...");

  const pgliteDir = join(dataDir, "pglite");
  mkdirSync(pgliteDir, { recursive: true });

  const { PGlite } = await import("@electric-sql/pglite");
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");

  pgliteDb = new PGlite(pgliteDir);
  const pglitePort = port + 1000;
  const socketServer = new PGLiteSocketServer({
    db: pgliteDb,
    port: pglitePort,
    host: "127.0.0.1",
  });
  await socketServer.start();

  process.env.DATABASE_URL = `postgresql://localhost:${pglitePort}/synapse`;
  process.env.SYNAPSE_PGLITE = "1";
  console.log(`  Embedded database listening on port ${pglitePort}`);
}

// --- Push schema to database ---
console.log("  Setting up database schema...");
const schemaPath = join(DIST_DIR, "prisma", "schema.prisma");
if (existsSync(schemaPath)) {
  try {
    const { stdout, stderr } = await execAsync(
      `npx prisma db push --schema ${schemaPath} --url "${process.env.DATABASE_URL}" --accept-data-loss`,
      {
        cwd: DIST_DIR,
        env: { ...process.env },
      },
    );
    if (stdout) console.log("  " + stdout.trim().split("\n").pop());
  } catch (err) {
    console.error("  Schema push failed:", err.stderr || err.message);
    process.exit(1);
  }
}

// --- Seed default user if empty ---
const defaultEmail = process.env.DEFAULT_USER || "admin@synapse.local";
const defaultPassword = process.env.DEFAULT_PASSWORD || "synapse";

try {
  if (pgliteDb) {
    // PGlite mode: seed via direct SQL on the db instance
    const { rows } = await pgliteDb.query("SELECT COUNT(*) as count FROM \"Company\"");
    const count = parseInt(rows[0].count, 10);
    if (count === 0) {
      const bcrypt = await import("bcrypt");
      const passwordHash = await bcrypt.hash(defaultPassword, 10);
      const companyUuid = randomUUID();
      const userUuid = randomUUID();

      await pgliteDb.query(
        `INSERT INTO "Company" (uuid, name, "createdAt", "updatedAt") VALUES ($1, $2, NOW(), NOW())`,
        [companyUuid, "Synapse Local"]
      );
      await pgliteDb.query(
        `INSERT INTO "User" (uuid, "companyUuid", email, "passwordHash", name, role, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [userUuid, companyUuid, defaultEmail, passwordHash, "Admin", "pi"]
      );
      console.log(`  Default login: ${defaultEmail} / ${defaultPassword}`);
    }
  }
} catch (err) {
  // Table might not exist yet on first schema push, that's OK
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

child.on("exit", (code) => process.exit(code ?? 0));

console.log(`  Synapse is running at http://localhost:${port}`);
console.log("");

// Graceful shutdown
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    child.kill(sig);
    process.exit(0);
  });
}
