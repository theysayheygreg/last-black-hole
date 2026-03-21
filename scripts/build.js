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
  linux: 'linux',
  ipad: 'ipad',
  ios: 'ipad',
};

function parseTargets(argv) {
  const arg = argv.find((item) => item.startsWith('--targets='));
  const raw = arg ? arg.split('=')[1] : 'web,mac,win,linux,ipad';
  return raw
    .split(',')
    .map((item) => TARGET_ALIASES[item.trim().toLowerCase()])
    .filter(Boolean);
}

function parseMode(argv) {
  const arg = argv.find((item) => item.startsWith('--mode='));
  const mode = arg ? arg.split('=')[1].trim().toLowerCase() : 'release';
  if (!['dev', 'test', 'release'].includes(mode)) {
    throw new Error(`Invalid mode "${mode}". Use --mode=dev|test|release`);
  }
  return mode;
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

function versionTag() {
  return `v${PKG.version}`;
}

function buildIdForMode(mode) {
  return mode === 'release' ? versionTag() : `${versionTag()}-${mode}`;
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

function resolvePackagedArtifact(packagedRoot, target) {
  if (!packagedRoot) return null;

  if (target !== 'mac') return packagedRoot;

  if (packagedRoot.endsWith('.app')) return packagedRoot;

  if (!fs.existsSync(packagedRoot) || !fs.statSync(packagedRoot).isDirectory()) {
    return packagedRoot;
  }

  const entries = fs.readdirSync(packagedRoot)
    .filter((name) => name.endsWith('.app'))
    .map((name) => path.join(packagedRoot, name));

  if (entries.length === 1) return entries[0];

  return packagedRoot;
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

function buildFlagsForMode(mode) {
  return {
    dev: {
      mode,
      enableDevPanel: true,
      enableTestAPI: true,
      enableDebugOverlay: true,
    },
    test: {
      mode,
      enableDevPanel: false,
      enableTestAPI: true,
      enableDebugOverlay: false,
    },
    release: {
      mode,
      enableDevPanel: false,
      enableTestAPI: false,
      enableDebugOverlay: false,
    },
  }[mode];
}

function copyWebRuntime(rendererDir, mode) {
  ensureDir(rendererDir);
  fs.copyFileSync(path.join(ROOT, 'index-a.html'), path.join(rendererDir, 'index.html'));
  fs.copyFileSync(path.join(ROOT, 'index-a.html'), path.join(rendererDir, 'index-a.html'));
  copyIfExists(path.join(ROOT, 'src'), path.join(rendererDir, 'src'));
  copyIfExists(path.join(ROOT, 'assets'), path.join(rendererDir, 'assets'));
  fs.writeFileSync(
    path.join(rendererDir, 'src', 'build-flags.js'),
    `window.__LBH_BUILD_FLAGS__ = ${JSON.stringify(buildFlagsForMode(mode), null, 2)};\n`
  );
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

function signMacApp(appPath) {
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  });
}

function buildWeb(targetRoot, mode) {
  const webDir = path.join(targetRoot, 'last-black-hole-web');
  removeIfExists(webDir);
  ensureDir(webDir);

  copyWebRuntime(webDir, mode);

  const info = makeBuildInfo({
    target: 'web',
    mode,
    entrypointSource: 'index-a.html',
    entrypointArtifact: 'index.html',
    artifact: 'last-black-hole-web/',
  });
  writeJson(path.join(targetRoot, 'BUILD-INFO-web.json'), info);

  return {
    target: 'web',
    outputDir: targetRoot,
    artifact: 'last-black-hole-web',
    status: 'built',
  };
}

function buildIpadWebApp(targetRoot, mode) {
  const ipadDir = path.join(targetRoot, 'last-black-hole-ipad-webapp');
  removeIfExists(ipadDir);
  ensureDir(ipadDir);

  copyWebRuntime(ipadDir, mode);

  const indexPath = path.join(ipadDir, 'index.html');
  const source = fs.readFileSync(indexPath, 'utf8');
  const injected = source.replace(
    '</head>',
    [
      '  <meta name="apple-mobile-web-app-capable" content="yes">',
      '  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
      '  <meta name="mobile-web-app-capable" content="yes">',
      '  <meta name="apple-mobile-web-app-title" content="Last Black Hole">',
      '  <link rel="manifest" href="manifest.webmanifest">',
      '</head>',
    ].join('\n')
  );
  fs.writeFileSync(indexPath, injected);

  writeJson(path.join(ipadDir, 'manifest.webmanifest'), {
    name: 'Last Black Hole',
    short_name: 'LBH',
    start_url: './index.html',
    display: 'standalone',
    orientation: 'landscape',
    background_color: '#000033',
    theme_color: '#000033',
  });

  fs.writeFileSync(
    path.join(ipadDir, 'README-IPAD-INSTALL.md'),
    [
      '# iPad Local Install',
      '',
      'This is the first useful iPad target for LBH.',
      '',
      'It is a controller-first web app bundle prepared for Safari "Add to Home Screen", not a signed IPA.',
      '',
      '## Install',
      '',
      '1. Serve this folder over HTTP on a machine the iPad can reach.',
      '2. Open `index.html` in Safari on the iPad.',
      '3. Use Share → Add to Home Screen.',
      '4. Pair a controller and launch from the home screen icon.',
      '',
      '## Why this target exists',
      '',
      '- same gameplay runtime as web/macOS/Windows/Linux',
      '- no Xcode or signing ceremony yet',
      '- good enough for local controller-based playtests',
      '',
      'A real IPA pipeline can come later if the game earns it.',
      '',
    ].join('\n')
  );

  writeJson(path.join(targetRoot, 'BUILD-INFO-ipad.json'), makeBuildInfo({
    target: 'ipad',
    mode,
    outputDir: targetRoot,
    artifact: 'last-black-hole-ipad-webapp',
    installMode: 'Safari Add to Home Screen',
  }));

  return {
    target: 'ipad',
    outputDir: targetRoot,
    artifact: 'last-black-hole-ipad-webapp',
    status: 'built',
  };
}

function stageElectronShell(mode) {
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

  copyWebRuntime(path.join(STAGING_ROOT, 'renderer'), mode);
}

async function buildElectronTarget(targetRoot, target, mode) {
  stageElectronShell(mode);

  const platform =
    target === 'mac' ? 'darwin' :
    target === 'win' ? 'win32' :
    'linux';
  const arch = target === 'mac'
    ? (process.arch === 'arm64' ? 'arm64' : 'x64')
    : 'x64';

  const outDir = path.join(
    targetRoot,
    target === 'mac'
      ? 'last-black-hole-mac'
      : target === 'win'
        ? 'last-black-hole-win'
        : 'last-black-hole-linux'
  );
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
    mode,
    platform,
    arch,
    outputDir: targetRoot,
    status: 'built',
  };

  const packagedRoot = resolvePackagedArtifact(appPaths[0], target);
  if (packagedRoot) {
    const finalName =
      target === 'mac'
        ? 'Last Black Hole.app'
        : target === 'win'
          ? 'Last Black Hole-win32-x64'
          : 'Last Black Hole-linux-x64';
    const finalPath = path.join(targetRoot, finalName);
    removeIfExists(finalPath);
    fs.renameSync(packagedRoot, finalPath);
    if (target === 'mac') signMacApp(finalPath);
    result.artifact = finalName;
  }

  writeJson(path.join(targetRoot, `BUILD-INFO-${target}.json`), makeBuildInfo({
    ...result,
  }));
  removeIfExists(outDir);
  return result;
}

async function main() {
  const targets = parseTargets(process.argv.slice(2));
  const mode = parseMode(process.argv.slice(2));
  if (targets.length === 0) {
    throw new Error('No valid targets requested. Use --targets=web,mac,win');
  }

  ensureDir(BUILD_ROOT);
  const buildId = buildIdForMode(mode);
  const targetRoot = path.join(BUILD_ROOT, buildId);
  removeIfExists(targetRoot);
  ensureDir(targetRoot);

  const results = [];

  if (targets.includes('web')) {
    console.log('Building web artifact...');
    results.push(buildWeb(targetRoot, mode));
  }

  if (targets.includes('ipad')) {
    console.log('Building ipad web-app artifact...');
    results.push(buildIpadWebApp(targetRoot, mode));
  }

  for (const target of targets.filter((item) => !['web', 'ipad'].includes(item))) {
    console.log(`Building ${target} desktop artifact...`);
    try {
      results.push(await buildElectronTarget(targetRoot, target, mode));
    } catch (error) {
      results.push({
        target,
        mode,
        status: 'failed',
        error: error.message,
      });
    }
  }

  writeJson(path.join(targetRoot, 'BUILD-MANIFEST.json'), {
    buildId,
    builtAt: new Date().toISOString(),
    version: PKG.version,
    mode,
    results,
  });

  const playtestZip = path.join(
    BUILD_ROOT,
    `last-black-hole-playtest-${buildId}.zip`
  );
  removeIfExists(playtestZip);
  zipDir(targetRoot, playtestZip);

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
  console.log(`- playtest zip: ${playtestZip}`);

  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
