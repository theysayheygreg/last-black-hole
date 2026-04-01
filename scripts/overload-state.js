const OVERLOAD_STATES = ["NORMAL", "THROTTLED", "DEGRADED", "DILATED"];

const OVERLOAD_POLICIES = {
  NORMAL: {
    timeScale: 1.0,
    tickScale: 1.0,
    snapshotScale: 1.0,
    worldTickScale: 1.0,
    portalTickScale: 1.0,
    growthTickScale: 1.0,
    scavengerTickScale: 1.0,
    waveTickScale: 1.0,
    fieldTickScale: 1.0,
    relevanceScale: 1.0,
    aiBudgetScale: 1.0,
    hazardBudgetScale: 1.0,
    forceBudgetScale: 1.0,
    fieldCellScale: 1.0,
  },
  THROTTLED: {
    timeScale: 1.0,
    tickScale: 1.0,
    snapshotScale: 0.85,
    worldTickScale: 0.75,
    portalTickScale: 0.75,
    growthTickScale: 0.75,
    scavengerTickScale: 0.75,
    waveTickScale: 0.8,
    fieldTickScale: 0.8,
    relevanceScale: 0.92,
    aiBudgetScale: 0.85,
    hazardBudgetScale: 0.85,
    forceBudgetScale: 0.85,
    fieldCellScale: 1.12,
  },
  DEGRADED: {
    timeScale: 1.0,
    tickScale: 1.0,
    snapshotScale: 0.7,
    worldTickScale: 0.55,
    portalTickScale: 0.55,
    growthTickScale: 0.55,
    scavengerTickScale: 0.5,
    waveTickScale: 0.6,
    fieldTickScale: 0.65,
    relevanceScale: 0.82,
    aiBudgetScale: 0.7,
    hazardBudgetScale: 0.7,
    forceBudgetScale: 0.7,
    fieldCellScale: 1.28,
  },
  DILATED: {
    timeScale: 0.65,
    tickScale: 0.8,
    snapshotScale: 0.55,
    worldTickScale: 0.45,
    portalTickScale: 0.45,
    growthTickScale: 0.45,
    scavengerTickScale: 0.4,
    waveTickScale: 0.5,
    fieldTickScale: 0.55,
    relevanceScale: 0.75,
    aiBudgetScale: 0.55,
    hazardBudgetScale: 0.6,
    forceBudgetScale: 0.6,
    fieldCellScale: 1.5,
  },
};

function clampHz(value, fallback = 1) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.round(value));
}

function clampPositive(value, fallback = 0) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, value);
}

function clampCount(value, fallback = 1) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.round(value));
}

function createOverloadController(baseSession) {
  const tickHz = clampHz(baseSession.tickHz || 10, 10);
  return {
    state: "NORMAL",
    base: {
      tickHz,
      snapshotHz: clampHz(baseSession.snapshotHz || 6, 6),
      worldTickHz: clampHz(baseSession.worldTickHz || tickHz, tickHz),
      portalTickHz: clampHz(baseSession.portalTickHz || tickHz, tickHz),
      growthTickHz: clampHz(baseSession.growthTickHz || tickHz, tickHz),
      scavengerTickHz: clampHz(baseSession.scavengerTickHz || tickHz, tickHz),
      waveTickHz: clampHz(baseSession.waveTickHz || tickHz, tickHz),
      fieldTickHz: clampHz(baseSession.fieldTickHz || baseSession.worldTickHz || tickHz, tickHz),
      entityRelevanceRadius: clampPositive(baseSession.entityRelevanceRadius || 1, 1),
      scavengerRelevanceRadius: clampPositive(baseSession.scavengerRelevanceRadius || 1, 1),
      useCoarseField: Boolean(baseSession.useCoarseField),
      flowFieldCellSize: clampPositive(baseSession.flowFieldCellSize || 0, 0),
      fieldFlowScale: clampPositive(baseSession.fieldFlowScale || 0, 0),
      spawnScavengersBase: clampPositive(baseSession.spawnScavengersBase || 1, 1),
      spawnScavengersPerPlayer: clampPositive(baseSession.spawnScavengersPerPlayer || 0, 0),
      maxScavengers: clampCount(baseSession.maxScavengers || 1, 1),
      maxRelevantStarsPerPlayer: clampCount(baseSession.maxRelevantStarsPerPlayer || 1, 1),
      maxRelevantPlanetoidsPerPlayer: clampCount(baseSession.maxRelevantPlanetoidsPerPlayer || 1, 1),
      maxRelevantWrecksPerPlayer: clampCount(baseSession.maxRelevantWrecksPerPlayer || 1, 1),
      maxRelevantScavengersPerPlayer: clampCount(baseSession.maxRelevantScavengersPerPlayer || 1, 1),
      maxWellInfluencesPerPlayer: clampCount(baseSession.maxWellInfluencesPerPlayer || 1, 1),
      maxWaveInfluencesPerPlayer: clampCount(baseSession.maxWaveInfluencesPerPlayer || 1, 1),
      maxPickupChecksPerPlayer: clampCount(baseSession.maxPickupChecksPerPlayer || 1, 1),
      maxPortalChecksPerPlayer: clampCount(baseSession.maxPortalChecksPerPlayer || 1, 1),
      maxPlayers: clampCount(baseSession.maxPlayers || 1, 1),
    },
    budgetMs: 1000 / tickHz,
    avgTickMs: 0,
    worstTickMs: 0,
    pressure: 0,
    sampleCount: 0,
    breachStreak: 0,
    recoverStreak: 0,
  };
}

