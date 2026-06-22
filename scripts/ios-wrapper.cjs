#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const IOS_ROOT = path.join(ROOT, 'ios');
const PROJECT_PATH = path.join(IOS_ROOT, 'LastSingularity.xcodeproj');
const WEBAPP_DIR = path.join(IOS_ROOT, 'LastSingularity', 'WebApp');
const PRODUCT_NAME = 'Last Singularity';
const PRODUCT_SLUG = 'last-singularity';
const PKG = require(path.join(ROOT, 'package.json'));

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const equalsIndex = arg.indexOf('=');
      const rawKey = equalsIndex >= 0 ? arg.slice(0, equalsIndex) : arg;
      const rawValue = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : null;
      const key = rawKey.slice(2);
      if (rawValue != null) {
        args[key] = rawValue;
      } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
        args[key] = argv[i + 1];
        i += 1;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(arg);
    }
  }
  return args;
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

function normalizeMode(value) {
  const mode = String(value || 'release').toLowerCase();
  if (!['dev', 'test', 'release'].includes(mode)) {
    throw new Error(`Invalid mode "${mode}". Use --mode=dev|test|release.`);
  }
  return mode;
}

function copyThreeRuntime(rendererDir) {
  const threeModule = path.join(ROOT, 'node_modules', 'three', 'build', 'three.module.js');
  if (!fs.existsSync(threeModule)) {
    throw new Error('Missing three.module.js. Run npm install before syncing the iOS wrapper.');
  }
  const target = path.join(rendererDir, 'node_modules', 'three', 'build');
  ensureDir(target);
  fs.copyFileSync(threeModule, path.join(target, 'three.module.js'));
}

