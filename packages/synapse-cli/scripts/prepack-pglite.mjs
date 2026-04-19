#!/usr/bin/env node

// prepack-pglite.mjs
// Prepares the synapse-cli package for npm publish.
// Handles pnpm's symlink-based node_modules by:
// 1. Copying standalone output as-is (preserving symlinks)
// 2. Dereferencing top-level package symlinks individually
// 3. Handling scoped packages (@scope/pkg)
// 4. Removing .pnpm directory

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

// --- Clean and copy standalone (preserving symlinks initially) ---
if (existsSync(DIST)) rmSync(DIST, { recursive: true });
mkdirSync(DIST, { recursive: true });

console.log("[prepack] Copying standalone output...");
cpSync(STANDALONE, DIST, { recursive: true });

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

// --- Dereference pnpm symlinks in dist/node_modules ---
const nmDir = join(DIST, "node_modules");
if (existsSync(nmDir)) {
  console.log("[prepack] Dereferencing pnpm symlinks...");
  let count = 0;

  for (const entry of readdirSync(nmDir)) {
    if (entry === ".pnpm" || entry === ".package-lock.json") continue;

    const target = join(nmDir, entry);
    const stat = lstatSync(target);

    if (stat.isSymbolicLink()) {
      deref(target);
      count++;
    } else if (stat.isDirectory() && entry.startsWith("@")) {
      // Scoped packages: dereference entries inside @scope/
      for (const sub of readdirSync(target)) {
        const subTarget = join(target, sub);
        const subStat = lstatSync(subTarget);
        if (subStat.isSymbolicLink()) {
          deref(subTarget);
          count++;
        }
      }
    }
  }

  console.log(`[prepack] Dereferenced ${count} packages`);

  // Remove .pnpm directory
  const pnpmDir = join(nmDir, ".pnpm");
  if (existsSync(pnpmDir)) {
    console.log("[prepack] Removing .pnpm directory...");
    rmSync(pnpmDir, { recursive: true, force: true });
  }
}

console.log("[prepack] Done. dist/ is ready for npm publish.");

// --- Helpers ---

function deref(symlinkPath) {
  try {
    const realPath = realpathSync(symlinkPath);
    rmSync(symlinkPath, { force: true });
    cpSync(realPath, symlinkPath, { recursive: true, dereference: true });
  } catch (err) {
    console.warn(`[prepack] Warning: could not dereference ${symlinkPath}: ${err.message}`);
  }
}
