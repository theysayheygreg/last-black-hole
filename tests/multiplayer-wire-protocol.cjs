const { TestRunner, assert } = require("./helpers.cjs");
const {
  WIRE_PROTOCOL_VERSION,
  SIM_PROTOCOL_VERSION,
  CLIENT_TO_SERVER,
  SERVER_TO_CLIENT,
  LIMITS,
  WireProtocolError,
  validateWireFrame,
  parseWireFrame,
  encodeWireFrame,
} = require("../scripts/multiplayer-wire-protocol.cjs");

function expectProtocolError(fn, code) {
  try {
    fn();
  } catch (error) {
    assert(error instanceof WireProtocolError, `Expected WireProtocolError, got ${error?.name}`);
    assert(error.code === code, `Expected ${code}, got ${error.code}: ${error.message}`);
    return error;
  }
  throw new Error(`Expected protocol error ${code}`);
}

function publicState(overrides = {}) {
  return {
    type: "publicState",
    runId: "run-a",
    snapshotId: 9,
    tick: 120,
    simTime: 8,
    lastEventSeq: 4,
    fieldRevision: 2,
    overloadMode: "NORMAL",
    lastInputSeq: 18,
    lastActionSeq: 3,
    manifestHash: "sha256:abc",
    full: true,
    state: { bodies: [{ id: "body-a", x: 0.25, y: 0.5 }], despawns: [] },
    ...overrides,
  };
}