function injectIpadHead(indexPath) {
  let source = fs.readFileSync(indexPath, 'utf8');
  source = source.replace(
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">'
  );
  if (!source.includes('apple-mobile-web-app-capable')) {
    source = source.replace(
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
  }
  fs.writeFileSync(indexPath, source);
}

function writeJson(filepath, value) {
  fs.writeFileSync(filepath, JSON.stringify(value, null, 2) + '\n');
}

function syncWebApp(args = {}) {
  const mode = normalizeMode(args.mode || process.env.LBH_IOS_MODE);
  removeIfExists(WEBAPP_DIR);
  ensureDir(WEBAPP_DIR);

  fs.copyFileSync(path.join(ROOT, 'index-a.html'), path.join(WEBAPP_DIR, 'index.html'));
  fs.copyFileSync(path.join(ROOT, 'index-a.html'), path.join(WEBAPP_DIR, 'index-a.html'));
  copyIfExists(path.join(ROOT, 'src'), path.join(WEBAPP_DIR, 'src'));
  copyIfExists(path.join(ROOT, 'assets'), path.join(WEBAPP_DIR, 'assets'));
  copyThreeRuntime(WEBAPP_DIR);
  injectIpadHead(path.join(WEBAPP_DIR, 'index.html'));
  injectIpadHead(path.join(WEBAPP_DIR, 'index-a.html'));

  fs.writeFileSync(
    path.join(WEBAPP_DIR, 'src', 'build-flags.js'),
    `window.__LBH_BUILD_FLAGS__ = ${JSON.stringify(buildFlagsForMode(mode), null, 2)};\n`
  );

  writeJson(path.join(WEBAPP_DIR, 'manifest.webmanifest'), {
    name: PRODUCT_NAME,
    short_name: 'LS',
    start_url: './index.html',
    display: 'standalone',
    orientation: 'landscape',
    background_color: '#000033',
    theme_color: '#000033',
  });

  writeJson(path.join(WEBAPP_DIR, 'IOS-WEBAPP-MANIFEST.json'), {
    project: PRODUCT_SLUG,
    productName: PRODUCT_NAME,
    version: PKG.version,
    mode,
    generatedAt: new Date().toISOString(),
    generatedBy: 'scripts/ios-wrapper.cjs sync',
    runtime: 'static web bundle for WKWebView wrapper',
  });

  fs.writeFileSync(
    path.join(WEBAPP_DIR, 'README-GENERATED.txt'),
    [
      'Generated iOS web runtime.',
      '',
      'Do not edit this folder directly. Run:',
      '  npm run ios:sync -- --mode=release',
      '',
    ].join('\n')
  );
  fs.writeFileSync(path.join(WEBAPP_DIR, '.gitkeep'), '');

  console.log(`Synced iOS WebApp (${mode}) -> ${path.relative(ROOT, WEBAPP_DIR)}`);
}

function xcodebuildBaseArgs() {
  return [
    '-project', PROJECT_PATH,
    '-scheme', 'LastSingularity',
  ];
}

function runXcodebuild(args) {
  console.log(`$ xcodebuild ${args.join(' ')}`);
  execFileSync('xcodebuild', args, {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

function buildSimulator(args = {}) {
  syncWebApp(args);
  const configuration = String(args.configuration || 'Debug');
  const derivedDataPath = path.resolve(args['derived-data'] || path.join(ROOT, 'builds', 'ios-derived-data'));
  const simulator = String(args.simulator || process.env.LBH_IOS_SIMULATOR || '').trim();
  const destination = String(
    args.destination || (simulator
      ? `platform=iOS Simulator,name=${simulator},OS=latest`
      : 'generic/platform=iOS Simulator')
  );
  const simServer = String(args['sim-server'] || process.env.LBH_SIM_SERVER_URL || '').trim();
  const buildArgs = [
    ...xcodebuildBaseArgs(),
    '-configuration', configuration,
    '-destination', destination,
    '-derivedDataPath', derivedDataPath,
    'CODE_SIGNING_ALLOWED=NO',
    'build',
  ];
  if (simServer) buildArgs.splice(buildArgs.length - 1, 0, `LBH_SIM_SERVER_URL=${simServer}`);
  runXcodebuild(buildArgs);
}

function buildDevice(args = {}) {
  syncWebApp(args);
  const team = String(args.team || process.env.LBH_DEVELOPMENT_TEAM || '').trim();
  const bundleId = String(args['bundle-id'] || process.env.LBH_BUNDLE_IDENTIFIER || '').trim();
  if (!team) {
    throw new Error('Device builds require --team=<Apple Team ID> or LBH_DEVELOPMENT_TEAM.');
  }
  const configuration = String(args.configuration || 'Release');
  const destination = String(args.destination || 'generic/platform=iOS');
  const derivedDataPath = path.resolve(args['derived-data'] || path.join(ROOT, 'builds', 'ios-derived-data'));
  const simServer = String(args['sim-server'] || process.env.LBH_SIM_SERVER_URL || '').trim();
  const buildArgs = [
    ...xcodebuildBaseArgs(),
    '-configuration', configuration,
    '-destination', destination,
    '-derivedDataPath', derivedDataPath,
    `DEVELOPMENT_TEAM=${team}`,
    'CODE_SIGN_STYLE=Automatic',
  ];
  if (bundleId) buildArgs.push(`PRODUCT_BUNDLE_IDENTIFIER=${bundleId}`);
  if (simServer) buildArgs.push(`LBH_SIM_SERVER_URL=${simServer}`);
  buildArgs.push('build');
  runXcodebuild(buildArgs);
}

function openProject() {
  if (process.platform !== 'darwin') {
    throw new Error('ios:open requires macOS.');
  }
  spawnSync('open', [PROJECT_PATH], {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

function printHelp() {
  console.log([
    'Usage: node scripts/ios-wrapper.cjs <command> [options]',
    '',
    'Commands:',
    '  sync          Copy the current web runtime into ios/LastSingularity/WebApp',
    '  build-sim     Sync, then build the native wrapper for an iPad simulator',
    '  build-device  Sync, then build for a signed iOS device target',
    '  open          Open the Xcode project',
    '',
    'Options:',
    '  --mode=release|test|dev',
    '  --sim-server=http://HOST:8787',
    '  --simulator="iPad Pro (11-inch) (M4)"',
    '  --team=<Apple Team ID>',
    '  --bundle-id=com.example.lastsingularity',
    '',
    `Host platform: ${os.platform()} ${os.arch()}`,
  ].join('\n'));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || 'help';
  if (command === 'sync') return syncWebApp(args);
  if (command === 'build-sim') return buildSimulator(args);
  if (command === 'build-device') return buildDevice(args);
  if (command === 'open') return openProject();
  if (command === 'help' || command === '--help' || command === '-h') return printHelp();
  throw new Error(`Unknown command "${command}".`);
}

main();
