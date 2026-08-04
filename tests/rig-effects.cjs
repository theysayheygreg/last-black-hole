const fs = require('fs');
const path = require('path');
const { TestRunner, assert } = require('./helpers.cjs');
const {
  RIG_TRACKS,
  PUBLIC_HULL_IDS,
  HULL_DEFINITIONS,
} = require('../scripts/content/hulls.cjs');
const { createPlayerBrain, normalizeRigLevels } = require('../scripts/player-brain.cjs');
const { hullCalmSpaceReferenceSpeed } = require('../scripts/sim/hull-reference-speed.cjs');

const ROOT = path.resolve(__dirname, '..');
const profileSource = fs.readFileSync(path.join(ROOT, 'src', 'profile.js'), 'utf8');

function zeroLevels(hullType) {
  return Object.keys(RIG_TRACKS[hullType] || {}).map(() => 0);
}

function expectedBrain(hullType, levels) {
  const expected = { ...HULL_DEFINITIONS[hullType] };
  const tracks = Object.values(RIG_TRACKS[hullType] || {});
  tracks.forEach((track, trackIndex) => {
    (track.levels || []).slice(0, levels[trackIndex]).forEach((level) => {
      level.modifiers.forEach((modifier) => {
        if (modifier.mode === 'add') expected[modifier.stat] += modifier.value;
        if (modifier.mode === 'multiply') expected[modifier.stat] *= modifier.value;
      });
    });
  });
  return expected;
}

async function run() {
  const runner = new TestRunner('RigEffects');

  await runner.run('Every public rig string maps to one measurable authority modifier', async () => {
    assert(profileSource.includes('level.effect'), 'RIG presentation must derive its text from the canonical level record');
    for (const hullType of PUBLIC_HULL_IDS) {
      for (const [trackKey, track] of Object.entries(RIG_TRACKS[hullType] || {})) {
        assert(Array.isArray(track.levels) && track.levels.length > 0,
          `${hullType}.${trackKey} must contain at least one purchasable level`);
        for (const [levelIndex, level] of track.levels.entries()) {
          assert(typeof level.effect === 'string' && level.effect.trim(),
            `${hullType}.${trackKey}.${levelIndex + 1} needs display copy`);
          assert(!/signal/i.test(level.effect),
            `${hullType}.${trackKey}.${levelIndex + 1} must use Noise vocabulary`);
          assert(Array.isArray(level.modifiers) && level.modifiers.length > 0,
            `${hullType}.${trackKey}.${levelIndex + 1} needs an authority modifier`);
          for (const modifier of level.modifiers) {
            assert(['add', 'multiply'].includes(modifier.mode),
              `${hullType}.${trackKey}.${levelIndex + 1} has an unsupported modifier mode`);
            assert(Number.isFinite(modifier.value),
              `${hullType}.${trackKey}.${levelIndex + 1} has a non-numeric modifier`);
            assert(typeof HULL_DEFINITIONS[hullType][modifier.stat] === 'number',
              `${hullType}.${trackKey}.${levelIndex + 1} targets a non-authoritative stat`);
          }
        }
      }
    }
  });

  await runner.run('Every purchasable rank resolves its full authority effect and clamps save data to its shipped cap', async () => {
    for (const hullType of PUBLIC_HULL_IDS) {
      const tracks = Object.values(RIG_TRACKS[hullType] || {});
      tracks.forEach((track, trackIndex) => {
        track.levels.forEach((_level, levelIndex) => {
          const levels = zeroLevels(hullType);
          levels[trackIndex] = levelIndex + 1;
          const resolved = createPlayerBrain({ hullType, rigLevels: levels });
          const expected = expectedBrain(hullType, levels);
          for (const modifier of track.levels.slice(0, levelIndex + 1).flatMap((level) => level.modifiers)) {
            assert(Math.abs(resolved[modifier.stat] - expected[modifier.stat]) < 1e-9,
              `${hullType}.track${trackIndex}.${levelIndex + 1} did not apply ${modifier.stat}`);
          }
        });
      });

      const requested = tracks.map((track) => track.levels.length + 9);
      const capped = normalizeRigLevels(requested, hullType);
      assert(JSON.stringify(capped) === JSON.stringify(tracks.map((track) => track.levels.length)),
        `${hullType} saved ranks must clamp to the shipped caps`);
    }
  });

  await runner.run('Rig modifiers change the established movement and pickup authority seams', async () => {
    const baseBreacher = createPlayerBrain({ hullType: 'breacher', rigLevels: [0, 0, 0] });
    const tunedBreacher = createPlayerBrain({ hullType: 'breacher', rigLevels: [2, 0, 0] });
    const baseSpeed = hullCalmSpaceReferenceSpeed({ hullType: 'breacher', brain: baseBreacher });
    const tunedSpeed = hullCalmSpaceReferenceSpeed({ hullType: 'breacher', brain: tunedBreacher });
    assert(tunedSpeed > baseSpeed, 'Afterburner ranks must increase the existing thrust-speed probe');

    const baseDrifter = createPlayerBrain({ hullType: 'drifter', rigLevels: [0, 0, 0] });
    const tunedDrifter = createPlayerBrain({ hullType: 'drifter', rigLevels: [1, 3, 1] });
    assert(tunedDrifter.currentCoupling > baseDrifter.currentCoupling,
      'Laminar must increase the movement-step current coupling seam');
    assert(tunedDrifter.wellResistScale > baseDrifter.wellResistScale,
      'Edgerunner must increase the well-gravity resistance seam');
    assert(tunedDrifter.noiseDecayMultiplier > baseDrifter.noiseDecayMultiplier,
      'Edgerunner must increase the Noise decay seam');
    assert(tunedDrifter.pickupRadius > baseDrifter.pickupRadius,
      'Gleanings must increase the pickup interaction seam');
  });

  process.exit(runner.summary() ? 0 : 1);
}

run().catch((error) => {
  console.error('RigEffects fatal error:', error.message);
  process.exit(1);
});
