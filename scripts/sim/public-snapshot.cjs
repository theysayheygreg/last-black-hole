const { PROTOCOL_VERSION, filterEventsForPlayer } = require("../sim-protocol.cjs");
const { getLegacySessionCompatibility } = require("./session-compatibility.cjs");
const { getHeatRatio, isPlayerOverheated } = require("./player-movement-step.cjs");
const { projectGlitchEntity, INHIBITOR_ECOLOGY_CONFIG } = require("./inhibitor-ecology.cjs");

/**
 * Public authority projection only. This module selects the stable wire shape
 * and owns no snapshot retention. Injected gameplay fact callbacks retain
 * their existing domain side effects, so their call order is intentional.
 */
function projectPublicSession(session, mapState, waveRings) {
  return {
    ...session,
    ...getLegacySessionCompatibility({
      worldScale: session.worldScale,
      mapState,
      waveRings,
      includeBaseKeys: true,
    }),
  };
}

function projectAbilityState(state) {
  if (!state) return null;
  return {
    hullType: state.hullType,
    // Drifter
    flowLockActive: state.flowLockActive,
    flowLockCooldown: state.flowLockCooldown,
    eddyBrakeCooldown: state.eddyBrakeCooldown,
    // Breacher
    burnActive: state.burnActive,
    burnFuel: state.burnFuel,
    momentumShieldActive: state.momentumShieldActive,
    // Resonant
    eddies: state.eddies,
    tapAnchor: state.tapAnchor,
    tapCooldown: state.tapCooldown,
    frequencyShiftCooldown: state.frequencyShiftCooldown,
    nextPulseInverted: state.nextPulseInverted,
    // Shroud
    ghostTrailActive: state.ghostTrailActive,
    wakeCloakCooldown: state.wakeCloakCooldown,
    decoyCharges: state.decoyCharges,
    decoyCooldown: state.decoyCooldown,
    decoys: state.decoys,
    // Hauler
    salvageLockCharges: state.salvageLockCharges,
    tractorCooldown: state.tractorCooldown,
    tractorChannelTimer: state.tractorChannelTimer,
  };
}

function projectNoise(player) {
  const noise = player.noise || {};
  const publicListenerStates = new Set(["HEARD", "TRACKING", "INVESTIGATING", "LOCKED ON"]);
  return {
    audibleRadiusMeters: Math.max(0, Number(noise.audibleRadiusMeters) || 0),
    trend: noise.trend || "steady",
    currentSource: noise.currentSource || "IDLE",
    dominantSource: noise.dominantSource || "IDLE",
    sourceClass: noise.sourceClass || null,
    heardListenerCount: Math.max(0, Math.floor(Number(noise.heardListenerCount) || 0)),
    trackedListenerCount: Math.max(0, Math.floor(Number(noise.trackedListenerCount) || 0)),
    lockedOnListenerCount: Math.max(0, Math.floor(Number(noise.lockedOnListenerCount) || 0)),
    listeners: Array.isArray(noise.listeners) ? noise.listeners.map((listener) => ({
      kind: listener.kind || "FAUNA",
      state: publicListenerStates.has(listener.state) ? listener.state : "HEARD",
      distanceMeters: Math.max(0, Number(listener.distanceMeters) || 0),
    })) : [],
    maxAudibleRadiusMeters: Math.max(0, Number(noise.maxAudibleRadiusMeters) || 0),
    timeHeardSeconds: Math.max(0, Number(noise.timeHeardSeconds) || 0),
    timeTrackedSeconds: Math.max(0, Number(noise.timeTrackedSeconds) || 0),
  };
}

