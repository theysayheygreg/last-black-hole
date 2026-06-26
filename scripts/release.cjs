#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PACKAGE_PATH = path.join(ROOT, 'package.json');
const LOCK_PATH = path.join(ROOT, 'package-lock.json');
const PRODUCT_NAME = 'Last Singularity';
const PRODUCT_SLUG = 'last-singularity';
const VERSION_TRAIN = '0.2';
const REQUIRED_TARGETS = ['web', 'ipad', 'mac', 'win', 'linux'];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function currentVersion() {
  return readJson(PACKAGE_PATH).version;
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  if (!match) throw new Error(`Expected semver version like 0.2.x, got "${version}".`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function assertV02Patch(version = currentVersion()) {
  const parsed = parseVersion(version);
  if (parsed.major !== 0 || parsed.minor !== 2) {
    throw new Error(`Release pushes must stay on the ${VERSION_TRAIN}.x train for now. Current version is ${version}.`);
  }
  return parsed;
}

function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] - right[key];
  }
  return 0;
}

function updateVersion(version) {
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

function bumpPatch() {
  const version = currentVersion();
  const parsed = assertV02Patch(version);
  const next = `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
  updateVersion(next);
  console.log(`Bumped Last Singularity release version: ${version} -> ${next}`);
  return next;
}

function run(command, args) {
  console.log(`$ ${[command, ...args].join(' ')}`);
  execFileSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function buildRelease() {
  assertV02Patch();
  if (!hasFlag('--skip-tests')) {
    run('npm', ['run', 'test:fast']);
  }
  run('node', ['scripts/build.cjs', `--targets=${REQUIRED_TARGETS.join(',')}`, '--mode=release']);
  run('node', ['scripts/ci/package-nightly-assets.cjs']);
  checkReleaseBuild();
}

function artifactChecks(version) {
  const buildRoot = path.join(ROOT, 'builds', `v${version}`);
  return [
    ['manifest', path.join(buildRoot, 'BUILD-MANIFEST.json')],
    ['web entrypoint', path.join(buildRoot, `${PRODUCT_SLUG}-web`, 'index.html')],
    ['ipad entrypoint', path.join(buildRoot, `${PRODUCT_SLUG}-ipad-webapp`, 'index.html')],
    ['mac app', path.join(buildRoot, `${PRODUCT_NAME}.app`)],
    ['windows exe', path.join(buildRoot, `${PRODUCT_NAME}-win32-x64`, `${PRODUCT_NAME}.exe`)],
    ['linux executable', path.join(buildRoot, `${PRODUCT_NAME}-linux-x64`, PRODUCT_NAME)],
    ['combined playtest zip', path.join(ROOT, 'builds', `${PRODUCT_SLUG}-playtest-v${version}.zip`)],
    ['weekly staging manifest', path.join(ROOT, 'dist', 'nightly', 'BUILD-MANIFEST.json')],
  ];
}

function checkReleaseBuild() {
  const version = currentVersion();
  assertV02Patch(version);
  const buildRoot = path.join(ROOT, 'builds', `v${version}`);
  const manifestPath = path.join(buildRoot, 'BUILD-MANIFEST.json');

  const missing = artifactChecks(version).filter(([, file]) => !fs.existsSync(file));
  if (missing.length > 0) {
    const details = missing.map(([label, file]) => `- ${label}: ${path.relative(ROOT, file)}`).join('\n');
    throw new Error(`Release build for v${version} is incomplete:\n${details}`);
  }

  const manifest = readJson(manifestPath);
  if (manifest.version !== version) {
    throw new Error(`Build manifest version ${manifest.version} does not match package version ${version}.`);
  }
  if (manifest.mode !== 'release') {
    throw new Error(`Build manifest mode must be release, got ${manifest.mode}.`);
  }

  const builtTargets = new Map((manifest.results || []).map((item) => [item.target, item]));
  for (const target of REQUIRED_TARGETS) {
    const result = builtTargets.get(target);
    if (!result || result.status !== 'built') {
      throw new Error(`Release build is missing built target "${target}".`);
    }
  }

  console.log(`Release build check passed for v${version}.`);
}

function upstreamVersion() {
  let upstream = '';
  try {
    upstream = execSync('git rev-parse --abbrev-ref --symbolic-full-name @{u}', {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }

  try {
    const pkg = execSync(`git show ${upstream}:package.json`, {
      cwd: ROOT,
      encoding: 'utf8',
    });
    return {
      upstream,
      version: JSON.parse(pkg).version,
    };
  } catch {
    return { upstream, version: null };
  }
}

function prepushCheck() {
  const version = currentVersion();
  assertV02Patch(version);
  const upstream = upstreamVersion();
  if (upstream?.version && compareVersions(version, upstream.version) <= 0) {
    throw new Error([
      `Current package version ${version} is not ahead of ${upstream.upstream} (${upstream.version}).`,
      'Run `npm run release:patch`, commit the version/build docs, then push again.',
      'For an intentional docs/process-only push that does not publish a build, set `LBH_SKIP_RELEASE_PREP=1`.',
    ].join('\n'));
  }
  checkReleaseBuild();
}

function usage() {
  console.log([
    'Usage: node scripts/release.cjs <command>',
    '',
    'Commands:',
    '  bump-patch   Increment package/package-lock from 0.2.x to the next patch.',
    '  build        Run fast gate, build all release targets, package weekly assets, and check outputs.',
    '  patch        bump-patch + build.',
    '  check        Verify the current version has a complete all-target release build.',
    '  prepush      Verify current version is ahead of upstream and has a complete release build.',
    '',
    'Options:',
    '  --skip-tests  For build/patch only: build without running npm run test:fast.',
    '',
    'Set LBH_SKIP_RELEASE_PREP=1 for intentional docs/process-only pushes that do not publish a build.',
  ].join('\n'));
}

function main() {
  const command = process.argv[2] || 'check';
  if (command === 'bump-patch') {
    bumpPatch();
    return;
  }
  if (command === 'build') {
    buildRelease();
    return;
  }
  if (command === 'patch') {
    bumpPatch();
    buildRelease();
    return;
  }
  if (command === 'check') {
    checkReleaseBuild();
    return;
  }
  if (command === 'prepush') {
    prepushCheck();
    return;
  }
  usage();
  process.exit(command === '--help' || command === 'help' ? 0 : 1);
}

main();
