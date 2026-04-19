#!/usr/bin/env node

// prepack-pglite.mjs
// Prepares the synapse-cli package for npm publish.
// Handles pnpm's symlink-based node_modules by:
// 1. Copying standalone output as-is
// 2. Hoisting all packages from .pnpm to top-level node_modules
// 3. Dereferencing top-level symlinks
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

// --- Clean and copy standalone ---
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

// --- Hoist and dereference pnpm packages ---
const nmDir = join(DIST, "node_modules");
const pnpmDir = join(nmDir, ".pnpm");

if (existsSync(nmDir)) {
  // Step 1: Hoist all packages from .pnpm/*/node_modules/* to top-level
  if (existsSync(pnpmDir)) {
    console.log("[prepack] Hoisting packages from .pnpm...");
    let hoisted = 0;

    for (const pnpmEntry of readdirSync(pnpmDir)) {
      const innerNm = join(pnpmDir, pnpmEntry, "node_modules");
      if (!existsSync(innerNm)) continue;

      for (const pkg of readdirSync(innerNm)) {
        if (pkg === ".pnpm") continue;

        const srcPath = join(innerNm, pkg);
        const stat = lstatSync(srcPath);

        if (pkg.startsWith("@")) {
          // Scoped package: hoist entries inside it
          if (!stat.isDirectory()) continue;
          for (const subPkg of readdirSync(srcPath)) {
            const subSrc = join(srcPath, subPkg);
            const subDest = join(nmDir, pkg, subPkg);
            if (!existsSync(subDest)) {
              mkdirSync(join(nmDir, pkg), { recursive: true });
              const realPath = stat.isSymbolicLink ? realpathSync(subSrc) : subSrc;
              cpSync(realPath, subDest, { recursive: true, dereference: true });
              hoisted++;
            }
          }
        } else {
          // Regular package
          const destPath = join(nmDir, pkg);
          if (!existsSync(destPath)) {
            const realPath = stat.isSymbolicLink() ? realpathSync(srcPath) : srcPath;
            cpSync(realPath, destPath, { recursive: true, dereference: true });
            hoisted++;
          }
        }
      }
    }

    console.log(`[prepack] Hoisted ${hoisted} packages`);
  }

  // Step 2: Dereference remaining top-level symlinks
  console.log("[prepack] Dereferencing top-level symlinks...");
  let derefCount = 0;

  for (const entry of readdirSync(nmDir)) {
    if (entry === ".pnpm" || entry === ".package-lock.json") continue;

    const target = join(nmDir, entry);
    const stat = lstatSync(target);

    if (stat.isSymbolicLink()) {
      deref(target);
      derefCount++;
    } else if (stat.isDirectory() && entry.startsWith("@")) {
      for (const sub of readdirSync(target)) {
        const subTarget = join(target, sub);
        if (lstatSync(subTarget).isSymbolicLink()) {
          deref(subTarget);
          derefCount++;
        }
      }
    }
  }

  console.log(`[prepack] Dereferenced ${derefCount} symlinks`);

  // Step 3: Remove .pnpm
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
