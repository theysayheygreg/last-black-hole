#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { argValue, hasFlag } = require('./cli.cjs');
const { currentBuildVersion } = require('../version.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const PRODUCT_NAME = 'Last Singularity';
const DESKTOP_ENTRY_NAME = 'last-singularity.desktop';
const BUILD_VERSION = currentBuildVersion();

function run(command, args, options = {}) {
  console.log(`$ ${[command, ...args].join(' ')}`);
  if (hasFlag('--dry-run') && options.skipOnDryRun) return;
  execFileSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    ...options,
  });
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function sshTarget(user, host) {
  return host.includes('@') ? host : `${user}@${host}`;
}

function sshOptions() {
  return [
    '-o', 'ConnectTimeout=8',
    '-o', 'StrictHostKeyChecking=accept-new',
  ];
}

function remoteCommand(command) {
  return `export PATH=/usr/bin:/bin:/usr/sbin:/sbin:$PATH\n${command}`;
}

function writeRemoteFile(ssh, target, remotePath, body) {
  execFileSync(
    ssh,
    [...sshOptions(), target, remoteCommand(`cat > ${shellQuote(remotePath)}`)],
    {
      cwd: ROOT,
      input: body,
      stdio: ['pipe', 'inherit', 'inherit'],
    }
  );
}

function buildRoot(mode) {
  const suffix = mode === 'release' ? '' : `-${mode}`;
  return path.join(ROOT, 'builds', `v${BUILD_VERSION}${suffix}`);
}

function requireDeckHost(host) {
  if (!host) {
    throw new Error([
      'Missing Steam Deck Tailscale host.',
      'Set LBH_DECK_HOST=steamdeck, use a MagicDNS name, or pass --host=100.x.y.z.',
    ].join(' '));
  }
}

