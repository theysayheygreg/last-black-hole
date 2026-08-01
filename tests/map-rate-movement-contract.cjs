const assert = require("assert");
const path = require("path");
const { loadPlayableMaps } = require("../scripts/shared-map-loader.cjs");
const serverScales = require("../scripts/content/map-scales.cjs");
const {
  AUTHORED_MAP_CONTRACT,
  getMapScaleDefinition,
  getPortalPlacementPolicy,
} = serverScales;
const { getSessionProfile } = require("../scripts/content/session-profiles.cjs");
const { MOVEMENT } = require("../scripts/content/movement.cjs");
const { stepPlayerMovementCore } = require("../scripts/sim/player-movement-step.cjs");
const { GRAPPLE_ARC } = require("../scripts/sim/slingshot-contract.cjs");

const maps = loadPlayableMaps();

function torusDelta(from, to, worldScale) {
  let delta = to - from;
  if (delta > worldScale / 2) delta -= worldScale;
  if (delta < -worldScale / 2) delta += worldScale;
  return delta;
}

function routeAnchors(map) {
  return (map.route?.stages || [])
    .filter((stage) => stage.anchor)
    .map((stage) => map[`${stage.anchor.entity}s`][stage.anchor.index]);
}

function routeLegs(map) {
  const anchors = routeAnchors(map);
  return anchors.slice(1).map((point, index) => {
    const previous = anchors[index];
    return Math.hypot(
      torusDelta(previous.wx, point.wx, map.worldScale),
      torusDelta(previous.wy, point.wy, map.worldScale),
    );
  });
}

function createRouteProbe(heat) {
  const deltaVMax = MOVEMENT.player.deltaVMax;
  const initialHeatRatio = heat.initialRatio;
  return {
    wx: 0,
    wy: 0,
    vx: 0,
    vy: 0,
    heat: initialHeatRatio,
    heatRatio: initialHeatRatio,
    deltaV: deltaVMax * (1 - initialHeatRatio),
    deltaVMax,
    deltaVBurnRate: MOVEMENT.player.deltaVBurnRate,
    deltaVBurnEff: 1,
    deltaVRegen: MOVEMENT.player.deltaVRegen,
    deltaVRegenBoost: MOVEMENT.player.deltaVRegenBoost,
    timeSinceThrust: 0,
    brain: { thrustScale: 1, dragScale: 1, currentCoupling: 1 },
  };
}

function measureProductRoute(mapId) {
  const definition = getMapScaleDefinition(mapId);
  const product = AUTHORED_MAP_CONTRACT.travel.productRate;
  const hz = MOVEMENT.authority.integrationHz;
  const dt = 1 / hz;
  const player = createRouteProbe(product.heat);
  const legs = [];

  for (const distance of routeLegs(maps[mapId])) {
    let traveled = 0;
    let steps = 0;
    while (traveled < distance && steps < hz * 120) {
      stepPlayerMovementCore(player, {
        moveX: 1,
        moveY: 0,
        thrust: 1,
        brake: 0,
      }, dt, {
        brain: player.brain,
        flowSample: { current: { x: 0, y: 0 } },
        worldScale: definition.dimensions.width,
      });
      traveled += Math.hypot(player.vx, player.vy) * dt;
      steps += 1;
    }
    assert(traveled >= distance, `${mapId}: product-rate route leg did not complete`);
    legs.push({
      seconds: Number((steps * dt).toFixed(2)),
      heatPercent: Number((player.heatRatio * 100).toFixed(1)),
    });
  }

  return {
    hz,
    legs,
    routeSeconds: Number(legs.reduce((total, leg) => total + leg.seconds, 0).toFixed(2)),
  };
}

async function run() {
  const travel = AUTHORED_MAP_CONTRACT.travel;
  const clientScales = await import(`file://${path.resolve(__dirname, "../src/content/map-scales.js")}`);
  for (const name of Object.keys(serverScales)) {
    assert.strictEqual(serverScales[name], clientScales[name], `${name} is not the canonical ESM export`);
  }
  assert.strictEqual(travel.baseline.integrationHz, 60, "60 Hz must remain a diagnostic baseline");
  assert.strictEqual(MOVEMENT.authority.integrationHz, 15, "15 Hz is the sole authority movement rate");
  assert(!("rateHzByMap" in travel.productRate), "Route metadata must not select a map movement rate");
  assert(!("dtSource" in travel.productRate), "Route metadata must not own movement dt");

  for (const mapId of ["shallows", "expanse", "deep-field"]) {
    const measured = measureProductRoute(mapId);
    const expected = travel.tiers[mapId];
    assert.strictEqual(measured.hz, getSessionProfile(mapId, maps[mapId].worldScale).tickHz,
      `${mapId}: route probe and session must use the canonical authority rate`);
    assert.deepStrictEqual(
      measured.legs.map((leg) => leg.seconds),
      expected.productObservedLegSeconds,
      `${mapId}: product-rate travel observations drifted`,
    );
    assert.deepStrictEqual(
      measured.legs.map((leg) => leg.heatPercent),
      expected.productHeatPercentAfterLeg,
      `${mapId}: Heat observations drifted`,
    );
    assert.strictEqual(measured.routeSeconds, expected.productRouteSeconds,
      `${mapId}: product route total drifted`);
  }

  assert.strictEqual(GRAPPLE_ARC.reelSeconds, 0.15,
    "Grapple reel duration must be one fixed wall-time feel contract");
  assert(!("coyoteTime" in GRAPPLE_ARC),
    "Grapple Arc v3 uses swept hook reach instead of a transport coyote window");

  const expectedBands = {
    shallows: { standard: [0.45, 1.25], finalExfil: [0.7, 1.35] },
    expanse: { standard: [1.35, 3.75], finalExfil: [2.1, 4.05] },
    "deep-field": { standard: [2.25, 6.25], finalExfil: [3.5, 6.75] },
  };
  for (const [mapId, expected] of Object.entries(expectedBands)) {
    const policy = getPortalPlacementPolicy(mapId);
    const clientPolicy = clientScales.getPortalPlacementPolicy(mapId);
    assert.deepStrictEqual(clientPolicy, policy,
      `${mapId}: ESM/CJS portal placement policy drifted`);
    assert.strictEqual(policy.policyId, "map-center-fractional-bands-v1");
    for (const kind of ["standard", "finalExfil"]) {
      const band = policy.spawnRadiusBands[kind];
      assert.deepStrictEqual([band.minRadius, band.maxRadius], expected[kind],
        `${mapId}: ${kind} portal band is not map-relative`);
    }
  }

  console.log("MapRateMovementContract: product route, grapple wall time, and portal policy checks passed");
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
