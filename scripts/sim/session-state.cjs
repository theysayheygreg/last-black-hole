"use strict";

function createIdleSessionState({
  movementHz,
  snapshotHz,
  worldScale,
  maxPlayers,
}) {
  return {
    id: null,
    status: "idle",
    mapId: null,
    mapName: null,
    runDurationSeconds: null,
    hostClientId: null,
    hostName: null,
    overloadState: "NORMAL",
    overloadPressure: 0,
    timeScale: 1,
    baseTickHz: movementHz,
    baseSnapshotHz: snapshotHz,
    worldScale,
    tickHz: movementHz,
    snapshotHz,
    maxPlayers,
  };
}

function createRunningSessionState({
  sessionId,
  runId,
  mapState,
  runDurationSeconds,
  host,
  movementHz,
  snapshotHz,
  profile,
  clientProfile,
  maxPlayers,
}) {
  return {
    id: sessionId,
    runId,
    status: "running",
    mapId: mapState.id,
    mapName: mapState.name,
    runDurationSeconds,
    anomalyCatalog: mapState.anomalyCatalog,
    hostClientId: host.clientId,
    hostProfileId: host.profileId,
    hostName: host.name,
    overloadState: "NORMAL",
    overloadPressure: 0,
    timeScale: 1,
    worldScale: mapState.worldScale,
    baseTickHz: movementHz,
    baseSnapshotHz: snapshotHz,
    tickHz: movementHz,
    snapshotHz,
    useCoarseField: profile.useCoarseField,
    baseFlowFieldCellSize: profile.flowFieldCellSize,
    flowFieldCellSize: profile.flowFieldCellSize,
    baseFieldFlowScale: profile.fieldFlowScale,
    fieldFlowScale: profile.fieldFlowScale,
    baseSpawnScavengersBase: profile.spawnScavengersBase,
    spawnScavengersBase: profile.spawnScavengersBase,
    baseSpawnScavengersPerPlayer: profile.spawnScavengersPerPlayer,
    spawnScavengersPerPlayer: profile.spawnScavengersPerPlayer,
    baseMaxScavengers: profile.maxScavengers,
    maxScavengers: profile.maxScavengers,
    simScaleProfile: profile.profileId,
    clientPerfProfile: profile.clientPerfProfile,
    localFluidResolution: clientProfile.fluidResolution,
    localFluidWindowWorldUnits: clientProfile.localWindowWorldUnits,
    coarseTextureResolution: clientProfile.coarseTextureResolution,
    maxCoarseFieldCells: profile.maxCoarseFieldCells,
    snapshotBudgetBytes: profile.snapshotBudgetBytes,
    snapshotBudgetBytesPerSecond: profile.snapshotBudgetBytesPerSecond,
    ballparkSyncBudgetMs: profile.ballparkSyncBudgetMs,
    maxPlayers,
  };
}

function createInhibitorState({ phaseZero = null, config = null, searchAngle = 0 } = {}) {
  return {
    phase: 0,
    waveId: phaseZero?.id || "inhibitor:phase-0",
    scheduledTime: phaseZero?.time || 0,
    waveBudget: config
      ? (phaseZero?.metadata?.budget ?? config.phaseWaveBudgets[0])
      : 0,
    localTime: 0,
    swarmSearchAngle: searchAngle,
  };
}

// A run gets fresh mutable containers. The groups mirror the lifecycle points
// where the runtime installs them; orchestration remains in sim-runtime.
function createRunState() {
  return {
    clock: {
      tick: 0,
      simTime: 0,
      idCounters: Object.create(null),
      emptySince: null,
      terminalSince: null,
      terminalShutdownAt: null,
    },
    portalClock: {
      openedWindowIds: new Set(),
      closedWindowIds: new Set(),
      finalOpen: false,
      finalClosed: false,
    },
    history: {
      recentEvents: [],
    },
    growth: {
      growthTimer: 0,
      growthIndex: 0,
    },
    world: {
      _wreckWaveIndex: 0,
      _wreckWaveRepeatTimer: 0,
      _wreckRepeatWaveCount: 0,
      waveRings: [],
      coarseField: null,
      authorityFieldPacket: null,
    },
    ecology: {
      inhibitorEntities: [],
      inhibitorEcology: {
        glitchSequence: 0,
        nextGlitchSpawnAt: null,
        swarmSequence: 0,
        nextSwarmSpawnAt: null,
        vesselSequence: 0,
        nextVesselSpawnAt: null,
      },
    },
  };
}

module.exports = {
  createIdleSessionState,
  createRunningSessionState,
  createInhibitorState,
  createRunState,
};
