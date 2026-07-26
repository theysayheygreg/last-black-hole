const { TestRunner, assert } = require("./helpers.cjs");
const { createSimSnapshotRing } = require("../scripts/sim-snapshot-ring.cjs");
const {
  assertRuntimeJsonBudget,
  serializedRuntimeJsonBytes,
  serializeRuntimeJson,
} = require("../scripts/sim/serialization-budget.cjs");

async function run() {
  const runner = new TestRunner("SnapshotRebase");

  await runner.run("Runtime JSON budget measures the exact compact wire payload", async () => {
    const payload = { type: "snapshot", values: [1, 2], nested: { active: true } };
    const wire = serializeRuntimeJson(payload);
    assert(wire === JSON.stringify(payload), "Runtime JSON must preserve native key order and values");
    assert(!wire.includes("\n"), "Runtime JSON transport must not add formatting bytes");
    assert(serializedRuntimeJsonBytes(payload) === Buffer.byteLength(wire),
      "Runtime JSON byte receipt must match its exact wire text");
    assert(assertRuntimeJsonBudget(payload, Buffer.byteLength(wire), { label: "Exact wire proof" }) === Buffer.byteLength(wire),
      "Exact runtime budget must admit its wire payload");
    let rejected = false;
    try {
      assertRuntimeJsonBudget(payload, Buffer.byteLength(wire) - 1, { label: "Exact wire proof" });
    } catch (error) {
      rejected = /exceeding the \d+-byte budget/.test(error.message);
    }
    assert(rejected, "Runtime budget must reject the next smaller wire limit");
  });

  await runner.run("Snapshots assign monotonic ids and preserve baseline metadata", async () => {
    const ring = createSimSnapshotRing({ capacity: 4, runId: "run-snap" });
    const first = ring.append({
      tick: 10,
      simTime: 0.66,
      mapId: "shallows",
      players: [{ clientId: "p1", wx: 1, wy: 2 }],
      lastEventSeq: 7,
      bodySchemaVersion: 2,
      snapshotSchemaVersion: 3,
    });
    const second = ring.append({
      baselineSnapshotId: first.snapshotId,
      tick: 11,
      simTime: 0.73,
      lastEventSeq: 8,
      players: [{ clientId: "p1", wx: 1.1, wy: 2 }],
    });

    assert(first.snapshotId === 1, `Expected first snapshotId 1, got ${first.snapshotId}`);
    assert(first.baselineSnapshotId === null, "Expected full snapshot to have null baseline");
    assert(first.runId === "run-snap", `Expected run-snap, got ${first.runId}`);
    assert(first.lastEventSeq === 7, `Expected lastEventSeq 7, got ${first.lastEventSeq}`);
    assert(first.bodySchemaVersion === 2, `Expected body schema 2, got ${first.bodySchemaVersion}`);
    assert(first.snapshotSchemaVersion === 3, `Expected snapshot schema 3, got ${first.snapshotSchemaVersion}`);
    assert(second.snapshotId === 2, `Expected second snapshotId 2, got ${second.snapshotId}`);
    assert(second.baselineSnapshotId === 1, `Expected baseline 1, got ${second.baselineSnapshotId}`);
  });

  await runner.run("Bounded retention returns stale, future, and missing lookups deterministically", async () => {
    const ring = createSimSnapshotRing({ capacity: 2, runId: "run-retention" });
    ring.append({ snapshotId: 10, tick: 10, simTime: 1 });
    ring.append({ snapshotId: 12, baselineSnapshotId: 10, tick: 12, simTime: 1.2 });

    const missing = ring.lookup(11, { runId: "run-retention" });
    assert(missing.status === "missing", `Expected missing gap lookup, got ${missing.status}`);
    assert(missing.reason === "snapshot-gap", `Unexpected missing reason ${missing.reason}`);

    ring.append({ snapshotId: 13, baselineSnapshotId: 12, tick: 13, simTime: 1.3 });
    const stale = ring.lookup(10, { runId: "run-retention" });
    assert(stale.status === "stale", `Expected dropped snapshot to be stale, got ${stale.status}`);
    assert(stale.firstRetainedSnapshotId === 12,
      `Expected first retained id 12, got ${stale.firstRetainedSnapshotId}`);

    const future = ring.lookup(99, { runId: "run-retention" });
    assert(future.status === "future", `Expected future lookup, got ${future.status}`);

    const hit = ring.lookup(12, { runId: "run-retention" });
    assert(hit.status === "hit", `Expected retained snapshot hit, got ${hit.status}`);
    assert(hit.snapshot.baselineSnapshotId === 10, "Expected retained snapshot to preserve dropped baseline id metadata");
  });

  await runner.run("Snapshot list exposes bounded windows and continuity watermarks", async () => {
    const ring = createSimSnapshotRing({ capacity: 3, runId: "run-list" });
    for (let i = 0; i < 5; i++) {
      ring.append({
        tick: i,
        simTime: i / 15,
        lastEventSeq: i * 2,
        players: [{ clientId: "p1", wx: i, wy: i }],
      });
    }

    const staleList = ring.list({ runId: "run-list", sinceSnapshotId: 1 });
    assert(staleList.status === "stale", `Expected stale list, got ${staleList.status}`);
    assert(staleList.snapshots.map((snapshot) => snapshot.snapshotId).join(",") === "3,4,5",
      `Expected retained ids 3,4,5, got ${staleList.snapshots.map((snapshot) => snapshot.snapshotId).join(",")}`);
    assert(staleList.snapshots[2].lastEventSeq === 8,
      `Expected last retained watermark 8, got ${staleList.snapshots[2].lastEventSeq}`);

    const empty = ring.list({ runId: "run-list", sinceSnapshotId: 5 });
    assert(empty.status === "ok", `Expected exact last id list to be ok, got ${empty.status}`);
    assert(empty.snapshots.length === 0, "Expected exact last id list to be empty");
  });

  await runner.run("Duplicate snapshot ids reject without corrupting retention state", async () => {
    const ring = createSimSnapshotRing({ capacity: 2, runId: "run-duplicate" });
    ring.append({ snapshotId: 3, tick: 3, simTime: 0.3 });

    let duplicateRejected = false;
    try {
      ring.append({ snapshotId: 3, tick: 4, simTime: 0.4 });
    } catch {
      duplicateRejected = true;
    }
    assert(duplicateRejected, "Expected duplicate snapshot id to reject");
    assert(ring.getStats().duplicateRejected === 1, "Expected duplicate rejection counter to increment");
    assert(ring.latest().snapshot.snapshotId === 3, "Expected latest snapshot to remain the original");
  });

  await runner.run("Run reset invalidates old snapshot lookup streams", async () => {
    const ring = createSimSnapshotRing({ capacity: 2, runId: "run-old" });
    ring.append({ tick: 1, simTime: 0.1, lastEventSeq: 3 });
    const oldHit = ring.lookup(1, { runId: "run-old" });
    assert(oldHit.status === "hit", "Expected old snapshot before reset");

    ring.startRun("run-new");
    const newSnapshot = ring.append({ tick: 0, simTime: 0, lastEventSeq: 1 });
    assert(newSnapshot.snapshotId === 1, "Expected snapshot ids to restart under new runId");
    const oldLookup = ring.lookup(1, { runId: "run-old" });
    assert(oldLookup.status === "reset", `Expected old run lookup reset, got ${oldLookup.status}`);
    assert(oldLookup.runId === "run-new", `Expected active run-new, got ${oldLookup.runId}`);
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("SnapshotRebase test fatal error:", err);
  process.exit(1);
});
