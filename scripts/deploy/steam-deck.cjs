#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const PKG = require(path.join(ROOT, 'package.json'));
const PRODUCT_NAME = 'Last Singularity';

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

  if (!['dev', 'test', 'release'].includes(mode)) {
    throw new Error(`Invalid mode "${mode}". Use dev, test, or release.`);
  }

  requireDeckHost(host);

  if (!noBuild) {
    run('node', ['scripts/build.cjs', '--targets=linux', `--mode=${mode}`]);
  }

  const artifact = path.join(buildRoot(mode), `${PRODUCT_NAME}-linux-x64`);
  if (!fs.existsSync(artifact)) {
    throw new Error(`Missing Linux Deck artifact: ${artifact}`);
  }

  const target = sshTarget(user, host);
  const executable = path.join(remoteDir, PRODUCT_NAME);
  const launcher = path.join(remoteDir, 'run-last-singularity.sh');
  const launcherBody = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'cd "$(dirname "$0")"',
    `exec "./${PRODUCT_NAME}" "$@"`,
    '',
  ].join('\n');

  run('ssh', [target, `mkdir -p ${shellQuote(remoteDir)}`], { skipOnDryRun: true });

  const rsyncArgs = ['-az', '--delete'];
  if (dryRun) rsyncArgs.push('--dry-run');
  rsyncArgs.push(`${artifact}/`, `${target}:${remoteDir}/`);
  run(process.env.LBH_RSYNC || 'rsync', rsyncArgs);

  if (!dryRun) {
    execFileSync(
      process.env.LBH_SSH || 'ssh',
      [
        target,
        [
          `cat > ${shellQuote(launcher)}`,
          `chmod +x ${shellQuote(launcher)} ${shellQuote(executable)}`,
          `test -x ${shellQuote(executable)}`,
        ].join(' && '),
      ],
      {
        cwd: ROOT,
        input: launcherBody,
        stdio: ['pipe', 'inherit', 'inherit'],
      }
    );
  }

  console.log('');
  console.log('Steam Deck deploy ready.');
  console.log(`- source: ${artifact}`);
  console.log(`- target: ${target}:${remoteDir}`);
  console.log(`- launcher: ${launcher}`);
  console.log('');
  console.log('On the Deck, add run-last-singularity.sh as a non-Steam game from Desktop Mode.');
}

main();
