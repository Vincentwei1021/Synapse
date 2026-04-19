#!/usr/bin/env node

// Synapse CLI — Zero-dependency local mode
// Starts embedded PGlite + Next.js standalone server

import { existsSync, mkdirSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync, fork } from "child_process";
import { homedir } from "os";
import { createHash } from "crypto";

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

if (!useExternalDb) {
  // --- Start PGlite ---
  console.log("  Starting embedded database...");

  const pgliteDir = join(dataDir, "pglite");
  mkdirSync(pgliteDir, { recursive: true });

  const { PGlite } = await import("@electric-sql/pglite");
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");

  const db = new PGlite(pgliteDir);
  const pglitePort = port + 1000;
  const socketServer = new PGLiteSocketServer({
    db,
    port: pglitePort,
    host: "127.0.0.1",
  });
  await socketServer.start();

  process.env.DATABASE_URL = `postgresql://localhost:${pglitePort}/synapse`;
  process.env.SYNAPSE_PGLITE = "1";
}

// --- Push schema to database ---
console.log("  Setting up database schema...");
const schemaPath = join(DIST_DIR, "prisma", "schema.prisma");
if (existsSync(schemaPath)) {
  try {
    execSync(
      `npx prisma db push --schema ${schemaPath} --skip-generate --accept-data-loss`,
      {
        cwd: DIST_DIR,
        stdio: "pipe",
        env: { ...process.env },
      },
    );
  } catch (err) {
    console.error("  Schema push failed:", err.message);
    process.exit(1);
  }
}

// --- Seed default user if empty ---
const defaultEmail = process.env.DEFAULT_USER || "admin@synapse.local";
const defaultPassword = process.env.DEFAULT_PASSWORD || "synapse";

try {
  // Dynamic import of the generated Prisma client from dist
  const prismaClientPath = join(DIST_DIR, "node_modules", ".prisma", "client", "index.js");
  if (existsSync(prismaClientPath)) {
    const { PrismaClient } = await import(prismaClientPath);
    const seedPrisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
    });

    const companyCount = await seedPrisma.company.count();
    if (companyCount === 0) {
      const bcrypt = await import("bcrypt");
      const passwordHash = await bcrypt.hash(defaultPassword, 10);

      const company = await seedPrisma.company.create({
        data: { name: "Synapse Local" },
      });

      await seedPrisma.user.create({
        data: {
          companyUuid: company.uuid,
          email: defaultEmail,
          passwordHash,
          name: "Admin",
          role: "pi",
        },
      });

      console.log(`  Default login: ${defaultEmail} / ${defaultPassword}`);
    }

    await seedPrisma.$disconnect();
  }
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
process.env.HOSTNAME = "127.0.0.1";
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
