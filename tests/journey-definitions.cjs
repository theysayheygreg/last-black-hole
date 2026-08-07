const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const JOURNEY_DIR = path.join(__dirname, '..', 'src', 'content', 'journeys');
async function main() {
  const journeyApi = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'journey', 'index.js')).href);
  const conditions = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'conditions', 'index.js')).href);
  const registry = journeyApi.createJourneyRegistry({
    actions: journeyApi.DEFAULT_ACTIONS,
    conditionValidator: conditions.validateConditionQuery,
  });
  for (const routine of journeyApi.DEFAULT_ROUTINES) registry.registerRoutine(routine, () => []);

  const files = fs.readdirSync(JOURNEY_DIR).filter((file) => file.endsWith('.json')).sort();
  assert.strictEqual(files.length, 16, 'Expected the complete durable Journey definition set');
  const ids = new Set();
  const definitions = [];
  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(JOURNEY_DIR, file), 'utf8'));
    const validated = journeyApi.validateJourneyDefinition(raw, registry);
    assert(!ids.has(validated.id), `Duplicate Journey id ${validated.id}`);
    ids.add(validated.id);
    definitions.push(validated);

    for (const [name, value] of Object.entries(validated.setup.startingProfileFacts)) {
      const definition = conditions.getConditionDefinition(name);
      assert.strictEqual(definition.kind, 'stored', `${file} setup may initialize stored conditions only`);
      assert.strictEqual(definition.scope, 'pilot', `${file} setup may initialize pilot conditions only`);
      conditions.validateConditionValue(definition, value, `${file}:${name}`);
    }
    const serialized = JSON.stringify(raw);
    assert(!/"frames?"\s*:|"frameNumber"\s*:/.test(serialized), `${file} contains frame choreography`);
    assert(!/teleport|setPosition|setCargo|setHull|forceExtract|removePortal/i.test(serialized), `${file} bypasses gameplay authority`);
  }

  const representative = definitions.find(({ id }) => id === 'agent.salvage-noise-extract');
  assert(representative?.knownFailure, 'Natural representative route must carry an explicit known-failure record');
  assert(representative.steps.some((step) => step.waitForCondition?.condition === 'run.cargo.count'));
  assert(representative.steps.some((step) => step.waitForCondition?.condition === 'run.noise.radiusMeters'));
  assert(representative.steps.some((step) => step.waitForCondition?.condition === 'run.extraction.state'));
  assert(representative.steps.some((step) => step.assertCondition?.condition === 'pilot.chronicle.cargoExtracted'));

  for (const mapId of ['shallows', 'expanse', 'deep-field']) {
    assert(definitions.some((definition) => definition.id === `capture.controlled-map-${mapId}`));
  }
  assert(definitions.some((definition) => definition.id === 'agent.breacher-death-recovery'));
  assert(definitions.some((definition) => definition.id === 'integration.pause-exit-relaunch'));
  assert(definitions.some((definition) => definition.id === 'integration.profile-home-launch'));
  assert(definitions.some((definition) => definition.id === 'integration.home-rig-chronicle-results'));
  assert(definitions.some((definition) => definition.id === 'reproduction.slingshot-real-input'));
  assert(definitions.some((definition) => definition.id === 'reproduction.ruler-live'));
  assert(definitions.some((definition) => definition.id === 'integration.run-lifecycle-recovery'));
  assert(definitions.some((definition) => definition.id === 'integration.pilot-delete'));
  assert(definitions.some((definition) => definition.id === 'capture.fabric-rich-current'));
  assert(definitions.some((definition) => definition.id === 'capture.map-select'));
  assert(definitions.some((definition) => definition.id === 'capture.fabric-event-wave'));
  assert(definitions.some((definition) => definition.id === 'capture.ui-repair'));

  console.log(`JourneyDefinitions: ${definitions.length}/${files.length} validated`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
