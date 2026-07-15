const fs = require('fs');
const path = require('path');
const { TestRunner, assert } = require('./helpers.cjs');

const ROOT = path.resolve(__dirname, '..');

async function importModule(rel) {
  return import(path.join(ROOT, rel));
}

async function run() {
  const runner = new TestRunner('ThreeEntityTemporal');
  const temporal = await importModule('src/render-three/entities/temporal-visibility.js');

  await runner.run('Named core remains stable across sequential title and match samples', async () => {
    const title = [0, 1, 2, 3].map((frameId) => ({
      phase: 'title',
      frameId,
      entities: [{ id: 'title-star-core', role: 'stars', coreSubmitted: true, inView: true, opacity: 1, reason: 'visible' }],
    }));
    const match = [4, 5, 6, 7].map((frameId) => ({
      phase: 'playing',
      frameId,
      entities: [{ id: 'match-ship-core', role: 'player', coreSubmitted: true, inView: true, opacity: 1, reason: 'visible' }],
    }));
    const titleProof = temporal.summarizeTemporalSamples(title, { entityId: 'title-star-core', minFrames: 4 });
    const matchProof = temporal.summarizeTemporalSamples(match, { entityId: 'match-ship-core', minFrames: 4 });
    assert(titleProof.stableCore && titleProof.dropoutFrames === 0, `Title core proof failed: ${JSON.stringify(titleProof)}`);
    assert(matchProof.stableCore && matchProof.dropoutFrames === 0, `Match core proof failed: ${JSON.stringify(matchProof)}`);
  });

  await runner.run('Temporal contract distinguishes culling and zero-opacity from a stable core', async () => {
    const contract = new temporal.TemporalVisibilityContract({ sampleLimit: 4, entityLimit: 4 });
    contract.reset({ phase: 'playing', runId: 'run-1' });
    contract.beginFrame({ phase: 'playing', runId: 'run-1', frameId: 1 });
    contract.record({ id: 'ship-a', role: 'player', coreSubmitted: true, inView: true, opacity: 1, reason: 'visible' });
    contract.endFrame();
    contract.beginFrame({ phase: 'playing', runId: 'run-1', frameId: 2 });
    contract.record({ id: 'ship-a', role: 'player', coreSubmitted: false, inView: false, opacity: 1, reason: 'offscreen-cull' });
    contract.endFrame();
    contract.beginFrame({ phase: 'playing', runId: 'run-1', frameId: 3 });
    contract.record({ id: 'ship-a', role: 'player', coreSubmitted: true, inView: true, opacity: 0, reason: 'zero-opacity' });
    contract.endFrame();
    const stats = contract.getStats({ entityIds: ['ship-a'] });
    const proof = stats.summaries['ship-a'];
    assert(proof.sampledFrames === 3 && proof.dropoutFrames === 2 && !proof.stableCore,
      `Temporal dropout reasons were not preserved: ${JSON.stringify(stats)}`);
    assert(proof.reasons.includes('offscreen-cull') && proof.reasons.includes('zero-opacity'),
      `Expected explicit dropout reasons: ${JSON.stringify(proof)}`);
  });

  await runner.run('Renderer owns temporal sampling and removes product wave-ring submission', async () => {
    const renderer = fs.readFileSync(path.join(ROOT, 'src/render-three/three-renderer.js'), 'utf8');
    assert(renderer.includes('TemporalVisibilityContract'), 'Renderer must own the temporal contract');
    assert(renderer.includes('this.temporalVisibility.beginFrame') && renderer.includes('this.temporalVisibility.endFrame'),
      'Temporal sampling must use the existing renderer update path');
    assert(renderer.includes('this.temporalVisibility.reset({ phase: frame.phase, runId: frame.runId })'),
      'Temporal history must reset at phase/run boundaries');
    assert(renderer.includes('this.entityAssets.getMaterial(assetId).clone()')
      && renderer.includes('pooledEntitySprite')
      && !renderer.includes('core.material.opacity = entityOpacity'),
    'Entity opacity must be isolated to bounded pooled sprite materials, not shared asset materials');
    assert(!renderer.includes('addSemantic(this.entityGeometries.ring, this.entityMaterials.wave'),
      'Product mode must not submit generic wave-growth rings');
    const main = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
    const waveRings = fs.readFileSync(path.join(ROOT, 'src/wave-rings.js'), 'utf8');
    assert(!main.includes('waveRings.render(') && !waveRings.includes('render(ctx, camX, camY'),
      'Canvas world mode must not retain generic wave-ring rendering');
    assert(renderer.includes("const diagnosticView = this.getViewMode() === 'scene';"),
      'Well primitives must remain behind the explicit raw-scene diagnostic gate');
  });

  await runner.run('Primitive inventory is machine-readable and has role dispositions', async () => {
    const inventory = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/v0.3/visual-primitive-inventory.json'), 'utf8'));
    for (const role of ['entityCore', 'wellPulseState', 'slingshotAbilitySemantic', 'mapNode', 'menuDecoration', 'vfx', 'debug']) {
      assert(inventory.roles[role], `Missing primitive inventory role ${role}`);
      assert(inventory.roles[role].productionOwner, `${role} needs an owner`);
      assert(inventory.roles[role].disposition, `${role} needs a disposition`);
    }
    assert(inventory.productionForbidden.includes('generic_in_match_well_growth_ring'),
      'Inventory must forbid generic in-match well growth rings');
    assert(inventory.semanticDebugAllowlist.includes('named_slingshot_range_affordance'),
      'Inventory must allow the ratified slingshot range affordance');
  });

  const ok = runner.summary();
  process.exit(ok ? 0 : 1);
}

run().catch((error) => {
  console.error('Three entity temporal test fatal error:', error);
  process.exit(1);
});
