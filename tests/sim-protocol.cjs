const { TestRunner, assert } = require("./helpers.cjs");
const {
  PROTOCOL_VERSION,
  createProtocolDescription,
  normalizeInputMessage,
  normalizeInventoryAction,
  playerEventVisibility,
  eventVisibleToPlayer,
} = require("../scripts/sim-protocol.cjs");
const {
  WIRE_PROTOCOL_VERSION,
  STREAM_PATH,
} = require("../scripts/multiplayer-protocol-constants.cjs");
const {
  WIRE_PROTOCOL_VERSION: CODEC_WIRE_PROTOCOL_VERSION,
  STREAM_PATH: CODEC_STREAM_PATH,
} = require("../scripts/multiplayer-wire-protocol.cjs");

async function run() {
  const runner = new TestRunner("SimProtocol");

  await runner.run("Input normalization preserves bounded slingshot edge ids", async () => {
    const normalized = normalizeInputMessage({
      runId: "run-7",
      playerId: "pilot",
      commandSeq: 12,
      commandCredential: "secret",
      seq: 7.9,
      moveX: 8,
      moveY: -8,
      thrust: 3,
      brake: -1,
      slingshot: false,
      slingshotEdges: [1, { id: 2 }, 2, -1, 3, 4, 5, 6, 7, 8, 9],
      pulse: "yes",
      consumeSlot: 99,
    });

    assert(normalized.seq === 7, `Expected floored seq 7, got ${normalized.seq}`);
    assert(normalized.runId === "run-7" && normalized.playerId === "pilot" && normalized.clientId === "pilot",
      "Expected v2 run and player identity to normalize once");
    assert(normalized.commandSeq === 12 && normalized.commandCredential === "secret",
      "Expected v2 command authority fields to survive normalization");
    assert(Math.abs(Math.hypot(normalized.moveX, normalized.moveY) - 1) < 1e-9, "Expected unit movement vector clamp");
    assert(normalized.thrust === 1 && normalized.brake === 0, "Expected scalar action clamp");
    assert(normalized.slingshot === false, "Held slingshot state should remain distinct from press edges");
    assert(JSON.stringify(normalized.slingshotEdges) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8]),
      `Expected unique positive edge ids capped at 8, got ${normalized.slingshotEdges}`);
    assert(normalized.pulse === true, "Expected pulse boolean normalization");
    assert(normalized.consumeSlot === 1, "Expected consumable slot clamp");
  });

  await runner.run("Missing slingshot edges normalize to an empty queue", async () => {
    const normalized = normalizeInputMessage({ clientId: "pilot", seq: 1 });
    assert(Array.isArray(normalized.slingshotEdges) && normalized.slingshotEdges.length === 0,
      "Expected absent press edges to normalize to an empty queue");
  });

  await runner.run("Protocol description and inventory actions expose the v2 authority envelope", async () => {
    const description = createProtocolDescription();
    assert(PROTOCOL_VERSION === "lbh-local-v2" && description.version === PROTOCOL_VERSION,
      `Expected lbh-local-v2, got ${description.version}`);
    assert(description.authority?.headers?.["x-lbh-command-credential"],
      "Expected command credential header in protocol description");

    const action = normalizeInventoryAction({
      runId: "run-a",
      clientId: "pilot-a",
      commandSeq: 9,
      commandCredential: "credential-a",
      action: "unequip",
      equipSlot: 1,
    });
    assert(action.playerId === "pilot-a" && action.clientId === "pilot-a",
      "Expected clientId compatibility alias to normalize to playerId");
    assert(action.runId === "run-a" && action.commandSeq === 9,
      "Expected inventory action to carry run and command identity");
  });

  await runner.run("Optional stream discovery shares cycle-free wire constants without weakening protocol v2", async () => {
    const description = createProtocolDescription();
    const stream = description.transports?.stream;

    assert(description.version === "lbh-local-v2" && description.version === PROTOCOL_VERSION,
      "Stream discovery must not rename the existing sim protocol");
    assert(description.messages?.join?.direction === "client->server"
      && description.messages?.snapshot?.direction === "server->client"
      && description.authority?.headers?.["x-lbh-command-credential"],
      "Stream discovery must preserve existing messages and authority fields");
    assert(WIRE_PROTOCOL_VERSION === CODEC_WIRE_PROTOCOL_VERSION,
      "Static discovery and strict codec must import the same wire version constant");
    assert(STREAM_PATH === CODEC_STREAM_PATH,
      "Static discovery and strict codec must import the same stream path constant");
    assert(JSON.stringify(stream) === JSON.stringify({
      optional: true,
      enabledByDefault: false,
      environmentGate: "LBH_SIM_WS_ENABLED",
      path: STREAM_PATH,
      wireVersion: WIRE_PROTOCOL_VERSION,
      framing: "UTF-8 JSON text",
      upgrade: "WebSocket Upgrade",
      authorityTopology: "same-process per-match single-writer authority",
    }), `Unexpected stream descriptor: ${JSON.stringify(stream)}`);
    assert(!Object.hasOwn(stream, "messages") && !Object.hasOwn(stream, "schemas"),
      "Static discovery must point to the strict codec instead of duplicating frame schemas");
  });

  await runner.run("Player-local visibility is owner-only", async () => {
    const event = { visibility: playerEventVisibility("membership-a") };
    assert(eventVisibleToPlayer(event, { membershipId: "membership-a" }) === true, "Expected owner membership visibility");
    assert(eventVisibleToPlayer(event, { membershipId: "membership-b" }) === false, "Expected cross-membership privacy");
    assert(eventVisibleToPlayer(event, { playerId: "pilot-a" }) === false,
      "A reused player id must not recover an earlier membership's private event");
    assert(eventVisibleToPlayer({ visibility: "public" }, null) === true, "Expected public visibility");
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
