#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { currentBuildVersion } = require('../version.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const BUILD_VERSION = currentBuildVersion();

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
  execFileSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    ...options,
  });
}

function buildRoot(mode) {
  const suffix = mode === 'release' ? '' : `-${mode}`;
  return path.join(ROOT, 'builds', `v${BUILD_VERSION}${suffix}`);
}

function removeIfExists(target) {
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function stageItchHtml5Artifact(source) {
  const target = path.join(ROOT, 'dist', 'deploy', 'itch', `v${BUILD_VERSION}`, 'html5');
  removeIfExists(target);
  ensureDir(path.dirname(target));
  fs.cpSync(source, target, { recursive: true });

  const indexPath = path.join(target, 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  const sandboxBootstrap = [
    '  <script>',
    '    (() => {',
    '      const url = new URL(window.location.href);',
    "      url.searchParams.set('localSandbox', '1');",
    "      if (window.__LBH_BUILD_FLAGS__) {",
    "        window.__LBH_BUILD_FLAGS__.buildTarget = 'sandbox';",
    "        window.__LBH_BUILD_FLAGS__.authorityMode = 'sandbox';",
    '      }',
    "      window.history.replaceState(null, '', url.toString());",
    "      localStorage.removeItem('lbh.simServerUrl');",
    '    })();',
    '  </script>',
  ].join('\n');

  fs.writeFileSync(
    indexPath,
    html.replace('  <script type="module" src="src/main.js"></script>', `${sandboxBootstrap}\n  <script type="module" src="src/main.js"></script>`)
  );
  if (!fs.readFileSync(indexPath, 'utf8').includes("localSandbox', '1'")) {
    throw new Error('Failed to inject itch localSandbox bootstrap into index.html.');
  }
  if (!fs.readFileSync(indexPath, 'utf8').includes("authorityMode = 'sandbox'")) {
    throw new Error('Failed to stamp itch sandbox authority identity into index.html.');
  }

  fs.writeFileSync(
    path.join(target, 'ITCH-BUILD-NOTES.md'),
    [
      '# Itch HTML5 Build Notes',
      '',
      'This artifact is staged from the normal web build, then adjusted for itch.io HTML5 hosting.',
      '',
      '- It forces `localSandbox=1` before `src/main.js` loads.',
      '- It clears any remembered local or remote sim URL.',
      '- It is browser-playable and does not expect itch.io to run the Node authority stack.',
      '',
      'Use downloadable desktop channels for embedded-authority builds.',
      '',
    ].join('\n')
  );

  return target;
}

function requireTarget(target) {
  if (!target) {
    throw new Error([
      'Missing itch target.',
      'Set LBH_ITCH_TARGET=user/game or pass --target=user/game.',
    ].join(' '));
  }
}

function main() {
  const mode = argValue('--mode', process.env.LBH_DEPLOY_MODE || 'release');
  const target = argValue('--target', process.env.LBH_ITCH_TARGET || '');
  const channel = argValue('--channel', process.env.LBH_ITCH_CHANNEL || 'html5-private');
  const userVersion = argValue(
    '--user-version',
    process.env.LBH_ITCH_USER_VERSION || BUILD_VERSION
  );
  const butler = argValue('--butler', process.env.BUTLER_PATH || 'butler');
  const noBuild = hasFlag('--no-build');
  const preview = hasFlag('--preview');
  const dryRun = hasFlag('--dry-run');
  const hidden = hasFlag('--hidden');

  if (!['dev', 'test', 'release'].includes(mode)) {
    throw new Error(`Invalid mode "${mode}". Use dev, test, or release.`);
  }

  requireTarget(target);

  if (!noBuild) {
    run('node', ['scripts/build.cjs', '--targets=web', `--mode=${mode}`]);
  }

  const sourceArtifact = path.join(buildRoot(mode), 'last-singularity-web');
  if (!fs.existsSync(path.join(sourceArtifact, 'index.html'))) {
    throw new Error(`Missing itch web artifact with index.html: ${sourceArtifact}`);
  }

  const artifact = stageItchHtml5Artifact(sourceArtifact);

  const itchTarget = `${target}:${channel}`;
  const args = preview
    ? ['push-preview', '--changes-only', artifact, itchTarget]
    : ['push', artifact, itchTarget, '--userversion', userVersion];

  if (!preview && dryRun) args.splice(1, 0, '--dry-run');
  if (!preview && hidden) args.splice(1, 0, '--hidden');

  run(butler, args);

  console.log('');
  console.log('itch.io pipeline complete.');
  console.log(`- source: ${sourceArtifact}`);
  console.log(`- artifact: ${artifact}`);
  console.log(`- target: ${itchTarget}`);
  console.log(`- version: ${userVersion}`);
}

main();
