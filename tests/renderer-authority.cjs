const fs = require("fs");
const { TestRunner, assert } = require("./helpers.cjs");
const { createRNGStreams } = require("../scripts/rng-stream.cjs");
const {
  buildCoarseFlowField,
  serializeCoarseFlowField,
} = require("../scripts/coarse-flow-field.cjs");
const { createSeededSea } = require("../scripts/sim/seeded-sea.cjs");
const { getSessionProfile } = require("../scripts/content/session-profiles.cjs");

async function run() {
  const runner = new TestRunner("RendererAuthority");
  const {
    composeBoundedVelocity,
    directionAgrees,
    resampleAuthoritativeField,
    sampleAuthoritativeCurrent,
  } = await import("../src/authoritative-field.mjs");
  const { normalizeStarPresentation } = await import("../src/stars.js");
  const { ScavengerSystem, normalizeScavengerPresentation } = await import("../src/scavengers.js");
  const {
    acceptedRemoteEvents,
    classifyRemoteSnapshot,
    projectRemoteSnapshot,
    projectRemoteWorldPatch,
    snapshotRunId,
  } = await import("../src/sim/remote-snapshot-presentation.js");
  const { syncRemoteWellPresentation } = await import("../src/presentation/well-wave-presentation.js");

  await runner.run("remote star rows retain a valid presentation contract", async () => {
    const first = normalizeStarPresentation({
      id: "star-1",
      type: "redGiant",
      mass: 1.4,
      alive: true,
    });
    const repeated = normalizeStarPresentation({
      id: "star-1",
      type: "redGiant",
      mass: 1.4,
      alive: true,
    }, first);
    const optionalDataAbsent = normalizeStarPresentation({
      id: "star-2",
      mass: 0.8,
    });
    assert(first.typeDef?.sizeMult === 1.8, "Known star types must restore sizeMult");
    assert(repeated.typeDef?.sizeMult === 1.8, "Repeated compact rows must remain render-compatible");
    assert(optionalDataAbsent.typeDef?.sizeMult === 1, "Missing type data must use a valid default type");
    assert(Array.isArray(optionalDataAbsent.asteroids), "Missing optional asteroid data must stay safe to render");
    const projected = projectRemoteWorldPatch({
      stars: [{ id: "star-1", type: "redGiant", mass: 1.4, alive: true }],
    }, { stars: [first] });
    assert(projected.stars[0].typeDef?.sizeMult === 1.8,
      "Remote world projection must normalize compact star rows before presentation");
  });

  await runner.run("remote scavenger rows retain a safe death presentation contract", async () => {
    const valid = normalizeScavengerPresentation({
      id: "scavenger-1",
      wx: 1.2,
      wy: 0.8,
      vx: 0.03,
      vy: -0.02,
      facing: 0.4,
      thrustIntensity: 0.15,
      archetype: "vulture",
      state: "dying",
      deathTimer: 0.4,
      deathWellId: "well-1",
      deathWellWX: 1,
      deathWellWY: 1,
      deathStartWX: 1.2,
      deathStartWY: 0.8,
      deathAngle: -0.7,
      alive: true,
    });
    const repeated = normalizeScavengerPresentation({
      id: "scavenger-1",
      wx: 1.2,
      wy: 0.8,
      archetype: "vulture",
      state: "dying",
      alive: true,
    }, valid);
    assert(valid.archetype === "vulture" && valid.state === "dying",
      "Valid scavenger identity and lifecycle state must remain unchanged");
    assert(valid.deathWell?.id === "well-1" && valid.deathWell.wx === 1 && valid.deathWell.wy === 1,
      "Compact death-well coordinates must restore the local presentation anchor");
    assert(repeated.deathWell?.wx === 1 && repeated.deathWell?.wy === 1,
      "Repeated compact rows must retain a valid death presentation anchor");

    const partial = normalizeScavengerPresentation({
      id: "scavenger-2",
      wx: 0.4,
      wy: 0.6,
      state: "dying",
      alive: true,
    });
    const system = new ScavengerSystem();
    let error = null;
    try {
      system._updateDeathSpiral(partial, 1 / 60);
    } catch (caught) {
      error = caught;
    }
    assert(!error, `Partial accepted scavenger row must not fatal: ${error?.message || "unknown error"}`);
    assert(partial.alive && partial.state === "dying",
      "Partial row must retain authoritative lifecycle state while optional presentation data is absent");
  });

  await runner.run("remote snapshots project protocol rows without presentation side effects", async () => {
    const incoming = {
      session: { runId: "run-b", mapId: "deep-field", worldScale: 3, cosmicSignature: { id: "sig-1" } },
      tick: 4,
      simTime: 2,
      players: [
        { clientId: "local", isAI: false },
        { clientId: "remote", isAI: false },
      ],
      inhibitor: {
        phase: 2,
        entities: [{ id: "inhibitor-swarm-fixture", kind: "swarm", lifecycle: "alive" }],
      },
      world: { authoritativeField: { columns: 2 } },
    };
    const classification = classifyRemoteSnapshot({ runId: "run-a", tick: 4, simTime: 2 }, incoming);
    assert(snapshotRunId(incoming) === "run-b", "Nested session run ID must remain supported");
    assert(classification.runChanged && classification.duplicate,
      "Run changes and duplicate presentation timestamps must remain independent");
    const projected = projectRemoteSnapshot(incoming, {
      clientId: "local",
      previousHealth: { idleState: { state: "active" } },
      elapsedTime: 1,
    });
    assert(projected.localPlayer === incoming.players[0], "The local authority row must retain its identity");
    assert(projected.remotePlayers.length === 1 && projected.remotePlayers[0] !== incoming.players[1],
      "Remote presentation rows must be shallow copies");
    assert(projected.health.idleState.state === "active"
      && projected.health.idleState.humanPlayerCount === 2,
    "Health projection must preserve connection state and count human pilots");
    assert(projected.cosmicSignature !== incoming.session.cosmicSignature
      && projected.inhibitor !== incoming.inhibitor,
    "Mutable signature and inhibitor rows must be copied");
  });

  await runner.run("remote event acceptance preserves authority order and cursor semantics", async () => {
    const accepted = acceptedRemoteEvents([
      null,
      { seq: 4, type: "player.pulse" },
      { seq: 3, type: "run.result" },
      { seq: 5, type: "inhibitor.wake" },
    ], 3);
    assert(accepted.length === 2 && accepted[0].seq === 4 && accepted[1].seq === 5,
      "Only forward events in authority order may reach presentation");
    assert(acceptedRemoteEvents([{ seq: 5 }, { seq: 6 }], 6).length === 0,
      "Recovered event windows must not replay the accepted cursor");
  });

  await runner.run("remote world projection retains renderer-safe entity contracts", async () => {
    const well = { id: "well-1", wx: 0.1, wy: 0.1 };
    const lootItem = { id: "scrap" };
    const patch = projectRemoteWorldPatch({
      waveRings: [{ id: "growth-1", sourceWellId: "well-1", sourceWX: 1, sourceWY: 2, amplitude: 0.4 }],
      wells: [well],
      wrecks: [{ id: "wreck-1", loot: [lootItem] }],
      portals: [{ id: "portal-1", type: "unstable", spawnTime: 0, lifespan: 10 }],
      fauna: [{ id: "alive" }, { id: "dead", alive: false }],
      nextPortalWaveIndex: 7,
    });
    assert(patch.wells[0] === well, "Well rows must remain available for stable-object mutation");
    assert(patch.waveRings[0].initialAmplitude === 0.4,
      "Wave rows must restore renderer defaults");
    assert(patch.waveRings[0].sourceWellId === "well-1",
      "Wave rows must preserve their authoritative source well identity");
    assert(patch.wrecks[0].loot[0] !== lootItem,
      "Wreck loot projection must retain independent item rows");
    assert(patch.fauna.length === 1 && patch.portals[0].timeLeft(4) === 6,
      "Dead transient rows must be removed and portals must retain their presentation interface");
  });

  await runner.run("remote well sync retains authoritative current direction", async () => {
    const local = { orbitalDir: 1, overdriveMultiplier: 1 };
    syncRemoteWellPresentation(local, {
      wx: 1, wy: 2, mass: 1.2, orbitalDir: -1,
      overdriveTier: 2, overdriveMultiplier: 1.5,
    });
    assert(local.orbitalDir === -1 && local.overdriveMultiplier === 1.5,
      `Remote well direction and effective strength must reach presentation: ${JSON.stringify(local)}`);
  });

  await runner.run("authority texture registration keeps the shared Y contract", async () => {
    const field = {
      columns: 1,
      rows: 3,
      cells: [
        { currentX: 0.4, currentY: 0.2 },
        { currentX: 0.7, currentY: 0.8 },
        { currentX: 1.0, currentY: 0.4 },
      ],
    };
    const data = resampleAuthoritativeField(field, 3);
    assert(Math.abs(data[0] - (0.7 / 3)) < 1e-6 && Math.abs(data[1] + (0.3 / 3)) < 1e-6,
      `Expected bottom world row to register as scaled GPU Y-up, got ${data[0]}, ${data[1]}`);
    assert(Math.abs(data[24] - (0.55 / 3)) < 1e-6 && Math.abs(data[25] + (0.5 / 3)) < 1e-6,
      `Expected top world row to register as scaled GPU Y-up, got ${data[24]}, ${data[25]}`);
    const source = fs.readFileSync(require.resolve("../src/authoritative-field.mjs"), "utf8");
    assert(!source.includes("1 - (row + 0.5) / size"), "Texture row flip must stay in coords.js contract");
    assert(source.includes("worldYToFluidTextureV"), "Adapter must use shared texture-Y conversion");
    assert(source.includes("worldVelToFluid"), "Adapter must use shared velocity conversion");
  });

  await runner.run("detail stays below the authority floor and cannot reverse direction", async () => {
    const rendered = composeBoundedVelocity([2, 0], [-99, 0], 0.75);
    assert(Math.abs(rendered[0] - 1.25) < 1e-12, `Expected bounded detail, got ${rendered[0]}`);
    assert(directionAgrees([2, 0], rendered, 0.75), "Rendered flow must agree above the floor");
    assert(!directionAgrees([2, 0], [-1, 0], 0.75), "Opposite flow must fail above the floor");
    assert(directionAgrees([0.5, 0], [-1, 0], 0.75), "Below-floor flow is not constrained");
  });

  await runner.run("packed authority delivery is bounded and row-major", async () => {
    const profile = getSessionProfile("deep-field", 25);
    const wells = Array.from({ length: 8 }, (_, index) => ({
      id: `well-${index + 1}`,
      wx: (index % 4) + 0.5,
      wy: Math.floor(index / 4) + 0.5,
      mass: 1,
      orbitalDir: index % 2 ? -1 : 1,
    }));
    const sea = createSeededSea({
      seed: 424242,
      mapId: "deep-field",
      worldScale: 25,
      wells,
      rngStreams: createRNGStreams(424242),
    });
    const field = buildCoarseFlowField({
      worldScale: 25,
      cellSize: profile.flowFieldCellSize,
      wells,
      waveRings: [],
      seededSea: sea,
      maxCells: profile.maxCoarseFieldCells,
    });
    const packet = serializeCoarseFlowField(field, 12, {
      maxCells: profile.maxCoarseFieldCells,
      maxBytes: profile.snapshotBudgetBytes,
    });
    const bytes = Buffer.byteLength(JSON.stringify(packet));
    assert(packet.encoding === "float32le-current-y-down-row-major-v1", "Expected packed field encoding");
    assert(packet.cellCount === 3136, `Expected 3136 cells, got ${packet.cellCount}`);
    assert(bytes <= profile.snapshotBudgetBytes,
      `Expected bounded 25x25 packet <= ${profile.snapshotBudgetBytes} bytes, got ${bytes}`);
    assert(Buffer.from(packet.data, "base64").byteLength === packet.cellCount * 8,
      "Packed current must use exactly two float32 values per cell");
    assert(sampleAuthoritativeCurrent(packet, 0.2, 0.3).every(Number.isFinite),
      "Client adapter must decode packed authority data");
    const runtime = fs.readFileSync(require.resolve("../scripts/sim-runtime.cjs"), "utf8");
    assert(runtime.includes("authorityFieldPacket?.field === runtime.coarseField")
      && runtime.includes("authorityFieldPacket.tick === runtime.tick"),
    "Repeated snapshots in one authority tick must reuse the packed packet");
  });

  await runner.run("local fallback keeps existing current and defers seeded GPU authority", async () => {
    const main = fs.readFileSync(require.resolve("../src/main.js"), "utf8");
    const simCore = fs.readFileSync(require.resolve("../src/sim/sim-core.js"), "utf8");
    const wells = fs.readFileSync(require.resolve("../src/wells.js"), "utf8");
    const stars = fs.readFileSync(require.resolve("../src/stars.js"), "utf8");
    assert(!main.includes("createEmbeddedSeededSea") && !main.includes("localAuthoritativeField"),
      "Offline main must not author a second seeded sea");
    assert(!main.includes("buildEmbeddedAuthorityField") && !main.includes("advanceEmbeddedSeededSea"),
      "Offline main must not rebuild authority formulas or RNG streams");
    assert(main.includes("fluid.clearAuthoritativeCoarseField()"),
      "Offline path must explicitly leave the remote authority texture empty");
    assert(main.includes("remoteSession.active && remoteSession.authoritativeField")
      && main.includes("fluid.setAuthoritativeCoarseField(remoteSession.authoritativeField)"),
    "Only the remote packed snapshot may register the authority texture");
    assert(main.includes("ship.update(dt, flowField, wellSystem, fluid)"),
      "Offline movement must retain its existing FlowField path while seeded migration is deferred");
    assert(simCore.includes("authorityDriven: visualOnly"),
      "Local well/star presentation must be retained while remote force injection is disabled");
    assert(wells.includes("if (authorityDriven) {") && wells.includes("fluid.visualSplat"),
      "Remote well authority must keep a presentation anchor without authoring local force");
    assert(stars.includes("if (!authorityDriven)") && stars.includes("fluid.applyWellForce"),
      "Remote star authority must suppress local force while retaining normal local fallback");
  });

  await runner.run("client no longer owns the coarse-current formula", async () => {
    const fluid = fs.readFileSync(require.resolve("../src/fluid.js"), "utf8");
    const shaders = fs.readFileSync(require.resolve("../src/render/shaders/fluid.glsl.js"), "utf8");
    assert(!`${fluid}\n${shaders}`.includes("FRAG_COARSE_UPDATE")
      && !`${fluid}\n${shaders}`.includes("updateCoarseField("),
      "Legacy client coarse-current formula must stay disabled");
    assert(fluid.includes("forceFromAuthoritativeField()"), "Fluid must force from authority after each step");
    assert(fluid.includes("authorityFloor(field) / FLUID_REF_SCALE"),
      "GPU detail floor must use the same world-to-fluid scale as authority samples");
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("RendererAuthority test fatal error:", err.message);
  process.exit(1);
});
