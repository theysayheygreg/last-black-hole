const { TestRunner, assert, startSimServer, stopSimServer } = require('./helpers.cjs');
const path = require('path');
const { pathToFileURL } = require('url');
const { SEEDED_SIGNATURES } = require('../scripts/content/signatures.cjs');
const {
  SIGNATURE_MOD_RANGES,
  resolveSignatureMods,
  applySignatureModsToBrain,
} = require('../scripts/sim/signature-mods.cjs');
const { BRAIN_DEFAULTS } = require('../scripts/player-brain.cjs');
const { stepPlayerFreeMovement } = require('../scripts/sim/player-movement-step.cjs');
const { resolveContinuousRadius } = require('../scripts/sim/noise-radius.cjs');
const { calculateWellGrowth } = require('../scripts/sim/well-growth.cjs');
const { buildCoarseFlowField } = require('../scripts/coarse-flow-field.cjs');
const { wellGravityVector } = require('../scripts/sim/well-gravity.cjs');

const SIM_PORT = 8815;
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;
const ROOT = path.resolve(__dirname, '..');
const SEEDS = {
  deep_gravity: 1,
  thin_space: 2,
  heavy_current: 3,
  dead_calm: 4,
  signal_storm: 9,
  dark_run: 14,
};

function approximately(actual, expected, message) {
  assert(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, got ${actual}`);
}

function playerFixture() {
  return {
    wx: 0,
    wy: 0,
    vx: 1,
    vy: 0,
    heat: 0,
    heatRatio: 0,
    deltaV: 60,
    deltaVMax: 60,
    deltaVRegen: 3,
    deltaVRegenBoost: 4,
    deltaVBurnRate: 12,
    deltaVBurnEff: 1,
    timeSinceThrust: 999,
    overheatRemaining: 0,
  };
}

async function getJson(route, options) {
  const response = await fetch(`${SIM_URL}${route}`, options);
  return { status: response.status, body: await response.json() };
}

async function run() {
  const runner = new TestRunner('SignatureMods');
  const { resolveClientSensorRange } = await import(
    pathToFileURL(path.join(ROOT, 'src', 'sim', 'remote-snapshot-presentation.js')).href,
  );

  await runner.run('all authored signature values resolve once into bounded frozen authority modifiers', () => {
    for (const signature of SEEDED_SIGNATURES) {
      const mods = resolveSignatureMods(signature);
      assert(Object.isFrozen(mods), `${signature.id}: session modifiers must be frozen`);
      for (const [key, [min, max]] of Object.entries(SIGNATURE_MOD_RANGES)) {
        assert(mods[key] >= min && mods[key] <= max,
          `${signature.id}: ${key} left its declared clamp`);
      }
    }
    const clamped = resolveSignatureMods({ mods: { currentCouplingMult: 99, noiseRadiusMultiplier: -2 } });
    approximately(clamped.currentCouplingMult, SIGNATURE_MOD_RANGES.currentCouplingMult[1], 'high coupling clamp');
    approximately(clamped.noiseRadiusMultiplier, SIGNATURE_MOD_RANGES.noiseRadiusMultiplier[0], 'low noise clamp');
  });

  await runner.run('movement, Noise, growth, and sensor seams consume their signature multipliers', () => {
    const heavy = resolveSignatureMods(SEEDED_SIGNATURES.find((signature) => signature.id === 'heavy_current'));
    const calm = resolveSignatureMods(SEEDED_SIGNATURES.find((signature) => signature.id === 'dead_calm'));
    const storm = resolveSignatureMods(SEEDED_SIGNATURES.find((signature) => signature.id === 'signal_storm'));
    const deep = resolveSignatureMods(SEEDED_SIGNATURES.find((signature) => signature.id === 'deep_gravity'));
    const dark = resolveSignatureMods(SEEDED_SIGNATURES.find((signature) => signature.id === 'dark_run'));

    const heavyBrain = applySignatureModsToBrain({ ...BRAIN_DEFAULTS }, heavy);
    const calmBrain = applySignatureModsToBrain({ ...BRAIN_DEFAULTS }, calm);
    approximately(heavyBrain.currentCoupling, 1.3, 'heavy current coupling');
    approximately(calmBrain.currentCoupling, 0.5, 'dead calm coupling');
    approximately(calmBrain.dragScale, 0.8, 'dead calm drag');
    approximately(dark ? applySignatureModsToBrain({ ...BRAIN_DEFAULTS }, dark).sensorRange : 0, 0.6, 'dark run sensor range');

    const heavyPlayer = playerFixture();
    const calmPlayer = playerFixture();
    stepPlayerFreeMovement(heavyPlayer, {}, 1 / 15, {
      brain: heavyBrain,
      flowSample: { current: { x: 3, y: 0 } },
      worldScale: 3,
    });
    stepPlayerFreeMovement(calmPlayer, {}, 1 / 15, {
      brain: calmBrain,
      flowSample: { current: { x: 3, y: 0 } },
      worldScale: 3,
    });
    assert(heavyPlayer.vx > calmPlayer.vx, 'current coupling must change the authority movement step');
    assert(calmPlayer.vx > 0, 'lower drag must preserve a usable coast');

    const stormBrain = applySignatureModsToBrain({ ...BRAIN_DEFAULTS }, storm);
    approximately(stormBrain.noiseRadiusMultiplier, 1.5, 'noise storm radius');
    approximately(stormBrain.noiseDecayMultiplier, 0.7, 'noise storm decay');
    assert(resolveContinuousRadius(10, 0, 0.05, stormBrain.noiseDecayMultiplier)
      > resolveContinuousRadius(10, 0, 0.05, 1), 'slower Noise decay must retain a larger radius');

    const well = { mass: 1, killRadius: 0.1, baseKillRadius: 0.1, startMass: 1 };
    const grown = calculateWellGrowth({
      well: { ...well },
      massDelta: 0.1 * deep.wellGrowthMult,
      killRadiusForMass: () => 0.1,
    });
    approximately(grown.after.mass, 1.07, 'deep gravity schedule growth');
  });

  await runner.run('Dark Run reduces the authority-projected client sensor reach', () => {
    const darkRun = resolveSignatureMods(
      SEEDED_SIGNATURES.find((signature) => signature.id === 'dark_run'),
    );
    const normalReach = resolveClientSensorRange(1, { sensorRangeMultiplier: 1 });
    const darkRunReach = resolveClientSensorRange(1, {
      sensorRangeMultiplier: darkRun.sensorRangeMult,
    });

    approximately(darkRunReach, 0.6, 'Dark Run client sensor reach');
    assert(darkRunReach < normalReach, 'Dark Run must reduce the client sensor edge');
  });

  await runner.run('Shallows direct and Expanse coarse gravity honor the same multiplier', () => {
    const multiplier = resolveSignatureMods(SEEDED_SIGNATURES.find((signature) => signature.id === 'deep_gravity')).wellGravityMult;
    const directBase = wellGravityVector('player', { dist: 0.2, nx: 1, ny: 0 }, 1);
    const directModified = { x: directBase.x * multiplier, y: directBase.y * multiplier };
    approximately(directModified.x / directBase.x, multiplier, 'Shallows direct gravity multiplier');

    const common = {
      worldScale: 3,
      cellSize: 0.5,
      wells: [{ id: 'well-1', wx: 1.5, wy: 1.5, mass: 1, orbitalDir: 1, killRadius: 0.1 }],
      wellGravityScale: 0.02,
      wellGravityMaxRange: 1.2,
      wellGravityFullRadius: 0.25,
      wellGravityFeatherRadius: 0.1,
    };
    const baseField = buildCoarseFlowField(common);
    const modifiedField = buildCoarseFlowField({ ...common, wellGravityScale: common.wellGravityScale * multiplier });
    const base = baseField.cells.find((cell) => Math.hypot(cell.gravityX, cell.gravityY) > 0);
    const modified = modifiedField.cells[baseField.cells.indexOf(base)];
    approximately(
      Math.hypot(modified.gravityX, modified.gravityY) / Math.hypot(base.gravityX, base.gravityY),
      multiplier,
      'Expanse coarse gravity multiplier',
    );
  });

  await runner.run('every seeded signature launches as frozen authority truth with truthful portal and sensor snapshot data', async () => {
    for (const signature of SEEDED_SIGNATURES) {
      await startSimServer(SIM_PORT);
      try {
        const start = await getJson('/session/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            mapId: signature.id === 'dark_run' ? 'expanse' : 'shallows',
            seed: SEEDS[signature.id],
            requesterId: `signature-mod-${signature.id}`,
          }),
        });
        assert(start.status === 200, `${signature.id}: session start failed`);
        assert(start.body.session.cosmicSignature.id === signature.id,
          `${signature.id}: seed rolled ${start.body.session.cosmicSignature.id}`);
        assert(JSON.stringify(start.body.session.signatureMods) === JSON.stringify(resolveSignatureMods(signature)),
          `${signature.id}: authority session modifiers drifted from content`);
        approximately(start.body.session.sensorRangeMultiplier, resolveSignatureMods(signature).sensorRangeMult,
          `${signature.id}: snapshot sensor scale`);

        const snapshot = await getJson('/snapshot');
        const finalWindow = snapshot.body.world.portalSchedule.windows
          .find((window) => window.metadata?.finalExfil);
        const expectedPortalMultiplier = resolveSignatureMods(signature).portalLifespanMult;
        approximately(finalWindow.duration, 60 * expectedPortalMultiplier,
          `${signature.id}: final portal lifespan`);
        approximately(finalWindow.metadata.signatureDurationMultiplier, expectedPortalMultiplier,
          `${signature.id}: portal schedule metadata`);
      } finally {
        await stopSimServer(SIM_PORT);
      }
    }
  });

  process.exit(runner.summary() ? 0 : 1);
}

run().catch(async (error) => {
  console.error('SignatureMods test fatal error:', error.stack || error.message);
  try { await stopSimServer(SIM_PORT); } catch {}
  process.exit(1);
});
