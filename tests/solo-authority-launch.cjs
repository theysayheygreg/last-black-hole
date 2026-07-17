/**
 * solo-authority-launch.cjs - packaged/review launch selection proof.
 *
 * This stays source/build level so it does not need a browser or a packaged
 * artifact. Gameplay authority contracts have their own focused fixtures.
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { buildFlagsForMode } = require('../scripts/build-flags.cjs');

const ROOT = path.resolve(__dirname, '..');

async function run() {
  const { resolveAuthorityLaunchPolicy } = await import(
    pathToFileURL(path.join(ROOT, 'src', 'runtime-flags.js')).href
  );
  const mainSource = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  const buildSource = fs.readFileSync(path.join(ROOT, 'scripts', 'build.cjs'), 'utf8');
  const electronSource = fs.readFileSync(path.join(ROOT, 'desktop', 'electron-main.cjs'), 'utf8');

  assert.equal(buildFlagsForMode('release', 'desktop').authorityMode, 'required');
  assert.equal(buildFlagsForMode('test', 'desktop').authorityMode, 'required');
  assert.equal(buildFlagsForMode('dev', 'desktop').authorityMode, 'required');
  assert.equal(buildFlagsForMode('dev', 'browser').authorityMode, 'dev-only');
  assert.equal(buildFlagsForMode('release', 'sandbox').authorityMode, 'sandbox');

  assert.equal(
    resolveAuthorityLaunchPolicy(buildFlagsForMode('release', 'desktop'), '?legacySolo=1').allowLegacySoloFallback,
    false,
    'packaged identity must reject the legacy fallback gate'
  );
  assert.equal(
    resolveAuthorityLaunchPolicy(buildFlagsForMode('dev', 'browser'), '').authorityRequired,
    true,
    'development must not silently choose legacy solo'
  );
  assert.equal(
    resolveAuthorityLaunchPolicy(buildFlagsForMode('dev', 'browser'), '?legacySolo=1').allowLegacySoloFallback,
    true,
    'development fallback requires the named gate'
  );
  assert.equal(
    resolveAuthorityLaunchPolicy(buildFlagsForMode('release', 'browser'), '?legacySolo=1').allowLegacySoloFallback,
    false,
    'review/release browser identity must reject the dev gate'
  );
  assert.equal(
    resolveAuthorityLaunchPolicy(buildFlagsForMode('release', 'sandbox'), '?localSandbox=1').allowLegacySoloFallback,
    true,
    'the explicit sandbox target may use its declared local fallback'
  );
  assert.equal(
    resolveAuthorityLaunchPolicy(buildFlagsForMode('release', 'browser'), '?localSandbox=1').allowLegacySoloFallback,
    false,
    'a review browser identity must not become legacy solo through a query alone'
  );

  assert.match(mainSource, /transitionToRemoteGame\(selectedEntry\);/);
  assert.doesNotMatch(mainSource, /else transitionToGame\(selectedEntry\.map, previewSeed\)/);
  assert.match(mainSource, /throw new Error\('local authority is required for this build'\)/);
  assert.match(mainSource, /showWarning\(authorityLaunchWarning\(err\)/);
  assert.match(mainSource, /gamePhase = 'mapSelect';[\s\S]*?showHUD\(\);[\s\S]*?showWarning\(authorityLaunchWarning\(err\)/);
  assert.match(mainSource, /if \(RUNTIME_FLAGS\.allowLegacySoloFallback\) \{[\s\S]*?startGame\(mapEntry\.map, previewSeed\)/);
  assert.match(buildSource, /copyWebRuntime\(path\.join\(STAGING_ROOT, 'renderer'\), mode, 'desktop'\)/);
  assert.match(electronSource, /const params = new URLSearchParams\(\{ simServer \}\)/);
  assert.match(electronSource, /loadEmbeddedFailurePage\(err\.message\)/);

  console.log('Solo authority launch selection is explicit and packaged fallback-free.');
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
