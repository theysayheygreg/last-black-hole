#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');
const {
  assertCleanTrackedTree,
  assertPublicVersion,
  buildIdForMode,
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
  const parsed = assertPublicVersion(version);
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
  assertPublicVersion();
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

function buildDropRelease() {
  assertPublicVersion();
  if (process.env.LBH_ALLOW_DIRTY_BUILD !== '1') {
    assertCleanTrackedTree();
  }
  if (!hasFlag('--skip-tests')) {
    run('node', ['tests/run-all.cjs', '--lane=fast', '--suite=CloudflareDrop', '--renderer=three']);
  }
  run('node', ['scripts/build.cjs', '--targets=drop', '--mode=release']);
  checkDropReleaseBuild();
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
  assertPublicVersion(currentPublicVersion());
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

function dropArtifactChecks(version) {
  const buildRoot = path.join(ROOT, 'builds', buildIdForMode('release', version));
  return [
    ['manifest', path.join(buildRoot, 'BUILD-MANIFEST.json')],
    ['drop build info', path.join(buildRoot, 'BUILD-INFO-drop.json')],
    ['drop entrypoint', path.join(buildRoot, `${PRODUCT_SLUG}-cloudflare-drop`, 'index.html')],
    ['drop debug entrypoint', path.join(buildRoot, `${PRODUCT_SLUG}-cloudflare-drop`, 'index-a.html')],
    ['drop notes', path.join(buildRoot, `${PRODUCT_SLUG}-cloudflare-drop`, 'CLOUDFLARE-DROP.md')],
    ['drop zip', path.join(ROOT, 'builds', `${PRODUCT_SLUG}-cloudflare-drop-${buildIdForMode('release', version)}.zip`)],
  ];
}

function checkDropReleaseBuild() {
  const version = currentVersion();
  assertPublicVersion(currentPublicVersion());
  const buildRoot = path.join(ROOT, 'builds', buildIdForMode('release', version));
  const manifestPath = path.join(buildRoot, 'BUILD-MANIFEST.json');

  const missing = dropArtifactChecks(version).filter(([, file]) => !fs.existsSync(file));
  if (missing.length > 0) {
    const details = missing.map(([label, file]) => `- ${label}: ${path.relative(ROOT, file)}`).join('\n');
    throw new Error(`Cloudflare Drop release build for v${version} is incomplete:\n${details}`);
  }

  const manifest = readJson(manifestPath);
  if (manifest.version !== version) {
    throw new Error(`Drop build manifest version ${manifest.version} does not match hash build version ${version}.`);
  }
  if (manifest.mode !== 'release') {
    throw new Error(`Drop build manifest mode must be release, got ${manifest.mode}.`);
  }

  const dropResult = (manifest.results || []).find((item) => item.target === 'drop');
  if (!dropResult || dropResult.status !== 'built') {
    throw new Error('Cloudflare Drop release build is missing a built drop target.');
  }

  const info = readJson(path.join(buildRoot, 'BUILD-INFO-drop.json'));
  if (info.runtimeMode !== 'local-sandbox' || info.authority !== 'none') {
    throw new Error('Cloudflare Drop release build must stay a local-sandbox, no-authority artifact.');
  }

  console.log(`Cloudflare Drop release build check passed for v${version}.`);
}

function releaseStatus() {
  const publicVersion = currentPublicVersion();
  const version = currentVersion();
  const missing = artifactChecks(version).filter(([, file]) => !fs.existsSync(file));
  const complete = missing.length === 0;
  const lines = [
    `LBH public train: ${publicVersion}`,
    `LBH build version: ${version}`,
    `Hash-named release build: ${complete ? 'present' : 'missing'}`,
  ];

  if (!hasFlag('--brief') && missing.length > 0) {
    lines.push('Missing artifacts:');
    for (const [label, file] of missing) {
      lines.push(`- ${label}: ${path.relative(ROOT, file)}`);
    }
  }
  if (!complete) {
    lines.push('Run `npm run release:internal` before handoff/push if this commit should publish a build.');
  }

  console.log(lines.join('\n'));
  return complete;
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
  assertPublicVersion(publicVersion);
  const upstream = upstreamVersion();
  if (upstream?.version && comparePublicVersions(publicVersion, upstream.version) < 0) {
    throw new Error([
      `Current public version ${publicVersion} is behind ${upstream.upstream} (${upstream.version}).`,
      'Ask Greg before changing the major/minor train; otherwise bump the current public patch and commit it.',
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
    '  bump-public  Increment the package/package-lock patch on the active version train.',
    '  build        Run fast gate, build all release targets, package weekly assets, and check hash-named outputs.',
    '  drop         Run the Drop gate, build the Cloudflare Drop target, and check hash-named outputs.',
    '  internal     Alias for build; internal handoffs consume the commit hash as the fourth field.',
    '  public       Alias for bump-public; commit it, then run build.',
    '  patch        Legacy alias for public.',
    '  check        Verify the current <major>.<minor>.<patch>.<hash> has a complete all-target release build.',
    '  prepush      Verify the current hash-named release build exists and public version is not behind upstream.',
    '  status       Print current public train, hash build version, and artifact presence.',
    '',
    'Options:',
    '  --skip-tests  For build/drop only: build without running the matching fast gate.',
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
  if (command === 'drop') {
    buildDropRelease();
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
  if (command === 'status') {
    releaseStatus();
    return;
  }
  usage();
  process.exit(command === '--help' || command === 'help' ? 0 : 1);
}

main();