async function run() {
  const runner = new TestRunner("MultiplayerWireProtocol");

  await runner.run("hello and welcome bind protocol-v2 membership and connection authority", async () => {
    const hello = {
      type: "hello",
      wireVersion: WIRE_PROTOCOL_VERSION,
      simProtocolVersion: SIM_PROTOCOL_VERSION,
      admissionTicket: "single-use-ticket",
    };
    const parsedHello = parseWireFrame(JSON.stringify(hello), { direction: CLIENT_TO_SERVER });
    assert(parsedHello.admissionTicket === "single-use-ticket", "Parsed hello should preserve the admission ticket");

    const welcome = {
      type: "welcome",
      wireVersion: WIRE_PROTOCOL_VERSION,
      simProtocolVersion: SIM_PROTOCOL_VERSION,
      runId: "run-a",
      membershipId: "membership-a",
      playerId: "pilot-a",
      connectionId: "connection-a",
      connectionEpoch: 2,
      commandCredential: "rotated-secret",
      lastCommandSeq: 7,
      nextCommandSeq: 8,
      lastInputSeq: 21,
      lastActionSeq: 4,
      heartbeatIntervalMs: 10000,
      reconnected: true,
    };
    const decoded = parseWireFrame(encodeWireFrame(welcome, { direction: SERVER_TO_CLIENT }), { direction: SERVER_TO_CLIENT });
    assert(decoded.membershipId === "membership-a" && decoded.connectionEpoch === 2,
      "Welcome must preserve membership while exposing the rotated connection epoch");
    assert(decoded.nextCommandSeq === decoded.lastCommandSeq + 1,
      "Welcome must resume the protocol-v2 command sequence");

    expectProtocolError(() => validateWireFrame({ ...hello, playerId: "caller-chosen" }, { direction: CLIENT_TO_SERVER }), "unknown-field");
    expectProtocolError(() => validateWireFrame({ ...hello, simProtocolVersion: "v3" }), "unsupported-sim-version");
    expectProtocolError(() => validateWireFrame({ ...hello, resumeTicket: "also-present" }), "invalid-ticket");
    expectProtocolError(() => validateWireFrame({ ...welcome, nextCommandSeq: 7 }), "invalid-sequence");
  });

  await runner.run("heartbeat and pong are directional and correlated", async () => {
    validateWireFrame({ type: "heartbeat", heartbeatId: "hb-1", serverTimeMs: 1234 }, { direction: SERVER_TO_CLIENT });
    validateWireFrame({ type: "pong", heartbeatId: "hb-1", clientTimeMs: 1240 }, { direction: CLIENT_TO_SERVER });
    expectProtocolError(
      () => validateWireFrame({ type: "heartbeat", heartbeatId: "hb-1", serverTimeMs: 1234 }, { direction: CLIENT_TO_SERVER }),
      "invalid-direction",
    );
  });

  await runner.run("latest input is bounded continuous state with no command or one-shot lane", async () => {
    const input = {
      type: "input",
      inputSeq: 22,
      moveX: 0.6,
      moveY: 0.8,
      thrust: 1,
      brake: 0,
      slingshot: true,
      ability1: false,
      ability2: true,
      clientTimeMs: 999,
    };
    validateWireFrame(input, { direction: CLIENT_TO_SERVER });
    expectProtocolError(() => validateWireFrame({ ...input, moveX: 1, moveY: 1 }), "invalid-field");
    expectProtocolError(() => validateWireFrame({ ...input, commandSeq: 9 }), "unknown-field");
    expectProtocolError(() => validateWireFrame({ ...input, pulse: true }), "unknown-field");
    expectProtocolError(() => validateWireFrame({ ...input, ability1: 1 }), "invalid-field");
    expectProtocolError(() => {
      const { ability2, ...missingAbility } = input;
      validateWireFrame(missingAbility);
    }, "invalid-field");
  });

  await runner.run("reliable actions retain idempotency plus monotonic action and command sequences", async () => {
    const action = {
      type: "action",
      actionId: "action-uuid-a",
      actionSeq: 5,
      commandSeq: 8,
      actionKind: "inventory",
      payload: { action: "unequip", equipSlot: 1 },
      clientTimeMs: 1001,
    };
    validateWireFrame(action, { direction: CLIENT_TO_SERVER });
    const ack = {
      type: "ack",
      ackKind: "action",
      deliveryId: 17,
      actionId: action.actionId,
      actionSeq: action.actionSeq,
      commandSeq: action.commandSeq,
      status: "accepted",
      result: { equipped: false },
    };
    validateWireFrame(ack, { direction: SERVER_TO_CLIENT });
    expectProtocolError(() => validateWireFrame({ ...action, actionId: "" }), "invalid-field");
    expectProtocolError(() => validateWireFrame({ ...action, commandSeq: 0 }), "invalid-field");
    expectProtocolError(() => validateWireFrame({ ...action, actionKind: "adminMutation" }), "invalid-action-kind");
    expectProtocolError(() => validateWireFrame(ack, { direction: CLIENT_TO_SERVER }), "invalid-direction");
    expectProtocolError(() => {
      const { deliveryId, ...unretainedAck } = ack;
      validateWireFrame(unretainedAck, { direction: SERVER_TO_CLIENT });
    }, "invalid-field");
  });

  await runner.run("public and owner state stay in distinct recipient lanes", async () => {
    validateWireFrame(publicState(), { direction: SERVER_TO_CLIENT });
    const owner = {
      type: "ownerState",
      runId: "run-a",
      membershipId: "membership-a",
      playerId: "pilot-a",
      snapshotId: 9,
      tick: 120,
      simTime: 8,
      lastEventSeq: 4,
      fieldRevision: 2,
      overloadMode: "NORMAL",
      lastInputSeq: 18,
      lastActionSeq: 3,
      state: { cargo: [{ type: "salvage" }], exactSignal: 0.37 },
    };
    validateWireFrame(owner, { direction: SERVER_TO_CLIENT });
    for (const overloadMode of ["NORMAL", "THROTTLED", "DEGRADED", "DILATED"]) {
      validateWireFrame(publicState({ overloadMode }), { direction: SERVER_TO_CLIENT });
    }
    expectProtocolError(() => validateWireFrame(publicState({ overloadMode: "SHED_VISUAL" })), "invalid-overload-mode");
    expectProtocolError(() => validateWireFrame({ ...publicState(), membershipId: "leak" }), "unknown-field");
    expectProtocolError(() => validateWireFrame({ ...owner, manifestHash: "wrong-lane" }), "unknown-field");
    expectProtocolError(
      () => validateWireFrame(publicState({ state: { bodies: Array(LIMITS.maxPublicBodies + 1).fill({ id: "x" }) } })),
      "payload-array-too-large",
    );
  });

  await runner.run("events, acknowledgements, rebases, errors, and closes are explicit", async () => {
    validateWireFrame({
      type: "event",
      deliveryId: 18,
      runId: "run-a",
      eventSeq: 5,
      tick: 121,
      visibility: "owner",
      eventType: "loot.collected",
      payload: { itemId: "item-a" },
    }, { direction: SERVER_TO_CLIENT });
    validateWireFrame({ type: "ack", ackKind: "baseline", snapshotId: 9, eventSeq: 5 }, { direction: CLIENT_TO_SERVER });
    validateWireFrame({ type: "ack", ackKind: "delivery", deliveryId: 18 }, { direction: CLIENT_TO_SERVER });
    validateWireFrame({ type: "ack", ackKind: "input", inputSeq: 22 }, { direction: SERVER_TO_CLIENT });
    validateWireFrame({ type: "rebase", runId: "run-a", reason: "event-gap", snapshotId: 10, lastEventSeq: 8 }, { direction: SERVER_TO_CLIENT });
    validateWireFrame({
      type: "error",
      code: "stale-command",
      message: "Command sequence was already processed",
      fatal: false,
      retryable: false,
      relatedType: "action",
      acceptedCommandSeq: 8,
    }, { direction: SERVER_TO_CLIENT });
    validateWireFrame({ type: "close", code: 4401, reason: "admission expired", reconnectable: true, retryAfterMs: 500 }, { direction: SERVER_TO_CLIENT });
    expectProtocolError(() => validateWireFrame({ type: "ack", ackKind: "delivery", deliveryId: 18 }, { direction: SERVER_TO_CLIENT }), "invalid-direction");
    expectProtocolError(() => validateWireFrame({
      type: "event",
      runId: "run-a",
      eventSeq: 6,
      tick: 122,
      visibility: "public",
      eventType: "signal.changed",
      payload: {},
    }, { direction: SERVER_TO_CLIENT }), "invalid-field");
  });

  await runner.run("strict parsing rejects unknown fields, invalid JSON values, direction errors, and byte excess", async () => {
    expectProtocolError(() => parseWireFrame("not-json"), "invalid-json");
    expectProtocolError(() => parseWireFrame(Buffer.from([0xc3, 0x28])), "invalid-frame-encoding");
    expectProtocolError(() => parseWireFrame(Buffer.alloc(LIMITS.maxFrameBytes + 1, 32)), "frame-too-large");
    expectProtocolError(() => validateWireFrame(publicState({ extra: true })), "unknown-field");
    expectProtocolError(() => validateWireFrame(publicState({ state: { unsafe: Infinity } })), "invalid-payload");
    expectProtocolError(() => validateWireFrame(publicState(), { direction: CLIENT_TO_SERVER }), "invalid-direction");
    expectProtocolError(() => validateWireFrame({ type: "mystery" }), "unknown-frame-type");
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
