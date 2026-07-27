"use strict";

const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");
const { createConductor } = require("../scripts/sim/conductor.cjs");
const {
  INHIBITOR_ECOLOGY_CONFIG,
  createGlitchEntity,
  advanceGlitchEntity,
  applyGlitchForcesAndContacts,
  projectGlitchEntity,
  countLiveGlitches,
  shouldSpawnGlitch,
} = require("../scripts/sim/inhibitor-ecology.cjs");
const { startSimServer, stopSimServer } = require("./helpers.cjs");

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
    assert.strictEqual(phaseOneSnapshot.inhibitor.compatibility.label, "legacy-scalar-projection",
      "Legacy scalar state must be explicitly labeled as compatibility");

    const accumulated = await waitFor((body) => body.inhibitor.entities?.length >= 2);
    const ids = accumulated.inhibitor.entities.map((entity) => entity.id);
    assert.strictEqual(new Set(ids).size, ids.length, "Accumulated Glitches must retain stable unique ids");
    assert(ids.every((id) => id.startsWith("inhibitor-glitch-")), "Glitch ids must use the stable ecology namespace");
    assert(ids.length <= INHIBITOR_ECOLOGY_CONFIG.glitch.populationCap, "Runtime collection must respect the cap");
    assert(accumulated.inhibitor.entities.every((entity) => entity.listensToNoise === false && entity.noiseListenerState === "NONE"),
      "Runtime Glitches must remain listener-free");
    assert(accumulated.recentEvents.some((event) => event.type === "inhibitor.glitchSpawned"),
      "Conductor spawning must publish a focused arrival event");

    const sceneSource = await import(pathToFileURL(path.join(__dirname, "..", "src/presentation/scene-source.js")).href);
    const presentationFrame = await import(pathToFileURL(path.join(__dirname, "..", "src/presentation/presentation-frame.js")).href);
    const scene = sceneSource.createPresentationSceneSource({
      phase: "playing",
      localPlayer: { ship: { wx: 0, wy: 0, vx: 0, vy: 0, slingshotEngaged: false } },
      world: { inhibitors: accumulated.inhibitor.entities },
    });
    const frame = presentationFrame.createPresentationFrame({ phase: "playing", scene });
    assert.strictEqual(frame.world.inhibitors.length, accumulated.inhibitor.entities.length,
      "Collection-owned Glitches must cross the renderer-neutral presentation seam");
    assert.strictEqual(frame.world.inhibitors[0].hint.roleColor, "anomalyMagenta",
      "Glitch presentation must retain the procedural magenta role");
  } finally {
    await stopSimServer(PORT);
  }
  console.log("PASS inhibitor ecology");
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
