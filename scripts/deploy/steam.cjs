#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');
const { currentBuildVersion, currentPublicVersion } = require('../version.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const PRODUCT_NAME = 'Last Singularity';
const DEPLOY_ROOT = path.join(ROOT, 'dist', 'deploy', 'steam');
const PUBLIC_VERSION = currentPublicVersion();
const BUILD_VERSION = currentBuildVersion(PUBLIC_VERSION);

const PLATFORM_SPECS = {
  linux: {
    artifact: `${PRODUCT_NAME}-linux-x64`,
    depotEnv: 'STEAM_DEPOT_ID_LINUX',
    folder: 'linux',
  },
  win: {
    artifact: `${PRODUCT_NAME}-win32-x64`,
    depotEnv: 'STEAM_DEPOT_ID_WINDOWS',
    folder: 'windows',
  },
  mac: {
    artifact: `${PRODUCT_NAME}.app`,
    depotEnv: 'STEAM_DEPOT_ID_MAC',
    folder: 'macos',
  },
};

function argValue(name, fallback) {
  const prefix = `${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function run(command, args, options = {}) {
  console.log(`$ ${[command, ...args].join(' ')}`);
  execFileSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    ...options,
  });
}

function buildRoot(mode) {
  const suffix = mode === 'release' ? '' : `-${mode}`;
  return path.join(ROOT, 'builds', `v${BUILD_VERSION}${suffix}`);
}

function gitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'nogit';
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function removeIfExists(target) {
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
}

function copyDir(from, to) {
  removeIfExists(to);
  fs.cpSync(from, to, { recursive: true });
}

function write(file, body) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, body);
}

function vdfValue(value) {
  return String(value).replace(/\\/g, '/').replace(/"/g, '\\"');
}

function parsePlatforms(raw) {
  const requested = raw.split(',').map((item) => item.trim()).filter(Boolean);
  const normalized = requested.map((item) => {
    if (item === 'windows') return 'win';
    if (item === 'osx' || item === 'darwin') return 'mac';
    return item;
  });
  for (const platform of normalized) {
    if (!PLATFORM_SPECS[platform]) throw new Error(`Unknown Steam platform "${platform}".`);
  }
  return normalized;
}

function depotIdFor(spec) {
  return process.env[spec.depotEnv] || '0';
}

function writeDepotScript(scriptDir, platform, depotId) {
  const spec = PLATFORM_SPECS[platform];
  const filename = `depot_build_${platform}_${depotId}.vdf`;
  write(path.join(scriptDir, filename), [
    '"DepotBuild"',
    '{',
    `  "DepotID" "${vdfValue(depotId)}"`,
    `  "ContentRoot" "../content/${spec.folder}"`,
    '  "FileMapping"',
    '  {',
    '    "LocalPath" "*"',
    '    "DepotPath" "."',
    '    "Recursive" "1"',
    '  }',
    '}',
    '',
  ].join('\n'));
  return filename;
}

function writeAppScript(scriptDir, platforms, options) {
  const depotLines = [];
  for (const platform of platforms) {
    const spec = PLATFORM_SPECS[platform];
    const depotId = depotIdFor(spec);
    const depotScript = writeDepotScript(scriptDir, platform, depotId);
    depotLines.push(`    "${vdfValue(depotId)}" "${vdfValue(depotScript)}"`);
  }

  const lines = [
    '"AppBuild"',
    '{',
    `  "AppID" "${vdfValue(options.appId)}"`,
    `  "Desc" "${vdfValue(options.desc)}"`,
  ];
  if (options.preview) lines.push('  "Preview" "1"');
  if (options.setLive) lines.push(`  "SetLive" "${vdfValue(options.setLive)}"`);
  lines.push('  "ContentRoot" "../content"');
  lines.push('  "BuildOutput" "../output"');
  lines.push('  "Depots"');
  lines.push('  {');
  lines.push(...depotLines);
  lines.push('  }');
  lines.push('}');
  lines.push('');

  const appScript = path.join(scriptDir, `app_build_${options.appId}.vdf`);
  write(appScript, lines.join('\n'));
  return appScript;
}

function validateUploadConfig(options, platforms) {
  if (!options.appId || options.appId === '0') {
    throw new Error('STEAM_APP_ID is required for upload.');
  }
  for (const platform of platforms) {
    const depotId = depotIdFor(PLATFORM_SPECS[platform]);
    if (!depotId || depotId === '0') {
      throw new Error(`${PLATFORM_SPECS[platform].depotEnv} is required for upload.`);
    }
  }
  if (!options.username) {
    throw new Error('STEAM_USERNAME is required for upload.');
  }
}

function upload(appScript, options) {
  validateUploadConfig(options, options.platforms);
  const args = [];
  if (options.guardCode) args.push('+set_steam_guard_code', options.guardCode);
  args.push('+login', options.username);
  if (options.password) args.push(options.password);
  args.push('+run_app_build', appScript, '+quit');
  run(options.steamcmd, args, {
    cwd: path.dirname(options.steamcmd),
  });
}

function main() {
  const mode = argValue('--mode', process.env.LBH_DEPLOY_MODE || 'release');
  const platforms = parsePlatforms(argValue('--targets', process.env.STEAM_TARGETS || 'linux,win,mac'));
  const noBuild = hasFlag('--no-build');
  const uploadRequested = hasFlag('--upload');
  const preview = hasFlag('--preview') || !uploadRequested;
  const appId = argValue('--app-id', process.env.STEAM_APP_ID || '0');
  const setLive = argValue('--set-live', process.env.STEAM_SET_LIVE || '');
  const steamcmd = argValue('--steamcmd', process.env.STEAMCMD_PATH || 'steamcmd');
  const username = argValue('--username', process.env.STEAM_USERNAME || '');
  const password = argValue('--password', process.env.STEAM_PASSWORD || '');
  const guardCode = argValue('--guard-code', process.env.STEAM_GUARD_CODE || '');
  const desc = argValue('--desc', process.env.STEAM_BUILD_DESC || `Last Singularity v${BUILD_VERSION}`);

  if (!['dev', 'test', 'release'].includes(mode)) {
    throw new Error(`Invalid mode "${mode}". Use dev, test, or release.`);
  }

  if (!noBuild) {
    run('node', ['scripts/build.cjs', `--targets=${platforms.join(',')}`, `--mode=${mode}`]);
  }

  const sourceRoot = buildRoot(mode);
  const targetRoot = path.join(DEPLOY_ROOT, `v${BUILD_VERSION}`);
  const contentRoot = path.join(targetRoot, 'content');
  const scriptRoot = path.join(targetRoot, 'scripts');
  removeIfExists(targetRoot);
  ensureDir(contentRoot);
  ensureDir(scriptRoot);
  ensureDir(path.join(targetRoot, 'output'));

  for (const platform of platforms) {
    const spec = PLATFORM_SPECS[platform];
    const from = path.join(sourceRoot, spec.artifact);
    if (!fs.existsSync(from)) throw new Error(`Missing ${platform} artifact: ${from}`);
    copyDir(from, path.join(contentRoot, spec.folder));
  }

  const appScript = writeAppScript(scriptRoot, platforms, {
    appId,
    desc,
    preview,
    setLive,
  });

  write(path.join(targetRoot, 'STEAMPIPE-README.md'), [
    '# Last Singularity SteamPipe Package',
    '',
    `Generated from v${BUILD_VERSION}.`,
    '',
    '## Contents',
    '',
    '- `content/` contains platform depot payloads.',
    '- `scripts/` contains SteamPipe VDF build scripts.',
    '- `output/` is reserved for SteamPipe logs, chunk cache, and manifests.',
    '',
    '## Upload',
    '',
    'Set `STEAM_APP_ID`, depot ids, and `STEAM_USERNAME`, then run:',
    '',
    '```sh',
    'npm run deploy:steam:upload -- --no-build',
    '```',
    '',
    'Pass `--preview` to ask SteamPipe for a manifest-only preview build.',
    'Use `STEAM_SET_LIVE=<beta-branch>` only for a beta branch you really want to update.',
    '',
  ].join('\n'));

  const manifest = {
    appId,
    version: BUILD_VERSION,
    publicVersion: PUBLIC_VERSION,
    git: gitSha(),
    mode,
    preview,
    setLive,
    platforms: platforms.map((platform) => ({
      platform,
      depotId: depotIdFor(PLATFORM_SPECS[platform]),
      folder: PLATFORM_SPECS[platform].folder,
    })),
    appScript: path.relative(ROOT, appScript),
  };
  write(path.join(targetRoot, 'STEAMPIPE-MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');

  if (uploadRequested) {
    upload(appScript, {
      appId,
      steamcmd,
      username,
      password,
      guardCode,
      platforms,
    });
  }

  console.log('');
  console.log('SteamPipe package ready.');
  console.log(`- package: ${targetRoot}`);
  console.log(`- app script: ${appScript}`);
  console.log(`- preview: ${preview ? 'yes' : 'no'}`);
  if (!uploadRequested) console.log('- upload: skipped; run npm run deploy:steam:upload when Steamworks config is ready.');
}

main();