function measurePressure(sample, controller) {
  const base = controller.base;
  const budgetMs = controller.budgetMs;
  const avgPressure = clampPositive(sample.avgTickMs, 0) / Math.max(1, budgetMs * 0.82);
  const worstPressure = clampPositive(sample.worstTickMs, 0) / Math.max(1, budgetMs * 1.2);
  const playerPressure = clampPositive(sample.playerCount, 0) / Math.max(1, base.maxPlayers);
  const aiPressure = clampPositive(sample.aiCount, 0) / Math.max(1, base.maxScavengers);
  const forcePressure = clampPositive(sample.forcePressure, 0);
  return Math.max(avgPressure, worstPressure, playerPressure * 0.7 + aiPressure * 0.4, forcePressure);
}

function projectOverloadBudget(baseSession, state) {
  const policy = OVERLOAD_POLICIES[state] || OVERLOAD_POLICIES.NORMAL;
  return {
    overloadState: state,
    timeScale: policy.timeScale,
    tickHz: clampHz(baseSession.tickHz * policy.tickScale, baseSession.tickHz),
    snapshotHz: clampHz(baseSession.snapshotHz * policy.snapshotScale, baseSession.snapshotHz),
    worldTickHz: clampHz(baseSession.worldTickHz * policy.worldTickScale, baseSession.worldTickHz),
    portalTickHz: clampHz(baseSession.portalTickHz * policy.portalTickScale, baseSession.portalTickHz),
    growthTickHz: clampHz(baseSession.growthTickHz * policy.growthTickScale, baseSession.growthTickHz),
    scavengerTickHz: clampHz(baseSession.scavengerTickHz * policy.scavengerTickScale, baseSession.scavengerTickHz),
    waveTickHz: clampHz(baseSession.waveTickHz * policy.waveTickScale, baseSession.waveTickHz),
    fieldTickHz: clampHz(baseSession.fieldTickHz * policy.fieldTickScale, baseSession.fieldTickHz),
    entityRelevanceRadius: baseSession.entityRelevanceRadius * policy.relevanceScale,
    scavengerRelevanceRadius: baseSession.scavengerRelevanceRadius * policy.relevanceScale,
    useCoarseField: Boolean(baseSession.useCoarseField),
    flowFieldCellSize: baseSession.flowFieldCellSize > 0
      ? baseSession.flowFieldCellSize * policy.fieldCellScale
      : 0,
    fieldFlowScale: baseSession.fieldFlowScale,
    spawnScavengersBase: clampPositive(baseSession.spawnScavengersBase * policy.aiBudgetScale, 0),
    spawnScavengersPerPlayer: baseSession.spawnScavengersPerPlayer * policy.aiBudgetScale,
    maxScavengers: clampCount(baseSession.maxScavengers * policy.aiBudgetScale, baseSession.maxScavengers),
    maxRelevantStarsPerPlayer: clampCount(baseSession.maxRelevantStarsPerPlayer * policy.hazardBudgetScale, baseSession.maxRelevantStarsPerPlayer),
    maxRelevantPlanetoidsPerPlayer: clampCount(baseSession.maxRelevantPlanetoidsPerPlayer * policy.hazardBudgetScale, baseSession.maxRelevantPlanetoidsPerPlayer),
    maxRelevantWrecksPerPlayer: clampCount(baseSession.maxRelevantWrecksPerPlayer * policy.hazardBudgetScale, baseSession.maxRelevantWrecksPerPlayer),
    maxRelevantScavengersPerPlayer: clampCount(baseSession.maxRelevantScavengersPerPlayer * policy.hazardBudgetScale, baseSession.maxRelevantScavengersPerPlayer),
    maxWellInfluencesPerPlayer: clampCount(baseSession.maxWellInfluencesPerPlayer * policy.forceBudgetScale, baseSession.maxWellInfluencesPerPlayer),
    maxWaveInfluencesPerPlayer: clampCount(baseSession.maxWaveInfluencesPerPlayer * policy.forceBudgetScale, baseSession.maxWaveInfluencesPerPlayer),
    maxPickupChecksPerPlayer: clampCount(baseSession.maxPickupChecksPerPlayer * policy.forceBudgetScale, baseSession.maxPickupChecksPerPlayer),
    maxPortalChecksPerPlayer: clampCount(baseSession.maxPortalChecksPerPlayer * policy.forceBudgetScale, baseSession.maxPortalChecksPerPlayer),
  };
}

function advanceOverload(controller, sample) {
  const previousState = controller.state;
  controller.sampleCount += 1;
  controller.avgTickMs = controller.sampleCount === 1
    ? clampPositive(sample.tickCostMs, 0)
    : controller.avgTickMs * 0.84 + clampPositive(sample.tickCostMs, 0) * 0.16;
  controller.worstTickMs = Math.max(clampPositive(sample.tickCostMs, 0), controller.worstTickMs * 0.82);
  controller.pressure = measurePressure({
    avgTickMs: controller.avgTickMs,
    worstTickMs: controller.worstTickMs,
    playerCount: sample.playerCount,
    aiCount: sample.aiCount,
    forcePressure: sample.forcePressure,
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
  createOverloadController,
  projectOverloadBudget,
  advanceOverload,
};