function projectPlayer(player, facts) {
  const heatRatio = getHeatRatio(player);
  const overheatRemaining = Math.max(0, Number(player.overheatRemaining) || 0);
  const coyote = player.slingshot ? facts.slingshotCoyoteTelemetry(player.slingshot) : null;
  const slingshot = player.slingshot ? {
    phase: player.slingshot.phase || "idle",
    engaged: Boolean(player.slingshot.engaged),
    anchorId: player.slingshot.anchorId ?? null,
    anchorType: player.slingshot.anchorType ?? null,
    anchorWX: player.slingshot.anchorWX ?? null,
    anchorWY: player.slingshot.anchorWY ?? null,
    anchorRange: player.slingshot.anchorRange ?? 0,
    energy: player.slingshot.energy || 0,
    chainCount: player.slingshot.chainCount || 0,
    engageRadius: player.slingshot.engageRadius || 0,
    orbitDir: player.slingshot.orbitDir || 0,
    bendDegrees: player.slingshot.bendDegrees || 0,
    arcRadians: player.slingshot.arcRadians || 0,
    aim: player.slingshot.aimAnchorKey ? {
      anchorId: player.slingshot.aimAnchorId,
      anchorType: player.slingshot.aimAnchorType,
      anchorWX: player.slingshot.aimAnchorWX,
      anchorWY: player.slingshot.aimAnchorWY,
      anchorRange: player.slingshot.aimAnchorRange,
      distance: player.slingshot.aimDistance,
      tangentialSpeed: player.slingshot.aimTangentialSpeed || 0,
      engageEligible: player.slingshot.engageEligible === true,
      coyoteActive: Boolean(player.slingshot.coyoteActive),
      coyoteRemainingMs: coyote.transportRemainingMs,
      canonicalCoyoteRemainingMs: coyote.canonicalRemainingMs,
      effectiveCoyoteDurationMs: coyote.effectiveDurationMs,
      transportCoyoteRemainingMs: coyote.transportRemainingMs,
    } : null,
    // Keep this after the outer aim fields: telegraph projection refreshes
    // eligibility before the ruler facts below consume it.
    telegraph: facts.buildSlingshotTelegraph(player),
  } : null;

  return {
    clientId: player.clientId,
    profileId: player.profileId || null,
    name: player.name,
    isAI: Boolean(player.isAI),
    personality: player.personality || null,
    hullType: player.hullType || "drifter",
    rigLevels: player.rigLevels || [0, 0, 0],
    abilityState: projectAbilityState(player.abilityState),
    status: player.status,
    hullDamage: Math.max(0, Number(player.hullDamage) || 0),
    hullIntegrityRatio: Math.max(0, 1 - Math.max(0, Math.min(1, Number(player.hullDamage) || 0))),
    wx: player.wx,
    wy: player.wy,
    vx: player.vx,
    vy: player.vy,
    slingshot,
    deltaV: player.deltaV,
    deltaVMax: player.deltaVMax,
    deltaVRatio: player.deltaVMax > 0 ? player.deltaV / player.deltaVMax : 0,
    heat: heatRatio,
    heatRatio,
    overheated: isPlayerOverheated(player),
    overheatRemaining,
    deliveredThrust: Math.max(0, Math.min(1, Number(player.lastDeliveredThrustIntensity) || 0)),
    deliveredBrake: Math.max(0, Math.min(1, Number(player.lastDeliveredBrakeIntensity) || 0)),
    forceLedger: player.forceLedger || null,
    ruler: facts.buildPlayerRulerFacts(player),
    lastInputSeq: player.lastInput.seq,
    lastInputBrake: player.lastInput.brake || 0,
    pendingSlingshotEdgeCount: Array.isArray(player.lastInput.slingshotEdges)
      ? player.lastInput.slingshotEdges.length
      : 0,
    cargo: player.cargo,
    cargoCount: player.cargo.filter(Boolean).length,
    equipped: player.equipped,
    consumables: player.consumables,
    activeEffects: player.activeEffects,
    effectState: player.effectState,
    portalInteraction: player.portalInteraction ? { ...player.portalInteraction } : null,
    noise: projectNoise(player),
    controlDebuff: player.controlDebuff || 0,
  };
}

