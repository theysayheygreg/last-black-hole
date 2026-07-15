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

  await runner.run('Named core remains stable only when every sequential frame has an explicit record', async () => {
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
    assert(titleProof.stableCore && titleProof.dropoutFrames === 0 && titleProof.sequentialFrameIds,
      `Title core proof failed: ${JSON.stringify(titleProof)}`);
    assert(matchProof.stableCore && matchProof.dropoutFrames === 0 && matchProof.sequentialFrameIds,
      `Match core proof failed: ${JSON.stringify(matchProof)}`);
  });

  await runner.run('Temporal contract synthesizes bounded absent, budget, transparent, and reset records', async () => {
    const contract = new temporal.TemporalVisibilityContract({ sampleLimit: 8, entityLimit: 16 });
    contract.reset({ phase: 'playing', runId: 'run-1' });
    contract.beginFrame({ phase: 'playing', runId: 'run-1', frameId: 1, families: ['player', 'wrecks', 'portals'] });
    contract.record({ id: 'ship-a', family: 'player', role: 'player', state: 'visible', coreSubmitted: true, inView: true, opacity: 1 });
    contract.record({ id: 'wreck-a', family: 'wrecks', role: 'wrecks', state: 'visible', coreSubmitted: true, inView: true, opacity: 1 });
    contract.endFrame();
    contract.beginFrame({ phase: 'playing', runId: 'run-1', frameId: 2, expected: [{ id: 'ship-a', family: 'player' }], families: ['player', 'wrecks', 'portals'] });
    contract.record({ id: 'ship-a', family: 'player', role: 'player', state: 'offscreen-cull', coreSubmitted: false, inView: false, opacity: 1 });
    contract.endFrame();
    contract.beginFrame({ phase: 'playing', runId: 'run-1', frameId: 3, expected: [{ id: 'ship-a', family: 'player' }], families: ['player', 'wrecks', 'portals'] });
    contract.record({ id: 'ship-a', family: 'player', role: 'player', state: 'budget-cull', coreSubmitted: false, inView: true, opacity: 1 });
    contract.endFrame();
    contract.beginFrame({ phase: 'playing', runId: 'run-1', frameId: 4, expected: [{ id: 'ship-a', family: 'player' }], families: ['player', 'wrecks', 'portals'] });
    contract.record({ id: 'ship-a', family: 'player', role: 'player', state: 'transparent', coreSubmitted: true, inView: true, opacity: 0 });
    contract.endFrame();
    contract.beginFrame({ phase: 'playing', runId: 'run-1', frameId: 5, expected: [{ id: 'ship-a', family: 'player' }], families: ['player', 'wrecks', 'portals'] });
    contract.endFrame();
    const stats = contract.getStats({ entityIds: ['ship-a', 'wreck-a'], families: ['player', 'wrecks', 'portals'] });
    const proof = stats.summaries['ship-a'];
    assert(proof.sampledFrames === 5 && proof.dropoutFrames === 4 && !proof.stableCore,
      `Temporal dropout reasons were not preserved: ${JSON.stringify(stats)}`);
    assert(proof.states.includes('offscreen-cull') && proof.states.includes('budget-cull')
      && proof.states.includes('transparent') && proof.states.includes('absent'),
      `Expected explicit dropout reasons: ${JSON.stringify(proof)}`);
    assert(stats.familySummaries.portals && stats.familySummaries.wrecks,
      `Expected empty and populated family summaries: ${JSON.stringify(stats.familySummaries)}`);
    assert(stats.sequentialFrameIds, `Expected sequential ledger ids: ${JSON.stringify(stats)}`);

    contract.reset({ phase: 'title', runId: 'title-1' });
    contract.beginFrame({ phase: 'title', runId: 'title-1', frameId: 1, families: ['player'] });
    contract.endFrame();
    const resetStats = contract.getStats({ entityIds: ['ship-a'], families: ['player'] });
    assert(resetStats.summaries['ship-a'].states.includes('reset'),
      `Expected reset record for the prior identity: ${JSON.stringify(resetStats)}`);
  });

  await runner.run('Temporal contract rejects non-sequential frame ids and preserves honest occlusion support', async () => {
    const contract = new temporal.TemporalVisibilityContract();
    contract.beginFrame({ frameId: 10, families: ['player'] });
    contract.record({ id: 'ship-a', family: 'player', state: 'visible', coreSubmitted: true, inView: true, opacity: 1 });
    contract.endFrame();
    let rejected = false;
    try { contract.beginFrame({ frameId: 12, families: ['player'] }); } catch { rejected = true; }
    assert(rejected, 'Expected a frame-id gap to be rejected');
    contract.beginFrame({ frameId: 11, families: ['player'] });
    contract.record({ id: 'ship-a', family: 'player', state: 'occluded', coreSubmitted: false, inView: true, opacity: 1, occlusion: 'known' });
    contract.endFrame();
    const stats = contract.getStats({ entityIds: ['ship-a'], families: ['player'] });
    assert(stats.summaries['ship-a'].states.includes('occluded') && stats.summaries['ship-a'].occlusion === 'known',
      `Expected explicit known occlusion only when supplied: ${JSON.stringify(stats)}`);
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
    assert(renderer.includes('collectTemporalSpriteExpectations')
      && renderer.includes("'budget-cull'")
      && renderer.includes("'absent'"),
    'Renderer must register every expected sprite and make skip states explicit');
    assert(renderer.includes("occlusion: 'unsupported'"),
      'Renderer must not claim occlusion knowledge it does not have');
    assert(!renderer.includes('addSemantic(this.entityGeometries.ring, this.entityMaterials.wave'),
      'Product mode must not submit generic wave-growth rings');
    const main = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
    const waveRings = fs.readFileSync(path.join(ROOT, 'src/wave-rings.js'), 'utf8');
    assert(!main.includes('waveRings.render(') && !waveRings.includes('render(ctx, camX, camY'),
      'Canvas world mode must not retain generic wave-ring rendering');
    assert(renderer.includes("const diagnosticView = this.getViewMode() === 'scene';"),
      'Well primitives must remain behind the explicit raw-scene diagnostic gate');
    assert(main.includes('localAbilityState = null;')
      && main.includes("if (gamePhase === 'playing' && localAbilityState)"),
    'Ability marks must clear on reset/snapshot absence and render only while playing');
  });

  await runner.run('Primitive inventory is machine-readable and has role dispositions', async () => {
    const inventory = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/v0.3/visual-primitive-inventory.json'), 'utf8'));
    for (const role of ['entityCore', 'wellPulseState', 'slingshotAbilitySemantic', 'hullAbilityStateMark', 'mapNode', 'menuDecoration', 'vfx', 'debug']) {
      assert(inventory.roles[role], `Missing primitive inventory role ${role}`);
      assert(inventory.roles[role].productionOwner, `${role} needs an owner`);
      assert(inventory.roles[role].disposition, `${role} needs a disposition`);
    }
    assert(inventory.productionForbidden.includes('generic_in_match_well_growth_ring'),
      'Inventory must forbid generic in-match well growth rings');
    assert(inventory.semanticDebugAllowlist.includes('named_slingshot_range_affordance'),
      'Inventory must allow the ratified slingshot range affordance');
    assert(JSON.stringify(inventory.modePolicy.product.forbidden) === JSON.stringify(inventory.productionForbidden)
      && JSON.stringify(inventory.modePolicy.representative.forbidden) === JSON.stringify(inventory.productionForbidden),
    'Product and representative modes must assert zero forbidden placeholders');
    assert(inventory.modePolicy.debug.requiresExplicitView
      && inventory.modePolicy.debug.allowlist.every((id) => inventory.semanticDebugAllowlist.includes(id)),
    'Debug mode must be explicit and constrained to the semantic allowlist');
    assert(inventory.roles.hullAbilityStateMark.allowed.includes('named_hull_ability_state_mark'),
      'Hull ability marks must have a named inventory allowlist entry');
  });

  const ok = runner.summary();
  process.exit(ok ? 0 : 1);
}

run().catch((error) => {
  console.error('Three entity temporal test fatal error:', error);
  process.exit(1);
});
