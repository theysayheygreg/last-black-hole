/**
 * Top-level test-adjacent scripts that deliberately do not run in a manifest
 * lane.  Every entry needs a short reason: the completeness guard treats an
 * unclassified new .cjs file as an error.
 */
const EXCLUSIONS = Object.freeze({
  "agent-play-report.cjs": "Shared AgentPlay report helper, exercised by agent-play suites.",
  "agent-play-route.cjs": "Shared AgentPlay route helper, exercised by agent-play suites.",
  "browser-driver.cjs": "Shared CDP driver used by helpers and browser suites.",
  "deck-ui-map-select-capture.cjs": "One-shot Deck visual capture receipt, not a repeatable assertion suite.",
  "fabric-event-wave-capture.cjs": "One-shot wave visual capture receipt, not a repeatable assertion suite.",
  "fabric-rich-current-capture.cjs": "One-shot rich-current visual comparison capture, not a repeatable assertion suite.",
  "helpers.cjs": "Shared harness helper module used by manifest suites.",
  "manifest-exclusions.cjs": "Completeness-guard metadata, not an executable test suite.",
  "perf-probe.cjs": "Manual performance diagnostic that reports measurements rather than a stable pass/fail contract.",
  "probe-fuel.cjs": "Manual fuel-feel probe for tuning investigation.",
  "probe-ship-speed.cjs": "Manual ship-speed probe for tuning investigation.",
  "probe-slingshot.cjs": "Manual slingshot diagnostic probe; the manifest owns contract and live-path coverage.",
  "probe-title-prototype.cjs": "Manual title-prototype diagnostic capture.",
  "probe-title-scene.cjs": "Manual title-scene diagnostic capture.",
  "release-package.cjs": "Release-artifact-only proof invoked explicitly by npm run test:package after a release build exists.",
  "run-all.cjs": "Manifest runner implementation, not a suite.",
  "suite-manifest.cjs": "Manifest data consumed by the completeness guard and runner.",
  "ui-rendered-repair-capture.cjs": "One-shot dense-UI visual capture receipt, not a repeatable assertion suite.",
});

module.exports = { EXCLUSIONS };
