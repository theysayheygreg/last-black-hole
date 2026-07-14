#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { TestRunner } = require("./helpers.cjs");
const { canonicalJsonBytes } = require("../scripts/session-replication-manifest.cjs");
const { createClientDeltaReceiver } = require("../scripts/client-delta-receiver.cjs");
const { encodeWireFrame, SERVER_TO_CLIENT } = require("../scripts/multiplayer-wire-protocol.cjs");
const { CAPABILITY, MIXED_CAPABILITY, createRuntimeStatePairAuthority } =
  require("../scripts/runtime-state-pair-integration.cjs");

const MANIFEST_SCHEMA = "lbh-session-replication-manifest-v1";
const MANIFEST_HASH = `sha256:${"d".repeat(64)}`;

function binding(seat, incarnation = 1) {
  return { runId: "match-s22", connectionId: `session-${seat}-${incarnation}`,
    membershipId: `member-${seat}`, playerId: `player-${seat}`,
    connectionEpoch: incarnation, authorityIncarnation: 4,
    wireVersion: "lbh-multiplayer-json-v2",
    capabilities: [CAPABILITY, MIXED_CAPABILITY, "static-manifest-v1"].sort(),
    manifestSchema: MANIFEST_SCHEMA, manifestHash: MANIFEST_HASH };
}

function claims(id) {
  return { wireVersion: id.wireVersion, capabilities: id.capabilities,
    manifestSchema: id.manifestSchema, manifestHash: id.manifestHash,
    authorityIncarnation: id.authorityIncarnation };
}

function frames(id, beat) {
  const publicFrame = { type: "publicState", full: true, lastInputSeq: 0, lastActionSeq: 0,
    runId: id.runId, snapshotId: beat, tick: beat * 6, simTime: beat / 10,
    lastEventSeq: beat, fieldRevision: beat, overloadMode: "NORMAL", manifestHash: MANIFEST_HASH,
    state: { session: { status: "running" }, players: Array.from({ length: 48 }, (_, index) => ({
      clientId: `public-entity-${index}`, wx: (index + beat) / 100, wy: index / 100,
      vx: 0.01, vy: -0.02, status: "alive", hullType: "drifter" })),
      world: { wells: [], stars: [], wrecks: [], planetoids: [], portals: [], scavengers: [], fauna: [], sentries: [] },
      inhibitor: null } };
  const ownerFrame = { type: "ownerState", runId: id.runId, membershipId: id.membershipId,
    playerId: id.playerId, snapshotId: beat, tick: beat * 6, simTime: beat / 10,
    lastEventSeq: beat, fieldRevision: beat, overloadMode: "NORMAL",
    lastInputSeq: beat, lastActionSeq: beat,
    state: { profileId: `private-${id.playerId}`, cargo: [`cargo-${seatNumber(id)}`] } };
  return { publicFrame, ownerFrame };
}

function seatNumber(id) { return Number(id.membershipId.split("-").at(-1)); }

function authority(workers) {
  return createRuntimeStatePairAuthority({ matchId: "match-s22", authorityIncarnation: 4,
    ballparkEpoch: 2, manifestSchema: MANIFEST_SCHEMA, manifestHash: MANIFEST_HASH,
    publicProjectionWorkers: workers, publicProjectionWorkerOptions: { timeoutMs: 2_000 } });
}

function receiver(id) {
  return createClientDeltaReceiver({ context: { matchId: id.runId, sessionId: id.connectionId,
    authorityIncarnation: id.authorityIncarnation, recipientId: id.membershipId,
    recipientIncarnation: id.connectionEpoch, manifestSchema: id.manifestSchema,
    manifestHash: id.manifestHash }, capabilities: id.capabilities });
}

function wire(frame) { return encodeWireFrame(frame, { direction: SERVER_TO_CLIENT }); }

async function transcript(workers, population = 4) {
  const server = authority(workers);
  const seats = Array.from({ length: population }, (_, seat) => {
    const id = binding(seat);
    server.admit(id, claims(id));
    return { id, client: receiver(id), rows: [] };
  });
  try {
    for (let beat = 1; beat <= 6; beat += 1) {
      const publications = await Promise.all(seats.map(({ id }) => {
        const source = frames(id, beat);
        const hostSnapshot = canonicalJsonBytes(source);
        const pending = Promise.resolve(server.publish(id, source.publicFrame, source.ownerFrame));
        source.publicFrame.state.players[0].wx = 999;
        source.ownerFrame.state.profileId = "mutated-after-dispatch";
        return pending.then((publication) => ({ publication, hostSnapshot }));
      }));
      for (let seat = 0; seat < seats.length; seat += 1) {
        const { publication } = publications[seat];
        const accepted = seats[seat].client.receive(wire(publication.frame));
        assert(accepted.accepted);
        assert(!JSON.stringify(publication.frame.public).includes("private-player"));
        assert(JSON.stringify(publication.frame.owner).includes(`private-player-${seat}`));
        assert(server.acknowledge(seats[seat].id, accepted.ack).accepted);
        seats[seat].rows.push({ frame: publication.frame, bytes: publication.bytes,
          projectionKind: publication.projectionKind });
      }
    }
    const diagnostics = server.diagnostics();
    return { rows: seats.map((seat) => seat.rows), diagnostics };
  } finally {
    for (const seat of seats) server.disconnect(seat.id);
    await server.close();
  }
}

async function run() {
  const runner = new TestRunner("RuntimePublicProjectionWorkers");
  await runner.run("two-worker runtime is byte and semantic identical to inline across 1 4 8", async () => {
    for (const population of [1, 4, 8]) {
      const inline = await transcript(0, population);
      const workers = await transcript(2, population);
      assert.deepStrictEqual(workers.rows, inline.rows);
      assert.strictEqual(workers.diagnostics.publicProjectionWorkers.configuredWorkers, 2);
      assert.strictEqual(workers.diagnostics.publicProjectionWorkers.fallback, 0);
      assert(workers.diagnostics.publicProjectionWorkers.committed >= population * 6);
      assert.strictEqual(workers.diagnostics.publicProjectionWorkers.fenceRejected, 0);
    }
  });
  await runner.run("worker boundary reports public-only clone and transfer accounting", async () => {
    const result = await transcript(2, 4);
    const diagnostics = result.diagnostics.publicProjectionWorkers;
    assert(diagnostics.inputCloneBytes > 0 && diagnostics.outputTransferBytes > 0);
    assert(diagnostics.workerCpuMicros > 0);
    assert.strictEqual(diagnostics.privacyBoundary,
      "Only normalized public current/base views and opaque recipient work tokens cross workers.");
    assert.strictEqual(diagnostics.pending, 0);
  });
  process.exit(runner.summary() ? 0 : 1);
}

run().catch((error) => { console.error(error.stack || error); process.exit(1); });
