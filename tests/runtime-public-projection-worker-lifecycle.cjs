#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { TestRunner } = require("./helpers.cjs");
const { CAPABILITY, MIXED_CAPABILITY, createRuntimeStatePairAuthority } =
  require("../scripts/runtime-state-pair-integration.cjs");

const MANIFEST_SCHEMA = "lbh-session-replication-manifest-v1";
const MANIFEST_HASH = `sha256:${"e".repeat(64)}`;

function binding(seat = 0) {
  return { runId: "match-s22-life", connectionId: `session-${seat}`, membershipId: `member-${seat}`,
    playerId: `player-${seat}`, connectionEpoch: 1, authorityIncarnation: 5,
    wireVersion: "lbh-multiplayer-json-v2",
    capabilities: [CAPABILITY, MIXED_CAPABILITY, "static-manifest-v1"].sort(),
    manifestSchema: MANIFEST_SCHEMA, manifestHash: MANIFEST_HASH };
}
function claims(id) { return { wireVersion: id.wireVersion, capabilities: id.capabilities,
  manifestSchema: id.manifestSchema, manifestHash: id.manifestHash,
  authorityIncarnation: id.authorityIncarnation }; }
function frames(id, beat = 1) {
  return { publicFrame: { type: "publicState", full: true, lastInputSeq: 0, lastActionSeq: 0,
    runId: id.runId, snapshotId: beat, tick: beat * 6, simTime: beat / 10, lastEventSeq: beat,
    fieldRevision: beat, overloadMode: "NORMAL", manifestHash: MANIFEST_HASH,
    state: { session: { status: "running" }, players: [{ id: "public-ship", wx: beat / 10, wy: 0.2,
      vx: 0.1, vy: 0.2, hullType: "drifter", status: "alive" }],
      world: { wells: [], stars: [], wrecks: [], planetoids: [], portals: [], scavengers: [], fauna: [], sentries: [] },
      inhibitor: null } }, ownerFrame: { type: "ownerState", runId: id.runId,
    membershipId: id.membershipId, playerId: id.playerId, snapshotId: beat, tick: beat * 6,
    simTime: beat / 10, lastEventSeq: beat, fieldRevision: beat, overloadMode: "NORMAL",
    lastInputSeq: beat, lastActionSeq: beat, state: { profileId: `private-${seatFrom(id)}`, cargo: ["secret"] } } };
}
function seatFrom(id) { return id.membershipId.split("-").at(-1); }
function server(options = {}) { return createRuntimeStatePairAuthority({ matchId: "match-s22-life",
  authorityIncarnation: 5, ballparkEpoch: 7, manifestSchema: MANIFEST_SCHEMA,
  manifestHash: MANIFEST_HASH, publicProjectionWorkers: 2,
  publicProjectionWorkerOptions: options }); }

async function run() {
  const runner = new TestRunner("RuntimePublicProjectionWorkerLifecycle");
  await runner.run("timeout falls back once and late result cannot republish", async () => {
    const id = binding();
    const authority = server({ timeoutMs: 5, testRunOptions: { delayMs: 30 } });
    authority.admit(id, claims(id));
    const publication = await authority.publish(id, ...Object.values(frames(id)));
    assert.strictEqual(publication.frame.frameId, 1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const diagnostics = authority.diagnostics().publicProjectionWorkers;
    assert.strictEqual(diagnostics.fallback, 1);
    assert.strictEqual(diagnostics.timedOut, 1);
    assert.strictEqual(diagnostics.committed, 0);
    assert.strictEqual(authority.diagnostics().publisher.pendingPairs, 1,
      "late worker result must not create a second retained publication");
    authority.disconnect(id);
    await authority.close();
  });

  await runner.run("bounded pending pressure degrades to exact inline without owner crossing", async () => {
    const observed = [];
    const authority = server({ timeoutMs: 100, maxPending: 1,
      testRunOptions: { delayMs: 20 }, observeJob: (job) => observed.push(job) });
    const ids = [binding(0), binding(1)];
    ids.forEach((id) => authority.admit(id, claims(id)));
    const results = await Promise.all(ids.map((id) => authority.publish(id, ...Object.values(frames(id)))));
    assert(results.every((row) => row.frame.frameId === 1));
    const diagnostics = authority.diagnostics().publicProjectionWorkers;
    assert.strictEqual(diagnostics.backpressure, 1);
    assert.strictEqual(diagnostics.fallback, 1);
    assert.strictEqual(diagnostics.committed, 1);
    assert.strictEqual(observed.length, 2);
    for (const input of observed) {
      const text = JSON.stringify(input);
      for (const secret of ["member-", "session-", "player-", "private-", "cargo", "profileId"]) {
        assert(!text.includes(secret), `${secret} crossed the public worker boundary`);
      }
      assert.deepStrictEqual(Object.keys(input).sort(), ["fence", "job"]);
      assert.deepStrictEqual(Object.keys(input.job).sort(), ["basePublicView", "currentPublicView"]);
    }
    ids.forEach((id) => authority.disconnect(id));
    await authority.close();
  });

  await runner.run("disconnect fences an issued generation before any commit", async () => {
    const id = binding();
    const authority = server({ timeoutMs: 100, testRunOptions: { delayMs: 20 } });
    authority.admit(id, claims(id));
    const pending = authority.publish(id, ...Object.values(frames(id)));
    authority.disconnect(id);
    await assert.rejects(pending, (error) => error?.code === "stale-public-worker-result");
    const diagnostics = authority.diagnostics();
    assert.strictEqual(diagnostics.publisher.pendingPairs, 0);
    assert.strictEqual(diagnostics.publicProjectionWorkers.fenceRejected, 1);
    await authority.close();
  });

  await runner.run("worker crash degrades to inline and pool shutdown is bounded", async () => {
    const id = binding();
    const authority = server({ timeoutMs: 100, testRunOptions: { crash: true } });
    authority.admit(id, claims(id));
    const publication = await authority.publish(id, ...Object.values(frames(id)));
    assert.strictEqual(publication.frame.frameId, 1);
    const before = authority.diagnostics().publicProjectionWorkers;
    assert.strictEqual(before.fallback, 1);
    assert(before.crashes >= 1 || before.rejected >= 1);
    authority.disconnect(id);
    await authority.close();
    const after = authority.diagnostics().publicProjectionWorkers;
    assert.strictEqual(after.pending, 0);
    assert.strictEqual(after.readyWorkers, 0);
  });

  process.exit(runner.summary() ? 0 : 1);
}

run().catch((error) => { console.error(error.stack || error); process.exit(1); });
