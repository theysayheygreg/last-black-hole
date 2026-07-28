#!/usr/bin/env node

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const installer = path.join(root, 'scripts', 'install.sh');
const windowsInstaller = fs.readFileSync(path.join(root, 'scripts', 'install.ps1'), 'utf8');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lbh-installer-'));
const fixtures = path.join(temp, 'fixtures');
const bin = path.join(temp, 'bin');
fs.mkdirSync(fixtures);
fs.mkdirSync(bin);

assert.match(windowsInstaller, /OSArchitecture/, 'Windows installer must detect the native architecture');
assert.match(windowsInstaller, /last-singularity-win-nightly\.zip/, 'Windows x64 must select the Windows release asset');
assert.match(windowsInstaller, /current public build requires x64 Windows/, 'unsupported Windows architectures must fail clearly');
assert.match(windowsInstaller, /\$Name\.lnk/, 'Windows historical installs must own a distinct shortcut name');
assert.match(windowsInstaller, /Programs\\\$folder/, 'Windows historical installs must own a distinct install folder');
assert.match(windowsInstaller, /--user-data-dir=.*\$Slug/, 'Windows historical installs must own separate user data');

function zipFixture(name, platform) {
  const staging = path.join(temp, `stage-${platform}`);
  fs.mkdirSync(staging);
  if (platform === 'mac') {
    const executable = path.join(staging, 'Last Singularity.app', 'Contents', 'MacOS');
    fs.mkdirSync(executable, { recursive: true });
    fs.writeFileSync(path.join(executable, 'Last Singularity'), 'mac-build\n');
  } else {
    const app = path.join(staging, 'Last Singularity-linux-x64');
    fs.mkdirSync(app);
    fs.writeFileSync(path.join(app, 'Last Singularity'), 'linux-build\n', { mode: 0o755 });
    fs.writeFileSync(path.join(app, 'last-singularity-icon.png'), 'icon\n');
  }
  execFileSync('zip', ['-qr', path.join(fixtures, name), '.'], { cwd: staging });
}

zipFixture('last-singularity-mac-nightly.zip', 'mac');
zipFixture('last-singularity-linux-nightly.zip', 'linux');

function writeRelease({ missing = false, checksums = false } = {}) {
  const assets = missing
    ? []
    : [
        { name: 'last-singularity-mac-nightly.zip' },
        { name: 'last-singularity-linux-nightly.zip' },
        ...(checksums ? [{ name: 'SHA256SUMS' }] : []),
      ];
  fs.writeFileSync(
    path.join(fixtures, 'release.json'),
    JSON.stringify({ tag_name: 'nightly-latest', draft: false, prerelease: true, assets }),
  );
}

function writeSums(valid = true) {
  const asset = 'last-singularity-linux-nightly.zip';
  const hash = valid
    ? crypto.createHash('sha256').update(fs.readFileSync(path.join(fixtures, asset))).digest('hex')
    : '0'.repeat(64);
  fs.writeFileSync(path.join(fixtures, 'SHA256SUMS'), `${hash}  ${asset}\n`);
}

fs.writeFileSync(
  path.join(bin, 'curl'),
  `#!/bin/sh
set -eu
out=
url=
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -H) shift 2 ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
[ -n "$out" ] || exit 2
case "$url" in
  *api-failure*) exit 22 ;;
  */repos/*/releases/tags/*) cp "$LBH_FIXTURES/release.json" "$out" ;;
  */SHA256SUMS) cp "$LBH_FIXTURES/SHA256SUMS" "$out" ;;
  *) cp "$LBH_FIXTURES/\${url##*/}" "$out" ;;
esac
`,
  { mode: 0o755 },
);

function run(args = [], overrides = {}) {
  return spawnSync('sh', [installer, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      LBH_FIXTURES: fixtures,
      HOME: path.join(temp, 'home'),
      LBH_TEST_OS: 'Linux',
      LBH_TEST_ARCH: 'x86_64',
      LBH_GITHUB_API: 'https://fixture-api',
      LBH_GITHUB_DOWNLOAD: 'https://fixture-download',
      ...overrides,
    },
  });
}

writeRelease();
let result = run(['--dry-run']);
assert.strictEqual(result.status, 0, result.stderr);
assert.match(result.stdout, /Platform: Linux\/x64/);
assert.match(result.stdout, /Version: nightly-latest/);
assert.match(result.stdout, /Name: Last Singularity/);

