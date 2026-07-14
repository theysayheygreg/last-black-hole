#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const path = require("path");
const { performance } = require("perf_hooks");

const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const sharedPublicWork = process.argv[3] === "1";
const label = process.argv[4] || (sharedPublicWork ? "shared" : "baseline");
const { createRuntimeStatePairAuthority } = require(path.join(root, "scripts/runtime-state-pair-integration.cjs"));
const { createClientDeltaReceiver } = require(path.join(root, "scripts/client-delta-receiver.cjs"));
const manifestSchema = "lbh-session-replication-manifest-v1";
const manifestHash = `sha256:${"a".repeat(64)}`;
const capabilities = ["runtime-public-components-v1", "state-pair-mixed-v1",
  "state-pair-positional-json-v1", "state-pair-v1", "static-manifest-v1"].sort();
const recipients = 8;
const warmup = 30;
const iterations = 160;

function binding(index) {
  return { runId: "s19-benchmark", connectionId: `session-${index}`, membershipId: `member-${index}`,
    playerId: `player-${index}`, connectionEpoch: 1, wireVersion: "lbh-multiplayer-json-v2",
    capabilities, manifestSchema, manifestHash, authorityIncarnation: 1 };
}

function claims(id) {
  return { membershipId: id.membershipId, playerId: id.playerId, profileId: id.playerId,
    wireVersion: id.wireVersion, capabilities, manifestSchema, manifestHash, authorityIncarnation: 1 };
}

function source(id, beat) {
  const players = Array.from({ length: recipients }, (_, index) => ({ clientId: `public-${index}`,
    wx: (beat + index) / 1000, wy: index / 100, vx: 0.01, vy: 0.02, hullType: "drifter",
    status: "alive", name: `Pilot ${index}`, isAI: false,
    slingshot: { engaged: false, anchorId: null, orbitDir: 1 } }));
  return { publicFrame: { type: "publicState", runId: id.runId, snapshotId: beat, tick: beat * 2,
    simTime: beat / 10, lastEventSeq: beat, fieldRevision: beat, overloadMode: "NORMAL",
    lastInputSeq: 0, lastActionSeq: 0, manifestHash, full: true,
    state: { session: { status: "running", simScaleProfile: "small" }, players,
      world: { wells: [], stars: [], wrecks: [], planetoids: [], portals: [], scavengers: [],
        fauna: [], sentries: [], nextPortalWaveIndex: beat },
      inhibitor: { form: 0, wx: 0, wy: 0 } } },
  ownerFrame: { type: "ownerState", runId: id.runId, membershipId: id.membershipId,
    playerId: id.playerId, snapshotId: beat, tick: beat * 2, simTime: beat / 10,
    lastEventSeq: beat, fieldRevision: beat, overloadMode: "NORMAL", lastInputSeq: beat,
    lastActionSeq: beat, state: { profileId: id.playerId, cargo: [`private-${id.playerId}-${beat}`] } } };
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * fraction)];
}

const authority = createRuntimeStatePairAuthority({ matchId: "s19-benchmark", authorityIncarnation: 1,
  ballparkEpoch: 1, manifestSchema, manifestHash,
  publisherOptions: { maxRecipients: 16, sharedPublicWork } });
const seats = Array.from({ length: recipients }, (_, index) => binding(index));
const receivers = seats.map((id) => createClientDeltaReceiver({ context: { matchId: id.runId,
  sessionId: id.connectionId, authorityIncarnation: 1, recipientId: id.membershipId,
  recipientIncarnation: 1, manifestSchema, manifestHash }, capabilities }));
for (const id of seats) authority.admit(id, claims(id));
const elapsed = [];
const transcript = crypto.createHash("sha256");
for (let beat = 1; beat <= warmup + iterations; beat += 1) {
  const started = performance.now();
  const publications = seats.map((id) => {
    const frames = source(id, beat);
    return authority.publish(id, frames.publicFrame, frames.ownerFrame);
  });
  const duration = performance.now() - started;
  if (beat > warmup) elapsed.push(duration);
  for (let index = 0; index < seats.length; index += 1) {
    const publication = publications[index];
    if (beat > warmup) transcript.update(publication.encodedWire);
    const result = receivers[index].receive(publication.encodedWire);
    assert(result.accepted);
    assert(authority.acknowledge(seats[index], result.ack).accepted);
  }
}
const diagnostics = authority.diagnostics();
console.log(JSON.stringify({ schema: "lbh-s19-shared-public-benchmark-row-v1", label, sharedPublicWork,
  recipients, warmup, iterations, publishMilliseconds: { mean: elapsed.reduce((a, b) => a + b, 0) / elapsed.length,
    p50: percentile(elapsed, 0.5), p95: percentile(elapsed, 0.95), p99: percentile(elapsed, 0.99) },
  transcriptSha256: transcript.digest("hex"), shared: {
    runtime: diagnostics.sharedPublicWork, publisher: diagnostics.publisher.sharedPublicWork },
  correctness: { receiverErrors: receivers.reduce((sum, receiver) => sum + receiver.diagnostics().rejected, 0),
    pendingPairs: diagnostics.publisher.pendingPairs, ackRejected: diagnostics.publisher.ackRejected } }, null, 2));
