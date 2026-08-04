const fs = require('fs');
const path = require('path');
const { TestRunner, assert } = require('./helpers.cjs');

const ROOT = path.resolve(__dirname, '..');

async function run() {
  const runner = new TestRunner('FabricDisplayContract');
  const budget = await import(path.join(ROOT, 'src/render/fabric-well-budget.js'));
  const shaders = await import(path.join(ROOT, 'src/render/shaders/fluid.glsl.js'));
  const ascii = await import(path.join(ROOT, 'src/render/shaders/ascii.glsl.js'));
  const entityScale = await import(path.join(ROOT, 'src/render-three/entity-presentation-scale.js'));

  await runner.run('display well uniforms fit the WebGL2 minimum fragment budget', async () => {
    assert(budget.FABRIC_WELL_UNIFORM_BUDGET === 64, 'Expected one 64-well product budget');
    assert(budget.estimatedFabricDisplayUniformVectors() === 381,
      `Expected conservative 381-vector accounting, got ${budget.estimatedFabricDisplayUniformVectors()}`);
    assert(budget.estimatedFabricDisplayUniformVectors() < 1024,
      'Display uniforms must fit MAX_FRAGMENT_UNIFORM_VECTORS=1024');
    assert(budget.estimatedFabricDisplayUniformVectors(256) === 1149,
      'The retired 256-well declaration must remain proven over budget');
    for (const declaration of ['u_wellPositions[64]', 'u_wellMasses[64]', 'u_wellShape[64]', 'u_wellProfile[64]']) {
      assert(shaders.FRAG_DISPLAY.includes(declaration), `Missing bounded display declaration ${declaration}`);
    }
    assert(!shaders.FRAG_DISPLAY.includes('u_wellPositions[256]'), 'Display shader must not revive the overflowing array');
  });

  await runner.run('overflow selection retains nearest wells deterministically', async () => {
    const candidates = Array.from({ length: 80 }, (_, index) => ({
      index,
      distanceSq: Math.abs(index - 39.5),
    }));
    const expectedNearest = [...candidates]
      .sort((a, b) => a.distanceSq - b.distanceSq || a.index - b.index)
      .slice(0, budget.FABRIC_WELL_UNIFORM_BUDGET)
      .map(({ index }) => index)
      .sort((a, b) => a - b);
    const forward = budget.selectFabricWellIndices(candidates);
    const reverse = budget.selectFabricWellIndices([...candidates].reverse());
    assert(forward.length === 64, `Expected 64 selected wells, got ${forward.length}`);
    assert(JSON.stringify(forward) === JSON.stringify(expectedNearest), 'Expected nearest set restored to source index order');
    assert(JSON.stringify(reverse) === JSON.stringify(expectedNearest), 'Selection must not depend on candidate traversal order');

    const underBudget = budget.selectFabricWellIndices([
      { index: 7, distanceSq: 5 },
      { index: 2, distanceSq: 1 },
    ]);
    assert(JSON.stringify(underBudget) === JSON.stringify([7, 2]), 'Under-budget maps must preserve authored order exactly');
  });

  await runner.run('lane shader keeps aspect-correct rich corridors and strength-through-motion art', async () => {
    const shader = shaders.FRAG_DISPLAY;
    assert(shader.includes('const float laneSpacing = 1.50;'), 'Rich ordinary play should begin at the deliberate half-frame material spacing');
    assert(shader.includes('sampleSpatiallyFilteredAuthoritativeFlow')
      && shader.includes('vec2 stableAuthorityFlow = sampleSpatiallyFilteredAuthoritativeFlow(')
      && !shader.includes('cameraFlowUV'),
    'Presentation must spatially filter the accepted authority field instead of using one camera texel');
    assert(shader.includes('const float channelHalfViewport = 0.125;')
      && shader.includes('float channelHalfWidth = u_cameraView * channelHalfViewport;')
      && shader.includes('channelHalfWidth * 0.80'),
    'Each corridor needs a screen-stable navigable channel envelope, not only a pencil mark');
    const channelPixelsAt800 = 800 * 0.125 * 2;
    for (const hull of [{ label: 'default', entity: {} }, { label: 'breacher', entity: { hull: { type: 'breacher' } } }]) {
      const shipVisibleDiameter = entityScale.resolveEntityPresentationSpec('player', hull.entity).basePx * 2;
      const channelToShipRatio = channelPixelsAt800 / shipVisibleDiameter;
      assert(channelToShipRatio >= 4 && channelToShipRatio <= 5,
        `Expected a 4-5x ${hull.label} ship corridor at 1280x800, got ${channelToShipRatio.toFixed(2)}x`);
    }
    assert(shader.includes('vec2 laneMetric = laneWorld * vec2(screenAspect, 1.0);')
      && shader.includes('vec2 laneDirMetric = normalize(laneFlow * vec2(screenAspect, 1.0));'),
    'Display-space metric must preserve corridor width at horizontal, diagonal, and vertical orientations');
    assert(shader.includes('float visualBacktrace = min(u_cameraView * 0.11, 0.32);')
      && shader.includes('laneWorld -= (localLaneDir - baseLaneDir) * visualBacktrace;'),
    'Curvature must use a bounded visual-only backtrace');
    assert(shader.includes('float mediumFilament = 1.0 - smoothstep(')
      && shader.includes('float fineAsciiWeave = fineThread * markAttack * markRelease * channelEnvelope;'),
    'Corridors must layer medium filaments and fine downstream ASCII weave over the broad material body');
    assert(shader.includes('float decorativeHistory = (sceneExcitation * 0.46 + ringSignal * 0.18)')
      && shader.includes('(channelEnvelope + waveSwell * 0.35)'),
    'Decorative density history must be clipped to meaningful current or wave material');
    assert(shader.includes('mix(0.13, 0.31, laneStrength)'), 'Stronger current must create long coherent downstream marks');
    assert(shader.includes('mix(0.12, 0.90, laneStrength)'), 'Stronger current must advance marks faster');
    assert(shader.includes('vec3(0.065, 0.055, 0.30)') && shader.includes('vec3(0.20, 0.18, 0.82)')
      && shader.includes('vec3 waveColor = vec3(1.00, 0.70, 0.34);'),
    'Terrain lanes must stay blue-violet while event waves own the separate bone/amber read');
    assert(shader.includes('float baseMix = sceneExcitation * 0.004;')
      && shader.includes('clamp(baseMix, 0.0, 0.006)'),
      'Calm field must remain dark outside meaningful current material');
    assert(shader.includes('channelEnvelope * 0.34 + channelBody * 0.42')
      && shader.includes('laneColor * channelBand * channelPresence'),
      'The channel must retain a quieter coherent body and soft shoulders through ASCII quantization');
    assert(shader.includes('smoothstep(0.001, 0.018, laneSpeed)')
      && shader.includes('mix(0.76, 1.0, laneStrength)'),
      'Any materially active current must keep its channel visible; strength changes emphasis rather than existence');
    assert(shader.includes('float glyphCell = floor(along / max(markLength * 0.62, 0.075))')
      && shader.includes('float glyphBrightness = mix(0.78, 1.10, step(1.5, glyphVariant));')
      && !shader.includes('glyphCrossGrain'),
    'Corridor-local material must retain bounded glyph rhythm without cross-grain multiplication');
    assert(shader.includes('waveColor * channelEnvelope * waveSwell * 0.28'),
      'The source wave must lift the broad fabric channel rather than add a detached ring');
    assert(shader.includes('float shoulderIn = smoothstep(nearestProfile.x * 0.76, nearestProfile.x * 0.46, nearestWellDistance);')
      && shader.includes('float shoulderOut = 1.0 - smoothstep(nearestProfile.x * 0.20, nearestProfile.x * 0.38, nearestWellDistance);')
      && shader.includes('currentWeight * 0.24')
      && shader.includes('nearestProfile.z * 0.68'),
    'Wells must briefly bend and split nearby corridors through a narrow shoulder, not draw an orbit diagram');
    assert(shader.includes('float visualCoreRadius = max(coreRadius * 1.90, u_cameraView * 0.068);'),
      'Lethal bodies need a large dominant presentation-only void at Deck resolution');
    assert(shader.includes('mix(0.28, 1.0, 1.0 - coreQuiet)')
      && shader.includes('mix(1.0, 1.20, gravityWeight * (1.0 - coreQuiet))'),
    'Near-core fabric must quiet while authored gravity only modestly reinforces curved lanes');
    assert(shader.includes('min(ringInner, visualCoreRadius * 1.36)')
      && shader.includes('min(ringOuter, visualCoreRadius * 1.86)'),
      'Analytic accretion must remain a compact body-relative rim, not a broad halo');
    assert(shader.includes('vec2 lbhCameraRelativeFluidUVToGlobalFluidUV(')
      && shader.includes('vec2 lbhGlobalFluidUvDeltaToWorld(')
      && shader.includes('vec2 wellDeltaWorld = lbhGlobalFluidUvDeltaToWorld(')
      && !shader.includes('wrappedFluidUV - u_wellPositions[i]'),
    'Every analytic well must use the shared global-fluid delta rather than re-wrap the local camera window');
    assert(shader.includes('vec2 plumeAxis = normalize(vec2(0.86, 0.50 * orbitalDir));')
      && shader.includes('float plumeReach = visualCoreRadius * (2.55 + min(ringEnergy, 1.0) * 0.20);')
      && shader.includes('float plumeMask = plumeSpine * plumeStart * plumeEnd * plumeRagged;'),
    'Wells must own one orbital-direction-keyed asymmetric hot accretion plume');
    assert(shader.includes('vec2 calmMottleCell = floor(coarseUV * u_worldScale * 4.0);')
      && shader.includes('float calmMottle = smoothstep(0.91, 0.99, calmMottleHash) * (1.0 - corridorPresence);'),
    'Calm space needs a sparse world-anchored indigo material layer without becoming another lane');
    assert(ascii.FRAG_ASCII.includes("import") === false
      && ascii.FRAG_ASCII.includes('lbhCameraRelativeFluidUVToGlobalFluidUV(')
      && ascii.FRAG_ASCII.includes('vec2 worldCell = floor(globalFluidUV * u_worldScale * (cellsPerScreen / u_cameraView));'),
    'ASCII glyph phase must use the shared global world conversion, not camera-local wrapped UV');
  });

  await runner.run('upload path shares the same fixed budget owner', async () => {
    const fluid = fs.readFileSync(path.join(ROOT, 'src/fluid.js'), 'utf8');
    const main = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
    assert(fluid.includes("import { FABRIC_WELL_UNIFORM_BUDGET } from './render/fabric-well-budget.js';")
      && fluid.includes('Math.min(FABRIC_WELL_UNIFORM_BUDGET, wellPositionsUV.length)'),
    'Fluid upload must cap against the shader budget');
    assert(main.includes("import { selectFabricWellIndices } from './render/fabric-well-budget.js';")
      && main.includes('const visibleIndices = selectFabricWellIndices(candidates);'),
    'Main presentation must select bounded visible wells through the shared owner');
  });

  await runner.run('legacy well density patches stay retired', async () => {
    const wells = fs.readFileSync(path.join(ROOT, 'src/wells.js'), 'utf8');
    const main = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
    const seedStart = main.indexOf('function seedInitialFluid()');
    const seedEnd = main.indexOf('\nfunction spawnClearance', seedStart);
    assert(!wells.includes('REMOTE_ANCHOR_POINTS') && !wells.includes('REMOTE_ANCHOR_REPLENISHMENT'),
      'Remote wells must not rebuild density-anchor patches');
    assert(!main.slice(seedStart, seedEnd).includes('wellSystem.wells'),
      'Initial fluid seed must not paint a broad per-well density patch');
  });

  await runner.run('gameplay has no second corona or motion-distortion owner', async () => {
    const main = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
    const accretion = fs.readFileSync(path.join(ROOT, 'src/render/passes/accretion-pass.js'), 'utf8');
    const threeScene = fs.readFileSync(path.join(ROOT, 'src/render-three/world-scene-presentation.js'), 'utf8');
    const presentationStyle = fs.readFileSync(path.join(ROOT, 'src/presentation/presentation-style.js'), 'utf8');
    assert(main.includes('accretionStrength: 0.0') && main.includes('chromaticAberration: { strength: 0.0'),
      'FluidDisplay must be the sole gameplay well owner and gameplay chromatic fringe must stay disabled');
    assert(accretion.includes('lbhGlobalFluidUvDeltaToWorld(')
      && !accretion.includes('diff = diff - round(diff)'),
    'The title accretion pass must share the same global world-torus delta when it is active');
    assert(!threeScene.includes('_buildBackdropLayers()')
      && !threeScene.includes('screen-anchored-parallax-grid'),
    'The moving screen-space backdrop lattice must be absent from the Three scene');
    assert(!presentationStyle.includes('motionWarp: 0.004')
      && !presentationStyle.includes('motionWarp: 0.007')
      && !presentationStyle.includes('chromaticMotion: 0.0018')
      && !presentationStyle.includes('chromaticMotion: 0.0025'),
    'Three presentation must not warp or split the scene while the camera moves');
  });

  process.exit(runner.summary() ? 0 : 1);
}

run().catch((error) => {
  console.error('Fabric display contract test fatal error:', error);
  process.exit(1);
});
