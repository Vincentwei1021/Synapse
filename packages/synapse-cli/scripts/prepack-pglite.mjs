#!/usr/bin/env node

// prepack-pglite.mjs
// Prepares the synapse-cli package for npm publish:
// 1. Builds Next.js standalone output
// 2. Copies standalone + static + public + migrations into dist/
// 3. Dereferences pnpm symlinks so npm pack works correctly

import { execSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  cpSync,
  rmSync,
  readdirSync,
  lstatSync,
  readlinkSync,
  unlinkSync,
} from "fs";
import { resolve, join } from "path";
import { fileURLToPath, URL } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const CLI_ROOT = resolve(__dirname, "..");
const PROJECT_ROOT = resolve(CLI_ROOT, "..", "..");
const DIST = join(CLI_ROOT, "dist");

console.log("[prepack] Building Next.js standalone...");
execSync("pnpm build", { cwd: PROJECT_ROOT, stdio: "inherit" });

const STANDALONE = join(PROJECT_ROOT, ".next", "standalone");
if (!existsSync(STANDALONE)) {
  console.error("[prepack] ERROR: .next/standalone not found. Build failed?");
  process.exit(1);
}

// Clean and recreate dist
if (existsSync(DIST)) rmSync(DIST, { recursive: true });
mkdirSync(DIST, { recursive: true });

// Copy standalone output
console.log("[prepack] Copying standalone output...");
cpSync(STANDALONE, DIST, { recursive: true });

// Copy static assets
const staticSrc = join(PROJECT_ROOT, ".next", "static");
const staticDest = join(DIST, ".next", "static");
if (existsSync(staticSrc)) {
  console.log("[prepack] Copying static assets...");
  mkdirSync(staticDest, { recursive: true });
  cpSync(staticSrc, staticDest, { recursive: true });
}

// Copy public
const publicSrc = join(PROJECT_ROOT, "public");
const publicDest = join(DIST, "public");
if (existsSync(publicSrc)) {
  console.log("[prepack] Copying public assets...");
  cpSync(publicSrc, publicDest, { recursive: true });
}

// Copy prisma migrations + schema
const prismaSrc = join(PROJECT_ROOT, "prisma");
const prismaDest = join(DIST, "prisma");
if (existsSync(prismaSrc)) {
  console.log("[prepack] Copying Prisma migrations...");
  mkdirSync(prismaDest, { recursive: true });
  cpSync(prismaSrc, prismaDest, { recursive: true });
}

// Dereference all symlinks in dist/node_modules
console.log("[prepack] Dereferencing pnpm symlinks...");
function dereferenceSymlinks(dir) {
  if (!existsSync(dir)) return;

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = lstatSync(fullPath);

    if (stat.isSymbolicLink()) {
      const target = readlinkSync(fullPath);
      const resolvedTarget = resolve(dir, target);

      if (existsSync(resolvedTarget)) {
        unlinkSync(fullPath);
        cpSync(resolvedTarget, fullPath, {
          recursive: true,
          dereference: true,
        });
      }
    } else if (stat.isDirectory()) {
      dereferenceSymlinks(fullPath);
    }
  }
}

dereferenceSymlinks(join(DIST, "node_modules"));

console.log("[prepack] Done. dist/ is ready for npm publish.");
