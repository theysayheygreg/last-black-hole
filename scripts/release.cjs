#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');
const {
  VERSION_TRAIN,
  assertCleanTrackedTree,
  assertV02PublicVersion,
  comparePublicVersions,
  currentBuildVersion,
  currentPublicVersion,
  formatPublicVersion,
  updatePublicVersion,
} = require('./version.cjs');

const ROOT = path.resolve(__dirname, '..');
const PRODUCT_NAME = 'Last Singularity';
const PRODUCT_SLUG = 'last-singularity';
const REQUIRED_TARGETS = ['web', 'ipad', 'mac', 'win', 'linux'];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function currentVersion() {
  return currentBuildVersion();
}

function bumpPublic() {
  const version = currentPublicVersion();
  const parsed = assertV02PublicVersion(version);
  const next = formatPublicVersion({ ...parsed, public: parsed.public + 1 });
  updatePublicVersion(next);
  console.log(`Bumped Last Singularity public version: ${version} -> ${next}`);
  console.log('Commit this version bump, then run `npm run release:build` so the build hash names the committed source.');
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
  assertV02PublicVersion();
  if (process.env.LBH_ALLOW_DIRTY_BUILD !== '1') {
    assertCleanTrackedTree();
  }
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
  assertV02PublicVersion(currentPublicVersion());
  const buildRoot = path.join(ROOT, 'builds', `v${version}`);
  const manifestPath = path.join(buildRoot, 'BUILD-MANIFEST.json');

  const missing = artifactChecks(version).filter(([, file]) => !fs.existsSync(file));
  if (missing.length > 0) {
    const details = missing.map(([label, file]) => `- ${label}: ${path.relative(ROOT, file)}`).join('\n');
    throw new Error(`Release build for v${version} is incomplete:\n${details}`);
  }

  const manifest = readJson(manifestPath);
  if (manifest.version !== version) {
    throw new Error(`Build manifest version ${manifest.version} does not match hash build version ${version}.`);
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
      commit: execSync(`git rev-parse ${upstream}`, {
        cwd: ROOT,
        encoding: 'utf8',
      }).trim(),
      version: JSON.parse(pkg).version,
    };
  } catch {
    return { upstream, version: null };
  }
}

function prepushCheck() {
  const version = currentVersion();
  const publicVersion = currentPublicVersion();
  assertV02PublicVersion(publicVersion);
  const upstream = upstreamVersion();
  if (upstream?.version && comparePublicVersions(publicVersion, upstream.version) < 0) {
    throw new Error([
      `Current public version ${publicVersion} is behind ${upstream.upstream} (${upstream.version}).`,
      'Ask Greg before moving to 0.3 or 1.0; otherwise bump the public 0.2.x train and commit it.',
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
    '  bump-public  Increment package/package-lock from 0.2.x to 0.2.(x+1).',
    '  build        Run fast gate, build all release targets, package weekly assets, and check outputs for 0.2.x.<hash>.',
    '  internal     Alias for build; internal handoffs consume the commit hash as the fourth field.',
    '  public       Alias for bump-public; commit it, then run build.',
    '  patch        Legacy alias for public.',
    '  check        Verify the current 0.2.x.<hash> has a complete all-target release build.',
    '  prepush      Verify the current hash-named release build exists and public version is not behind upstream.',
    '',
    'Options:',
    '  --skip-tests  For build/patch only: build without running npm run test:fast.',
    '',
    'Set LBH_SKIP_RELEASE_PREP=1 for intentional docs/process-only pushes that do not publish a build.',
  ].join('\n'));
}

function main() {
  const command = process.argv[2] || 'check';
  if (command === 'bump-public') {
    bumpPublic();
    return;
  }
  if (command === 'build' || command === 'internal') {
    buildRelease();
    return;
  }
  if (command === 'public' || command === 'patch') {
    bumpPublic();
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
