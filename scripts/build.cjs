#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, execSync } = require('child_process');
const packagerModule = require('@electron/packager');
const packager = packagerModule.packager || packagerModule.default || packagerModule;
const {
  buildIdForMode,
  currentBuildVersion,
  currentPublicVersion,
} = require('./version.cjs');
const { buildFlagsForMode } = require('./build-flags.cjs');

const ROOT = path.resolve(__dirname, '..');
const BUILD_ROOT = path.join(ROOT, 'builds');
const STAGING_ROOT = path.join(ROOT, 'release-staging');
const PRODUCT_NAME = 'Last Singularity';
const PRODUCT_SLUG = 'last-singularity';
const PRODUCT_SHORT = 'LS';
const APP_ICON_PNG = path.join(ROOT, 'assets', 'app', 'icon-512.png');
const PUBLIC_VERSION = currentPublicVersion();
const BUILD_VERSION = currentBuildVersion(PUBLIC_VERSION);
const DESKTOP_SERVER_SCRIPTS = [
  'sim-runtime.cjs',
  'sim-event-journal.cjs',
  'replication-lanes.cjs',
  'sim-protocol.cjs',
  'sim-server.cjs',
  'shared-map-loader.cjs',
  'control-plane-runtime.cjs',
  'control-plane-store.cjs',
  'control-plane-client.cjs',
  'control-plane-server.cjs',
  'session-registry.cjs',
  'player-brain.cjs',
  'coarse-flow-field.cjs',
  'flow-sample.cjs',
  'overload-state.cjs',
  'rng-stream.cjs',
  'runtime-telemetry.cjs',
  'seeded-generation.cjs',
];
const DESKTOP_SERVER_DIRECTORIES = [
  'content',
  'sim',
];
const DESKTOP_SERVER_SHARED_SOURCE_FILES = [
  'physics.js',
];

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
  drop: 'drop',
  cloudflare: 'drop',
  'cloudflare-drop': 'drop',
  cf: 'drop',
  'cf-drop': 'drop',
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

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function removeIfExists(target) {
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
}

function copyIfExists(from, to) {
  if (fs.existsSync(from)) fs.cpSync(from, to, { recursive: true });
}

function removePlatformMetadata(target) {
  if (!fs.existsSync(target)) return;

  const stat = fs.statSync(target);
  if (!stat.isDirectory()) return;

  for (const entry of fs.readdirSync(target)) {
    const filepath = path.join(target, entry);
    if (entry === '.DS_Store' || entry === '__MACOSX') {
      removeIfExists(filepath);
      continue;
    }
    removePlatformMetadata(filepath);
  }
}

