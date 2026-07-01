const { TestRunner, assert } = require("./helpers.cjs");
const {
  createEventPlaybackGate,
  createSimEventJournal,
} = require("../scripts/sim-event-journal.cjs");
const {
  REPLICATION_LANES,
  ALL_REPLICATION_LANES,
  normalizeLaneFilter,
} = require("../scripts/replication-lanes.cjs");

async function run() {
  const runner = new TestRunner("ProtocolJournal");

  await runner.run("Journal events carry monotonic seq and required protocol fields", async () => {
    const journal = createSimEventJournal({ capacity: 8, runId: "run-a" });
    const payload = { amount: 3, nested: { source: "test" } };
    const first = journal.append({
      tick: 4,
      simTime: 0.25,
      type: "cargo.pickedUp",
      lane: REPLICATION_LANES.GLOBAL,
      source: "wreck-1",
      subject: "player-1",
      visibility: "public",
      payload,
    });
    payload.nested.source = "mutated-after-append";
    const second = journal.append({
      tick: 5,
      simTime: 0.3,
      type: "pickupGlint",
      lane: REPLICATION_LANES.VFX,
      source: "wreck-1",
      subject: "player-1",
      visibility: "client",
      payload: { family: "salvage" },
    });

    assert(first.seq === 1, `Expected first seq 1, got ${first.seq}`);
    assert(second.seq === 2, `Expected second seq 2, got ${second.seq}`);
    for (const event of [first, second]) {
      for (const field of ["seq", "runId", "tick", "simTime", "type", "lane", "source", "subject", "visibility", "payload"]) {
        assert(Object.prototype.hasOwnProperty.call(event, field), `Expected event to expose ${field}`);
      }
    }
    assert(first.runId === "run-a", `Expected run-a, got ${first.runId}`);
    assert(first.payload.nested.source === "test", "Expected journal to clone appended payloads");
    assert(journal.describe().lastSeq === 2, "Expected journal lastSeq to advance");
  });

  await runner.run("Stale and future since windows are explicit and deterministic", async () => {
    const journal = createSimEventJournal({ capacity: 3, runId: "run-retention" });
    for (let i = 0; i < 5; i++) {
      journal.append({ tick: i, simTime: i / 15, type: `debug.event${i}`, lane: REPLICATION_LANES.DEBUG });
    }

    const stale = journal.read({ runId: "run-retention", since: 1 });
    assert(stale.stale === true, "Expected since=1 to be stale after bounded retention");
    assert(stale.reason === "since-before-retention", `Unexpected stale reason ${stale.reason}`);
    assert(stale.events.map((event) => event.seq).join(",") === "3,4,5",
      `Expected retained seq 3,4,5, got ${stale.events.map((event) => event.seq).join(",")}`);

    const future = journal.read({ runId: "run-retention", since: 99 });
    assert(future.future === true, "Expected future since to be flagged");
    assert(future.events.length === 0, "Expected future since to return no events");
    assert(future.nextSince === 5, `Expected nextSince to stay at last seq 5, got ${future.nextSince}`);
  });

  await runner.run("Lane filters cover global/playerLocal/neighborhood/vfx/debug/cinematic", async () => {
    const journal = createSimEventJournal({ capacity: 12, runId: "run-lanes" });
    for (const lane of ALL_REPLICATION_LANES) {
      journal.append({
        tick: 1,
        simTime: 1,
        type: `lane.${lane}`,
        lane,
        source: "lane-test",
        subject: lane,
      });
    }

    assert(normalizeLaneFilter("all") === null, "Expected all lane filter to normalize to null");
    const vfxOnly = journal.read({ lane: REPLICATION_LANES.VFX });
    assert(vfxOnly.events.length === 1, `Expected one vfx event, got ${vfxOnly.events.length}`);
    assert(vfxOnly.events[0].lane === REPLICATION_LANES.VFX, "Expected vfx lane event");

    const localAndNear = journal.read({
      lanes: [REPLICATION_LANES.PLAYER_LOCAL, REPLICATION_LANES.NEIGHBORHOOD],
    });
    assert(localAndNear.events.map((event) => event.lane).join(",") === "playerLocal,neighborhood",
      `Unexpected lane order ${localAndNear.events.map((event) => event.lane).join(",")}`);

    const globalAndDebug = journal.read({ lane: "global,debug" });
    assert(globalAndDebug.events.map((event) => event.lane).join(",") === "global,debug",
      `Unexpected global/debug filter ${globalAndDebug.events.map((event) => event.lane).join(",")}`);
  });

  await runner.run("Run reset invalidates old streams cleanly", async () => {
    const journal = createSimEventJournal({ capacity: 4, runId: "run-old" });
    journal.append({ tick: 1, simTime: 0.1, type: "run.started" });
    const beforeReset = journal.read({ runId: "run-old", since: 0 });
    assert(beforeReset.events.length === 1, "Expected old run event before reset");

    journal.startRun("run-new");
    const newRunEvent = journal.append({ tick: 0, simTime: 0, type: "run.started" });
    assert(newRunEvent.seq === 1, "Expected new run sequence to restart under new runId");

    const oldStream = journal.read({ runId: "run-old", since: beforeReset.nextSince });
    assert(oldStream.reset === true, "Expected old stream to be told to reset");
    assert(oldStream.runId === "run-new", `Expected current run id run-new, got ${oldStream.runId}`);
    assert(oldStream.events.length === 0, "Expected reset response to avoid mixing old and new streams");
  });

  await runner.run("Duplicate append attempts and playback duplicates are rejected safely", async () => {
    const journal = createSimEventJournal({ capacity: 4, runId: "run-dupes" });
    const event = journal.append({
      tick: 1,
      simTime: 0.1,
      type: "pickupGlint",
      lane: REPLICATION_LANES.VFX,
      source: "wreck-2",
      subject: "player-1",
    });

    let duplicateAppendRejected = false;
    try {
      journal.append({ seq: 1, tick: 2, simTime: 0.2, type: "pickupGlint", lane: REPLICATION_LANES.VFX });
    } catch {
      duplicateAppendRejected = true;
    }
    assert(duplicateAppendRejected, "Expected duplicate caller-owned seq to reject");
    assert(journal.getStats().duplicateRejected === 1, "Expected duplicate rejection counter to increment");

    const gate = createEventPlaybackGate({ runId: "run-dupes" });
    const firstPlay = gate.accept(event);
    const secondPlay = gate.accept(event);
    assert(firstPlay.accepted === true, "Expected first VFX event playback to accept");
    assert(secondPlay.accepted === false && secondPlay.reason === "duplicate",
      `Expected duplicate playback reject, got ${secondPlay.reason}`);

    journal.startRun("run-after-reset");
    const staleOldEvent = gate.accept(event);
    assert(staleOldEvent.accepted === false && staleOldEvent.reason === "duplicate",
      `Expected already-played old event to remain duplicate, got ${staleOldEvent.reason}`);
    gate.reset("run-after-reset");
    const oldRunAfterGateReset = gate.accept(event);
    assert(oldRunAfterGateReset.accepted === false && oldRunAfterGateReset.reason === "stale-run",
      `Expected old run event to reject after gate reset, got ${oldRunAfterGateReset.reason}`);
    const newEvent = journal.append({ tick: 0, simTime: 0, type: "run.started", lane: REPLICATION_LANES.GLOBAL });
    assert(gate.accept(newEvent).accepted === true, "Expected playback gate to accept new run event after reset");
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("ProtocolJournal test fatal error:", err);
  process.exit(1);
});
