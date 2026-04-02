#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const HEALTH_PATH = path.join(ROOT, 'docs', 'project', 'BUILD-HEALTH.json');
const CHECKS = [
  { name: 'test', cmd: 'npm', args: ['test'] },
  { name: 'renderer', cmd: 'npm', args: ['run', 'test:renderer'] },
];

function git(command) {
  return execSync(command, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function loadHealth() {
  if (!fs.existsSync(HEALTH_PATH)) return null;
  return JSON.parse(fs.readFileSync(HEALTH_PATH, 'utf8'));
}

function saveHealth(payload) {
  fs.writeFileSync(HEALTH_PATH, JSON.stringify(payload, null, 2) + '\n');
}

function nowIso() {
  return new Date().toISOString();
}

function head() {
  return git('git rev-parse HEAD');
}

function branch() {
  return git('git rev-parse --abbrev-ref HEAD');
}

function dirtyPaths() {
  const out = git('git status --short');
  if (!out) return [];
  return out.split('\n').filter(Boolean);
}

function runCheck(check) {
  const startedAt = Date.now();
  const result = spawnSync(check.cmd, check.args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });

  return {
    name: check.name,
    command: [check.cmd, ...check.args].join(' '),
    exitCode: result.status ?? 1,
    ok: result.status === 0,
    durationMs: Date.now() - startedAt,
  };
}

function summarizeStatus(health) {
  const currentHead = head();
  if (!health) {
    return { ok: false, reason: 'missing', message: 'No build health record found.' };
  }
  if (!health.gitHead) {
    return { ok: false, reason: 'missing', message: 'Build health record has not been initialized yet.' };
  }
  if (health.gitHead !== currentHead) {
    return {
      ok: false,
      reason: 'stale',
      message: `Build health is stale. Recorded ${health.gitHead.slice(0, 7)}, current ${currentHead.slice(0, 7)}.`,
    };
  }
  if (!health.ok) {
    return { ok: false, reason: 'failed', message: 'Last recorded verification failed.' };
  }
  return { ok: true, reason: 'current', message: 'Build health is current and green.' };
}

function printStatus(status, health) {
  console.log(status.message);
  if (!health) return;
  console.log(`Recorded at: ${health.recordedAt}`);
  console.log(`Branch: ${health.branch}`);
  console.log(`Git head: ${health.gitHead}`);
  for (const check of health.checks || []) {
    console.log(`- ${check.name}: ${check.ok ? 'pass' : 'fail'} (${check.command})`);
  }
}

function verify() {
  const checks = CHECKS.map(runCheck);
  const ok = checks.every((check) => check.ok);
  const payload = {
    ok,
    recordedAt: nowIso(),
    branch: branch(),
    gitHead: head(),
    checks,
    dirtyPaths: dirtyPaths(),
  };
  saveHealth(payload);
  const status = summarizeStatus(payload);
  printStatus(status, payload);
  process.exit(ok ? 0 : 1);
}

function status() {
  const health = loadHealth();
  const result = summarizeStatus(health);
  printStatus(result, health);
  process.exit(result.ok ? 0 : 1);
}

function main() {
  const mode = process.argv[2] || 'status';
  if (mode === 'verify') {
    verify();
    return;
  }
  if (mode === 'status') {
    status();
    return;
  }
  console.error('Usage: node scripts/build-health.js [status|verify]');
  process.exit(1);
}

main();
