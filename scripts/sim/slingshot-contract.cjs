// W1-D is intentionally a five-knob contract. Everything under INTERNAL is
// implementation detail: it has no dev-panel registration or player-facing
// tuning surface.
const { UNIT_SCALE, simUnitsToMeters } = require('../content/units.cjs');

const SLINGSHOT_KNOB_CONTRACT = Object.freeze({
  captureRadius: Object.freeze({
    unit: "m",
    min: UNIT_SCALE.rulerPresentationDefaultMeters,
    max: UNIT_SCALE.metersPerSimUnit,
    step: 25,
    value: simUnitsToMeters(0.45),
    startBias: "medium",
  }),
  magnetism: Object.freeze({
    unit: "deg",
    min: 0,
    max: 90,
    step: 5,
    value: 30,
    startBias: "large",
  }),
  coyoteTime: Object.freeze({
    unit: "ms",
    min: 0,
    max: 500,
    step: 50,
    value: 50,
    startBias: "small",
  }),
  payoffCurve: Object.freeze({
    unit: "x/quarter-turn",
    min: 1,
    max: 3,
    step: 0.1,
    value: 1.4,
    startBias: "medium",
  }),
  chainWindow: Object.freeze({
    unit: "s",
    min: 0,
    max: 3,
    step: 0.5,
    value: 0.5,
    startBias: "disabled-or-small",
  }),
});

const SLINGSHOT_VALUES = Object.freeze(Object.fromEntries(
  Object.entries(SLINGSHOT_KNOB_CONTRACT).map(([name, contract]) => [name, contract.value])
));

// Anchor-family scaling keeps the accepted W1-E rings readable while leaving
// one capture-radius knob. These factors are not tunables.
const ANCHOR_RANGE_FACTORS = Object.freeze({ well: 1, star: 2 / 3, planetoid: 0.4 });
const INTERNAL = Object.freeze({
  minimumTangentialSpeed: 0.05,
  energyAccrualRate: 3.5,
  releaseFillMultiplier: 4.5,
  gravityCancelFraction: 0.95,
  tangentialForce: 1.5,
  chainQuarterTurnBonus: 0.5,
  maxChainCount: 6,
  lockTelegraphDurationSeconds: 0.25,
  releaseGhostDurationSeconds: 1.0,
  rangeBreakGraceFactor: 1.1,
  // Internal prompt/snapshot-to-command transport allowance, not a knob.
  promptTransportTicks: 4,
});

const QUARTER_TURN_RADIANS = Math.PI / 2;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function vector(value, fallback = { x: 1, y: 0 }) {
  const x = finite(value?.x, fallback.x);
  const y = finite(value?.y, fallback.y);
  const magnitude = Math.hypot(x, y);
  if (magnitude <= 1e-9) return { x: fallback.x, y: fallback.y };
  return { x, y };
}

function normalized(value, fallback = { x: 1, y: 0 }) {
  const source = vector(value, fallback);
  const magnitude = Math.hypot(source.x, source.y) || 1;
  return { x: source.x / magnitude, y: source.y / magnitude };
}

function signedAngle(from, to) {
  const a = normalized(from);
  const b = normalized(to);
  return Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y);
}

function rotate(value, radians) {
  return {
    x: value.x * Math.cos(radians) - value.y * Math.sin(radians),
    y: value.x * Math.sin(radians) + value.y * Math.cos(radians),
  };
}

function rotateToward(value, target, maxDegrees) {
  const source = vector(value);
  const sourceSpeed = Math.hypot(source.x, source.y);
  if (sourceSpeed <= 1e-9) return { vector: normalized(target), bendDegrees: 0 };
  const angle = signedAngle(source, target);
  const maxRadians = Math.max(0, finite(maxDegrees)) * Math.PI / 180;
  const applied = Math.max(-maxRadians, Math.min(maxRadians, angle));
  const result = rotate(source, applied);
  return {
    vector: result,
    bendDegrees: Math.abs(applied) * 180 / Math.PI,
  };
}

function captureRadiusWorld(anchorType, captureRadiusMeters = SLINGSHOT_VALUES.captureRadius) {
  const factor = ANCHOR_RANGE_FACTORS[anchorType] ?? 1;
  return Math.max(0, finite(captureRadiusMeters) * factor / UNIT_SCALE.metersPerSimUnit);
}

