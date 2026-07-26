#!/usr/bin/env node

const dns = require('dns');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { argValue, hasFlag } = require('./cli.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_REMOTE_DIR = '/home/deck/Games/last-singularity';
const MACOS_TAILSCALE = '/Applications/Tailscale.app/Contents/MacOS/Tailscale';

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function stripTrailingDot(value) {
  return String(value || '').replace(/\.$/, '');
}

function runCapture(command, args, { timeout = 8000 } = {}) {
  try {
    return {
      ok: true,
      stdout: execFileSync(command, args, {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout,
      }),
      stderr: '',
    };
  } catch (err) {
    return {
      ok: false,
      stdout: err.stdout?.toString() || '',
      stderr: err.stderr?.toString() || err.message,
      code: err.status,
    };
  }
}

function findExecutable(name) {
  const found = runCapture('/bin/sh', ['-lc', `command -v ${shellQuote(name)}`], { timeout: 2000 });
  return found.ok ? found.stdout.trim() : '';
}

function tailscalePath() {
  const explicit = process.env.LBH_TAILSCALE_PATH || process.env.TAILSCALE_PATH || '';
  if (explicit && fs.existsSync(explicit)) return explicit;
  const onPath = findExecutable('tailscale');
  if (onPath) return onPath;
  if (fs.existsSync(MACOS_TAILSCALE)) return MACOS_TAILSCALE;
  return '';
}

function sshTarget(user, host) {
  return host.includes('@') ? host : `${user}@${host}`;
}

function tailDomain(status) {
  const selfName = stripTrailingDot(status?.Self?.DNSName || '');
  const firstDot = selfName.indexOf('.');
  return firstDot >= 0 ? selfName.slice(firstDot + 1) : '';
}

function addCandidate(candidates, host, reason) {
  const clean = stripTrailingDot(host);
  if (!clean) return;
  const key = clean.toLowerCase();
  if (candidates.has(key)) return;
  candidates.set(key, { host: clean, reason });
}

function candidateHosts(status, explicitHost) {
  const candidates = new Map();
  if (explicitHost) addCandidate(candidates, explicitHost, 'explicit --host/LBH_DECK_HOST');

  const domain = tailDomain(status);
  if (!explicitHost) {
    for (const base of ['steamdeck', 'steam-deck', 'deck']) {
      addCandidate(candidates, base, 'default Deck name probe');
      if (domain) addCandidate(candidates, `${base}.${domain}`, 'default MagicDNS probe');
    }
  }

  for (const peer of Object.values(status?.Peer || {})) {
    const haystack = [
      peer.HostName,
      peer.DNSName,
      peer.OS,
      ...(peer.TailscaleIPs || []),
    ].join(' ');
    if (!/(steam|deck|steamos|linux)/i.test(haystack)) continue;
    addCandidate(candidates, peer.DNSName, 'Tailscale peer match');
    addCandidate(candidates, peer.HostName, 'Tailscale peer hostname match');
    for (const ip of peer.TailscaleIPs || []) addCandidate(candidates, ip, 'Tailscale peer IP');
  }

  return [...candidates.values()];
}

function lookupHost(host, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ host, ok: false, error: 'DNS timeout' }), timeoutMs);
    dns.lookup(host, { family: 4 }, (err, address) => {
      clearTimeout(timer);
      if (err) resolve({ host, ok: false, error: err.code || err.message });
      else resolve({ host, ok: true, address });
    });
  });
}

function tailscalePing(tailscale, host) {
  if (!tailscale) return { ok: false, output: 'tailscale CLI unavailable' };
  const result = runCapture(tailscale, ['ping', '--c=1', '--timeout=3s', host], { timeout: 5000 });
  return {
    ok: result.ok,
    output: `${result.stdout}${result.stderr}`.trim(),
  };
}

function sshProbe(host, user, remoteDir, prepare) {
  const ssh = process.env.LBH_SSH || 'ssh';
  const target = sshTarget(user, host);
  const remoteParent = path.posix.dirname(remoteDir);
  const probe = prepare
    ? [
        `mkdir -p ${shellQuote(remoteDir)}`,
        `test -w ${shellQuote(remoteDir)}`,
        `printf 'prepared=%s user=%s host=%s\\n' ${shellQuote(remoteDir)} "$(whoami)" "$(hostname)"`,
      ].join(' && ')
    : [
        `printf 'user=%s host=%s home=%s\\n' "$(whoami)" "$(hostname)" "$HOME"`,
        `if [ -d ${shellQuote(remoteDir)} ]; then test -w ${shellQuote(remoteDir)} && echo 'deploy-dir=ready' || echo 'deploy-dir=not-writable'; else echo 'deploy-dir=missing'; fi`,
        `if [ -d ${shellQuote(remoteParent)} ]; then test -w ${shellQuote(remoteParent)} && echo 'parent-dir=ready' || echo 'parent-dir=not-writable'; else echo 'parent-dir=missing'; fi`,
      ].join(' ; ');

  const result = runCapture(ssh, [
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=6',
    '-o', 'StrictHostKeyChecking=accept-new',
    target,
    probe,
  ], { timeout: 10000 });

  return {
    ok: result.ok,
    target,
    output: `${result.stdout}${result.stderr}`.trim(),
  };
}