function copyThreeRuntime(rendererDir) {
  const threeBuild = path.join(ROOT, 'node_modules', 'three', 'build');
  const threeModule = path.join(threeBuild, 'three.module.js');
  if (!fs.existsSync(threeModule)) {
    throw new Error('Missing three/build runtime. Run npm install before building renderer artifacts.');
  }
  const target = path.join(rendererDir, 'node_modules', 'three', 'build');
  ensureDir(target);
  fs.cpSync(threeBuild, target, { recursive: true });
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
    project: PRODUCT_SLUG,
    productName: PRODUCT_NAME,
    version: BUILD_VERSION,
    publicVersion: PUBLIC_VERSION,
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

function copyWebRuntime(rendererDir, mode, target = 'browser') {
  ensureDir(rendererDir);
  fs.copyFileSync(path.join(ROOT, 'index-a.html'), path.join(rendererDir, 'index.html'));
  fs.copyFileSync(path.join(ROOT, 'index-a.html'), path.join(rendererDir, 'index-a.html'));
  copyIfExists(path.join(ROOT, 'src'), path.join(rendererDir, 'src'));
  copyIfExists(path.join(ROOT, 'assets'), path.join(rendererDir, 'assets'));
  copyThreeRuntime(rendererDir);
  fs.writeFileSync(
    path.join(rendererDir, 'src', 'build-flags.js'),
    `window.__LBH_BUILD_FLAGS__ = ${JSON.stringify(buildFlagsForMode(mode, target), null, 2)};\n`
  );
}

function resolveLocalRuntimeModule(fromFile, request) {
  const resolved = path.resolve(path.dirname(fromFile), request);
  const candidates = path.extname(resolved)
    ? [resolved]
    : [resolved, `${resolved}.cjs`, `${resolved}.js`, `${resolved}.json`];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

function collectDesktopServerClosure() {
  const scriptsRoot = path.join(ROOT, 'scripts');
  const queue = DESKTOP_SERVER_SCRIPTS.map((script) => path.join(scriptsRoot, script));
  const collected = new Map();

  while (queue.length > 0) {
    const source = queue.shift();
    if (!fs.existsSync(source)) {
      throw new Error(`Missing desktop authority runtime module: ${source}`);
    }

    const relative = path.relative(scriptsRoot, source);
    if (relative.startsWith('..') || path.isAbsolute(relative) || collected.has(relative)) continue;
    collected.set(relative, source);

    if (!/\.(?:cjs|js)$/.test(source)) continue;
    const moduleSource = fs.readFileSync(source, 'utf8');
    const pattern = /require\((['"])(\.[^'"]+)\1\)/g;
    let match;
    while ((match = pattern.exec(moduleSource))) {
      const dependency = resolveLocalRuntimeModule(source, match[2]);
      if (!dependency) {
        throw new Error(`${relative} requires missing local module ${match[2]}`);
      }
      const dependencyRelative = path.relative(scriptsRoot, dependency);
      if (!dependencyRelative.startsWith('..') && !path.isAbsolute(dependencyRelative)) {
        queue.push(dependency);
      }
    }
  }

  return collected;
}

function stageDesktopAuthorityRuntime(stagingRoot) {
  const serverDir = path.join(stagingRoot, 'server');
  ensureDir(serverDir);

  for (const [relative, source] of collectDesktopServerClosure()) {
    const destination = path.join(serverDir, relative);
    ensureDir(path.dirname(destination));
    fs.copyFileSync(source, destination);
  }

  // These scopes can also contain data or dynamically selected modules that a
  // static CommonJS walk cannot see, so stage each complete runtime unit.
  for (const directory of DESKTOP_SERVER_DIRECTORIES) {
    copyIfExists(
      path.join(ROOT, 'scripts', directory),
      path.join(serverDir, directory)
    );
  }

  // shared-map-loader resolves maps one level above server/, while the CJS
  // content wrappers resolve their JSON payloads from src/content.
  copyIfExists(path.join(ROOT, 'src', 'maps'), path.join(stagingRoot, 'src', 'maps'));
  copyIfExists(path.join(ROOT, 'src', 'content'), path.join(stagingRoot, 'src', 'content'));
  for (const file of DESKTOP_SERVER_SHARED_SOURCE_FILES) {
    copyIfExists(path.join(ROOT, 'src', file), path.join(stagingRoot, 'src', file));
  }
}

function zipDir(sourceDir, zipPath) {
  if (process.platform === 'darwin') {
    execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', sourceDir, zipPath], {
      cwd: path.dirname(sourceDir),
      stdio: 'inherit',
    });
    return;
  }

  if (process.platform === 'win32') {
    const sourceName = path.basename(sourceDir).replace(/'/g, "''");
    const destPath = zipPath.replace(/'/g, "''");
    execFileSync(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Compress-Archive -Path '${sourceName}' -DestinationPath '${destPath}' -Force`,
      ],
      {
        cwd: path.dirname(sourceDir),
        stdio: 'inherit',
      }
    );
    return;
  }

  execFileSync('zip', ['-rq', zipPath, path.basename(sourceDir)], {
    cwd: path.dirname(sourceDir),
    stdio: 'inherit',
  });
}

function zipDirContents(sourceDir, zipPath) {
  if (process.platform === 'darwin') {
    execFileSync('zip', ['-rq', zipPath, '.', '-x', '*.DS_Store', '__MACOSX/*'], {
      cwd: sourceDir,
      stdio: 'inherit',
    });
    return;
  }

  if (process.platform === 'win32') {
    const destPath = zipPath.replace(/'/g, "''");
    execFileSync(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Compress-Archive -Path * -DestinationPath '${destPath}' -Force`,
      ],
      {
        cwd: sourceDir,
        stdio: 'inherit',
      }
    );
    return;
  }

  execFileSync('zip', ['-rq', zipPath, '.', '-x', '*.DS_Store', '__MACOSX/*'], {
    cwd: sourceDir,
    stdio: 'inherit',
  });
}

function injectStaticSandboxBootstrap(indexPath, label) {
  const markerPattern = /  <script type="module" src="src\/main\.js"[^>]*><\/script>/;
  const source = fs.readFileSync(indexPath, 'utf8');
  const match = source.match(markerPattern);
  if (!match) {
    throw new Error(`Could not find main script marker while preparing ${label}: ${indexPath}`);
  }

  const sandboxBootstrap = [
    '  <script>',
    '    (() => {',
    '      const url = new URL(window.location.href);',
    "      url.searchParams.set('localSandbox', '1');",
    "      url.searchParams.delete('simServer');",
    "      if (!url.searchParams.has('renderer')) url.searchParams.set('renderer', 'three');",
    "      window.history.replaceState(null, '', url.toString());",
    '      try {',
    "        localStorage.removeItem('lbh.simServerUrl');",
    '      } catch {}',
    '    })();',
    '  </script>',
  ].join('\n');

  fs.writeFileSync(indexPath, source.replace(match[0], `${sandboxBootstrap}\n${match[0]}`));

  const checked = fs.readFileSync(indexPath, 'utf8');
  if (!checked.includes("url.searchParams.set('localSandbox', '1')")) {
    throw new Error(`Failed to inject localSandbox bootstrap into ${label}: ${indexPath}`);
  }
}

function signMacApp(appPath) {
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  });
}

function writeMacLauncher(targetRoot) {
  const launcherPath = path.join(targetRoot, `Run ${PRODUCT_NAME}.command`);
  const script = [
    '#!/bin/bash',
    'set -euo pipefail',
    'DIR="$(cd "$(dirname "$0")" && pwd)"',
    `open -n "$DIR/${PRODUCT_NAME}.app"`,
    '',
  ].join('\n');
  fs.writeFileSync(launcherPath, script);
  fs.chmodSync(launcherPath, 0o755);
}

function writeStartHere(targetRoot, results) {
  const built = new Set(results.filter((item) => item.status === 'built').map((item) => item.target));
  const lines = [
    '# START HERE',
    '',
    'Choose the launcher for your platform:',
    '',
    `- **macOS:** double-click \`Run ${PRODUCT_NAME}.command\`, or run \`open -n "${PRODUCT_NAME}.app"\` from Terminal in this folder`,
    `- **Windows:** run \`${PRODUCT_NAME}-win32-x64/${PRODUCT_NAME}.exe\``,
    `- **Linux:** run \`${PRODUCT_NAME}-linux-x64/${PRODUCT_NAME}\``,
    '- **Steam Deck:** prefer the public installer from the README so the Deck wrapper and Gaming Mode shortcut are installed correctly',
    '',
    '## Which artifact should I use?',
    '',
    `- **Mac:** \`${PRODUCT_NAME}.app\``,
    `- **Windows:** \`${PRODUCT_NAME}-win32-x64/${PRODUCT_NAME}.exe\``,
    `- **Linux / Steam Deck:** \`${PRODUCT_NAME}-linux-x64/${PRODUCT_NAME}\``,
    `- **Browser fallback:** \`${PRODUCT_SLUG}-web/index.html\``,
    `- **Temporary Cloudflare share:** drop \`${PRODUCT_SLUG}-cloudflare-drop\` or its zip on Cloudflare Drop`,
    `- **iPad local install:** read \`${PRODUCT_SLUG}-ipad-webapp/README-IPAD-INSTALL.md\``,
    '',
    '## First launch flow',
    '',
    '- Press Space / Enter on keyboard or A on controller/Steam Deck at the title screen.',
    '- Choose a pilot slot. Empty slots ask for a pilot name; type one and press Enter.',
    '- On the home screen, use Q/E on keyboard or L1/R1 on controller/Steam Deck to move between tabs.',
    '- Go to LAUNCH, confirm with Space or A, choose a destination, then confirm again to drop in.',
    '- During a run, loot wrecks, conserve delta-v, follow cyan route apertures, remain inside one, then press Enter or A to extract before it expires or the universe collapses.',
    '- After extraction or death, press Space or A to return to the pilot flow.',
    '',
    '## What is in this folder?',
    '',
    '- `BUILD-MANIFEST.json` tells you what was built',
    '- `BUILD-INFO-*.json` records per-target build metadata',
    '',
    '## Targets in this build',
    '',
  ];

  for (const item of results) {
    if (item.status === 'built') {
      lines.push(`- ${item.target}: built`);
    } else {
      lines.push(`- ${item.target}: failed (${item.error})`);
    }
  }

  lines.push('');
  lines.push('## Controls');
  lines.push('');
  lines.push('- Menus: arrows / WASD or D-pad/stick move selection, Space / Enter / A confirms, Escape / B backs out.');
  lines.push('- Keyboard + mouse: aim with the mouse, hold left click / W / Space to thrust, hold right click / S / Ctrl to brake.');
  lines.push('- Keyboard fallback: arrows / A-D can steer if you do not have a controller or mouse aim available.');
  lines.push('- Gamepad: left stick aims, R2 thrusts, L2 brakes, face buttons handle confirm/back/pulse.');
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  if (built.has('mac')) {
    lines.push(`- The macOS app is ad-hoc signed, not notarized. Use \`Run ${PRODUCT_NAME}.command\` for the least fragile local launch path.`);
  }
  if (built.has('win')) {
    lines.push('- The Windows target is a portable folder, not an installer.');
  }
  if (built.has('linux')) {
    lines.push('- The Linux target is the first Deck-friendly native package.');
  }
  if (built.has('web')) {
    lines.push('- The web target is the source-of-truth runtime and safest fallback.');
  }
  if (built.has('drop')) {
    lines.push('- The Cloudflare Drop target is a static sandbox share build. It does not include the embedded authority stack.');
  }

  fs.writeFileSync(path.join(targetRoot, 'START-HERE.md'), lines.join('\n') + '\n');
}

function buildWeb(targetRoot, mode) {
  const webDir = path.join(targetRoot, `${PRODUCT_SLUG}-web`);
  removeIfExists(webDir);
  ensureDir(webDir);

  copyWebRuntime(webDir, mode, 'browser');

  const info = makeBuildInfo({
    target: 'web',
    mode,
    entrypointSource: 'index-a.html',
    entrypointArtifact: 'index.html',
    artifact: `${PRODUCT_SLUG}-web/`,
  });
  writeJson(path.join(targetRoot, 'BUILD-INFO-web.json'), info);

  return {
    target: 'web',
    outputDir: targetRoot,
    artifact: `${PRODUCT_SLUG}-web`,
    status: 'built',
  };
}

function buildCloudflareDrop(targetRoot, mode) {
  const dropDir = path.join(targetRoot, `${PRODUCT_SLUG}-cloudflare-drop`);
  removeIfExists(dropDir);
  ensureDir(dropDir);

  copyWebRuntime(dropDir, mode, 'sandbox');
  injectStaticSandboxBootstrap(path.join(dropDir, 'index.html'), 'Cloudflare Drop index');
  injectStaticSandboxBootstrap(path.join(dropDir, 'index-a.html'), 'Cloudflare Drop debug index');

  fs.writeFileSync(
    path.join(dropDir, 'CLOUDFLARE-DROP.md'),
    [
      '# Cloudflare Drop Build',
      '',
      'This folder is prepared for Cloudflare Drop or Cloudflare Pages drag-and-drop sharing.',
      '',
      '## Share it',
      '',
      '1. Run `npm run release:drop` from a committed source tree.',
      `2. Open https://www.cloudflare.com/drop/ and drop either this folder or \`${PRODUCT_SLUG}-cloudflare-drop-*.zip\`.`,
      '3. Copy the generated URL and send it to testers.',
      '',
      'Cloudflare Drop links are temporary unless you claim them. Treat them as quick social/playtest links, not release channels.',
      '',
      '## Runtime shape',
      '',
      '- This is a static browser sandbox build.',
      '- It forces `localSandbox=1` before the game boots.',
      '- It clears remembered local or remote sim URLs.',
      '- It defaults to the Three renderer.',
      '- It does not run the Node control plane or authoritative sim.',
      '',
      'Use the desktop, Steam Deck, itch downloadable, or Steam targets for embedded-authority play.',
      '',
    ].join('\n')
  );
  removePlatformMetadata(dropDir);

  const buildId = buildIdForMode(mode, BUILD_VERSION);
  const zipName = `${PRODUCT_SLUG}-cloudflare-drop-${buildId}.zip`;
  const zipPath = path.join(BUILD_ROOT, zipName);
  removeIfExists(zipPath);
  zipDirContents(dropDir, zipPath);

  const info = makeBuildInfo({
    target: 'drop',
    mode,
    entrypointSource: 'index-a.html',
    entrypointArtifact: 'index.html',
    artifact: `${PRODUCT_SLUG}-cloudflare-drop/`,
    zipArtifact: zipName,
    hosting: 'Cloudflare Drop / Cloudflare Pages drag-and-drop',
    runtimeMode: 'local-sandbox',
    authority: 'none',
  });
  writeJson(path.join(targetRoot, 'BUILD-INFO-drop.json'), info);

  return {
    target: 'drop',
    outputDir: targetRoot,
    artifact: `${PRODUCT_SLUG}-cloudflare-drop`,
    zipArtifact: zipName,
    status: 'built',
  };
}

function buildIpadWebApp(targetRoot, mode) {
  const ipadDir = path.join(targetRoot, `${PRODUCT_SLUG}-ipad-webapp`);
  removeIfExists(ipadDir);
  ensureDir(ipadDir);

  copyWebRuntime(ipadDir, mode, 'sandbox');
  injectStaticSandboxBootstrap(path.join(ipadDir, 'index.html'), 'iPad web-app index');
  injectStaticSandboxBootstrap(path.join(ipadDir, 'index-a.html'), 'iPad web-app debug index');

  const indexPath = path.join(ipadDir, 'index.html');
  const source = fs.readFileSync(indexPath, 'utf8');
  const injected = source.replace(
    '</head>',
    [
      '  <meta name="apple-mobile-web-app-capable" content="yes">',
      '  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
      '  <meta name="mobile-web-app-capable" content="yes">',
      `  <meta name="apple-mobile-web-app-title" content="${PRODUCT_NAME}">`,
      '  <link rel="manifest" href="manifest.webmanifest">',
      '</head>',
    ].join('\n')
  );
  fs.writeFileSync(indexPath, injected);

  writeJson(path.join(ipadDir, 'manifest.webmanifest'), {
    name: PRODUCT_NAME,
    short_name: PRODUCT_SHORT,
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
      'This is the fastest iPad target for LBH.',
      '',
      'It is a controller-first web app bundle prepared for Safari "Add to Home Screen", not a signed IPA.',
      '',
      'The iPad lane is also a native Apple-platform bench. The repo includes a SwiftUI/WKWebView wrapper now; future native bench work should move toward Metal snapshot-rendering probes without duplicating gameplay truth.',
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
      'The repo also has a thin native iOS wrapper for simulator/device work:',
      '',
      '```sh',
      'npm run ios:sync -- --mode=release',
      'npm run ios:build:sim -- --mode=release',
      '```',
      '',
      'Device builds still require Xcode signing. See `docs/reference/IPAD-IOS-BUILD.md` in the repo.',
      '',
    ].join('\n')
  );

  writeJson(path.join(targetRoot, 'BUILD-INFO-ipad.json'), makeBuildInfo({
    target: 'ipad',
    mode,
    outputDir: targetRoot,
    artifact: `${PRODUCT_SLUG}-ipad-webapp`,
    installMode: 'Safari Add to Home Screen',
  }));

  return {
    target: 'ipad',
    outputDir: targetRoot,
    artifact: `${PRODUCT_SLUG}-ipad-webapp`,
    status: 'built',
  };
}

function stageElectronShell(mode) {
  removeIfExists(STAGING_ROOT);
  ensureDir(STAGING_ROOT);

  const shellPkg = {
    name: `${PRODUCT_SLUG}-shell`,
    productName: PRODUCT_NAME,
    // Electron/Windows package metadata expects numeric semver; LBH's hash build
    // version stays in BUILD-MANIFEST and artifact paths.
    version: PUBLIC_VERSION,
    main: 'electron-main.cjs',
  };

  fs.writeFileSync(
    path.join(STAGING_ROOT, 'package.json'),
    JSON.stringify(shellPkg, null, 2) + '\n'
  );

  const desktopFiles = [
    'electron-main.cjs',
    'main-preload.cjs',
    'status-preload.cjs',
    'status.html',
  ];
  for (const file of desktopFiles) {
    fs.copyFileSync(
      path.join(ROOT, 'desktop', file),
      path.join(STAGING_ROOT, file)
    );
  }

  copyWebRuntime(path.join(STAGING_ROOT, 'renderer'), mode, 'desktop');

  stageDesktopAuthorityRuntime(STAGING_ROOT);
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
      ? `${PRODUCT_SLUG}-mac`
      : target === 'win'
        ? `${PRODUCT_SLUG}-win`
        : `${PRODUCT_SLUG}-linux`
  );
  removeIfExists(outDir);
  ensureDir(outDir);

  const appPaths = await packager({
    dir: STAGING_ROOT,
    out: outDir,
    overwrite: true,
    platform,
    arch,
    executableName: PRODUCT_NAME,
    appCopyright: `${PRODUCT_NAME} playtest build`,
    icon: fs.existsSync(APP_ICON_PNG) ? APP_ICON_PNG : undefined,
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
        ? `${PRODUCT_NAME}.app`
        : target === 'win'
          ? `${PRODUCT_NAME}-win32-x64`
          : `${PRODUCT_NAME}-linux-x64`;
    const finalPath = path.join(targetRoot, finalName);
    removeIfExists(finalPath);
    fs.renameSync(packagedRoot, finalPath);
    if (target === 'mac') signMacApp(finalPath);
    if (fs.existsSync(APP_ICON_PNG) && target !== 'mac') {
      fs.copyFileSync(APP_ICON_PNG, path.join(finalPath, 'last-singularity-icon.png'));
    }
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
  const buildId = buildIdForMode(mode, BUILD_VERSION);
  const targetRoot = path.join(BUILD_ROOT, buildId);
  removeIfExists(targetRoot);
  ensureDir(targetRoot);

  const results = [];

  if (targets.includes('web')) {
    console.log('Building web artifact...');
    results.push(buildWeb(targetRoot, mode));
  }

  if (targets.includes('drop')) {
    console.log('Building Cloudflare Drop artifact...');
    results.push(buildCloudflareDrop(targetRoot, mode));
  }

  if (targets.includes('ipad')) {
    console.log('Building ipad web-app artifact...');
    results.push(buildIpadWebApp(targetRoot, mode));
  }

  for (const target of targets.filter((item) => !['web', 'drop', 'ipad'].includes(item))) {
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
    version: BUILD_VERSION,
    publicVersion: PUBLIC_VERSION,
    mode,
    results,
  });
  if (results.some((item) => item.target === 'mac' && item.status === 'built')) {
    writeMacLauncher(targetRoot);
  }
  writeStartHere(targetRoot, results);

  const playtestZip = path.join(
    BUILD_ROOT,
    `${PRODUCT_SLUG}-playtest-${buildId}.zip`
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

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  DESKTOP_SERVER_DIRECTORIES,
  DESKTOP_SERVER_SCRIPTS,
  buildFlagsForMode,
  stageDesktopAuthorityRuntime,
};
