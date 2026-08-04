"use strict";

const assert = require("assert");
const fs = require("fs");
const { performance } = require("perf_hooks");
const {
  INHIBITOR_ECOLOGY_CONFIG,
  countLiveInhibitors,
  totalCapBlocksSpawn,
  createGlitchEntity,
  advanceGlitchEntity,
  shouldSpawnGlitch,
  createSwarmEntity,
  advanceSwarmEntity,
  shouldSpawnSwarm,
  createVesselEntity,
  advanceVesselEntity,
  shouldSpawnVessel,
} = require("../scripts/sim/inhibitor-ecology.cjs");
const { startSimServer, stopSimServer } = require("./helpers.cjs");

const PORT = Number(process.env.LBH_INHIBITOR_CAP_SIM_PORT || 8822);
const URL = `http://127.0.0.1:${PORT}`;
const CAP = INHIBITOR_ECOLOGY_CONFIG.totalActiveCap;
const DT = 1 / 15;

function p95(samples) {
  if (!samples.length) return 0;
  const ordered = samples.slice().sort((a, b) => a - b);
  return Number(ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * 0.95) - 1)].toFixed(4));
}

function countByKind(entities) {
  return Object.fromEntries(["glitch", "swarm", "vessel"].map((kind) => [
    kind,
    entities.filter((entity) => entity.kind === kind && entity.lifecycle !== "expired").length,
  ]));
}

function simulateEcology(totalActiveCap, durationSeconds) {
  const entities = [];
  const next = { glitch: null, swarm: null, vessel: null };
  const sequence = { glitch: 0, swarm: 0, vessel: 0 };
  const suppressedByTotalCap = { glitch: 0, swarm: 0, vessel: 0 };
  const timings = { before: [], atCap: [], after: [] };
  let maxActiveCount = 0;
  let maxCounts = null;
  let reachedCap = false;

  for (let tick = 0; tick <= Math.ceil(durationSeconds / DT); tick += 1) {
    const started = performance.now();
    const simTime = Number((tick * DT).toFixed(9));
    const phase = simTime >= durationSeconds * 0.45
      ? 3
      : simTime >= durationSeconds * 0.30
        ? 2
        : simTime >= durationSeconds * 0.15 ? 1 : 0;
    for (let index = entities.length - 1; index >= 0; index -= 1) {
      if (entities[index].lifecycle === "expired") entities.splice(index, 1);
    }

    const spawn = (kind, create, config) => {
      sequence[kind] += 1;
      const entity = create({
        id: `probe-${kind}-${sequence[kind]}`,
        wx: 0,
        wy: 0,
        createdAt: simTime,
        createdTick: tick,
        config,
      });
      entities.push(entity);
      next[kind] = simTime + config.spawnCadenceSeconds;
    };
    const admit = (kind, requiredPhase, config, should, create) => {
      if (should({
        phase,
        simTime,
        nextSpawnAt: next[kind],
        entities,
        config,
        totalActiveCap,
      })) {
        spawn(kind, create, config);
        return;
      }
      if (phase >= requiredPhase && simTime >= Number(next[kind])
          && totalCapBlocksSpawn(entities, config, totalActiveCap)) {
        suppressedByTotalCap[kind] += 1;
        next[kind] = simTime + config.spawnCadenceSeconds;
      }
    };

    if (phase >= 1 && next.glitch == null) next.glitch = simTime;
    if (phase >= 2 && next.swarm == null) next.swarm = simTime;
    if (phase >= 3 && next.vessel == null) next.vessel = simTime;
    admit("glitch", 1, INHIBITOR_ECOLOGY_CONFIG.glitch, shouldSpawnGlitch, createGlitchEntity);
    admit("swarm", 2, INHIBITOR_ECOLOGY_CONFIG.swarm, shouldSpawnSwarm, createSwarmEntity);
    admit("vessel", 3, INHIBITOR_ECOLOGY_CONFIG.vessel, shouldSpawnVessel, createVesselEntity);

    for (const entity of entities) {
      if (entity.kind === "glitch") advanceGlitchEntity(entity, { dt: DT, worldScale: 5, tick, simTime });
      if (entity.kind === "swarm") advanceSwarmEntity(entity, { dt: DT, worldScale: 5, tick, simTime, noiseSources: [] });
      if (entity.kind === "vessel") advanceVesselEntity(entity, { dt: DT, worldScale: 5, tick, simTime, players: [] });
    }
    const counts = countByKind(entities);
    const activeCount = countLiveInhibitors(entities);
    maxActiveCount = Math.max(maxActiveCount, activeCount);
    if (activeCount === maxActiveCount) maxCounts = counts;
    const elapsed = performance.now() - started;
    if (activeCount < totalActiveCap && !reachedCap) timings.before.push(elapsed);
    else if (activeCount === totalActiveCap && !reachedCap) {
      timings.atCap.push(elapsed);
      // Keep a short deterministic window at the exact cap, then classify the
      // remaining ticks as after-cap steady-state work.
      if (timings.atCap.length >= 15) reachedCap = true;
    } else if (reachedCap) timings.after.push(elapsed);
  }
  return {
    durationSeconds,
    totalActiveCap,
    maxActiveCount,
    maxCounts,
    finalCounts: countByKind(entities),
    suppressedByTotalCap,
    tickP95Ms: Object.fromEntries(Object.entries(timings).map(([key, samples]) => [key, p95(samples)])),
  };
}

