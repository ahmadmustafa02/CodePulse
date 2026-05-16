/** Flattens dist/client (with prerendered HTML) into dist/ for Vercel static hosting. */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const clientDir = join(root, "dist", "client");
const distDir = join(root, "dist");
const stagingDir = join(root, ".vercel-dist-staging");

if (!existsSync(clientDir)) {
  console.error("prepare-vercel-dist: dist/client not found — run vite build first");
  process.exit(1);
}

rmSync(stagingDir, { recursive: true, force: true });
cpSync(clientDir, stagingDir, { recursive: true });
rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
cpSync(stagingDir, distDir, { recursive: true });
rmSync(stagingDir, { recursive: true, force: true });

for (const artifact of ["wrangler.json", ".assetsignore"]) {
  rmSync(join(distDir, artifact), { force: true });
}

console.log("prepare-vercel-dist: static assets ready in dist/");
