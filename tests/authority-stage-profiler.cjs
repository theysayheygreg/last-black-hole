#!/usr/bin/env node
"use strict";

const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");
const { TestRunner, assert, startSimServer, stopSimServer } = require("./helpers.cjs");
const { createAuthorityStageProfiler, STAGES } = require("../scripts/authority-stage-profiler.cjs");
const { createAuthorityDeltaPublisher } = require("../scripts/authority-delta-publisher.cjs");

const ROOT = path.resolve(__dirname, "..");
const S4 = path.join(ROOT, "docs", "v0.4", "evidence", "state-pair-s4",
  "multiplayer-state-pair-s4-2026-07-13T074927227Z-a052787");
const startupLog = (port) => path.join(ROOT, "tmp", `sim-server-${port}.log`);

async function health(port, compact = false) {
  const response = await fetch(`http://127.0.0.1:${port}/health${compact ? "/compact" : ""}`,
    { headers: { connection: "close" } });
  return { status: response.status, body: await response.json() };
}

function identity() {
  return { matchId: "match-profile", sessionId: "session-profile", authorityIncarnation: 1,
    recipientId: "private-member-value", recipientIncarnation: 1 };
}

function view(lane) {
  return {
    schema: "lbh-canonical-projection-v1", lane, runId: "match-profile", authorityEpoch: 1,
    connectionEpoch: 1, ballparkEpoch: 1, manifestHash: `sha256:${"a".repeat(64)}`,
    statePairId: "pair-1-1", snapshotId: "snapshot-1", tick: 1, simTime: 0.1,
    eventWatermark: 0, fieldRevision: 1, overloadMode: "NORMAL", world: {},
    entities: [{ category: lane === "public" ? "player" : "owner", sourceId: "source-1",
      incarnation: 1, lifecycleRevision: 1,
      components: lane === "public"
        ? { runtimePublic: { revision: 1, value: { x: 0.5, y: 0.5 } } }
        : { ownerState: { revision: 1, value: { deltaV: 90 } } } }],
  };
}