function projectWorld({
  mapState,
  portalSchedule,
  waveRings,
  collapseEpochState,
  collapseEpochSchedule,
  getAuthoritativeField,
}) {
  return {
    anomalyCatalog: mapState.anomalyCatalog,
    wells: mapState.wells,
    stars: mapState.stars,
    wrecks: mapState.wrecks,
    planetoids: mapState.planetoids,
    portals: mapState.portals,
    portalSchedule,
    nextPortalWindowIndex: mapState.nextPortalWindowIndex,
    nextPortalWaveIndex: mapState.nextPortalWaveIndex,
    scavengers: mapState.scavengers,
    fauna: mapState.fauna,
    sentries: mapState.sentries,
    waveRings: waveRings.map((ring) => ({
      id: ring.id,
      sourceWX: ring.sourceWX,
      sourceWY: ring.sourceWY,
      radius: ring.radius,
      amplitude: ring.amplitude,
      initialAmplitude: ring.initialAmplitude,
      sourceWellId: ring.sourceWellId ?? null,
      alive: ring.alive !== false,
    })),
    collapseEpoch: collapseEpochState ? {
      epochId: collapseEpochState.epochId,
      epochIndex: collapseEpochState.epochIndex,
      scheduledTime: collapseEpochState.scheduledTime,
      transitionCount: collapseEpochState.transitionCount,
      parameterVector: { ...collapseEpochState.parameterVector },
    } : null,
    collapseEpochSchedule,
    authoritativeField: getAuthoritativeField(),
  };
}

function projectInhibitor(inhibitor, schedule, entities = [], ecology = {}) {
  const legacyScalar = {
    form: inhibitor.form,
    phase: inhibitor.phase,
    waveId: inhibitor.waveId,
    scheduledTime: inhibitor.scheduledTime,
    waveBudget: inhibitor.waveBudget,
    wx: inhibitor.wx,
    wy: inhibitor.wy,
    intensity: inhibitor.intensity,
    radius: inhibitor.radius,
    localTime: inhibitor.localTime,
    formTimes: Array.isArray(inhibitor.formTimes)
      ? inhibitor.formTimes.slice(0, 4)
      : [null, null, null, null],
    schedule,
    targetWX: inhibitor.swarmTargetX,
    targetWY: inhibitor.swarmTargetY,
    listenerState: inhibitor.noiseListenerState || "QUIET",
    searchState: inhibitor.noiseSearchState || "IDLE",
    lastNoiseWX: inhibitor.lastNoiseWX,
    lastNoiseWY: inhibitor.lastNoiseWY,
    finalPortalSpawned: Boolean(inhibitor.finalPortalSpawned),
    finalPortalExpired: Boolean(inhibitor.finalPortalExpired),
    gravityBonus: inhibitor.gravityBonus || 0,
  };
  const glitch = INHIBITOR_ECOLOGY_CONFIG.glitch;
  return {
    ...legacyScalar,
    // Keep the old scalar fields readable for Swarm/Vessel/client consumers,
    // but label the object so new consumers use the collection below.
    compatibility: {
      label: "legacy-scalar-projection",
      owner: "swarm-vessel-client-rendering",
      scalar: legacyScalar,
    },
    phase: inhibitor.phase,
    entities: Array.from(entities || []).map(projectGlitchEntity),
    glitchSchedule: {
      phase: 1,
      populationCap: glitch.populationCap,
      spawnCadenceSeconds: glitch.spawnCadenceSeconds,
      lifetimeSeconds: glitch.lifetimeSeconds,
      nextSpawnAt: ecology.nextGlitchSpawnAt ?? null,
    },
    schedule,
  };
}

function buildPublicSnapshot(state, facts) {
  return {
    type: "snapshot",
    protocolVersion: PROTOCOL_VERSION,
    session: state.session,
    tick: state.clock.tick,
    simTime: state.clock.simTime,
    serverTime: state.clock.serverTime,
    lastEventSeq: state.clock.lastEventSeq,
    bench: state.bench,
    players: Array.from(state.players).map((player) => projectPlayer(player, facts)),
    world: projectWorld(state.world),
    inhibitor: projectInhibitor(
      state.inhibitor,
      state.world.portalSchedule,
      state.inhibitorEntities,
      state.inhibitorEcology,
    ),
    portalSchedule: state.world.portalSchedule,
    // Baselines are shared and cacheable. Player-local events are recovered
    // through the authenticated event stream instead.
    recentEvents: filterEventsForPlayer(state.recentEvents.slice(-32), null),
  };
}

module.exports = {
  buildPublicSnapshot,
  projectPublicSession,
};
