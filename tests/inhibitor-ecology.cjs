"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { createConductor } = require("../scripts/sim/conductor.cjs");
const {
  INHIBITOR_ECOLOGY_CONFIG,
  createGlitchEntity,
  advanceGlitchEntity,
  applyGlitchForcesAndContacts,
  projectGlitchEntity,
  createSwarmEntity,
  advanceSwarmEntity,
  applySwarmContacts,
  projectSwarmEntity,
  createVesselEntity,
  advanceVesselEntity,
  applyVesselForcesAndContacts,
  projectVesselEntity,
  countLiveVessels,
  shouldSpawnVessel,
  applyWellOverdrive,
  deriveWellOverdriveMultiplier,
  effectiveWellMass,
  countLiveGlitches,
  countLiveSwarms,
  shouldSpawnGlitch,
  shouldSpawnSwarm,
} = require("../scripts/sim/inhibitor-ecology.cjs");
const { startSimServer, stopSimServer } = require("./helpers.cjs");
const { projectWorld } = require("../scripts/sim/public-snapshot.cjs");

const PORT = Number(process.env.LBH_INHIBITOR_ECOLOGY_SIM_PORT || 8818);
const URL = `http://127.0.0.1:${PORT}`;

async function request(path, body = null) {
  const response = await fetch(`${URL}${path}`, body == null ? undefined : {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok || json.ok === false) {
    throw new Error(`${path} failed: ${response.status} ${json.error || JSON.stringify(json)}`);
  }
  return json;
}

async function snapshot() {
  return request("/snapshot");
}

async function waitFor(predicate, timeoutMs = 42000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await snapshot();
    if (predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ecology state at tick ${last?.tick}`);
}

async function run() {
  console.log("\n=== INHIBITOR ECOLOGY TESTS ===\n");

  const cfg = {
    ...INHIBITOR_ECOLOGY_CONFIG.glitch,
    populationCap: 2,
    lifetimeSeconds: 1,
    contactCooldownSeconds: 1,
    coreDamage: 0.5,
  };
  const conductor = createConductor({ seed: 77, conductorId: "match-conductor", worldScale: 5 });
  const phaseOne = conductor.scheduleSeverityWaves({
    waveIdPrefix: "inhibitor:phase-1",
    startTime: 1,
    cadence: 1,
    count: 1,
    budget: 1,
    tier: 1,
    metadata: { phase: 1 },
  })[0];
  assert.strictEqual(phaseOne.tier, 1, "Conductor must own the Phase-1 wave");

  const spawn = (sequence) => conductor.selectToroidalSpawn({
    streamName: `inhibitor.glitch.${sequence}`,
    anchor: { wx: 2.5, wy: 2.5 },
    worldScale: 5,
    minRadius: 0,
    maxRadius: 2,
  });
  const first = createGlitchEntity({ id: "inhibitor-glitch-1", ...spawn(1), vx: 0.1, config: cfg });
  const second = createGlitchEntity({ id: "inhibitor-glitch-2", ...spawn(2), vx: -0.1, config: cfg });
  assert.strictEqual(second.contactCooldownSeconds, cfg.contactCooldownSeconds, "Contact cadence must be entity-owned from centralized config");
  assert.strictEqual(second.maxDamage, cfg.maxDamage, "Contact lethality must be entity-owned from centralized config");
  assert.strictEqual(new Set([first.id, second.id]).size, cfg.populationCap, "Glitch ids must be stable and unique at cap");
  assert(new Set([first.id, second.id]).size <= cfg.populationCap, "Glitch population must remain capped");

  const laterPhaseEntities = [
    { kind: "glitch", lifecycle: "alive" },
    { kind: "glitch", lifecycle: "expired" },
    { kind: "swarm", lifecycle: "alive" },
  ];
  assert.strictEqual(countLiveGlitches(laterPhaseEntities, cfg.kind), 1,
    "Expired Glitches and future entity kinds must not consume the Glitch cap");
  assert(shouldSpawnGlitch({
    phase: 2,
    simTime: 8,
    nextSpawnAt: 8,
    entities: laterPhaseEntities,
    config: cfg,
  }), "Later phases must continue admitting Glitches after earlier ones expire");
  laterPhaseEntities.push({ kind: "glitch", lifecycle: "spawning" });
  assert.strictEqual(countLiveGlitches(laterPhaseEntities, cfg.kind), cfg.populationCap,
    "A replenished later-phase Glitch must consume exactly one Glitch-cap slot");

  const before = first.wx;
  advanceGlitchEntity(first, { dt: 0.25, worldScale: 5, config: cfg });
  assert.notStrictEqual(first.wx, before, "Glitch drift must advance deterministically");
  advanceGlitchEntity(first, { dt: 0.8, worldScale: 5, config: cfg });
  assert.strictEqual(first.lifecycle, "expired", "Glitch must expire at its configured lifetime");

  advanceGlitchEntity(second, { dt: 0, worldScale: 5, config: cfg });
  const player = { clientId: "pilot", status: "alive", wx: second.wx, wy: second.wy, vx: 0, vy: 0, hullDamage: 0 };
  const firstContact = applyGlitchForcesAndContacts([second], [player], { dt: 0.1, worldScale: 5, tick: 1 });
  assert.strictEqual(firstContact[0].damage, cfg.coreDamage, "Core contact must apply configured hull damage");
  const cooldownContact = applyGlitchForcesAndContacts([second], [player], { dt: 0.1, worldScale: 5, tick: 2 });
  assert.strictEqual(cooldownContact.length, 0, "Core contact must respect its bounded cadence");
  const lethalContact = applyGlitchForcesAndContacts([second], [player], { dt: 1, worldScale: 5, tick: 3 });
  assert(lethalContact[0].lethal, "Accumulated core damage must be bounded and lethal at the configured maximum");
  const projected = projectGlitchEntity(second);
  assert.strictEqual(projected.listensToNoise, false, "Glitches must never listen to Noise");
  assert.strictEqual(projected.noiseListenerState, "NONE", "Glitches must publish no listener state");
  assert(projected.position && Number.isFinite(projected.position.wx), "Glitch projection must expose a position object");

  const swarmCfg = {
    ...INHIBITOR_ECOLOGY_CONFIG.swarm,
    populationCap: 2,
    lifetimeSeconds: 20,
    trackingIntervalSeconds: 3,
    searchTimeoutSeconds: 5,
    hullDamage: 0.6,
    contactCooldownSeconds: 0.8,
  };
  const swarm = createSwarmEntity({ id: "inhibitor-swarm-1", wx: 1, wy: 1, config: swarmCfg });
  const playerNoise = { kind: "player", wx: 1.05, wy: 1, radiusMeters: 100 };
  advanceSwarmEntity(swarm, { dt: 1, worldScale: 5, noiseSources: [playerNoise], config: swarmCfg });
  assert.strictEqual(swarm.noiseListenerState, "HEARD", "Swarm must acquire audible player Noise independently");
  advanceSwarmEntity(swarm, { dt: 1, worldScale: 5, noiseSources: [playerNoise], config: swarmCfg });
  advanceSwarmEntity(swarm, { dt: 1, worldScale: 5, noiseSources: [playerNoise], config: swarmCfg });
  assert.strictEqual(swarm.noiseListenerState, "TRACKING", "Swarm must enter tracking after its configured interval");
  assert.deepStrictEqual({ wx: swarm.targetWX, wy: swarm.targetWY }, { wx: playerNoise.wx, wy: playerNoise.wy },
    "Tracking must move the per-Swarm target to the heard source");
  for (let i = 0; i < 5; i += 1) {
    advanceSwarmEntity(swarm, { dt: 1, worldScale: 5, noiseSources: [], config: swarmCfg });
  }
  assert.strictEqual(swarm.noiseListenerState, "INVESTIGATING", "Lost Noise must enter per-Swarm investigation");
  assert.strictEqual(swarm.noiseSearchState, "SEARCHING", "Lost Noise must use the configured search state");
  const decoySwarm = createSwarmEntity({ id: "inhibitor-swarm-2", wx: 2, wy: 2, config: swarmCfg });
  advanceSwarmEntity(decoySwarm, {
    dt: 1,
    worldScale: 5,
    noiseSources: [{ kind: "decoy", wx: 2.04, wy: 2, radiusMeters: 80 }],
    config: swarmCfg,
  });
  assert.strictEqual(decoySwarm.noiseListenerState, "HEARD", "Swarm must acquire decoy Noise through the same seam");
  assert.strictEqual(countLiveSwarms([swarm, decoySwarm]), 2, "Swarm population counting must be kind-specific");
  assert(shouldSpawnSwarm({ phase: 2, simTime: 8, nextSpawnAt: 8, entities: [swarm], config: swarmCfg }),
    "Phase 2 must admit Swarms when their kind cap has room");
  const contactPlayer = {
    clientId: "swarm-pilot",
    status: "alive",
    wx: swarm.wx,
    wy: swarm.wy,
    hullDamage: 0,
    cargo: [{ id: "cargo-kept" }],
    noise: { audibleRadiusMeters: 0, impulses: [] },
  };
  const swarmContact = applySwarmContacts([swarm], [contactPlayer], { dt: 0.1, worldScale: 5, tick: 1 });
  assert.strictEqual(swarmContact[0].damage, swarmCfg.hullDamage, "Swarm contact must apply heavy configured hull damage");
  assert.strictEqual(contactPlayer.cargo.length, 1, "Swarm contact must not mutate cargo");
  assert.strictEqual(contactPlayer.controlDebuff, undefined, "Swarm contact must not apply control sluggishness");
  assert.strictEqual(contactPlayer.noise.impulses.length, 0, "Swarm contact must not spike player Noise");
  assert.strictEqual(applySwarmContacts([swarm], [contactPlayer], { dt: 0.1, worldScale: 5, tick: 2 }).length, 0,
    "Swarm contact must respect its cooldown");
  const swarmLethalContact = applySwarmContacts([swarm], [contactPlayer], { dt: 1, worldScale: 5, tick: 3 });
  assert(swarmLethalContact[0].lethal, "Repeated heavy Swarm contact must reach the configured hull death threshold");
  const swarmProjection = projectSwarmEntity(swarm);
  assert.strictEqual(swarmProjection.listensToNoise, true, "Swarm projection must expose Noise ownership");
  assert.strictEqual(swarmProjection.noiseListenerState, "INVESTIGATING", "Swarm projection must expose current search state");
  assert(swarmProjection.lastHeard && Number.isFinite(swarmProjection.lastHeard.wx),
    "Swarm projection must retain last-heard memory");

  const vesselCfg = {
    ...INHIBITOR_ECOLOGY_CONFIG.vessel,
    populationCap: 3,
    inboundTellSeconds: 3,
    contactCooldownSeconds: 1,
  };
  const vessel = createVesselEntity({
    id: "inhibitor-vessel-1",
    edge: "left",
    edgeProgress: 0.4,
    worldScale: 5,
    config: vesselCfg,
  });
  assert.strictEqual(vessel.lifecycle, "inbound", "Vessels must enter through an explicit inbound lifecycle");
  assert.strictEqual(vessel.edge, "left", "Vessel edge entry must be deterministic and public");
  assert(shouldSpawnVessel({ phase: 3, simTime: 24, nextSpawnAt: 24, entities: [vessel], config: vesselCfg }),
    "Phase 3 must admit Vessels while their kind cap has room");
  assert.strictEqual(countLiveVessels([
    vessel,
    { kind: "vessel", lifecycle: "expired" },
    { kind: "glitch", lifecycle: "alive" },
  ]), 1, "Vessel cap counting must be kind-specific and ignore expired entries");
  const vesselPilot = { clientId: "vessel-pilot", status: "alive", wx: 2, wy: 2, vx: 0, vy: 0, hullDamage: 0 };
  advanceVesselEntity(vessel, { dt: 1, worldScale: 5, players: [vesselPilot], config: vesselCfg });
  assert.strictEqual(vessel.awareness, "STRATEGIC", "Vessels must use strategic awareness");
  assert.strictEqual(vessel.targetClientId, vesselPilot.clientId, "Vessel must target the nearest alive player");
  assert.strictEqual(vessel.noiseListenerState, "NONE", "Vessels must not use audible listener state");
  advanceVesselEntity(vessel, { dt: 2, worldScale: 5, players: [vesselPilot], config: vesselCfg });
  assert.strictEqual(vessel.lifecycle, "alive", "Vessel inbound tell must end at its configured cadence");
  vessel.wx = 2;
  vessel.wy = 2;
  vesselPilot.wx = 2 + vesselCfg.outerDamageRadius * 0.9;
  vesselPilot.wy = 2;
  const vesselOuterContact = applyVesselForcesAndContacts([vessel], [vesselPilot], { dt: 0.1, worldScale: 5, tick: 1 });
  assert.strictEqual(vesselOuterContact[0].damage, vesselCfg.outerDamage, "Vessel outer contact must apply configured damage");
  assert.strictEqual(vesselPilot.hullDamage, vesselCfg.outerDamage, "Vessel outer damage must use the existing hull state seam");
  assert.strictEqual(applyVesselForcesAndContacts([vessel], [vesselPilot], { dt: 0.1, worldScale: 5, tick: 2 }).length, 0,
    "Vessel outer damage must respect its cooldown");
  vesselPilot.wx = vessel.wx;
  vesselPilot.wy = vessel.wy;
  const vesselCoreContact = applyVesselForcesAndContacts([vessel], [vesselPilot], { dt: 1, worldScale: 5, tick: 3 });
  assert(vesselCoreContact[0].instantKill && vesselCoreContact[0].lethal, "Vessel core contact must be instant lethal");
  const vesselProjection = projectVesselEntity(vessel);
  assert.strictEqual(vesselProjection.awareness, "STRATEGIC", "Vessel projection must expose strategic awareness");
  assert.strictEqual(vesselProjection.presentation.palette, "procedural-magenta", "Vessel presentation must be procedural magenta");

  const overdriveWell = { id: "well-overdrive", wx: 1, wy: 1, mass: 2, killRadius: 0.05 };
  const firstOverdrive = applyWellOverdrive({ well: overdriveWell, source: vessel.id, time: 10, config: vesselCfg });
  const cappedOverdrive = [firstOverdrive];
  let currentTier = firstOverdrive.tier;
  for (let i = 0; i < 4; i += 1) {
    const next = applyWellOverdrive({
      well: { ...overdriveWell, overdriveTier: currentTier },
      source: vessel.id,
      time: 11 + i,
      config: vesselCfg,
    });
    cappedOverdrive.push(next);
    currentTier = next.tier;
  }
  assert.strictEqual(currentTier, vesselCfg.tierCap, "Well overdrive must cap at the configured tier");
  assert.strictEqual(cappedOverdrive.at(-1).multiplier, deriveWellOverdriveMultiplier(vesselCfg.tierCap, vesselCfg),
    "Well overdrive must derive its bounded per-tier multiplier");
  assert.strictEqual(effectiveWellMass({ ...overdriveWell, overdriveMultiplier: cappedOverdrive.at(-1).multiplier }),
    overdriveWell.mass * cappedOverdrive.at(-1).multiplier, "Overdrive must strengthen effective force mass");
  assert.strictEqual(overdriveWell.mass, 2, "Pure well overdrive must not reduce or mutate base well mass");

  const runtimeSource = fs.readFileSync(path.join(__dirname, "..", "scripts/sim-runtime.cjs"), "utf8");
  assert(!runtimeSource.includes("updateInhibitorPortalBlocks"), "Vessel ecology must not own portal blocking");
  assert(!runtimeSource.includes("vesselPortalBlockRange"), "Vessel ecology must not score portals by proximity");
  assert(!runtimeSource.includes("consumedByInhibitor"), "Vessel ecology must not consume or reduce wells");
  assert(!runtimeSource.includes("blockedByInhibitor"), "Vessel ecology must not block portals");

  await startSimServer(PORT, {
    keepAlive: true,
    idleShutdownMs: 5000,
    env: { LBH_SIM_MAX_SIM_TIME: "90" },
  });
  try {
    const started = await request("/session/start", {
      mapId: "shallows",
      requesterId: "ecology-pilot",
      requesterName: "Ecology Harness",
      maxPlayers: 1,
      seed: 901,
    });
    const joined = await request("/join", {
      runId: started.session.runId,
      clientId: "ecology-pilot",
      name: "Ecology Pilot",
      hullType: "drifter",
      joinTicket: started.joinTicket,
    });
    assert(joined.player, "Focused ecology fixture must boot and join the authority");

    const phaseOneSnapshot = await waitFor((body) => body.inhibitor?.phase === 1 && body.inhibitor.entities?.length >= 1);
    const firstEntity = phaseOneSnapshot.inhibitor.entities[0];
    assert.strictEqual(firstEntity.kind, "glitch", "Phase 1 must spawn Glitches");
    assert(firstEntity.id && firstEntity.lifecycle === "alive", "Snapshot must expose stable live Glitch identity and lifecycle");
    assert(firstEntity.position && Number.isFinite(firstEntity.position.wx), "Snapshot must expose Glitch position");
    assert.strictEqual(firstEntity.lifetime, INHIBITOR_ECOLOGY_CONFIG.glitch.lifetimeSeconds, "Snapshot must expose configured lifetime");
    assert.strictEqual(phaseOneSnapshot.inhibitor.glitchSchedule.populationCap, INHIBITOR_ECOLOGY_CONFIG.glitch.populationCap,
      "Snapshot must expose the bounded ecology schedule");
    assert(!Object.prototype.hasOwnProperty.call(phaseOneSnapshot.inhibitor, "compatibility"),
      "Public ecology must not expose a scalar compatibility projection");

    const accumulated = await waitFor((body) => body.inhibitor.entities?.length >= 2);
    const ids = accumulated.inhibitor.entities.map((entity) => entity.id);
    assert.strictEqual(new Set(ids).size, ids.length, "Accumulated Glitches must retain stable unique ids");
    assert(ids.every((id) => id.startsWith("inhibitor-glitch-")), "Glitch ids must use the stable ecology namespace");
    assert(ids.length <= INHIBITOR_ECOLOGY_CONFIG.glitch.populationCap, "Runtime collection must respect the cap");
    assert(accumulated.inhibitor.entities.every((entity) => entity.listensToNoise === false && entity.noiseListenerState === "NONE"),
      "Runtime Glitches must remain listener-free");
    assert(accumulated.recentEvents.some((event) => event.type === "inhibitor.glitchSpawned"),
      "Conductor spawning must publish a focused arrival event");

    await request("/debug/inhibitor-state", { phase: 2 });
    const phaseTwo = await waitFor((body) => body.inhibitor?.phase === 2
      && body.inhibitor.entities?.some((entity) => entity.kind === "swarm"));
    const phaseTwoSwarms = phaseTwo.inhibitor.entities.filter((entity) => entity.kind === "swarm");
    assert(phaseTwo.inhibitor.swarmSchedule.populationCap === INHIBITOR_ECOLOGY_CONFIG.swarm.populationCap,
      "Phase 2 snapshot must expose the centralized Swarm schedule");
    assert(phaseTwoSwarms[0].id.startsWith("inhibitor-swarm-"), "Swarm ids must use the stable ecology namespace");
    assert(phaseTwoSwarms[0].listensToNoise === true, "Snapshot must expose individual Swarm Noise ownership");
    assert(["QUIET", "HEARD", "TRACKING", "INVESTIGATING"].includes(phaseTwoSwarms[0].noiseListenerState),
      "Snapshot must expose a per-Swarm listener state");

    const phaseTwoAccumulated = await waitFor((body) => {
      const entities = body.inhibitor.entities || [];
      return entities.filter((entity) => entity.kind === "swarm").length >= 2
        && entities.some((entity) => entity.id === "inhibitor-glitch-3");
    });
    const phaseTwoEntities = phaseTwoAccumulated.inhibitor.entities;
    const phaseTwoIds = phaseTwoEntities.map((entity) => entity.id);
    assert.strictEqual(new Set(phaseTwoIds).size, phaseTwoIds.length, "Mixed ecology ids must remain stable and unique");
    assert(phaseTwoEntities.filter((entity) => entity.kind === "swarm").length <= INHIBITOR_ECOLOGY_CONFIG.swarm.populationCap,
      "Swarm collection must respect its kind-specific cap");
    assert(phaseTwoEntities.filter((entity) => entity.kind === "glitch").length <= INHIBITOR_ECOLOGY_CONFIG.glitch.populationCap,
      "Glitch collection must retain its independent cap in Phase 2");
    assert(phaseTwoAccumulated.recentEvents.some((event) => event.type === "inhibitor.swarmSpawned"),
      "Conductor Phase 2 spawning must publish a Swarm arrival event");

    await request("/debug/inhibitor-state", { phase: 3 });
    const phaseThree = await waitFor((body) => body.inhibitor?.phase === 3
      && body.inhibitor.entities?.some((entity) => entity.kind === "vessel"));
    const firstVessel = phaseThree.inhibitor.entities.find((entity) => entity.kind === "vessel");
    assert(firstVessel.id.startsWith("inhibitor-vessel-"), "Vessel ids must use the stable ecology namespace");
    assert(["inbound", "alive"].includes(firstVessel.lifecycle), "Snapshot must expose Vessel inbound lifecycle");
    assert.strictEqual(firstVessel.awareness, "STRATEGIC", "Snapshot must expose strategic Vessel awareness");
    assert.strictEqual(firstVessel.listensToNoise, false, "Vessels must remain outside Noise listener ownership");
    assert.strictEqual(phaseThree.inhibitor.vesselSchedule.populationCap, INHIBITOR_ECOLOGY_CONFIG.vessel.populationCap,
      "Phase 3 snapshot must expose the centralized Vessel schedule");
    assert(phaseThree.recentEvents.some((event) => event.type === "inhibitor.vesselInbound"),
      "Conductor Vessel spawning must publish an inbound tell event");
    assert(Array.isArray(phaseThree.world.noiseEmitters), "World snapshot must expose Noise emitters");
    const ecologyEmitters = phaseThree.world.noiseEmitters.filter((emitter) => emitter.sourceKind === "inhibitor");
    assert(ecologyEmitters.some((emitter) => emitter.sourceClass === "GLITCH"),
      "Glitches must emit category-only world Noise contacts");
    assert(ecologyEmitters.some((emitter) => emitter.sourceClass === "SWARM"),
      "Swarms must emit category-only world Noise contacts");
    assert(ecologyEmitters.some((emitter) => emitter.sourceClass === "VESSEL"),
      "Vessels must emit world Noise contacts");
    assert(ecologyEmitters.every((emitter) => emitter.radiusMeters > 0 && emitter.cadenceSeconds > 0),
      "World Noise emitters must carry centralized meter/cadence data");
    const exfilProjection = projectWorld({
      mapState: {
        anomalyCatalog: [], wells: [], stars: [], wrecks: [], planetoids: [],
        portals: [{ id: "portal-final-exfil", alive: true, wx: 4.2, wy: 1.1 }],
        scavengers: [], fauna: [], sentries: [], nextPortalWindowIndex: 0, nextPortalWaveIndex: 0,
      },
      inhibitorEntities: [],
      portalSchedule: null,
      waveRings: [],
      collapseEpochState: null,
      collapseEpochSchedule: [],
      getAuthoritativeField: () => null,
    });
    assert.strictEqual(exfilProjection.noiseEmitters[0].sourceClass, "EXFIL",
      "Active exfils must emit world Noise contacts through the shared projection");

    const sceneSource = await import(pathToFileURL(path.join(__dirname, "..", "src/presentation/scene-source.js")).href);
    const presentationFrame = await import(pathToFileURL(path.join(__dirname, "..", "src/presentation/presentation-frame.js")).href);
    const scene = sceneSource.createPresentationSceneSource({
      phase: "playing",
      localPlayer: { ship: { wx: 0, wy: 0, vx: 0, vy: 0, slingshotEngaged: false } },
      world: {
        inhibitors: accumulated.inhibitor.entities,
        noiseEmitters: [...phaseThree.world.noiseEmitters, ...exfilProjection.noiseEmitters],
      },
    });
    const frame = presentationFrame.createPresentationFrame({ phase: "playing", scene });
    assert.strictEqual(frame.world.inhibitors.length, accumulated.inhibitor.entities.length,
      "Collection-owned Glitches must cross the renderer-neutral presentation seam");
    assert(frame.world.noiseEmitters.some((emitter) => emitter.sourceClass === "EXFIL"),
      "Renderer-neutral presentation must carry active exfil emitters");
    assert.strictEqual(frame.world.inhibitors[0].hint.roleColor, "anomalyMagenta",
      "Glitch presentation must retain the procedural magenta role");
    const mixedScene = sceneSource.createPresentationSceneSource({
      phase: "playing",
      localPlayer: { ship: { wx: 0, wy: 0, vx: 0, vy: 0, slingshotEngaged: false } },
      world: { inhibitors: phaseTwoEntities },
    });
    const mixedFrame = presentationFrame.createPresentationFrame({ phase: "playing", scene: mixedScene });
    assert.strictEqual(mixedFrame.world.inhibitors.length, phaseTwoEntities.length,
      "Renderer-neutral presentation must expose mixed Glitch and Swarm collections");
    const presentedSwarm = mixedFrame.world.inhibitors.find((entity) => entity.kind === "swarm");
    assert(presentedSwarm && presentedSwarm.visual.family === "noise-hunting-fabric",
      "Swarm presentation must retain its procedural magenta/fabric identity");
    const vesselScene = sceneSource.createPresentationSceneSource({
      phase: "playing",
      localPlayer: { ship: { wx: 0, wy: 0, vx: 0, vy: 0, slingshotEngaged: false } },
      world: { inhibitors: [firstVessel] },
    });
    const vesselFrame = presentationFrame.createPresentationFrame({ phase: "playing", scene: vesselScene });
    assert.strictEqual(vesselFrame.world.inhibitors[0].visual.family, "strategic-vessel-magenta",
      "Vessel presentation must retain its renderer-neutral procedural identity");
  } finally {
    await stopSimServer(PORT);
  }
  console.log("PASS inhibitor ecology");
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
