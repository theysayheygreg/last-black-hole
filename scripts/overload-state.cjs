const { MOVEMENT } = require("./content/movement.cjs");

const OVERLOAD_STATES = ["NORMAL", "THROTTLED", "DEGRADED", "DILATED"];

// Pressure may reduce transport work, never the simulation. A slow frame is
// evidence to profile, not permission to alter movement or world truth.
const OVERLOAD_POLICIES = {
  NORMAL: { snapshotScale: 1.0 },
  THROTTLED: { snapshotScale: 0.85 },
  DEGRADED: { snapshotScale: 0.7 },
  DILATED: { snapshotScale: 0.55 },
};

const AUTHORITY_INTEGRATION_HZ = MOVEMENT.authority.integrationHz;

function clampHz(value, fallback = 1) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.round(value));
}

function createOverloadController(baseSession = {}) {
  const snapshotHz = Math.min(
    AUTHORITY_INTEGRATION_HZ,
    clampHz(baseSession.snapshotHz || 6, 6),
  );
  return {
    state: "NORMAL",
    base: {
      tickHz: AUTHORITY_INTEGRATION_HZ,
      snapshotHz,
    },
    budgetMs: 1000 / AUTHORITY_INTEGRATION_HZ,
    avgTickMs: 0,
    worstTickMs: 0,
    pressure: 0,
    sampleCount: 0,
    breachStreak: 0,
    recoverStreak: 0,
  };
}

function measurePressure(sample, controller) {
  const budgetMs = controller.budgetMs;
  const avgPressure = Math.max(0, Number(sample.avgTickMs) || 0) / Math.max(1, budgetMs * 0.82);
  const worstPressure = Math.max(0, Number(sample.worstTickMs) || 0) / Math.max(1, budgetMs * 1.2);
  return Math.max(avgPressure, worstPressure);
}

function projectOverloadBudget(baseSession = {}, state) {
  const policy = OVERLOAD_POLICIES[state] || OVERLOAD_POLICIES.NORMAL;
  const snapshotHz = Math.min(
    AUTHORITY_INTEGRATION_HZ,
    clampHz((Number(baseSession.snapshotHz) || 6) * policy.snapshotScale, 1),
  );
  return {
    overloadState: state,
    timeScale: 1,
    tickHz: AUTHORITY_INTEGRATION_HZ,
    snapshotHz,
  };
}

function advanceOverload(controller, sample) {
  const previousState = controller.state;
  controller.sampleCount += 1;
  const tickCostMs = Math.max(0, Number(sample.tickCostMs) || 0);
  controller.avgTickMs = controller.sampleCount === 1
    ? tickCostMs
    : controller.avgTickMs * 0.84 + tickCostMs * 0.16;
  controller.worstTickMs = Math.max(tickCostMs, controller.worstTickMs * 0.82);
  controller.pressure = measurePressure({
    avgTickMs: controller.avgTickMs,
    worstTickMs: controller.worstTickMs,
  }, controller);

  const severe = controller.pressure >= 1.35;
  const stressed = controller.pressure >= 1.0;
  const healthy = controller.pressure <= 0.62;

  if (severe) {
    controller.breachStreak += 2;
  } else if (stressed) {
    controller.breachStreak += 1;
  } else {
    controller.breachStreak = Math.max(0, controller.breachStreak - 1);
  }

  controller.recoverStreak = healthy ? controller.recoverStreak + 1 : 0;

  let stateIndex = OVERLOAD_STATES.indexOf(controller.state);
  if (controller.breachStreak >= 6 && stateIndex < OVERLOAD_STATES.length - 1) {
    stateIndex += 1;
    controller.state = OVERLOAD_STATES[stateIndex];
    controller.breachStreak = 0;
    controller.recoverStreak = 0;
  } else if (controller.recoverStreak >= 24 && stateIndex > 0) {
    stateIndex -= 1;
    controller.state = OVERLOAD_STATES[stateIndex];
    controller.breachStreak = 0;
    controller.recoverStreak = 0;
  }

  return {
    changed: controller.state !== previousState,
    previousState,
    state: controller.state,
    pressure: controller.pressure,
    avgTickMs: controller.avgTickMs,
    worstTickMs: controller.worstTickMs,
  };
}

module.exports = {
  OVERLOAD_STATES,
  OVERLOAD_POLICIES,
  AUTHORITY_INTEGRATION_HZ,
  createOverloadController,
  projectOverloadBudget,
  advanceOverload,
};