function coyoteWindowOpen(nowSeconds, lastAimSeenSeconds, coyoteTimeMs = SLINGSHOT_VALUES.coyoteTime) {
  const duration = Math.max(0, finite(coyoteTimeMs)) / 1000;
  return duration > 0 && finite(nowSeconds) - finite(lastAimSeenSeconds, -Infinity) <= duration;
}

// Prompt presentation and command delivery each cross an authority tick. The
// allowance is internal transport behavior, not a sixth gameplay knob.
function effectiveCoyoteTimeMs(coyoteTimeMs = SLINGSHOT_VALUES.coyoteTime, fixedStepSeconds = 0) {
  const duration = Math.max(0, finite(coyoteTimeMs));
  if (duration <= 0) return 0;
  return duration + Math.max(0, finite(fixedStepSeconds)) * 1000 * INTERNAL.promptTransportTicks;
}

function resolveChainCount({
  nowSeconds,
  lastReleaseSeconds,
  chainWindowSeconds = SLINGSHOT_VALUES.chainWindow,
  lastAnchorKey,
  anchorKey,
  previousCount = 0,
}) {
  const withinWindow = finite(nowSeconds) - finite(lastReleaseSeconds, -Infinity)
    <= Math.max(0, finite(chainWindowSeconds));
  if (withinWindow && lastAnchorKey && lastAnchorKey !== anchorKey) {
    return Math.min(Math.max(1, Math.floor(previousCount) + 1), INTERNAL.maxChainCount);
  }
  return 1;
}

function quarterTurnsFromArc(arcRadians, chainCount = 1) {
  const arcTurns = Math.max(0, finite(arcRadians)) / QUARTER_TURN_RADIANS;
  const chainBonus = Math.max(0, Math.floor(chainCount) - 1) * INTERNAL.chainQuarterTurnBonus;
  return arcTurns + chainBonus;
}

function releaseSpeedCap(entrySpeed, arcRadians, payoffCurve = SLINGSHOT_VALUES.payoffCurve, chainCount = 1) {
  const speed = Math.max(0, finite(entrySpeed));
  const curve = Math.max(1, finite(payoffCurve));
  return speed * Math.pow(curve, quarterTurnsFromArc(arcRadians, chainCount));
}

function boundedReleaseDelta({ velocity, direction, entrySpeed, arcRadians, payoffCurve, chainCount, desiredBoost }) {
  const current = vector(velocity, { x: 0, y: 0 });
  const currentSpeed = Math.hypot(current.x, current.y);
  const exitDirection = normalized(direction, normalized(current, { x: 1, y: 0 }));
  const capSpeed = releaseSpeedCap(entrySpeed, arcRadians, payoffCurve, chainCount);
  const requested = Math.max(0, finite(desiredBoost));
  const projection = current.x * exitDirection.x + current.y * exitDirection.y;
  const discriminant = Math.max(0, projection * projection + capSpeed * capSpeed - currentSpeed * currentSpeed);
  const capDelta = Math.max(0, -projection + Math.sqrt(discriminant));
  const deltaMagnitude = Math.min(requested, capDelta);
  const delta = { x: exitDirection.x * deltaMagnitude, y: exitDirection.y * deltaMagnitude };
  const exit = { x: current.x + delta.x, y: current.y + delta.y };
  return Object.freeze({
    delta,
    exit,
    capSpeed,
    exitSpeed: Math.hypot(exit.x, exit.y),
    ratio: Math.max(0, finite(entrySpeed)) > 1e-9
      ? Math.hypot(exit.x, exit.y) / Math.max(0, finite(entrySpeed))
      : 0,
  });
}

module.exports = {
  ANCHOR_RANGE_FACTORS,
  INTERNAL,
  QUARTER_TURN_RADIANS,
  SLINGSHOT_KNOB_CONTRACT,
  SLINGSHOT_VALUES,
  boundedReleaseDelta,
  captureRadiusWorld,
  coyoteWindowOpen,
  effectiveCoyoteTimeMs,
  quarterTurnsFromArc,
  releaseSpeedCap,
  resolveChainCount,
  rotateToward,
  signedAngle,
};