function main() {
  const mode = argValue('--mode', process.env.LBH_DEPLOY_MODE || 'release');
  const host = argValue('--host', process.env.LBH_DECK_HOST || '');
  const user = argValue('--user', process.env.LBH_DECK_USER || 'deck');
  const remoteDir = argValue(
    '--dir',
    process.env.LBH_DECK_DIR || '/home/deck/Games/last-singularity'
  );
  const displayName = argValue('--name', process.env.LBH_DECK_NAME || PRODUCT_NAME);
  const installSlug = argValue('--slug', process.env.LBH_DECK_SLUG || 'last-singularity');
  const artifactOverride = argValue('--artifact', process.env.LBH_DECK_ARTIFACT || '');
  const noBuild = hasFlag('--no-build');
  const forceBuild = hasFlag('--force-build');
  const dryRun = hasFlag('--dry-run');
  const skipPreflight = hasFlag('--skip-preflight');
  const ssh = process.env.LBH_SSH || 'ssh';

  if (!['dev', 'test', 'release'].includes(mode)) {
    throw new Error(`Invalid mode "${mode}". Use dev, test, or release.`);
  }

  requireDeckHost(host);
  const target = sshTarget(user, host);

  if (!skipPreflight) {
    run(ssh, [...sshOptions(), target, remoteCommand('true')], { skipOnDryRun: true });
  }

  const artifact = artifactOverride
    ? path.resolve(artifactOverride)
    : path.join(buildRoot(mode), `${PRODUCT_NAME}-linux-x64`);
  if (!artifactOverride && !noBuild && (forceBuild || !fs.existsSync(artifact))) {
    run('node', ['scripts/build.cjs', '--targets=linux', `--mode=${mode}`]);
  } else if (!noBuild) {
    console.log(`Reusing existing Linux Deck artifact: ${artifact}`);
  }

  if (!fs.existsSync(artifact)) {
    throw new Error(`Missing Linux Deck artifact: ${artifact}`);
  }

  const executable = path.join(remoteDir, PRODUCT_NAME);
  const launcher = path.join(remoteDir, 'run-last-singularity.sh');
  const desktopEntryName = `${installSlug}.desktop`;
  const desktopEntry = path.join(remoteDir, desktopEntryName);
  const localDesktopEntry = `/home/${user}/.local/share/applications/${desktopEntryName}`;
  const desktopShortcut = `/home/${user}/Desktop/${displayName}.desktop`;
  const launcherBody = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'cd "$(dirname "$0")"',
    'export LBH_DECK=1',
    'export ELECTRON_ENABLE_LOGGING="${ELECTRON_ENABLE_LOGGING:-1}"',
    `LOG_DIR="\${XDG_STATE_HOME:-$HOME/.local/state}/${installSlug}"`,
    'mkdir -p "$LOG_DIR"',
    'for name in deck-launch electron; do',
    '  if [ -f "$LOG_DIR/$name.log" ]; then',
    '    mv "$LOG_DIR/$name.log" "$LOG_DIR/$name.previous.log"',
    '  fi',
    'done',
    'export ELECTRON_LOG_FILE="$LOG_DIR/electron.log"',
    'export LBH_DECK_LOG_DIR="$LOG_DIR"',
    'EXTRA_FLAGS=()',
    'if [ "${LBH_DECK_DISABLE_GPU:-0}" = "1" ]; then',
    '  EXTRA_FLAGS+=("--disable-gpu")',
    'fi',
    'if [ "${LBH_DECK_DISABLE_GPU_COMPOSITING:-0}" = "1" ]; then',
    '  EXTRA_FLAGS+=("--disable-gpu-compositing")',
    'fi',
    'if [ "${LBH_DECK_IN_PROCESS_GPU:-0}" = "1" ]; then',
    '  EXTRA_FLAGS+=("--in-process-gpu")',
    'fi',
    'if [ -n "${LBH_DECK_EXTRA_FLAGS:-}" ]; then',
    '  read -r -a USER_EXTRA_FLAGS <<< "$LBH_DECK_EXTRA_FLAGS"',
    '  EXTRA_FLAGS+=("${USER_EXTRA_FLAGS[@]}")',
    'fi',
    [
      `exec "./${PRODUCT_NAME}"`,
      '--no-sandbox',
      '--disable-gpu-sandbox',
      '--ignore-gpu-blocklist',
      '--ozone-platform=x11',
      '--enable-logging=stderr',
      `"--user-data-dir=\${XDG_CONFIG_HOME:-$HOME/.config}/${installSlug}"`,
      '"${EXTRA_FLAGS[@]}"',
      '"$@"',
      '>> "$LOG_DIR/deck-launch.log" 2>&1',
    ].join(' '),
    '',
  ].join('\n');
  const desktopBody = [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${displayName}`,
    `Comment=${displayName} local playtest build`,
    `Exec=${launcher}`,
    `Path=${remoteDir}`,
    `Icon=${path.posix.join(remoteDir, 'last-singularity-icon.png')}`,
    'Terminal=false',
    'Categories=Game;',
    'StartupNotify=false',
    `StartupWMClass=${PRODUCT_NAME}`,
    '',
  ].join('\n');

  run(ssh, [...sshOptions(), target, remoteCommand(`mkdir -p ${shellQuote(remoteDir)}`)], { skipOnDryRun: true });

  const rsyncArgs = ['-az', '--delete'];
  rsyncArgs.push('--rsync-path=/usr/bin/rsync');
  rsyncArgs.push('-e', [ssh, ...sshOptions()].join(' '));
  if (dryRun) rsyncArgs.push('--dry-run');
  rsyncArgs.push(`${artifact}/`, `${target}:${remoteDir}/`);
  run(process.env.LBH_RSYNC || 'rsync', rsyncArgs);

  if (!dryRun) {
    writeRemoteFile(ssh, target, launcher, launcherBody);
    writeRemoteFile(ssh, target, desktopEntry, desktopBody);
    execFileSync(
      ssh,
      [
        ...sshOptions(),
        target,
        remoteCommand([
          `mkdir -p ${shellQuote(path.posix.dirname(localDesktopEntry))} ${shellQuote(path.posix.dirname(desktopShortcut))}`,
          `cp ${shellQuote(desktopEntry)} ${shellQuote(localDesktopEntry)}`,
          `cp ${shellQuote(desktopEntry)} ${shellQuote(desktopShortcut)}`,
          `chmod +x ${shellQuote(launcher)} ${shellQuote(executable)} ${shellQuote(desktopEntry)} ${shellQuote(localDesktopEntry)} ${shellQuote(desktopShortcut)}`,
          `test -x ${shellQuote(executable)}`,
        ].join(' && ')),
      ],
      {
        cwd: ROOT,
        stdio: 'inherit',
      }
    );
  }

  console.log('');
  console.log('Steam Deck deploy ready.');
  console.log(`- source: ${artifact}`);
  console.log(`- target: ${target}:${remoteDir}`);
  console.log(`- launcher: ${launcher}`);
  console.log(`- desktop entry: ${desktopEntry}`);
  console.log(`- display name: ${displayName}`);
  console.log(`- data namespace: ${installSlug}`);
  console.log('');
  console.log(`On the Deck, launch ${displayName} from Desktop Mode or register it with deck:gaming-mode.`);
}

main();
