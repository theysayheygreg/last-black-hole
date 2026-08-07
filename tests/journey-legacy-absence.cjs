const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const retired = [
  'tests/agent-play-eval.cjs',
  'tests/agent-play-route.cjs',
  'tests/agent-play-route-planner.cjs',
  'tests/agent-play-report.cjs',
  'tests/flow.cjs',
  'tests/meta-flow.cjs',
  'tests/slingshot-input-path.cjs',
  'tests/slingshot-v2-live.cjs',
  'tests/ruler-live.cjs',
  'tests/run-lifecycle-recovery.cjs',
  'tests/pilot-delete-global-mute.cjs',
  'tests/probe-slingshot.cjs',
  'tests/probe-fuel.cjs',
  'tests/fabric-rich-current-capture.cjs',
  'tests/deck-ui-map-select-capture.cjs',
  'tests/fabric-event-wave-capture.cjs',
  'tests/ui-rendered-repair-capture.cjs',
];

for (const file of retired) {
  assert(!fs.existsSync(path.join(ROOT, file)), `Retired scenario path remains: ${file}`);
}

const liveHarnessSources = [
  'package.json',
  'tests/suite-manifest.cjs',
  'tests/manifest-exclusions.cjs',
  'scripts/run-visible-agent-eval.cjs',
].map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n');
for (const file of retired) {
  assert(!liveHarnessSources.includes(path.basename(file)), `Live harness still references retired path: ${file}`);
}

console.log(`JourneyLegacyAbsence: ${retired.length} bespoke scenario paths retired`);
