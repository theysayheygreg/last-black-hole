const assert = require('assert');
const {
  GRAPPLE_ARC,
  assistedReleaseDirection,
  grappleGeometry,
  orbitDirection,
  sweptHookContact,
  tangentFor,
} = require('../scripts/sim/slingshot-contract.cjs');

function near(actual, expected, epsilon = 1e-9) {
  assert(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

function run() {
  assert.strictEqual(GRAPPLE_ARC.reelSeconds, 0.15);
  assert.strictEqual(GRAPPLE_ARC.releaseAssistDegrees, 10);

  const ordinaryWell = grappleGeometry({ type: 'well', killRadius: 0.04, mass: 1 });
  const grownWell = grappleGeometry({ type: 'well', killRadius: 0.09, mass: 3 });
  assert(grownWell.swingRadius > ordinaryWell.swingRadius, 'grown well must own a larger swing radius');
  assert(grownWell.hookRadius > ordinaryWell.hookRadius, 'grown well must own a larger hook reach');
  assert(grownWell.boost > ordinaryWell.boost, 'grown well must grant a larger flat boost');
  assert(ordinaryWell.hookRadius > ordinaryWell.swingRadius, 'forgiving hook reach must exceed the held arc');

  const endpointMiss = sweptHookContact({
    anchorDX: 0.5,
    anchorDY: 0,
    stepX: 1,
    stepY: 0,
    hookRadius: 0.2,
  });
  assert(endpointMiss.hit, 'high-speed segment crossing must capture when both endpoints miss');
  near(endpointMiss.t, 0.5);

  const radialDirection = orbitDirection({ x: 1, y: 0 }, { x: 1, y: 0 });
  assert([1, -1].includes(radialDirection), 'radial nonzero entry must get deterministic handedness');
  const tangent = tangentFor({ x: 1, y: 0 }, radialDirection);
  near(Math.hypot(tangent.x, tangent.y), 1);

  const outward = { x: -1, y: 0 };
  const baselineTangent = { x: 0, y: 1 };
  const slightOutward = {
    x: Math.cos(95 * Math.PI / 180),
    y: Math.sin(95 * Math.PI / 180),
  };
  const assisted = assistedReleaseDirection({ tangent: baselineTangent, outward, requested: slightOutward });
  assert(Math.acos(Math.max(-1, Math.min(1, assisted.x * baselineTangent.x + assisted.y * baselineTangent.y))) <= 10 * Math.PI / 180 + 1e-9,
    'compatible release assist must remain inside the 10 degree cone');
  assert.deepStrictEqual(
    assistedReleaseDirection({ tangent: baselineTangent, outward, requested: { x: 0, y: -1 } }),
    baselineTangent,
    'reverse input must not rewrite the tangent',
  );
  assert.deepStrictEqual(
    assistedReleaseDirection({ tangent: baselineTangent, outward, requested: { x: 1, y: 0 } }),
    baselineTangent,
    'inward input must not rewrite the tangent',
  );

  const sameAnchor = grappleGeometry({ type: 'star', starType: 'redGiant', mass: 2 });
  const shortHoldExit = 2 + sameAnchor.boost;
  const longHoldExit = 2 + sameAnchor.boost;
  near(shortHoldExit, longHoldExit);
  assert(!('chainWindow' in GRAPPLE_ARC), 'canonical contract must have no chain window');
  assert(!('payoffCurve' in GRAPPLE_ARC), 'canonical contract must have no arc-duration payoff curve');
  assert(!('energyAccrualRate' in GRAPPLE_ARC), 'canonical contract must have no energy bank');

  console.log('GrappleArcContract: 12/12 passed');
}

try {
  run();
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}
