#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, execSync } = require('child_process');
const packagerModule = require('@electron/packager');
const packager = packagerModule.packager || packagerModule.default || packagerModule;

const ROOT = path.resolve(__dirname, '..');
const PKG = require(path.join(ROOT, 'package.json'));
const BUILD_ROOT = path.join(ROOT, 'builds');
const STAGING_ROOT = path.join(ROOT, 'release-staging');

const TARGET_ALIASES = {
  web: 'web',
  mac: 'mac',
  darwin: 'mac',
  win: 'win',
  windows: 'win',
  win32: 'win',
};

function parseTargets(argv) {
  const arg = argv.find((item) => item.startsWith('--targets='));
  const raw = arg ? arg.split('=')[1] : 'web,mac,win';
  return raw
    .split(',')
    .map((item) => TARGET_ALIASES[item.trim().toLowerCase()])
    .filter(Boolean);
}

function stamp(now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join('-') + '-' + [
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function removeIfExists(target) {
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
}

function copyIfExists(from, to) {
  if (fs.existsSync(from)) fs.cpSync(from, to, { recursive: true });
}

function gitInfo() {
  const run = (command) =>
    execSync(command, { cwd: ROOT, encoding: 'utf8' }).trim();
  return {
    commit: run('git rev-parse --short HEAD'),
    branch: run('git rev-parse --abbrev-ref HEAD'),
  };
}

function writeJson(filepath, value) {
  fs.writeFileSync(filepath, JSON.stringify(value, null, 2) + '\n');
}

function makeBuildInfo(base) {
  return {
    project: 'last-black-hole',
    version: PKG.version,
    builtAt: new Date().toISOString(),
    host: {
      platform: process.platform,
      arch: process.arch,
      hostname: os.hostname(),
    },
    git: gitInfo(),
    ...base,
  };
}

function copyWebRuntime(rendererDir) {
  ensureDir(rendererDir);
  fs.copyFileSync(path.join(ROOT, 'index-a.html'), path.join(rendererDir, 'index.html'));
  fs.copyFileSync(path.join(ROOT, 'index-a.html'), path.join(rendererDir, 'index-a.html'));
  copyIfExists(path.join(ROOT, 'src'), path.join(rendererDir, 'src'));
  copyIfExists(path.join(ROOT, 'assets'), path.join(rendererDir, 'assets'));
}

function zipDir(sourceDir, zipPath) {
  if (process.platform === 'darwin') {
    execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', sourceDir, zipPath], {
      cwd: path.dirname(sourceDir),
      stdio: 'inherit',
    });
    return;
  }

  execFileSync('zip', ['-rq', zipPath, path.basename(sourceDir)], {
    cwd: path.dirname(sourceDir),
    stdio: 'inherit',
  });
}

function buildWeb(targetRoot) {
  const webDir = path.join(targetRoot, 'last-black-hole-web');
  removeIfExists(webDir);
  ensureDir(webDir);

  copyWebRuntime(webDir);

  writeJson(
    path.join(webDir, 'BUILD-INFO.json'),
    makeBuildInfo({
      target: 'web',
      entrypointSource: 'index-a.html',
      entrypointArtifact: 'index.html',
    })
  );

  const zipPath = path.join(targetRoot, 'last-black-hole-web.zip');
  removeIfExists(zipPath);
  zipDir(webDir, zipPath);

  return {
    target: 'web',
    outputDir: webDir,
    zip: zipPath,
    status: 'built',
  };
}

function stageElectronShell() {
  removeIfExists(STAGING_ROOT);
  ensureDir(STAGING_ROOT);

  const shellPkg = {
    name: 'last-black-hole-shell',
    productName: 'Last Black Hole',
    version: PKG.version,
    main: 'electron-main.cjs',
  };

  fs.writeFileSync(
    path.join(STAGING_ROOT, 'package.json'),
    JSON.stringify(shellPkg, null, 2) + '\n'
  );

  fs.copyFileSync(
    path.join(ROOT, 'desktop', 'electron-main.cjs'),
    path.join(STAGING_ROOT, 'electron-main.cjs')
  );

  copyWebRuntime(path.join(STAGING_ROOT, 'renderer'));
}

async function buildElectronTarget(targetRoot, target) {
  stageElectronShell();

  const platform = target === 'mac' ? 'darwin' : 'win32';
  const arch = target === 'mac'
    ? (process.arch === 'arm64' ? 'arm64' : 'x64')
    : 'x64';

  const outDir = path.join(targetRoot, target);
  removeIfExists(outDir);
  ensureDir(outDir);

  const appPaths = await packager({
    dir: STAGING_ROOT,
    out: outDir,
    overwrite: true,
    platform,
    arch,
    executableName: 'Last Black Hole',
    appCopyright: 'Last Black Hole playtest build',
    prune: false,
    quiet: true,
  });

  const result = {
    target,
    platform,
    arch,
    outputDir: outDir,
    appPaths,
    status: 'built',
  };

  const packagedRoot = appPaths[0];
  if (packagedRoot) {
    const zipPath = path.join(outDir, `${path.basename(packagedRoot)}.zip`);
    removeIfExists(zipPath);
    zipDir(packagedRoot, zipPath);
    result.zip = zipPath;
  }

  writeJson(path.join(outDir, 'BUILD-INFO.json'), makeBuildInfo(result));
  return result;
}

async function main() {
  const targets = parseTargets(process.argv.slice(2));
  if (targets.length === 0) {
    throw new Error('No valid targets requested. Use --targets=web,mac,win');
  }

  ensureDir(BUILD_ROOT);
  const buildId = `${stamp()}-lbh-v${PKG.version}`;
  const targetRoot = path.join(BUILD_ROOT, buildId);
  ensureDir(targetRoot);

  const results = [];

  if (targets.includes('web')) {
    console.log('Building web artifact...');
    results.push(buildWeb(targetRoot));
  }

  for (const target of targets.filter((item) => item !== 'web')) {
    console.log(`Building ${target} desktop artifact...`);
    try {
      results.push(await buildElectronTarget(targetRoot, target));
    } catch (error) {
      results.push({
        target,
        status: 'failed',
        error: error.message,
      });
    }
  }

  writeJson(path.join(targetRoot, 'BUILD-MANIFEST.json'), {
    buildId,
    version: PKG.version,
    results,
  });

  removeIfExists(STAGING_ROOT);

  const failed = results.filter((item) => item.status !== 'built');
  console.log(`\nBuild root: ${targetRoot}`);
  for (const item of results) {
    if (item.status === 'built') {
      console.log(`- ${item.target}: built`);
    } else {
      console.log(`- ${item.target}: failed (${item.error})`);
    }
  }

  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