async function run() {
  const runner = new TestRunner("AuthorityStageProfiler");
  await runner.run("bounded rings, recipient ordinals, and reset never expose identities", () => {
    const profiler = createAuthorityStageProfiler({ sampleCapacity: 3, maxRecipients: 2 });
    for (let index = 0; index < 5; index += 1) {
      profiler.observe(STAGES.PUBLIC_PROJECTION, index + 1, {
        recipientKey: index < 2 ? `secret-${index}` : "secret-overflow", inputBytes: 10, outputBytes: 5,
      });
    }
    const snapshot = profiler.snapshot();
    const encoded = JSON.stringify(snapshot);
    const row = snapshot.stages[STAGES.PUBLIC_PROJECTION];
    assert(row.aggregate.calls === 5 && row.aggregate.retainedSamples === 3,
      "Stage samples must be bounded while lifetime call totals remain exact");
    assert(snapshot.recipientSlots === 2 && snapshot.overflowRecipientObservations === 3,
      "Recipient map must cap and account for every observation beyond the identity bound");
    assert(!encoded.includes("secret-"), "Readback must never expose recipient keys");
    profiler.reset();
    const reset = profiler.snapshot();
    assert(reset.recipientSlots === 0 && Object.keys(reset.stages).length === 0,
      "Reset must clear stage and recipient state exactly");
    profiler.stop();
  });

  await runner.run("instrumentation preserves state-pair hashes and wire bytes", () => {
    const profiler = createAuthorityStageProfiler({ sampleCapacity: 8, maxRecipients: 2 });
    const plain = createAuthorityDeltaPublisher({ maxRecipients: 2 });
    const observed = createAuthorityDeltaPublisher({ maxRecipients: 2, stageProfiler: profiler });
    const input = { identity: identity(), publicView: view("public"), ownerView: view("owner"), allowMixed: true };
    const plainPair = plain.publish(input);
    const observedPair = observed.publish(input);
    assert(JSON.stringify(plainPair.frame) === JSON.stringify(observedPair.frame),
      "Profiling must not alter canonical frame bytes");
    assert(plainPair.bytes === observedPair.bytes
      && plainPair.frame.public.resultHash === observedPair.frame.public.resultHash
      && plainPair.frame.owner.resultHash === observedPair.frame.owner.resultHash,
    "Profiling must preserve byte accounting and projection hashes");
    assert(profiler.snapshot().stages[STAGES.JSON_SERIALIZATION].aggregate.calls > 0,
      "Enabled publisher must emit bounded serialization observations");
    profiler.stop();
  });

  await runner.run("runtime profile is default-off and requires exact test evidence guards", async () => {
    const defaultPort = 8961;
    const malformedPort = 8962;
    const unguardedPort = 8963;
    try {
      await startSimServer(defaultPort, { keepAlive: true, env: { LBH_SIM_WS_ENABLED: "true" } });
      const defaultHealth = await health(defaultPort);
      assert(!Object.hasOwn(defaultHealth.body.multiplayer.adapter, "authorityStageProfile"),
        "Production-default health must omit stage instrumentation entirely");
      let malformedRejected = false;
      try {
        await startSimServer(malformedPort, { keepAlive: true,
          env: { LBH_SIM_WS_ENABLED: "true", LBH_SIM_WS_STAGE_PROFILE: "true" } });
      } catch (error) {
        const log = fs.existsSync(startupLog(malformedPort)) ? fs.readFileSync(startupLog(malformedPort), "utf8") : "";
        malformedRejected = /did not start cleanly/.test(error.message) && /must be exactly 0 or 1/.test(log);
      }
      assert(malformedRejected, "Malformed profile flag must fail startup");
      let unguardedRejected = false;
      try {
        await startSimServer(unguardedPort, { keepAlive: true,
          env: { LBH_SIM_WS_ENABLED: "true", LBH_SIM_WS_STAGE_PROFILE: "1", NODE_ENV: "test" } });
      } catch (error) {
        const log = fs.existsSync(startupLog(unguardedPort)) ? fs.readFileSync(startupLog(unguardedPort), "utf8") : "";
        unguardedRejected = /did not start cleanly/.test(error.message)
          && /requires NODE_ENV=test and LBH_REPLICATION_BASELINE_CAPTURE=1/.test(log);
      }
      assert(unguardedRejected, "Stage profile must require the explicit test evidence guard");
    } finally {
      await stopSimServer(defaultPort).catch(() => {});
      await stopSimServer(malformedPort).catch(() => {});
      await stopSimServer(unguardedPort).catch(() => {});
    }
  });

  await runner.run("guarded runtime readback and reset remain compact and exact", async () => {
    const port = 8964;
    try {
      await startSimServer(port, { keepAlive: true, env: {
        LBH_SIM_WS_ENABLED: "true", LBH_SIM_WS_REPLICATION_ACCOUNTING: "1",
        LBH_SIM_WS_STAGE_PROFILE: "1", LBH_REPLICATION_BASELINE_CAPTURE: "1", NODE_ENV: "test",
      } });
      const compact = await health(port, true);
      const profile = compact.body.multiplayer.adapter.authorityStageProfile;
      assert(profile?.enabled === true && profile.bounds.sampleCapacityPerStage === 512
        && profile.bounds.maxRecipients === 16 && Object.keys(profile.stages).length === 0,
      "Guarded compact health must expose only bounded empty profile aggregates");
      const reset = await fetch(`http://127.0.0.1:${port}/debug/multiplayer/evidence-reset`, {
        method: "POST", headers: { "content-type": "application/json", connection: "close" }, body: "{}",
      });
      assert(reset.status === 200, "Guarded evidence reset must remain independently callable");
      const after = (await health(port, true)).body.multiplayer.adapter.authorityStageProfile;
      assert(after.recipientSlots === 0 && after.overflowRecipientObservations === 0
        && Object.keys(after.stages).length === 0,
      "Evidence reset must clear every bounded profile aggregate exactly");
    } finally {
      await stopSimServer(port).catch(() => {});
    }
  });

  await runner.run("artifact validation and product admission are independent commands", () => {
    const script = path.join(__dirname, "multiplayer-state-pair-product-gate.cjs");
    const validation = spawnSync(process.execPath, [script, "--validate-artifact", S4], {
      cwd: ROOT, encoding: "utf8", timeout: 20_000,
    });
    const admission = spawnSync(process.execPath, [script, "--admission-artifact", S4], {
      cwd: ROOT, encoding: "utf8", timeout: 20_000,
    });
    assert(validation.status === 0, `Immutable S4 artifact should remain structurally valid: ${validation.stderr}`);
    assert(admission.status === 2, "A valid artifact with product FAIL must return the explicit nonzero admission status");
    assert(JSON.parse(admission.stdout).admitted === false, "Admission readback must state the product rejection explicitly");
  });

  process.exit(runner.summary() ? 0 : 1);
}

run().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
