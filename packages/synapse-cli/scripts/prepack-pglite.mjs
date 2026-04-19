#!/usr/bin/env node

// prepack-pglite.mjs
// Prepares the synapse-cli package for npm publish:
// 1. Builds Next.js standalone output
// 2. Copies standalone + static + public + migrations into dist/
// 3. Dereferences ALL pnpm symlinks at every depth
// 4. Removes .pnpm directory

import { execSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  cpSync,
  rmSync,
  readdirSync,
  lstatSync,
  realpathSync,
} from "fs";
import { resolve, join } from "path";
import { fileURLToPath, URL } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const CLI_ROOT = resolve(__dirname, "..");
const PROJECT_ROOT = resolve(CLI_ROOT, "..", "..");
const DIST = join(CLI_ROOT, "dist");

// --- Build ---
console.log("[prepack] Building Next.js standalone...");
execSync("pnpm build", {
  cwd: PROJECT_ROOT,
  stdio: "inherit",
  env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=4096" },
});

const STANDALONE = join(PROJECT_ROOT, ".next", "standalone");
if (!existsSync(STANDALONE)) {
  console.error("[prepack] ERROR: .next/standalone not found. Build failed?");
  process.exit(1);
}

// --- Clean and copy standalone (with dereference) ---
if (existsSync(DIST)) rmSync(DIST, { recursive: true });
mkdirSync(DIST, { recursive: true });

console.log("[prepack] Copying standalone output (dereferencing all symlinks)...");
cpSync(STANDALONE, DIST, { recursive: true, dereference: true });

// --- Copy static assets ---
const staticSrc = join(PROJECT_ROOT, ".next", "static");
const staticDest = join(DIST, ".next", "static");
if (existsSync(staticSrc)) {
  console.log("[prepack] Copying static assets...");
  mkdirSync(staticDest, { recursive: true });
  cpSync(staticSrc, staticDest, { recursive: true });
}

// --- Copy public ---
const publicSrc = join(PROJECT_ROOT, "public");
const publicDest = join(DIST, "public");
if (existsSync(publicSrc)) {
  console.log("[prepack] Copying public assets...");
  cpSync(publicSrc, publicDest, { recursive: true });
}

// --- Copy prisma migrations + schema ---
const prismaSrc = join(PROJECT_ROOT, "prisma");
const prismaDest = join(DIST, "prisma");
if (existsSync(prismaSrc)) {
  console.log("[prepack] Copying Prisma schema and migrations...");
  if (existsSync(prismaDest)) rmSync(prismaDest, { recursive: true });
  mkdirSync(prismaDest, { recursive: true });
  cpSync(prismaSrc, prismaDest, { recursive: true });
}

// --- Remove .pnpm if it was copied ---
const pnpmDir = join(DIST, "node_modules", ".pnpm");
if (existsSync(pnpmDir)) {
  console.log("[prepack] Removing .pnpm directory...");
  rmSync(pnpmDir, { recursive: true, force: true });
}

console.log("[prepack] Done. dist/ is ready for npm publish.");
