#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BUILDS_DIR = path.join(ROOT, 'builds');
const DIST_DIR = path.join(ROOT, 'dist', 'nightly');
const PRODUCT_NAME = 'Last Singularity';
const PRODUCT_SLUG = 'last-singularity';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function latestBuildDir() {
  if (!fs.existsSync(BUILDS_DIR)) {
    throw new Error(`Builds directory not found: ${BUILDS_DIR}`);
  }
  const entries = fs.readdirSync(BUILDS_DIR)
    .map((name) => ({ name, full: path.join(BUILDS_DIR, name) }))
    .filter((entry) => fs.existsSync(entry.full) && fs.statSync(entry.full).isDirectory())
    .sort((a, b) => fs.statSync(b.full).mtimeMs - fs.statSync(a.full).mtimeMs);

  if (entries.length === 0) {
    throw new Error(`No build directories found in ${BUILDS_DIR}`);
  }
  return entries[0].full;
}

function copyIfExists(from, to) {
  if (!fs.existsSync(from)) return false;
  fs.cpSync(from, to, { recursive: true, force: true });
  return true;
}

function main() {
  const buildDir = latestBuildDir();
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  ensureDir(DIST_DIR);

  const manifestPath = path.join(buildDir, 'BUILD-MANIFEST.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing build manifest: ${manifestPath}`);
  }

  fs.copyFileSync(manifestPath, path.join(DIST_DIR, 'BUILD-MANIFEST.json'));

  const copied = {
    web: copyIfExists(path.join(buildDir, `${PRODUCT_SLUG}-web`), path.join(DIST_DIR, 'web')),
    mac: copyIfExists(path.join(buildDir, `${PRODUCT_NAME}.app`), path.join(DIST_DIR, `${PRODUCT_NAME}.app`)),
    win: copyIfExists(path.join(buildDir, `${PRODUCT_NAME}-win32-x64`), path.join(DIST_DIR, `${PRODUCT_NAME}-win32-x64`)),
    startHere: copyIfExists(path.join(buildDir, 'START-HERE.md'), path.join(DIST_DIR, 'START-HERE.md')),
  };

  fs.writeFileSync(
    path.join(DIST_DIR, 'nightly-assets.json'),
    JSON.stringify(
      {
        buildDir,
        generatedAt: new Date().toISOString(),
        copied,
      },
      null,
      2,
    ) + '\n',
  );

  console.log(JSON.stringify({ ok: true, buildDir, distDir: DIST_DIR, copied }, null, 2));
}

main();
