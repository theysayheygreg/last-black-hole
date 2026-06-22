#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const PKG = require(path.join(ROOT, 'package.json'));
const PRODUCT_NAME = 'Last Singularity';
const DESKTOP_ENTRY_NAME = 'last-singularity.desktop';

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

function writeRemoteFile(ssh, target, remotePath, body) {
  execFileSync(
    ssh,
    [...sshOptions(), target, `cat > ${shellQuote(remotePath)}`],
    {
      cwd: ROOT,
      input: body,
      stdio: ['pipe', 'inherit', 'inherit'],
    }
  );
}

function buildRoot(mode) {
  const suffix = mode === 'release' ? '' : `-${mode}`;
  return path.join(ROOT, 'builds', `v${PKG.version}${suffix}`);
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
  const noBuild = hasFlag('--no-build');
  const dryRun = hasFlag('--dry-run');
  const skipPreflight = hasFlag('--skip-preflight');
  const ssh = process.env.LBH_SSH || 'ssh';

  if (!['dev', 'test', 'release'].includes(mode)) {
    throw new Error(`Invalid mode "${mode}". Use dev, test, or release.`);
  }

  requireDeckHost(host);
  const target = sshTarget(user, host);

  if (!skipPreflight) {
    run(ssh, [...sshOptions(), target, 'true'], { skipOnDryRun: true });
  }

  if (!noBuild) {
    run('node', ['scripts/build.cjs', '--targets=linux', `--mode=${mode}`]);
  }

  const artifact = path.join(buildRoot(mode), `${PRODUCT_NAME}-linux-x64`);
  if (!fs.existsSync(artifact)) {
    throw new Error(`Missing Linux Deck artifact: ${artifact}`);
  }

  const executable = path.join(remoteDir, PRODUCT_NAME);
  const launcher = path.join(remoteDir, 'run-last-singularity.sh');
  const desktopEntry = path.join(remoteDir, DESKTOP_ENTRY_NAME);
  const localDesktopEntry = `/home/${user}/.local/share/applications/${DESKTOP_ENTRY_NAME}`;
  const desktopShortcut = `/home/${user}/Desktop/Last Singularity.desktop`;
  const launcherBody = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'cd "$(dirname "$0")"',
    'export LBH_DECK=1',
    `exec "./${PRODUCT_NAME}" --no-sandbox "$@"`,
    '',
  ].join('\n');
  const desktopBody = [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${PRODUCT_NAME}`,
    `Comment=${PRODUCT_NAME} local playtest build`,
    `Exec=${launcher}`,
    `Path=${remoteDir}`,
    'Terminal=false',
    'Categories=Game;',
    'StartupNotify=false',
    '',
  ].join('\n');

  run(ssh, [...sshOptions(), target, `mkdir -p ${shellQuote(remoteDir)}`], { skipOnDryRun: true });

  const rsyncArgs = ['-az', '--delete'];
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
        [
          `mkdir -p ${shellQuote(path.posix.dirname(localDesktopEntry))} ${shellQuote(path.posix.dirname(desktopShortcut))}`,
          `cp ${shellQuote(desktopEntry)} ${shellQuote(localDesktopEntry)}`,
          `cp ${shellQuote(desktopEntry)} ${shellQuote(desktopShortcut)}`,
          `chmod +x ${shellQuote(launcher)} ${shellQuote(executable)} ${shellQuote(desktopEntry)} ${shellQuote(localDesktopEntry)} ${shellQuote(desktopShortcut)}`,
          `test -x ${shellQuote(executable)}`,
        ].join(' && '),
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
  console.log('');
  console.log('On the Deck, add run-last-singularity.sh or the Last Singularity desktop shortcut as a non-Steam game from Desktop Mode.');
}

main();
