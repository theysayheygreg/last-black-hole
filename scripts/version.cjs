#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PACKAGE_PATH = path.join(ROOT, 'package.json');
const LOCK_PATH = path.join(ROOT, 'package-lock.json');
const VERSION_TRAIN = '0.2';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function parsePublicVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  if (!match) throw new Error(`Expected public version like 0.2.x, got "${version}".`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    public: Number(match[3]),
  };
}

function parseBuildVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)\.([0-9a-fA-F]{7,40}|nogit)$/.exec(String(version).trim());
  if (!match) throw new Error(`Expected build version like 0.2.x.<hash>, got "${version}".`);
  return {
    ...parsePublicVersion(`${match[1]}.${match[2]}.${match[3]}`),
    hash: match[4],
  };
}

function formatPublicVersion({ major, minor, public }) {
  return `${major}.${minor}.${public}`;
}

function currentPublicVersion() {
  return readJson(PACKAGE_PATH).version;
}

function assertV02PublicVersion(version = currentPublicVersion()) {
  const parsed = parsePublicVersion(version);
  if (parsed.major !== 0 || parsed.minor !== 2) {
    throw new Error(`Automated release helpers stay on ${VERSION_TRAIN}.x. Ask Greg before moving to 0.3 or 1.0.`);
  }
  return parsed;
}

function comparePublicVersions(a, b) {
  const left = parsePublicVersion(a);
  const right = parsePublicVersion(b);
  for (const key of ['major', 'minor', 'public']) {
    if (left[key] !== right[key]) return left[key] - right[key];
  }
  return 0;
}

function gitShortHash() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'nogit';
  }
}

function currentBuildVersion(publicVersion = currentPublicVersion(), hash = gitShortHash()) {
  assertV02PublicVersion(publicVersion);
  return `${publicVersion}.${hash}`;
}

function buildIdForMode(mode, buildVersion = currentBuildVersion()) {
  return mode === 'release' ? `v${buildVersion}` : `v${buildVersion}-${mode}`;
}

function updatePublicVersion(version) {
  assertV02PublicVersion(version);
  const pkg = readJson(PACKAGE_PATH);
  pkg.version = version;
  writeJson(PACKAGE_PATH, pkg);

  const lock = readJson(LOCK_PATH);
  lock.version = version;
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = version;
  }
  writeJson(LOCK_PATH, lock);
}

function trackedStatus() {
  return execSync('git status --porcelain --untracked-files=no', {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
}

function assertCleanTrackedTree() {
  const status = trackedStatus();
  if (!status) return;
  throw new Error([
    'Release builds must be made from committed tracked source so 0.2.x.<hash> is truthful.',
    'Commit or stash tracked changes, then run the release build again.',
    'Set LBH_ALLOW_DIRTY_BUILD=1 only for an explicit local probe.',
    status,
  ].join('\n'));
}

module.exports = {
  ROOT,
  VERSION_TRAIN,
  assertCleanTrackedTree,
  assertV02PublicVersion,
  buildIdForMode,
  comparePublicVersions,
  currentBuildVersion,
  currentPublicVersion,
  formatPublicVersion,
  gitShortHash,
  parseBuildVersion,
  parsePublicVersion,
  updatePublicVersion,
};

if (require.main === module) {
  const command = process.argv[2] || 'build';
  if (command === 'public') {
    console.log(currentPublicVersion());
  } else if (command === 'hash') {
    console.log(gitShortHash());
  } else if (command === 'build') {
    console.log(currentBuildVersion());
  } else {
    console.error('Usage: node scripts/version.cjs [build|public|hash]');
    process.exit(1);
  }
}