async function request(route, body = null, authority = null) {
  const headers = body ? { "content-type": "application/json" } : {};
  const payload = body ? { ...body } : undefined;
  if (authority) {
    headers["x-lbh-command-credential"] = authority.commandCredential;
    headers["x-lbh-player-id"] = authority.playerId;
    headers["x-lbh-run-id"] = authority.runId;
    payload.runId = authority.runId;
    payload.playerId = authority.playerId;
    payload.commandCredential = authority.commandCredential;
    payload.commandSeq = (authority.lastCommandSeq || 0) + 1;
    authority.lastCommandSeq = payload.commandSeq;
  }
  const response = await fetch(`${URL}${route}`, body == null ? undefined : {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const json = await response.json();
  if (!response.ok || json.ok === false) {
    throw new Error(`${route} failed: ${response.status} ${json.error || JSON.stringify(json)}`);
  }
  return json;
}

let inputSequence = 0;

async function get(route) {
  const response = await fetch(`${URL}${route}`);
  const json = await response.json();
  if (!response.ok) throw new Error(`${route} failed: ${response.status}`);
  return json;
}

async function waitFor(predicate, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await get("/snapshot");
    if (predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Timed out waiting for snapshot; last tick=${last?.tick}`);
}

async function run() {
  const baseline = simulateEcology(Infinity, 720);
  const capped = simulateEcology(CAP, 720);
  assert.strictEqual(baseline.maxActiveCount, 12, "Measured uncapped late ecology must reach 12 live entities");
  assert.deepStrictEqual(baseline.maxCounts, { glitch: 5, swarm: 4, vessel: 3 }, "Baseline density must preserve the observed kind mix");
  assert.strictEqual(capped.maxActiveCount, CAP, `Capped ecology must reach exact total cap ${CAP}`);
  assert.deepStrictEqual(capped.maxCounts, { glitch: 5, swarm: 4, vessel: 2 }, "Cap must retain all kinds and late crowding");
  assert(capped.suppressedByTotalCap.vessel > 0, "Capped ecology must report suppressed Vessel arrivals honestly");
  assert(capped.finalCounts.vessel === 2 && Object.values(capped.finalCounts).reduce((sum, count) => sum + count, 0) === CAP,
    "Capped ecology must hold its mixed population after suppression");

  const rendererSource = fs.readFileSync(require.resolve("../src/render-three/world-scene-presentation.js"), "utf8");
  assert(rendererSource.includes("this.vfxManager.reset()"), "Run reset must clear the VFX manager");
  assert(rendererSource.includes("this.vfxManager.dispose()"), "Renderer disposal must close the VFX manager lifecycle");
  const { VisualFamilyLifecycle } = await import("../src/render-three/entities/visual-family.js");
  const { VfxManager } = await import("../src/render-three/vfx/vfx-manager.js");
  const { WorldScenePresentation } = await import("../src/render-three/world-scene-presentation.js");
  const { createPresentationSceneSource } = await import("../src/presentation/scene-source.js");
  const { createPresentationFrame } = await import("../src/presentation/presentation-frame.js");
  const THREE = await import("../node_modules/three/build/three.module.js");
  const family = new VisualFamilyLifecycle("reset-probe").create();
  family.reset();
  family.dispose();
  assert.strictEqual(family.getStats().resetCount, 2, "Entity family must count run reset and dispose reset");
  const vfx = new VfxManager({ screenGroup: new THREE.Group(), immediateGroup: new THREE.Group() });
  vfx.reset();
  vfx.dispose();
  assert.strictEqual(vfx.getStats().resetCount, 2, "VFX manager must count run reset and dispose reset");
  assert.strictEqual(vfx.getStats().disposeCount, 1, "VFX manager must count disposal once");

  const renderer = new WorldScenePresentation({ renderQuality: "minimal" });
  // The renderer contract below is about scene ownership/count/reset, not
  // browser image decoding. Give its pooled sprite cards one headless Three
  // material so this authority fixture does not require `document`.
  const headlessSpriteMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 1 });
  renderer.entityAssets.getMaterial = () => headlessSpriteMaterial;
  const renderEntityCount = (counts, runId, totalTime) => {
    const inhibitors = [];
    for (const [kind, count] of Object.entries(counts)) {
      for (let index = 0; index < count; index += 1) {
        inhibitors.push({
          id: `renderer-${runId}-${kind}-${index}`,
          kind,
          wx: 0.1 + index * 0.01,
          wy: 0.2 + index * 0.01,
          radius: 0.1,
          coreRadius: 0.045,
          lifecycle: "alive",
        });
      }
    }
    const scene = createPresentationSceneSource({
      phase: "playing",
      // Player family update is disabled below: this fixture measures only
      // Inhibitor ownership while retaining the normal scene-source shape.
      localPlayer: { ship: { wx: 0, wy: 0, vx: 0, vy: 0 } },
      world: { inhibitors },
    });
    const frame = createPresentationFrame({
      phase: "playing",
      runId,
      frameId: Math.round(totalTime * 15),
      scene,
      timing: { dt: DT, totalTime },
    });
    renderer.update(frame);
    return renderer.getStats().entityCount;
  };
  // The focused probe is headless; no player sprite is needed for the
  // Inhibitor entity count, and avoiding its texture loader keeps this fixture
  // independent of browser globals.
  renderer.visualFamilies.player.update = () => {};
  const rendererEntityCounts = {
    before: renderEntityCount(baseline.maxCounts, "uncapped", 12),
    atCap: renderEntityCount(capped.maxCounts, "capped", 24),
  };
  renderer.reset({ phase: "playing", runId: "new-run" });
  rendererEntityCounts.after = renderEntityCount({}, "new-run", 0);
  renderer.dispose();
  headlessSpriteMaterial.dispose();

  await startSimServer(PORT, {
    keepAlive: true,
    idleShutdownMs: 5000,
  });
  try {
    const started = await request("/session/start", {
      mapId: "shallows",
      requesterId: "cap-reset-pilot",
      requesterName: "Cap Reset Probe",
      maxPlayers: 1,
      seed: 1301,
    });
    const joined = await request("/join", {
      runId: started.session.runId,
      clientId: "cap-reset-pilot",
      name: "Cap Reset Pilot",
      hullType: "drifter",
      joinTicket: started.joinTicket,
    });
    let authority = joined.authority;
    const beforeHealth = await get("/health");
    const oldRunId = authority.runId;
    const oldSessionId = beforeHealth.session.id;
    await request("/debug/inhibitor-state", { phase: 3 }, authority);
    const populated = await waitFor((snapshot) => snapshot.inhibitor.entities?.length >= 1);
    const swarm = populated.inhibitor.entities.find((entity) => entity.kind === "swarm");
    const vessel = populated.inhibitor.entities.find((entity) => entity.kind === "vessel");
    const firstWell = populated.world.wells[0];
    await request("/debug/player-state", {
      clientId: "cap-reset-pilot",
      wx: swarm?.position?.wx || 0.1,
      wy: swarm?.position?.wy || 0.1,
      noiseRadiusMeters: 0,
    }, authority);
    await request("/input", {
      seq: ++inputSequence,
      moveX: 1,
      moveY: 0,
      thrust: 1,
      brake: 0,
    }, authority);
    const noisePrimed = await waitFor((snapshot) => {
      const playerState = snapshot.players.find((entry) => entry.clientId === "cap-reset-pilot");
      return playerState?.status === "alive" && playerState.noise?.heardListenerCount > 0;
    }, 3000);
    if (vessel && firstWell) {
      await waitFor((snapshot) => snapshot.inhibitor.entities?.some((entity) => entity.id === vessel.id && entity.lifecycle === "alive"), 5000);
      await request("/debug/player-state", {
        clientId: "cap-reset-pilot",
        wx: firstWell.wx + 0.13,
        wy: firstWell.wy,
        vx: 0,
        vy: 0,
      }, authority);
      await request("/debug/inhibitor-state", {
        entity: { id: vessel.id, wx: firstWell.wx, wy: firstWell.wy },
      }, authority);
    }
    const beforeReset = await waitFor((snapshot) => {
      const overdriveReady = !vessel || snapshot.world.wells.some((well) => well.overdriveTier > 0);
      return snapshot.inhibitor.ecology.activeCount > 0 && overdriveReady;
    }, 8000);
    const oldEntityIds = new Set(beforeReset.inhibitor.entities.map((entity) => entity.id));
    const preResetHealth = await get("/health");
    assert(oldEntityIds.size > 0, "Pre-reset run must contain live Inhibitor identities");

    const reset = await request("/session/start", {
      mapId: "deep-field",
      requesterId: "cap-reset-pilot",
      requesterName: "Cap Reset Pilot",
      maxPlayers: 1,
      seed: 1302,
    }, authority);
    assert.notStrictEqual(reset.session.runId, oldRunId, "New map must receive a new authority run ID");
    const rejoined = await request("/join", {
      runId: reset.session.runId,
      clientId: "cap-reset-pilot",
      name: "Cap Reset Pilot",
      hullType: "drifter",
      joinTicket: reset.joinTicket,
    });
    authority = rejoined.authority;
    const afterReset = await waitFor((snapshot) => snapshot.session.runId === reset.session.runId);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const afterHealth = await get("/health");
    assert.strictEqual(afterReset.session.mapId, "deep-field", "Reset must install the requested new map");
    assert.strictEqual(afterReset.inhibitor.ecology.activeCount, 0, "New run must clear prior Inhibitor entities");
    assert.strictEqual(afterReset.inhibitor.entities.length, 0, "New run must start with no prior Inhibitor IDs");
    assert(afterReset.world.wells.every((well) => well.overdriveTier === 0 && well.overdriveMultiplier === 1),
      "New map must clear Vessel well overdrive contributions");
    assert.strictEqual(afterReset.world.waveRings.length, 0, "New run must clear Ballpark wave bodies");
    const player = afterReset.players.find((entry) => entry.clientId === "cap-reset-pilot");
    assert(player && player.noise.heardListenerCount === 0 && player.noise.listeners.length === 0,
      "New run must clear prior Noise contacts");
    assert([...oldEntityIds].every((id) => !afterReset.inhibitor.entities.some((entity) => entity.id === id)),
      "New run must not retain prior run entity IDs");
    assert.strictEqual(afterHealth.process.pid, beforeHealth.process.pid, "Run reset must reuse one sim PID");
    assert.strictEqual(afterHealth.simInstanceId, beforeHealth.simInstanceId, "Run reset must preserve one sim instance owner");
    assert.strictEqual(afterHealth.ballpark.worldScale, 25, "Ballpark must adopt the new map scale");
    assert(afterHealth.ballpark.identities.epoch > preResetHealth.ballpark.identities.epoch,
      "Ballpark reset must advance its identity epoch");

    console.log(JSON.stringify({
      cap: CAP,
      baseline: {
        maxActiveCount: baseline.maxActiveCount,
        maxCounts: baseline.maxCounts,
        tickP95Ms: baseline.tickP95Ms,
      },
      capped: {
        maxActiveCount: capped.maxActiveCount,
        maxCounts: capped.maxCounts,
        finalCounts: capped.finalCounts,
        suppressedByTotalCap: capped.suppressedByTotalCap,
        tickP95Ms: capped.tickP95Ms,
      },
      rendererEntityCount: rendererEntityCounts,
      noisePrimed: {
        heardListenerCount: noisePrimed.players.find((entry) => entry.clientId === "cap-reset-pilot")?.noise?.heardListenerCount,
        tick: noisePrimed.tick,
      },
      authority: {
        before: {
          pid: beforeHealth.process.pid,
          runId: oldRunId,
          sessionId: oldSessionId,
          tickTiming: preResetHealth.timing.tick,
          scheduler: preResetHealth.scheduler,
        },
        after: {
          pid: afterHealth.process.pid,
          runId: afterReset.session.runId,
          sessionId: afterHealth.session.id,
          tickTiming: afterHealth.timing.tick,
          scheduler: afterHealth.scheduler,
        },
        port: PORT,
        ballparkBefore: preResetHealth.ballpark.activeBodyCount,
        ballparkAfter: afterHealth.ballpark.activeBodyCount,
        ballparkEpochBefore: preResetHealth.ballpark.identities.epoch,
        ballparkEpochAfter: afterHealth.ballpark.identities.epoch,
      },
    }, null, 2));
  } finally {
    await stopSimServer(PORT).catch(() => null);
  }
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