result = run([
  '--version', 'v0.2.2-final',
  '--name', 'Last Singularity v0.2',
  '--slug', 'last-singularity-v02',
  '--dry-run',
], { LBH_TEST_STEAMOS: '1' });
assert.strictEqual(result.status, 0, result.stderr);
assert.match(result.stdout, /Version: v0\.2\.2-final/);
assert.match(result.stdout, /Name: Last Singularity v0\.2/);
assert.match(result.stdout, /Games\/last-singularity-v02/);

result = run(['--slug', '../current', '--dry-run']);
assert.notStrictEqual(result.status, 0);
assert.match(result.stderr, /slug must use lowercase letters/);

result = run(['--dry-run'], { LBH_TEST_STEAMOS: '1' });
assert.strictEqual(result.status, 0, result.stderr);
assert.match(result.stdout, /Platform: SteamOS\/x64/);

result = run(['--dry-run'], { LBH_TEST_OS: 'Darwin', LBH_TEST_ARCH: 'arm64' });
assert.strictEqual(result.status, 0, result.stderr);
assert.match(result.stdout, /Platform: macOS\/arm64/);

for (const [platform, arch] of [['Darwin', 'x86_64'], ['Linux', 'arm64'], ['Plan9', 'x86_64']]) {
  result = run(['--dry-run'], { LBH_TEST_OS: platform, LBH_TEST_ARCH: arch });
  assert.notStrictEqual(result.status, 0, `${platform}/${arch} should be unsupported`);
}

result = run(['--dry-run'], { LBH_GITHUB_API: 'https://api-failure' });
assert.notStrictEqual(result.status, 0);
assert.match(result.stderr, /could not resolve public GitHub Release/);

writeRelease({ missing: true });
result = run(['--dry-run']);
assert.notStrictEqual(result.status, 0);
assert.match(result.stderr, /has no Linux\/x64 asset/);

writeRelease({ checksums: true });
writeSums(false);
result = run(['--no-launcher']);
assert.notStrictEqual(result.status, 0);
assert.match(result.stderr, /checksum mismatch/);

writeRelease();
result = run(['--no-launcher']);
assert.notStrictEqual(result.status, 0);
assert.match(result.stderr, /no verifiable SHA-256 metadata/);

writeRelease({ checksums: true });
writeSums(true);
const installDir = path.join(temp, 'installed game');
result = run(['--install-dir', installDir, '--no-launcher']);
assert.strictEqual(result.status, 0, result.stderr);
assert.ok(fs.existsSync(path.join(installDir, 'Last Singularity')));
const saveDir = path.join(temp, 'home', '.config', 'Last Singularity');
fs.mkdirSync(saveDir, { recursive: true });
fs.writeFileSync(path.join(saveDir, 'save.json'), 'pilot-save\n');
fs.writeFileSync(path.join(installDir, 'old-app-bit'), 'old\n');

result = run(['--install-dir', installDir, '--no-launcher']);
assert.strictEqual(result.status, 0, result.stderr);
assert.strictEqual(fs.readFileSync(path.join(saveDir, 'save.json'), 'utf8'), 'pilot-save\n');
assert.ok(!fs.existsSync(path.join(installDir, 'old-app-bit')));
assert.ok(fs.existsSync(`${installDir}.previous/old-app-bit`));

const historicalDir = path.join(temp, 'home', 'Games', 'last-singularity-v02');
result = run([
  '--version', 'v0.2.2-final',
  '--name', 'Last Singularity v0.2',
  '--slug', 'last-singularity-v02',
  '--no-launcher',
], { LBH_TEST_STEAMOS: '1' });
assert.strictEqual(result.status, 0, result.stderr);
assert.ok(fs.existsSync(path.join(historicalDir, 'Last Singularity')));
const historicalLauncher = fs.readFileSync(path.join(historicalDir, 'run-last-singularity.sh'), 'utf8');
assert.match(historicalLauncher, /\.local\/state}\/last-singularity-v02/);
assert.match(historicalLauncher, /--user-data-dir=.*last-singularity-v02/);
assert.ok(fs.existsSync(installDir), 'historical install must not replace the current install');

console.log('installer contract: passed');