function printStatus(status, tailscale) {
  const self = status?.Self || {};
  console.log('Tailscale');
  console.log(`- cli: ${tailscale || 'not found'}`);
  console.log(`- self: ${self.HostName || 'unknown'} ${stripTrailingDot(self.DNSName || '')}`);
  console.log(`- ips: ${(self.TailscaleIPs || []).join(', ') || 'unknown'}`);
  const peers = Object.values(status?.Peer || {});
  if (!peers.length) {
    console.log('- peers: none visible');
    return;
  }
  console.log('- peers:');
  for (const peer of peers) {
    const name = stripTrailingDot(peer.DNSName || peer.HostName || 'unknown');
    const ips = (peer.TailscaleIPs || []).join(', ');
    console.log(`  - ${name} [${peer.OS || 'unknown'}] online=${peer.Online === true} ips=${ips}`);
  }
}

async function main() {
  const explicitHost = argValue('--host', process.env.LBH_DECK_HOST || '');
  const user = argValue('--user', process.env.LBH_DECK_USER || 'deck');
  const remoteDir = argValue('--dir', process.env.LBH_DECK_DIR || DEFAULT_REMOTE_DIR);
  const prepare = hasFlag('--prepare');
  const skipSsh = hasFlag('--no-ssh');
  const soft = hasFlag('--soft');

  const tailscale = tailscalePath();
  let status = {};
  if (tailscale) {
    const statusResult = runCapture(tailscale, ['status', '--json'], { timeout: 6000 });
    if (statusResult.ok) {
      status = JSON.parse(statusResult.stdout);
    } else {
      console.log(`Tailscale status failed: ${statusResult.stderr || statusResult.stdout}`);
    }
  }

  printStatus(status, tailscale);
  console.log('');

  const candidates = candidateHosts(status, explicitHost);
  if (!candidates.length) {
    console.log('No Deck candidates found.');
    console.log('Next: enroll the Steam Deck in this tailnet, name it steamdeck, then rerun:');
    console.log('  npm run deck:preflight -- --host=steamdeck --prepare');
    process.exit(soft ? 0 : 1);
  }

  console.log('Candidates');
  let best = null;
  for (const candidate of candidates) {
    const resolved = await lookupHost(candidate.host);
    const ping = resolved.ok ? tailscalePing(tailscale, candidate.host) : { ok: false, output: 'skipped; DNS did not resolve' };
    let ssh = { ok: false, output: skipSsh ? 'skipped by --no-ssh' : 'skipped; DNS did not resolve' };
    if (!skipSsh && resolved.ok) ssh = sshProbe(candidate.host, user, remoteDir, prepare);

    console.log(`- ${candidate.host} (${candidate.reason})`);
    console.log(`  dns: ${resolved.ok ? resolved.address : resolved.error}`);
    console.log(`  tailscale ping: ${ping.ok ? 'ok' : 'not ready'}`);
    if (ping.output) console.log(`  ping detail: ${ping.output.split('\n')[0]}`);
    console.log(`  ssh: ${skipSsh ? 'skipped' : (ssh.ok ? 'ok' : 'not ready')}`);
    if (ssh.output) console.log(`  ssh detail: ${ssh.output.split('\n')[0]}`);

    if (!best && resolved.ok && (skipSsh || ssh.ok)) {
      best = { host: candidate.host, address: resolved.address, ssh };
    }
  }

  console.log('');
  if (best) {
    console.log('Deck target ready.');
    console.log(`- host: ${best.host}`);
    console.log(`- address: ${best.address}`);
    console.log(`- remote dir: ${remoteDir}`);
    console.log('');
    console.log('Deploy command:');
    console.log(`  LBH_DECK_HOST=${shellQuote(best.host)} npm run deploy:deck`);
    return;
  }

  console.log('Deck target is not ready yet.');
  console.log('Expected final shape: Tailscale peer resolves, `tailscale ping` succeeds, and SSH as deck works.');
  console.log('After Deck setup, rerun:');
  console.log(`  npm run deck:preflight -- --host=${explicitHost || 'steamdeck'} --prepare`);
  process.exit(soft ? 0 : 1);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
