/**
 * Top-level test-adjacent scripts that deliberately do not run in a manifest
 * lane.  Every entry needs a short reason: the completeness guard treats an
 * unclassified new .cjs file as an error.
 */
const EXCLUSIONS = Object.freeze({
  "browser-driver.cjs": "Shared CDP driver used by helpers and browser suites.",
  "helpers.cjs": "Shared harness helper module used by manifest suites.",
  "manifest-exclusions.cjs": "Completeness-guard metadata, not an executable test suite.",
  "perf-probe.cjs": "Manual performance diagnostic that reports measurements rather than a stable pass/fail contract.",
  "probe-ship-speed.cjs": "Manual ship-speed probe for tuning investigation.",
  "probe-title-prototype.cjs": "Manual title-prototype diagnostic capture.",
  "probe-title-scene.cjs": "Manual title-scene diagnostic capture.",
  "release-package.cjs": "Release-artifact-only proof invoked explicitly by npm run test:package after a release build exists.",
  "run-all.cjs": "Manifest runner implementation, not a suite.",
  "suite-manifest.cjs": "Manifest data consumed by the completeness guard and runner.",
});

module.exports = { EXCLUSIONS };
