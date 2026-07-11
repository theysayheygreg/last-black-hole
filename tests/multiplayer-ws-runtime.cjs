"use strict";

const fs = require("fs");
const path = require("path");
const { WebSocket } = require("ws");
const {
  TestRunner,
  assert,
  startSimServer,
  stopSimServer,
  simLogFile,
} = require("./helpers.cjs");
const { WIRE_PROTOCOL_VERSION } = require("../scripts/multiplayer-wire-protocol.cjs");
const { PROTOCOL_VERSION } = require("../scripts/sim-protocol.cjs");

const DISABLED_PORT = 8840;
const SECURITY_PORT = 8841;
const LINEAGE_PORT = 8843;
const ACTION_PORT = 8845;
const EVENT_PORT = 8846;
const EVENT_GAP_PORT = 8847;
const EVENT_UPPER_PORT = 8849;
const COHORT_PORTS = { 1: 8842, 4: 8844, 8: 8848 };

async function waitFor(check, label, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await check();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${label}; last=${JSON.stringify(last)}`);
}

async function request(port, pathname, { method = "GET", body = null, authority = null } = {}) {
  const headers = { "content-type": "application/json" };
  if (authority) {
    headers["x-lbh-command-credential"] = authority.commandCredential;
    headers["x-lbh-player-id"] = authority.playerId;
    headers["x-lbh-run-id"] = authority.runId;
  }
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

function command(authority, commandSeq, extra = {}) {
  return {
    runId: authority.runId,
    playerId: authority.playerId,
    commandCredential: authority.commandCredential,
    commandSeq,
    ...extra,
  };
}

async function issueTicket(port, authority, kind = "admission", extra = {}) {
  return request(port, "/multiplayer/ticket", {
    method: "POST",
    authority,
    body: { kind, ...extra },
  });
}

function socketClient(port) {
  const client = {
    ws: new WebSocket(`ws://127.0.0.1:${port}/stream`),
    opened: false,
    frames: [],
    raw: [],
    close: null,
    error: null,
    unexpectedStatus: null,
  };
  client.ws.on("open", () => { client.opened = true; });
  client.ws.on("unexpected-response", (_request, response) => {
    client.unexpectedStatus = response.statusCode;
  });
  client.ws.on("error", (error) => { client.error = error.message; });
  client.ws.on("close", (code, reason) => {
    client.close = { code, reason: reason.toString("utf8") };
  });
  client.ws.on("message", (raw) => {
    const text = raw.toString("utf8");
    client.raw.push(text);
    const frame = JSON.parse(text);
    client.frames.push({ ...frame, _receivedAt: Date.now(), _bytes: Buffer.byteLength(text) });
    if (frame.type === "heartbeat" && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        type: "pong",
        heartbeatId: frame.heartbeatId,
        clientTimeMs: Date.now(),
      }));
    }
  });
  return client;
}

async function openBoundClient(port, ticket, kind = "admission", cursors = {}) {
  const client = socketClient(port);
  await waitFor(() => client.opened || client.error || client.unexpectedStatus, "WebSocket open");
  assert(client.opened, `Expected WebSocket open, got error=${client.error} status=${client.unexpectedStatus}`);
  const hello = {
    type: "hello",
    wireVersion: WIRE_PROTOCOL_VERSION,
    simProtocolVersion: PROTOCOL_VERSION,
    [kind === "resume" ? "resumeTicket" : "admissionTicket"]: ticket,
    ...cursors,
  };
  client.ws.send(JSON.stringify(hello));
  await waitFor(
    () => client.frames.some((frame) => frame.type === "welcome") || client.close,
    `${kind} welcome or rejection`,
  );
  return client;
}

function frame(client, type, predicate = () => true) {
  return client.frames.find((entry) => entry.type === type && predicate(entry));
}

function frames(client, type) {
  return client.frames.filter((entry) => entry.type === type);
}

async function closeClient(client) {
  if (!client || client.ws.readyState === WebSocket.CLOSED) return;
  client.ws.close(1000, "test complete");
  await waitFor(() => client.close, "client close").catch(() => {
    client.ws.terminate();
  });
}

async function sendAction(client, action, paceMs = 120) {
  const before = frames(client, "ack").length;
  client.ws.send(JSON.stringify({ type: "action", clientTimeMs: Date.now(), ...action }));
  const ack = await waitFor(() => frames(client, "ack").slice(before).find((entry) =>
    entry.ackKind === "action" && entry.actionId === action.actionId
  ), `action ACK ${action.actionId}`);
  // Stay below the production action bucket while this fixture deliberately
  // exercises many semantic failures in a short local interval.
  if (paceMs > 0) await new Promise((resolve) => setTimeout(resolve, paceMs));
  return ack;
}

async function ownerPlayer(client, predicate = () => true) {
  return waitFor(() => {
    const owner = frames(client, "ownerState").at(-1);
    return owner && predicate(owner.state) ? owner.state : null;
  }, "matching owner state");
}

async function playerEventCount(port, authority, type) {
  const response = await request(port, `/events?runId=${encodeURIComponent(authority.runId)}&since=0`, { authority });
  return response.body.events.filter((event) => event.type === type).length;
}

async function runEventRecoveryFixture() {
  await startSimServer(EVENT_PORT, { keepAlive: true, env: { LBH_SIM_WS_ENABLED: "true" } });
  const clients = [];
  try {
    const started = await request(EVENT_PORT, "/session/start", {
      method: "POST",
      body: { mapId: "shallows", requesterId: "event-a", requesterName: "Event A", maxPlayers: 2 },
    });
    const authorities = [];
    for (const id of ["event-a", "event-b"]) {
      const joined = await request(EVENT_PORT, "/join", {
        method: "POST",
        body: {
          runId: started.body.session.runId,
          clientId: id,
          joinTicket: id === "event-a" ? started.body.joinTicket : undefined,
          name: id,
          equipped: [{ id: `event-rig-${id}`, name: `Event Rig ${id}`, subcategory: "equippable" }],
        },
      });
      authorities.push(joined.body.authority);
    }
    for (const authority of authorities) {
      const ticket = await issueTicket(EVENT_PORT, authority);
      clients.push(await openBoundClient(EVENT_PORT, ticket.body.ticket));
    }
    const [a, b] = clients;
    const baselineSeq = frame(a, "rebase").lastEventSeq;
    for (const client of [a, b]) {
      const result = await request(EVENT_PORT, "/inventory/action", {
        method: "POST",
        authority: frame(client, "welcome"),
        body: command(frame(client, "welcome"), 1, { action: "unequip", equipSlot: 0 }),
      });
      assert(result.status === 200, "Expected private inventory event fixture");
    }
    const eventA = await waitFor(() => frames(a, "event").find((entry) =>
      entry.eventType === "player.inventoryAction" && entry.payload.clientId === authorities[0].playerId
    ), "owner A inventory event");
    await waitFor(() => frames(b, "event").some((entry) =>
      entry.eventType === "player.inventoryAction" && entry.payload.clientId === authorities[1].playerId
    ), "owner B inventory event");
    assert(!frames(a, "event").some((entry) =>
      entry.eventType === "player.inventoryAction" && entry.payload.clientId === authorities[1].playerId
    ), "Owner A received owner B's private consequence");
    const checkpoint = await waitFor(() => frames(a, "event").find((entry) =>
      entry.eventType === "system.eventCursor" && entry.eventSeq > eventA.eventSeq
    ), "private-hole cursor checkpoint");
    a.ws.send(JSON.stringify({ type: "ack", ackKind: "delivery", deliveryId: eventA.deliveryId }));
    const deliveredOnly = await waitFor(async () => {
      const health = await request(EVENT_PORT, "/health");
      return health.body.multiplayer.adapter.eventReplay.pendingEventFrames > 0 ? health : null;
    }, "delivery ACK preserves playback pending state");
    assert(deliveredOnly.body.multiplayer.adapter.eventReplay.pendingEventBytes > 0,
      "Playback-pending diagnostics must remain byte bounded after delivery ACK");
    a.ws.send(JSON.stringify({ type: "ack", ackKind: "event", eventSeq: checkpoint.eventSeq }));

    const inventory = await request(EVENT_PORT, "/inventory/action", {
      method: "POST",
      authority: frame(a, "welcome"),
      body: command(frame(a, "welcome"), 2, { action: "equipCargo", cargoSlot: 0, equipSlot: 0 }),
    });
    assert(inventory.status === 200, "Expected owner-private inventory consequence");
    const inventoryEvent = await waitFor(() => frames(a, "event").find((entry) =>
      entry.eventType === "player.inventoryAction" && entry.payload.action === "equipCargo"
    ), "inventory event before disconnect");
    a.ws.send(JSON.stringify({ type: "ack", ackKind: "delivery", deliveryId: inventoryEvent.deliveryId }));
    const resumeTicket = await issueTicket(EVENT_PORT, frame(a, "welcome"), "resume");
    const resumed = await openBoundClient(EVENT_PORT, resumeTicket.body.ticket, "resume", {
      lastRunId: started.body.session.runId,
      lastSnapshotId: frame(a, "publicState").snapshotId,
      lastEventSeq: checkpoint.eventSeq,
    });
    clients[0] = resumed;
    const replay = await waitFor(() => frames(resumed, "event").find((entry) =>
      entry.eventType === "player.inventoryAction" && entry.eventSeq === inventoryEvent.eventSeq
    ), "unacknowledged event replay");
    const order = ["welcome", "rebase", "publicState", "ownerState"].map((type) =>
      resumed.frames.findIndex((entry) => entry.type === type));
    assert(order.every((index, position) => index >= 0 && (position === 0 || index > order[position - 1]))
      && resumed.frames.indexOf(replay) > order.at(-1),
    `Resume baseline must be atomic before replay: ${JSON.stringify(order)}`);
    assert(frame(resumed, "rebase").lastEventSeq === checkpoint.eventSeq,
      "Resume rebase must advertise the acknowledged replay cursor, not the state watermark");
    resumed.ws.send(JSON.stringify({ type: "ack", ackKind: "event", eventSeq: replay.eventSeq }));

    const fillStart = frames(resumed, "event").length;
    for (let offset = 0; offset < 32; offset += 1) {
      const commandSeq = 3 + offset;
      const unequip = offset % 2 === 0;
      const result = await request(EVENT_PORT, "/inventory/action", {
        method: "POST",
        authority: frame(resumed, "welcome"),
        body: command(frame(resumed, "welcome"), commandSeq, unequip
          ? { action: "unequip", equipSlot: 0 }
          : { action: "equipCargo", cargoSlot: 0, equipSlot: 0 }),
      });
      assert(result.status === 200, `Expected replay-window filler ${offset + 1}`);
    }
    const fillEvents = await waitFor(() => {
      const entries = frames(resumed, "event").slice(fillStart)
        .filter((entry) => entry.eventType === "player.inventoryAction");
      return entries.length >= 32 ? entries.slice(0, 32) : null;
    }, "full playback-pending event window", 8000);
    for (const entry of fillEvents) {
      resumed.ws.send(JSON.stringify({ type: "ack", ackKind: "delivery", deliveryId: entry.deliveryId }));
    }
    const fullWindow = await waitFor(async () => {
      const health = await request(EVENT_PORT, "/health");
      return health.body.multiplayer.adapter.eventReplay.pendingEventFrames >= 32 ? health : null;
    }, "32-event playback window");
    assert(fullWindow.body.multiplayer.adapter.eventReplay.actionMessageReserve === 16
      && fullWindow.body.multiplayer.adapter.eventReplay.actionByteReserve === 32 * 1024,
    "Event replay must reserve explicit reliable headroom for action ACKs");
    const beatsBefore = fullWindow.body.multiplayer.projection.beats;
    await new Promise((resolve) => setTimeout(resolve, 450));
    const backlogHealth = await request(EVENT_PORT, "/health");
    assert(backlogHealth.body.multiplayer.projection.beats >= beatsBefore + 2
      && backlogHealth.body.multiplayer.projection.errors === 0,
    "A full playback backlog must not stall the tick-coupled projection cadence");
    const actionWithFullReplay = await sendAction(resumed, {
      actionId: "event-window-action",
      actionSeq: 1,
      commandSeq: 35,
      actionKind: "pulse",
      payload: {},
    });
    assert(actionWithFullReplay.status === "accepted", "Full event playback window starved a reliable action ACK");
    resumed.ws.send(JSON.stringify({ type: "ack", ackKind: "delivery", deliveryId: actionWithFullReplay.deliveryId }));

    const hidden = await request(EVENT_PORT, "/inventory/action", {
      method: "POST",
      authority: frame(b, "welcome"),
      body: command(frame(b, "welcome"), 2, { action: "equipCargo", cargoSlot: 0, equipSlot: 0 }),
    });
    assert(hidden.status === 200, "Expected hidden-tail event while owner A replay window was full");
    const hiddenEvent = await waitFor(() => frames(b, "event").find((entry) =>
      entry.eventType === "player.inventoryAction" && entry.payload.action === "equipCargo"
    ), "hidden private tail event");
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert(!frames(resumed, "event").some((entry) =>
      entry.eventType === "system.eventCursor" && entry.eventSeq >= hiddenEvent.eventSeq
    ), "A full replay window advanced a hidden-tail scan without issuing its checkpoint");
    resumed.ws.send(JSON.stringify({ type: "ack", ackKind: "event", eventSeq: fillEvents.at(-1).eventSeq }));
    await waitFor(() => frames(resumed, "event").find((entry) =>
      entry.eventType === "system.eventCursor" && entry.eventSeq >= hiddenEvent.eventSeq
    ), "deferred hidden-tail checkpoint after capacity release");

    const left = await request(EVENT_PORT, "/leave", {
      method: "POST",
      authority: frame(b, "welcome"),
      body: command(frame(b, "welcome"), 3, { playerId: authorities[1].playerId }),
    });
    assert(left.status === 200, "Expected old membership to leave");
    const rejoined = await request(EVENT_PORT, "/join", {
      method: "POST",
      body: { runId: started.body.session.runId, clientId: authorities[1].playerId, name: "Event B New" },
    });
    assert(rejoined.body.authority.membershipId !== authorities[1].membershipId,
      "Reused player id must receive a new membership lineage");
    const eventsHttp = await request(EVENT_PORT, `/events?runId=${encodeURIComponent(started.body.session.runId)}&since=0`, {
      authority: rejoined.body.authority,
    });
    assert(!eventsHttp.body.events.some((entry) =>
      entry.type === "player.inventoryAction" && entry.payload.clientId === authorities[1].playerId
    ), "New membership recovered prior occupant private events over HTTP");
    const newResumeTicket = await issueTicket(EVENT_PORT, rejoined.body.authority, "resume");
    const reused = await openBoundClient(EVENT_PORT, newResumeTicket.body.ticket, "resume", {
      lastRunId: started.body.session.runId,
      lastSnapshotId: 1,
      lastEventSeq: baselineSeq,
    });
    clients.push(reused);
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert(!frames(reused, "event").some((entry) =>
      entry.eventType === "player.inventoryAction" && entry.payload.clientId === authorities[1].playerId
    ), "New membership recovered prior occupant private events over WebSocket");
    reused.ws.send(JSON.stringify({ type: "ack", ackKind: "event", eventSeq: 999999 }));
    await waitFor(() => reused.close, "issued-only future event ACK rejection");
    assert(frame(reused, "error")?.code === "future-recovery-cursor",
      "Event ACK must be bounded by the highest eligible cursor actually issued");
  } finally {
    await Promise.all(clients.map(closeClient));
    await stopSimServer(EVENT_PORT).catch(() => null);
  }
}

async function runEventUpperBoundFixture() {
  await startSimServer(EVENT_UPPER_PORT, {
    keepAlive: true,
    env: { LBH_SIM_WS_ENABLED: "true", LBH_SIM_WS_TEST_PROJECTION_DELAY_MS: "600" },
  });
  let client = null;
  try {
    const started = await request(EVENT_UPPER_PORT, "/session/start", {
      method: "POST",
      body: { mapId: "shallows", requesterId: "upper-a", requesterName: "Upper A", maxPlayers: 1 },
    });
    const joined = await request(EVENT_UPPER_PORT, "/join", {
      method: "POST",
      body: {
        runId: started.body.session.runId,
        clientId: "upper-a",
        joinTicket: started.body.joinTicket,
        equipped: [{ id: "upper-rig", name: "Upper Rig", subcategory: "equippable" }],
      },
    });
    const ticket = await issueTicket(EVENT_UPPER_PORT, joined.body.authority);
    client = await openBoundClient(EVENT_UPPER_PORT, ticket.body.ticket);
    await waitFor(async () => {
      const health = await request(EVENT_UPPER_PORT, "/health");
      return health.body.multiplayer.projection.inFlight ? health : null;
    }, "captured delayed projection");
    const inventory = await request(EVENT_UPPER_PORT, "/inventory/action", {
      method: "POST",
      authority: frame(client, "welcome"),
      body: command(frame(client, "welcome"), 1, { action: "unequip", equipSlot: 0 }),
    });
    assert(inventory.status === 200, "Expected event injected after projection capture");
    await waitFor(async () => {
      const health = await request(EVENT_UPPER_PORT, "/health");
      return health.body.multiplayer.projection.accounting.projectionDurationSamples === 1 ? health : null;
    }, "first delayed projection settlement", 3000);
    assert(!frames(client, "event").some((entry) => entry.eventType === "player.inventoryAction"),
      "A projection delivered an event newer than its captured public watermark");
    await waitFor(() => frames(client, "event").find((entry) => entry.eventType === "player.inventoryAction"),
      "next captured projection event", 3000);
  } finally {
    await closeClient(client);
    await stopSimServer(EVENT_UPPER_PORT).catch(() => null);
  }
}

async function runEventGapFixture() {
  await startSimServer(EVENT_GAP_PORT, {
    keepAlive: true,
    env: { LBH_SIM_WS_ENABLED: "true", LBH_SIM_EVENT_JOURNAL_CAPACITY: "4" },
  });
  let client = null;
  try {
    const started = await request(EVENT_GAP_PORT, "/session/start", {
      method: "POST",
      body: { mapId: "shallows", requesterId: "gap-a", requesterName: "Gap A", maxPlayers: 1 },
    });
    const joined = await request(EVENT_GAP_PORT, "/join", {
      method: "POST",
      body: {
        runId: started.body.session.runId,
        clientId: "gap-a",
        joinTicket: started.body.joinTicket,
        equipped: [{ id: "gap-rig", name: "Gap Rig", subcategory: "equippable" }],
      },
    });
    let authority = joined.body.authority;
    for (let seq = 1; seq <= 8; seq += 1) {
      const unequip = seq % 2 === 1;
      const result = await request(EVENT_GAP_PORT, "/inventory/action", {
        method: "POST",
        authority,
        body: command(authority, seq, unequip
          ? { action: "unequip", equipSlot: 0 }
          : { action: "equipCargo", cargoSlot: 0, equipSlot: 0 }),
      });
      assert(result.status === 200, `Expected retention filler ${seq}`);
      authority = { ...authority, lastCommandSeq: seq, nextCommandSeq: seq + 1 };
    }
    const ticket = await issueTicket(EVENT_GAP_PORT, authority, "resume");
    client = await openBoundClient(EVENT_GAP_PORT, ticket.body.ticket, "resume", {
      lastRunId: started.body.session.runId,
      lastSnapshotId: 1,
      lastEventSeq: 0,
    });
    assert(frame(client, "rebase")?.reason === "event-gap", "since=0 retention loss must force event-gap rebase");
    const baselineEnd = client.frames.findIndex((entry) => entry.type === "ownerState");
    assert(baselineEnd > client.frames.findIndex((entry) => entry.type === "rebase"),
      "Gap rebase must precede its captured public/owner baseline");
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert(!frames(client, "event").some((entry) => entry.eventSeq < frame(client, "rebase").lastEventSeq),
      "Retention recovery must not replay a partial tail as complete history");
  } finally {
    await closeClient(client);
    await stopSimServer(EVENT_GAP_PORT).catch(() => null);
  }
}

async function runReliableActionsFixture() {
  await startSimServer(ACTION_PORT, { keepAlive: true, env: { LBH_SIM_WS_ENABLED: "true" } });
  let client = null;
  let resumed = null;
  let resetClient = null;
  try {
    const started = await request(ACTION_PORT, "/session/start", {
      method: "POST",
      body: { mapId: "shallows", requesterId: "action-pilot", requesterName: "Action Pilot", maxPlayers: 1 },
    });
    const joined = await request(ACTION_PORT, "/join", {
      method: "POST",
      body: {
        runId: started.body.session.runId,
        clientId: "action-pilot",
        joinTicket: started.body.joinTicket,
        name: "Action Pilot",
        consumables: [
          { id: "reliable-fuel", name: "Reliable Fuel", subcategory: "consumable", charges: 2, useEffect: "fuelRefill" },
          { id: "reliable-shield", name: "Reliable Shield", subcategory: "consumable", charges: 1, useEffect: "shieldBurst" },
        ],
      },
    });
    let authority = joined.body.authority;
    const ticket = await issueTicket(ACTION_PORT, authority);
    client = await openBoundClient(ACTION_PORT, ticket.body.ticket);
    await waitFor(() => frame(client, "ownerState"), "initial action owner state");

    const slingshot = {
      actionId: "reliable-edge", actionSeq: 1, commandSeq: 1,
      actionKind: "slingshotEdge", payload: { edgeId: 1000 },
    };
    const edgeAck = await sendAction(client, slingshot);
    assert(edgeAck.status === "accepted" && edgeAck.result.code === "queued" && edgeAck.result.edgeId === 1000,
      `Slingshot edge must queue authoritatively: ${JSON.stringify(edgeAck)}`);
    const edgeRetry = await sendAction(client, { ...slingshot, clientTimeMs: Date.now() + 500 }, 0);
    assert(edgeRetry.status === edgeAck.status
      && JSON.stringify(edgeRetry.result) === JSON.stringify(edgeAck.result)
      && edgeRetry.deliveryId !== edgeAck.deliveryId,
    "Slingshot exact retry must return cached queue semantics under a fresh delivery");
    await waitFor(async () => {
      const health = await request(ACTION_PORT, "/health");
      return health.body.multiplayer.adapter.queuedMessages >= 2
        && health.body.multiplayer.actions.adjudicated === 1
        && health.body.multiplayer.actions.replays === 1
        ? health : null;
    }, "accepted action retained by delivery id");
    client.ws.send(JSON.stringify({ type: "ack", ackKind: "delivery", deliveryId: edgeAck.deliveryId }));
    client.ws.send(JSON.stringify({ type: "ack", ackKind: "delivery", deliveryId: edgeRetry.deliveryId }));
    await waitFor(async () => {
      const health = await request(ACTION_PORT, "/health");
      return health.body.multiplayer.adapter.queuedMessages
        <= health.body.multiplayer.adapter.eventReplay.pendingEventFrames ? health : null;
    }, "accepted action delivery release");

    const consume = {
      actionId: "reliable-consume", actionSeq: 2, commandSeq: 2,
      actionKind: "consume", payload: { slot: 0 },
    };
    const consumeAckStart = frames(client, "ack").length;
    client.ws.send(JSON.stringify({ type: "action", clientTimeMs: Date.now(), ...consume }));
    client.ws.send(JSON.stringify({ type: "action", clientTimeMs: Date.now() + 750, ...consume }));
    client.ws.send(JSON.stringify({
      type: "action", clientTimeMs: Date.now() + 1,
      actionId: "consume-race", actionSeq: 3, commandSeq: 3,
      actionKind: "inventory", payload: { action: "unloadConsumable", consumableSlot: 0 },
    }));
    const consumeAcks = await waitFor(() => {
      const received = frames(client, "ack").slice(consumeAckStart).filter((entry) => entry.ackKind === "action");
      return received.filter((entry) => entry.actionId === consume.actionId).length === 2
        && received.some((entry) => entry.actionId === "consume-race")
        ? received : null;
    }, "serialized consume retry and inventory race ACKs");
    const [consumeAck, consumeRetry] = consumeAcks.filter((entry) => entry.actionId === consume.actionId);
    const racedInventory = consumeAcks.find((entry) => entry.actionId === "consume-race");
    assert(consumeAck.status === "accepted" && consumeAck.result.itemId === "reliable-fuel",
      `Consumable use must bind the validated item: ${JSON.stringify(consumeAck)}`);
    assert(consumeRetry.status === consumeAck.status
      && JSON.stringify(consumeRetry.result) === JSON.stringify(consumeAck.result)
      && consumeRetry.deliveryId !== consumeAck.deliveryId,
    "Consume exact retry must return cached queue semantics under a fresh delivery");
    assert(racedInventory.status === "rejected" && racedInventory.result.code === "inventory-rejected",
      "Inventory must not replace a pending consumable request");
    await waitFor(async () => (await request(ACTION_PORT, "/health")).body.multiplayer.adapter.queuedMessages >= 3,
      "accepted consume retry and rejected inventory retained by delivery ids");
    client.ws.send(JSON.stringify({ type: "ack", ackKind: "delivery", deliveryId: consumeAck.deliveryId }));
    client.ws.send(JSON.stringify({ type: "ack", ackKind: "delivery", deliveryId: consumeRetry.deliveryId }));
    client.ws.send(JSON.stringify({ type: "ack", ackKind: "delivery", deliveryId: racedInventory.deliveryId }));
    await waitFor(async () => {
      const health = (await request(ACTION_PORT, "/health")).body.multiplayer.adapter;
      return health.queuedMessages <= health.eventReplay.pendingEventFrames;
    }, "rejected action delivery release");
    await waitFor(async () => await playerEventCount(ACTION_PORT, authority, "player.effectUsed") === 1,
      "one consumable consequence");

    const pulse = {
      actionId: "reliable-pulse", actionSeq: 4, commandSeq: 4,
      actionKind: "pulse", payload: {},
    };
    const pulseAck = await sendAction(client, pulse);
    assert(pulseAck.status === "accepted" && pulseAck.result.code === "queued", "Pulse must queue");
    const pulseRetry = await sendAction(client, { ...pulse, clientTimeMs: Date.now() + 1000 });
    assert(pulseRetry.status === pulseAck.status && JSON.stringify(pulseRetry.result) === JSON.stringify(pulseAck.result)
      && pulseRetry.deliveryId !== pulseAck.deliveryId,
    "Same-socket exact retry must return cached semantics under a fresh delivery");
    await waitFor(async () => await playerEventCount(ACTION_PORT, authority, "player.pulse") === 1,
      "one pulse consequence");

    const inventory = {
      actionId: "reliable-inventory", actionSeq: 5, commandSeq: 5,
      actionKind: "inventory", payload: { consumableSlot: 1, action: "unloadConsumable" },
    };
    const inventoryAck = await sendAction(client, inventory);
    assert(inventoryAck.status === "accepted" && inventoryAck.result.code === "applied",
      `Inventory mutation must apply: ${JSON.stringify(inventoryAck)}`);
    await ownerPlayer(client, (player) => player.consumables[1] == null
      && player.cargo.some((item) => item?.id === "reliable-shield"));
    const inventoryRetry = await sendAction(client, {
      ...inventory,
      payload: { action: "unloadConsumable", consumableSlot: 1 },
      clientTimeMs: Date.now() + 2000,
    });
    assert(inventoryRetry.status === "accepted" && inventoryRetry.result.code === "applied",
      "Reordered JSON keys and client time must preserve exact retry identity");
    const laterPulseRetry = await sendAction(client, { ...pulse, clientTimeMs: Date.now() + 3000 });
    assert(laterPulseRetry.status === pulseAck.status
      && JSON.stringify(laterPulseRetry.result) === JSON.stringify(pulseAck.result)
      && laterPulseRetry.deliveryId !== pulseRetry.deliveryId,
    "Retained-window retry after a later action must return cached semantics under a fresh delivery");
    assert(await playerEventCount(ACTION_PORT, authority, "player.pulse") === 1,
      "Retained-window pulse retry must not create a second consequence");

    const payloadConflict = await sendAction(client, {
      ...inventory, payload: { action: "unloadConsumable", consumableSlot: 0 },
    });
    assert(payloadConflict.status === "rejected" && payloadConflict.result.code === "action-id-conflict",
      "Action id reuse with changed payload must conflict");
    const seqConflict = await sendAction(client, {
      actionId: "sequence-conflict", actionSeq: 5, commandSeq: 6,
      actionKind: "pulse", payload: {},
    });
    assert(seqConflict.result.code === "action-seq-conflict", "Consumed action sequence must conflict");
    const gap = await sendAction(client, {
      actionId: "action-gap", actionSeq: 7, commandSeq: 6,
      actionKind: "pulse", payload: {},
    });
    assert(gap.result.code === "action-sequence-gap", "Action gap must be rejected without cursor advance");
    const future = await sendAction(client, {
      actionId: "command-future", actionSeq: 6, commandSeq: 8,
      actionKind: "pulse", payload: {},
    });
    assert(future.result.code === "command-sequence-gap", "Future command cursor must be rejected");

    const staleEdge = await sendAction(client, {
      actionId: "old-edge", actionSeq: 6, commandSeq: 6,
      actionKind: "slingshotEdge", payload: { edgeId: 999 },
    });
    assert(staleEdge.status === "rejected" && staleEdge.result.code === "stale-slingshot-edge",
      "Slingshot uniqueness must remain monotonic beyond the consumed-edge ring");

    const httpInput = await request(ACTION_PORT, "/input", {
      method: "POST",
      authority,
      body: command(authority, 7, { seq: 1, moveX: 0, moveY: 0, thrust: 0, brake: 0 }),
    });
    assert(httpInput.status === 200 && httpInput.body.acceptedCommandSeq === 7,
      "HTTP commands must interleave on the shared authoritative command cursor");
    const staleCommand = await sendAction(client, {
      actionId: "stale-http-command", actionSeq: 7, commandSeq: 7,
      actionKind: "consume", payload: { slot: 9 },
    });
    assert(staleCommand.status === "rejected" && staleCommand.result.code === "stale-command",
      "An HTTP-consumed command sequence must reject a stale unknown stream action without advancing");
    const afterHttp = await sendAction(client, {
      actionId: "after-http", actionSeq: 7, commandSeq: 8,
      actionKind: "consume", payload: { slot: 9 },
    });
    assert(afterHttp.status === "rejected" && afterHttp.result.code === "invalid-consumable-slot",
      "Deterministic gameplay rejection must adjudicate the next shared cursor");
    client.ws.send(JSON.stringify({ type: "ack", ackKind: "delivery", deliveryId: afterHttp.deliveryId }));

    const resumeTicket = await issueTicket(ACTION_PORT, authority, "resume");
    resumed = await openBoundClient(ACTION_PORT, resumeTicket.body.ticket, "resume");
    const resumedWelcome = frame(resumed, "welcome");
    authority = resumedWelcome;
    await waitFor(() => client.close, "action socket epoch fence");
    const reconnectRetry = await sendAction(resumed, {
      actionId: "after-http", actionSeq: 7, commandSeq: 8,
      actionKind: "consume", payload: { slot: 9 },
    });
    assert(reconnectRetry.status === "rejected" && reconnectRetry.result.code === "invalid-consumable-slot",
      "Reconnect exact retry must recover cached rejected semantics");
    assert(frame(resumed, "welcome").lastActionSeq === 7 && frame(resumed, "welcome").lastCommandSeq === 8,
      "Reconnect welcome must expose authoritative action and command cursors");
    resumed.ws.send(JSON.stringify({ type: "ack", ackKind: "delivery", deliveryId: reconnectRetry.deliveryId }));

    for (let actionSeq = 8; actionSeq <= 36; actionSeq += 1) {
      const rejected = await sendAction(resumed, {
        actionId: `receipt-fill-${actionSeq}`,
        actionSeq,
        commandSeq: actionSeq + 1,
        actionKind: "consume",
        payload: { slot: 9 },
      });
      assert(rejected.status === "rejected" && rejected.result.code === "invalid-consumable-slot",
        `Receipt filler ${actionSeq} must be deterministically adjudicated`);
      resumed.ws.send(JSON.stringify({ type: "ack", ackKind: "delivery", deliveryId: rejected.deliveryId }));
    }
    const staleEvicted = await sendAction(resumed, {
      actionId: "evicted-stale-action", actionSeq: 1, commandSeq: 38,
      actionKind: "pulse", payload: {},
    });
    assert(staleEvicted.status === "rejected" && staleEvicted.result.code === "stale-action",
      "An unknown action older than the bounded receipt window must reject as stale without gameplay mutation");

    const debugState = await request(ACTION_PORT, "/debug/player-state", {
      method: "POST",
      body: { clientId: authority.playerId, wx: 2.5, wy: 2.5, vx: 0, vy: 0 },
    });
    await request(ACTION_PORT, "/debug/portal-state", {
      method: "POST",
      body: { id: "reliable-exit", wx: debugState.body.player.wx, wy: debugState.body.player.wy, alive: true, lifespan: 60 },
    });
    await ownerPlayer(resumed, (player) => player.portalInteraction?.portalId === "reliable-exit");
    const extract = await sendAction(resumed, {
      actionId: "reliable-extract", actionSeq: 37, commandSeq: 38,
      actionKind: "extractConfirm", payload: {},
    }, 0);
    assert(extract.status === "accepted" && extract.result.portalId === "reliable-exit",
      "Extraction confirmation must queue only while authority reports ready");
    const extractRetry = await sendAction(resumed, {
      actionId: "reliable-extract", actionSeq: 37, commandSeq: 38,
      actionKind: "extractConfirm", payload: {}, clientTimeMs: Date.now() + 900,
    }, 0);
    assert(extractRetry.status === extract.status
      && JSON.stringify(extractRetry.result) === JSON.stringify(extract.result)
      && extractRetry.deliveryId !== extract.deliveryId,
    "Extraction exact retry must return cached queue semantics under a fresh delivery");
    await waitFor(async () => {
      const snapshot = await request(ACTION_PORT, `/snapshot?runId=${encodeURIComponent(authority.runId)}`, { authority });
      return snapshot.body.players?.find((player) => player.clientId === authority.playerId)?.status === "escaped";
    }, "authoritative extraction consequence");
    assert(await playerEventCount(ACTION_PORT, authority, "player.portalConfirmed") === 1
      && await playerEventCount(ACTION_PORT, authority, "player.escaped") === 1,
    "Extraction exact retry must produce one portal confirmation and one escape consequence");

    const health = await request(ACTION_PORT, "/health");
    assert(health.body.multiplayer.actions.capacityPerMembership === 32
      && health.body.multiplayer.actions.replays >= 3
      && health.body.multiplayer.actions.conflicts >= 2
      && health.body.multiplayer.actions.gaps >= 2
      && health.body.multiplayer.actions.stale >= 2
      && health.body.multiplayer.actions.evicted >= 1
      && health.body.multiplayer.actions.retained === 32,
    `Action receipt metrics must expose bounded replay/conflict/gap evidence: ${JSON.stringify(health.body.multiplayer.actions)}`);
    assert(health.body.multiplayer.actions.rejected >= 2,
      "Rejected action metrics must remain visible independently of transport delivery release");

    const reset = await request(ACTION_PORT, "/session/reset", {
      method: "POST",
      authority,
      body: command(authority, 39, { requesterId: authority.playerId }),
    });
    const resetJoin = await request(ACTION_PORT, "/join", {
      method: "POST",
      body: { runId: reset.body.session.runId, clientId: authority.playerId, joinTicket: reset.body.joinTicket },
    });
    const resetTicket = await issueTicket(ACTION_PORT, resetJoin.body.authority);
    resetClient = await openBoundClient(ACTION_PORT, resetTicket.body.ticket);
    const cleanReceipt = await sendAction(resetClient, {
      actionId: "after-http", actionSeq: 1, commandSeq: 1,
      actionKind: "consume", payload: { slot: 9 },
    });
    assert(cleanReceipt.result.code === "invalid-consumable-slot"
      && frame(resetClient, "welcome").lastActionSeq === 0,
    "New run must start a clean receipt lineage even when an old action id is reused");
    const descendingEdges = await request(ACTION_PORT, "/input", {
      method: "POST",
      authority: resetJoin.body.authority,
      body: command(resetJoin.body.authority, 2, {
        seq: 1, moveX: 0, moveY: 0, thrust: 0, brake: 0,
        slingshotEdges: [2000, 1999],
      }),
    });
    assert(descendingEdges.status === 200
      && JSON.stringify(descendingEdges.body.acceptedSlingshotEdges) === JSON.stringify([2000]),
    `HTTP slingshot batches must retain a monotonic edge cursor: ${JSON.stringify(descendingEdges.body)}`);
    const interleavedOldEdge = await sendAction(resetClient, {
      actionId: "http-ws-old-edge", actionSeq: 2, commandSeq: 3,
      actionKind: "slingshotEdge", payload: { edgeId: 1999 },
    });
    assert(interleavedOldEdge.status === "rejected" && interleavedOldEdge.result.code === "stale-slingshot-edge",
      "A lower edge discarded by HTTP batching must remain stale on the WebSocket action lane");
  } finally {
    await closeClient(client);
    await closeClient(resumed);
    await closeClient(resetClient);
    await stopSimServer(ACTION_PORT).catch(() => null);
  }
}

function percentile(values, quantile) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * quantile))];
}

function commonSnapshotId(clients) {
  const sets = clients.map((client) => {
    const ownerIds = new Set(frames(client, "ownerState").map((entry) => entry.snapshotId));
    return new Set(frames(client, "publicState")
      .filter((entry) => ownerIds.has(entry.snapshotId))
      .map((entry) => entry.snapshotId));
  });
  if (sets.some((set) => set.size === 0)) return null;
  return [...sets[0]].filter((id) => sets.every((set) => set.has(id))).sort((a, b) => b - a)[0] || null;
}

function publicPlayer(publicFrame, playerId) {
  return publicFrame?.state?.players?.find((player) => player.clientId === playerId);
}

async function runSecurityFixture() {
  const marker = "FORGED-TICKET-MARKER-MUST-NOT-LEAK";
  await startSimServer(SECURITY_PORT, {
    keepAlive: true,
    env: {
      LBH_SIM_WS_ENABLED: "true",
      LBH_SIM_WS_TEST_TICKET_TTL_MS: "80",
    },
  });
  let accepted = null;
  try {
    const started = await request(SECURITY_PORT, "/session/start", {
      method: "POST",
      body: { mapId: "shallows", requesterId: "security-a", requesterName: "Security A", maxPlayers: 1 },
    });
    const joined = await request(SECURITY_PORT, "/join", {
      method: "POST",
      body: {
        runId: started.body.session.runId,
        clientId: "security-a",
        joinTicket: started.body.joinTicket,
        name: "Security A",
      },
    });
    const authority = joined.body.authority;

    const unauthenticated = await request(SECURITY_PORT, "/multiplayer/ticket", {
      method: "POST",
      body: { kind: "admission" },
    });
    assert(unauthenticated.status !== 200, "Unauthenticated ticket issuance must fail");

    const forged = await issueTicket(SECURITY_PORT, authority, "admission", {
      membershipId: marker,
    });
    assert(forged.status === 400 && forged.body.code === "caller-claims-forbidden",
      `Caller-selected ticket claims must fail: ${JSON.stringify(forged.body)}`);
    assert(!JSON.stringify(forged.body).includes(marker), "Forged marker leaked through ticket error");

    const expiring = await issueTicket(SECURITY_PORT, authority);
    assert(expiring.status === 200, "Expected short-lived admission ticket");
    await waitFor(() => Date.now() > expiring.body.expiresAt, "ticket expiry deadline", 1000);
    const expired = await openBoundClient(SECURITY_PORT, expiring.body.ticket);
    await waitFor(() => expired.close, "expired ticket close");
    assert(expired.close.code === 4401 && !expired.raw.join("\n").includes(expiring.body.ticket),
      "Expired ticket must fail with sanitized admission close");

    const reusable = await issueTicket(SECURITY_PORT, authority);
    accepted = await openBoundClient(SECURITY_PORT, reusable.body.ticket);
    assert(frame(accepted, "welcome") && frame(accepted, "rebase"), "Expected first ticket redemption");
    const reused = await openBoundClient(SECURITY_PORT, reusable.body.ticket);
    await waitFor(() => reused.close, "reused ticket close");
    assert(reused.close.code === 4401, "Reused ticket must fail admission");

    const crossRun = await issueTicket(SECURITY_PORT, authority);
    const reset = await request(SECURITY_PORT, "/session/reset", {
      method: "POST",
      authority,
      body: command(authority, 1, { requesterId: authority.playerId }),
    });
    assert(reset.status === 200 && reset.body.session.runId !== authority.runId, "Expected run reset");
    await waitFor(() => accepted.close, "old socket reset fence");
    assert(accepted.close.code === 4003, "Run reset must fence the old socket");
    const staleRunTicket = await openBoundClient(SECURITY_PORT, crossRun.body.ticket);
    await waitFor(() => staleRunTicket.close, "cross-run ticket close");
    assert(staleRunTicket.close.code === 4401, "Cross-run ticket must fail admission");

    const health = await request(SECURITY_PORT, "/health");
    const logs = fs.existsSync(simLogFile(SECURITY_PORT)) ? fs.readFileSync(simLogFile(SECURITY_PORT), "utf8") : "";
    const observable = JSON.stringify({ health: health.body, logs, errors: [expired.raw, reused.raw, staleRunTicket.raw] });
    assert(!observable.includes(marker), "Supplied marker leaked into health, logs, errors, or close frames");
    assert(health.body.multiplayer.adapter.maxConnections === 16
      && health.body.multiplayer.adapter.maxPendingHello === 8,
    "Runtime must expose the intentional 8-player plus bounded-resume caps");

    await Promise.all([expired, reused, staleRunTicket].map(closeClient));
  } finally {
    await closeClient(accepted);
    await stopSimServer(SECURITY_PORT).catch(() => null);
  }
}

async function runProjectionLineageFixture() {
  let oldClient = null;
  let newClient = null;
  await startSimServer(LINEAGE_PORT, {
    keepAlive: true,
    env: {
      LBH_SIM_WS_ENABLED: "true",
      LBH_SIM_WS_TEST_PROJECTION_DELAY_MS: "600",
    },
  });
  try {
    const started = await request(LINEAGE_PORT, "/session/start", {
      method: "POST",
      body: { mapId: "shallows", requesterId: "lineage-a", requesterName: "Lineage A", maxPlayers: 1 },
    });
    const joined = await request(LINEAGE_PORT, "/join", {
      method: "POST",
      body: {
        runId: started.body.session.runId,
        clientId: "lineage-a",
        joinTicket: started.body.joinTicket,
        name: "Lineage A",
      },
    });
    const authority = joined.body.authority;
    const ticket = await issueTicket(LINEAGE_PORT, authority);
    oldClient = await openBoundClient(LINEAGE_PORT, ticket.body.ticket);
    await waitFor(async () => {
      const health = await request(LINEAGE_PORT, "/health");
      return health.body.multiplayer.projection.inFlight ? health : null;
    }, "old-run delayed projection");

    const reset = await request(LINEAGE_PORT, "/session/reset", {
      method: "POST",
      authority,
      body: command(authority, 1, { requesterId: authority.playerId }),
    });
    assert(reset.status === 200 && reset.body.session.runId !== authority.runId,
      "Delayed projection fixture must rotate run lineage");
    await waitFor(() => oldClient.close, "old delayed socket reset fence");

    const newJoin = await request(LINEAGE_PORT, "/join", {
      method: "POST",
      body: {
        runId: reset.body.session.runId,
        clientId: "lineage-b",
        joinTicket: reset.body.joinTicket,
        name: "Lineage B",
      },
    });
    const newTicket = await issueTicket(LINEAGE_PORT, newJoin.body.authority);
    newClient = await openBoundClient(LINEAGE_PORT, newTicket.body.ticket);
    const serialized = await waitFor(async () => {
      const health = await request(LINEAGE_PORT, "/health");
      return health.body.multiplayer.projection.skippedBeats > 0 ? health : null;
    }, "new run waits behind old projection");
    const during = serialized.body.multiplayer.projection;
    assert(during.inFlight === true
      && during.projectedConnections === 0
      && during.accounting.projectionDurationSamples === 0
      && during.accounting.projectionDurationTotalMs === 0
      && during.accounting.pendingReplicationCostMs === 0,
    `Old completion must not charge or unlock new lineage: ${JSON.stringify(during)}`);
    assert(frames(newClient, "publicState").length === 1
      && frames(newClient, "ownerState").length === 1,
    "Admission may send only its atomic baseline while the delayed old projection settles");

    await waitFor(() => frame(newClient, "publicState"), "serialized new-run projection", 3500);
    const completedHealth = await waitFor(async () => {
      const health = await request(LINEAGE_PORT, "/health");
      return health.body.multiplayer.projection.accounting.projectionDurationSamples >= 1 ? health : null;
    }, "new-run projection settlement", 3500);
    const completed = completedHealth.body.multiplayer.projection;
    const accounting = completed.accounting;
    assert(completed.projectedConnections === 1
      && accounting.projectionDurationSamples === 1
      && accounting.projectionDurationTotalMs > 0,
    `New lineage must record exactly one completion for its one projected connection: ${JSON.stringify(completed)}`);
    assert(Math.abs(accounting.projectionDurationTotalMs
      - accounting.replicationCostConsumedTotalMs
      - accounting.pendingReplicationCostMs
      - accounting.replicationCostOverflowMs) < 1e-6,
    "Delayed reset must preserve exact-once replication accounting");
  } finally {
    await closeClient(oldClient);
    await closeClient(newClient);
    await stopSimServer(LINEAGE_PORT).catch(() => null);
  }
}

async function runCohort(count, { proveResumeAndReset = false, proveLiveShutdown = false } = {}) {
  const port = COHORT_PORTS[count];
  const clients = [];
  const inputLatencies = [];
  await startSimServer(port, { keepAlive: true, env: { LBH_SIM_WS_ENABLED: "true" } });
  try {
    const started = await request(port, "/session/start", {
      method: "POST",
      body: {
        mapId: "shallows",
        requesterId: `ws-${count}-0`,
        requesterName: `WS ${count} Pilot 0`,
        maxPlayers: count,
        seed: 8840 + count,
      },
    });
    assert(started.status === 200, `Expected ${count}-client session start`);
    const runId = started.body.session.runId;
    const authorities = [];
    const markers = [];
    for (let index = 0; index < count; index += 1) {
      const marker = `private-profile-${count}-${index}`;
      markers.push(marker);
      const joined = await request(port, "/join", {
        method: "POST",
        body: {
          runId,
          clientId: `ws-${count}-${index}`,
          joinTicket: index === 0 ? started.body.joinTicket : undefined,
          name: `WS ${count} Pilot ${index}`,
          profileId: marker,
          profileSnapshot: { id: marker, name: `WS ${count} Pilot ${index}`, shipType: "drifter" },
        },
      });
      assert(joined.status === 200, `Expected HTTP cold join ${index + 1}/${count}`);
      authorities.push(joined.body.authority);
    }

    const issued = await Promise.all(authorities.map((authority) => issueTicket(port, authority)));
    assert(issued.every((entry) => entry.status === 200), "Every authority must receive an admission ticket");
    for (let index = 0; index < count; index += 1) {
      clients.push(await openBoundClient(port, issued[index].body.ticket));
    }
    assert(clients.every((client) => frame(client, "welcome") && frame(client, "rebase")),
      "Every client must receive strict welcome and initial rebase");

    await waitFor(() => clients.every((client) => frames(client, "publicState").length >= 2),
      `${count}-client first measured projection`);
    await waitFor(async () => {
      const health = await request(port, "/health");
      return health.body.multiplayer.projection.accounting.projectionDurationSamples >= 1 ? health : null;
    }, `${count}-client projection accounting`);
    const sharedSnapshotId = await waitFor(() => commonSnapshotId(clients), `${count}-client aligned projection`);
    for (let index = 0; index < count; index += 1) {
      const publicState = frame(clients[index], "publicState", (entry) => entry.snapshotId === sharedSnapshotId);
      const ownerState = frame(clients[index], "ownerState", (entry) => entry.snapshotId === sharedSnapshotId);
      assert(publicState?.runId === runId && Number.isSafeInteger(publicState.snapshotId),
        "Public projection must carry real run and snapshot lineage");
      assert(ownerState?.snapshotId === publicState.snapshotId
        && ownerState.tick === publicState.tick
        && ownerState.simTime === publicState.simTime
        && ownerState.lastEventSeq === publicState.lastEventSeq
        && ownerState.fieldRevision === publicState.fieldRevision,
      `Public and owner projection watermarks must align: ${JSON.stringify({ public: publicState && { snapshotId: publicState.snapshotId, tick: publicState.tick, simTime: publicState.simTime, lastEventSeq: publicState.lastEventSeq, fieldRevision: publicState.fieldRevision }, owner: ownerState && { snapshotId: ownerState.snapshotId, tick: ownerState.tick, simTime: ownerState.simTime, lastEventSeq: ownerState.lastEventSeq, fieldRevision: ownerState.fieldRevision } })}`);
      assert(ownerState.membershipId === authorities[index].membershipId
        && ownerState.playerId === authorities[index].playerId
        && ownerState.state.profileId === markers[index],
      "Owner projection must bind only the redeemed membership's private state");
      const publicWire = JSON.stringify(publicState);
      assert(!markers.some((marker) => publicWire.includes(marker)), "Public state leaked a private profile marker");
      for (let rival = 0; rival < count; rival += 1) {
        if (rival !== index) {
          assert(!clients[index].raw.join("\n").includes(markers[rival]),
            `Rival private marker ${rival} crossed into client ${index}`);
        }
      }
    }

    const initialPositions = clients.map((client, index) => {
      const baseline = frame(client, "publicState", (entry) => entry.snapshotId === sharedSnapshotId);
      const player = publicPlayer(baseline, authorities[index].playerId);
      return { wx: player.wx, wy: player.wy };
    });
    const sends = new Map();
    for (let index = 0; index < count; index += 1) {
      for (let inputSeq = 1; inputSeq <= 3; inputSeq += 1) {
        sends.set(`${index}:${inputSeq}`, Date.now());
        clients[index].ws.send(JSON.stringify({
          type: "input",
          inputSeq,
          moveX: 1,
          moveY: 0,
          thrust: 1,
          brake: 0,
          slingshot: false,
          ability1: inputSeq === 3,
          ability2: false,
          clientTimeMs: Date.now(),
        }));
      }
    }
    await waitFor(() => clients.every((client) => frames(client, "ack").filter((entry) => entry.ackKind === "input").length >= 3),
      `${count}-client input acknowledgements`);
    for (let index = 0; index < count; index += 1) {
      const acks = frames(clients[index], "ack").filter((entry) => entry.ackKind === "input").slice(0, 3);
      assert(acks.map((entry) => entry.inputSeq).join(",") === "1,2,3", "Input ACKs must be monotonic");
      for (const ack of acks) inputLatencies.push(ack._receivedAt - sends.get(`${index}:${ack.inputSeq}`));
    }
    await waitFor(() => clients.every((client, index) => {
      const owner = [...frames(client, "ownerState")].reverse().find((entry) => entry.lastInputSeq === 3);
      const latestPublic = frames(client, "publicState").at(-1);
      const player = publicPlayer(latestPublic, authorities[index].playerId);
      const initial = initialPositions[index];
      return owner && player && Math.hypot(player.wx - initial.wx, player.wy - initial.wy) > 0.001;
    }), `${count}-client authoritative input integration`);

    const tickStart = await request(port, "/health");
    assert(tickStart.body.session.baseSnapshotHz === 10 && tickStart.body.session.baseTickHz === 15,
      "Shallows must retain its declared NORMAL 15Hz authority and 10Hz projection clocks");
    assert(tickStart.body.session.overloadState === "NORMAL"
      && tickStart.body.session.snapshotHz === 10
      && tickStart.body.session.tickHz === 15,
    `Shallows cadence gate must begin at declared NORMAL clocks: ${JSON.stringify(tickStart.body.session)}`);
    const cadenceStart = clients.map((client) => frames(client, "publicState").length);
    const cadenceStartedAt = Date.now();
    await waitFor(() => clients.every((client, index) =>
      frames(client, "publicState").length >= cadenceStart[index] + 11
    ), `${count}-client projection cadence`, 3500);
    const tickEnd = await request(port, "/health");
    const cadenceEndedAt = Date.now();
    const cadenceElapsedMs = cadenceEndedAt - cadenceStartedAt;
    const projectionRates = clients.map((client, index) =>
      (frames(client, "publicState").length - cadenceStart[index]) * 1000 / cadenceElapsedMs
    );
    const observedProjectionHz = projectionRates.reduce((sum, value) => sum + value, 0) / projectionRates.length;
    const observedTickHz = (tickEnd.body.tick - tickStart.body.tick) * 1000 / (cadenceEndedAt - cadenceStartedAt);
    assert(tickEnd.body.session.overloadState === "NORMAL"
      && tickEnd.body.session.snapshotHz === 10
      && tickEnd.body.session.tickHz === 15,
    `Shallows cadence gate must end at declared NORMAL clocks: ${JSON.stringify(tickEnd.body.session)}`);
    const projectionFloor = tickStart.body.session.baseSnapshotHz * 0.85;
    const projectionCeiling = tickStart.body.session.baseSnapshotHz * 1.2;
    const tickFloor = tickStart.body.session.baseTickHz * 0.85;
    const tickCeiling = tickStart.body.session.baseTickHz * 1.2;
    assert(observedProjectionHz >= projectionFloor && observedProjectionHz <= projectionCeiling,
      `Expected loaded Shallows projection near declared 10Hz target, got ${observedProjectionHz.toFixed(2)}; health=${JSON.stringify({ overloadStart: tickStart.body.session.overloadState, overloadEnd: tickEnd.body.session.overloadState, multiplayer: tickEnd.body.multiplayer })}`);
    assert(observedTickHz >= tickFloor && observedTickHz <= tickCeiling,
      `Expected loaded Shallows authority tick near declared 15Hz target, got ${observedTickHz.toFixed(2)}`);

    const actionClient = clients[0];
    actionClient.ws.send(JSON.stringify({
      type: "action",
      actionId: `baseline-reject-${count}`,
      actionSeq: 1,
      commandSeq: 1,
      actionKind: "pulse",
      payload: {},
      clientTimeMs: Date.now(),
    }));
    const actionAck = await waitFor(() => frame(actionClient, "ack", (entry) => entry.ackKind === "action"),
      "reliable action acceptance");
    assert(actionAck.status === "accepted" && actionAck.result?.code === "queued"
      && Number.isSafeInteger(actionAck.deliveryId),
    "Admitted actions must be explicitly and reliably acknowledged");
    const retainedActionHealth = await waitFor(async () => {
      const health = await request(port, "/health");
      return health.body.multiplayer.adapter.queuedMessages >= 1 ? health : null;
    }, "retained action rejection");
    actionClient.ws.send(JSON.stringify({ type: "ack", ackKind: "delivery", deliveryId: actionAck.deliveryId }));
    await waitFor(async () => {
      const health = await request(port, "/health");
      return health.body.multiplayer.adapter.queuedMessages
        <= health.body.multiplayer.adapter.eventReplay.pendingEventFrames ? health : null;
    }, "delivery ACK release");

    let resumeFacts = null;
    if (proveResumeAndReset) {
      const oldClient = clients[0];
      const oldWelcome = frame(oldClient, "welcome");
      const futureResumeTicket = await issueTicket(port, oldWelcome, "resume");
      assert(futureResumeTicket.status === 200, "Expected future-cursor resume ticket");
      const futureResume = await openBoundClient(port, futureResumeTicket.body.ticket, "resume", {
        lastRunId: runId,
        lastSnapshotId: tickEnd.body.snapshotRing.lastSnapshotId + 100,
        lastEventSeq: tickEnd.body.eventJournal.lastSeq + 100,
      });
      await waitFor(() => futureResume.close, "future resume cursor rejection");
      assert(futureResume.close.code === 4400
        && frame(futureResume, "error")?.code === "future-recovery-cursor",
      "Future resume cursors must fail before rotating connection authority");
      oldClient.ws.send(JSON.stringify({
        type: "input",
        inputSeq: 4,
        moveX: 1,
        moveY: 0,
        thrust: 1,
        brake: 0,
        slingshot: false,
        ability1: false,
        ability2: false,
        clientTimeMs: Date.now(),
      }));
      await waitFor(() => frame(oldClient, "ack", (entry) => entry.ackKind === "input" && entry.inputSeq === 4),
        "old authority survives rejected future resume");
      const resumeTicket = await issueTicket(port, oldWelcome, "resume");
      assert(resumeTicket.status === 200, "Expected authenticated resume ticket");
      const resumed = await openBoundClient(port, resumeTicket.body.ticket, "resume", {
        lastRunId: runId,
        lastSnapshotId: sharedSnapshotId,
        lastEventSeq: frame(oldClient, "publicState", (entry) => entry.snapshotId === sharedSnapshotId).lastEventSeq,
      });
      const resumedWelcome = frame(resumed, "welcome");
      assert(resumedWelcome.reconnected === true
        && resumedWelcome.connectionId !== oldWelcome.connectionId
        && resumedWelcome.connectionEpoch === oldWelcome.connectionEpoch + 1
        && resumedWelcome.commandCredential !== oldWelcome.commandCredential,
      "Resume must rotate connection identity, epoch, and credential");
      await waitFor(() => oldClient.close, "old socket resume fence");
      assert(oldClient.close.code === 4003, "Resume must immediately fence the old socket");
      const oldOwnerCount = frames(oldClient, "ownerState").length;
      await waitFor(() => frames(resumed, "ownerState").length >= 2, "resumed owner projections");
      assert(frames(oldClient, "ownerState").length === oldOwnerCount,
        "Fenced socket received owner state after resume");
      clients[0] = resumed;

      const pendingOldRunTicket = await issueTicket(port, resumedWelcome, "admission");
      const reset = await request(port, "/session/reset", {
        method: "POST",
        authority: resumedWelcome,
        body: command(resumedWelcome, resumedWelcome.nextCommandSeq, { requesterId: resumedWelcome.playerId }),
      });
      assert(reset.status === 200 && reset.body.session.runId !== runId, "Expected WebSocket-authority reset");
      await waitFor(() => resumed.close, "reset socket fence");
      assert(resumed.close.code === 4003, "Reset must close the resumed old-run socket");
      const invalidated = await openBoundClient(port, pendingOldRunTicket.body.ticket);
      await waitFor(() => invalidated.close, "reset-invalidated ticket");
      assert(invalidated.close.code === 4401, "Reset must invalidate old-run admission tickets");

      const newJoin = await request(port, "/join", {
        method: "POST",
        body: {
          runId: reset.body.session.runId,
          clientId: resumedWelcome.playerId,
          joinTicket: reset.body.joinTicket,
          name: "WS Reset Pilot",
        },
      });
      const newTicket = await issueTicket(port, newJoin.body.authority, "resume");
      const newClient = await openBoundClient(port, newTicket.body.ticket, "resume", {
        lastRunId: runId,
        lastSnapshotId: 1,
        lastEventSeq: 0,
      });
      assert(frame(newClient, "rebase")?.reason === "run-changed",
        "Equal numeric cursors from another run must force run-changed recovery");
      const newPublic = await waitFor(() => frame(newClient, "publicState"), "new-run public state");
      const newOwner = await waitFor(() => frame(newClient, "ownerState", (entry) => entry.snapshotId === newPublic.snapshotId),
        "new-run owner state");
      assert(newPublic.runId === reset.body.session.runId && newPublic.fieldRevision === 1
        && newOwner.fieldRevision === 1,
      "Reset must establish a new run and field-revision-one lineage");
      resumeFacts = {
        oldConnectionEpoch: oldWelcome.connectionEpoch,
        newConnectionEpoch: resumedWelcome.connectionEpoch,
        resetRunChanged: true,
      };
      await waitFor(async () => {
        const health = await request(port, "/health");
        return health.body.multiplayer.projection.accounting.projectionDurationSamples >= 1 ? health : null;
      }, "new-run measured projection");
      newClient.ws.send(JSON.stringify({
        type: "ack",
        ackKind: "baseline",
        snapshotId: newPublic.snapshotId,
        eventSeq: newPublic.lastEventSeq,
      }));
      newClient.ws.send(JSON.stringify({
        type: "ack",
        ackKind: "baseline",
        snapshotId: Math.max(1, newPublic.snapshotId - 1),
        eventSeq: Math.max(0, newPublic.lastEventSeq - 1),
      }));
      newClient.ws.send(JSON.stringify({
        type: "input",
        inputSeq: 1,
        moveX: 0,
        moveY: 1,
        thrust: 0.5,
        brake: 0,
        slingshot: false,
        ability1: false,
        ability2: false,
        clientTimeMs: Date.now(),
      }));
      await waitFor(() => frame(newClient, "ack", (entry) => entry.ackKind === "input" && entry.inputSeq === 1),
        "regressive recovery cursor ignored without fencing live input");
      newClient.ws.send(JSON.stringify({
        type: "ack",
        ackKind: "baseline",
        snapshotId: newPublic.snapshotId + 100,
        eventSeq: newPublic.lastEventSeq + 100,
      }));
      await waitFor(() => newClient.close, "future baseline cursor rejection");
      assert(newClient.close.code === 4400
        && frame(newClient, "error")?.code === "future-recovery-cursor",
      "Future baseline ACK cursors must close with a sanitized authority error");
      clients[0] = newClient;
      await closeClient(futureResume);
      await closeClient(invalidated);
    }

    const health = await request(port, "/health");
    const accounting = health.body.multiplayer.projection.accounting;
    assert(accounting.projectionDurationSamples > 0
      && accounting.projectionDurationLatestMs >= 0
      && accounting.projectionDurationAverageMs >= 0
      && accounting.projectionDurationWorstMs >= accounting.projectionDurationLatestMs
      && accounting.projectionDurationTotalMs >= accounting.projectionDurationWorstMs,
    `Projection duration diagnostics must be finite and ordered: ${JSON.stringify(accounting)}`);
    assert(accounting.pendingReplicationCostMs >= 0
      && accounting.pendingReplicationCostMs <= accounting.pendingReplicationCostCapMs,
    `Pending replication cost must remain bounded: ${JSON.stringify(accounting)}`);
    assert(Math.abs(accounting.lastCombinedSampledCostMs
      - accounting.lastSimTickCostMs
      - accounting.lastReplicationCostConsumedMs) < 1e-6,
    `Combined overload sample must equal sim plus one consumed replication bucket: ${JSON.stringify(accounting)}`);
    assert(Math.abs(accounting.projectionDurationTotalMs
      - accounting.replicationCostConsumedTotalMs
      - accounting.pendingReplicationCostMs
      - accounting.replicationCostOverflowMs) < 1e-6,
    `Completed projection cost must be consumed, pending, or explicitly overflowed exactly once: ${JSON.stringify(accounting)}`);
    const publicBytes = clients.flatMap((client) => frames(client, "publicState").map((entry) => entry._bytes));
    const ownerBytes = clients.flatMap((client) => frames(client, "ownerState").map((entry) => entry._bytes));
    let shutdownProof = null;
    if (proveLiveShutdown) {
      const liveSocketCount = clients.filter((client) => !client.close).length;
      assert(liveSocketCount === count, "Shutdown proof requires the full cohort to remain connected");
      await stopSimServer(port);
      await waitFor(() => clients.every((client) => client.close), "adapter closes every live socket before process exit");
      const pidFile = path.resolve(__dirname, "..", "tmp", `sim-server-${port}.pid`);
      assert(!fs.existsSync(pidFile), "Sim child PID file remained after ordered shutdown");
      shutdownProof = {
        liveSocketCount,
        closedSocketCount: clients.filter((client) => client.close).length,
        pidFileRemoved: true,
      };
    }
    return {
      humans: count,
      publicFrameBytesP50: percentile(publicBytes, 0.5),
      publicFrameBytesP95: percentile(publicBytes, 0.95),
      ownerFrameBytesP50: percentile(ownerBytes, 0.5),
      ownerFrameBytesP95: percentile(ownerBytes, 0.95),
      observedProjectionHz: Number(observedProjectionHz.toFixed(2)),
      observedTickHz: Number(observedTickHz.toFixed(2)),
      declaredNormalProjectionHz: tickStart.body.session.baseSnapshotHz,
      declaredNormalTickHz: tickStart.body.session.baseTickHz,
      loadedProjectionTargetHzStart: tickStart.body.session.snapshotHz,
      loadedProjectionTargetHzEnd: tickEnd.body.session.snapshotHz,
      loadedTickTargetHzStart: tickStart.body.session.tickHz,
      loadedTickTargetHzEnd: tickEnd.body.session.tickHz,
      overloadModeStart: tickStart.body.session.overloadState,
      overloadModeEnd: tickEnd.body.session.overloadState,
      inputAckCount: inputLatencies.length,
      inputAckLatencyMsP50: percentile(inputLatencies, 0.5),
      inputAckLatencyMsP95: percentile(inputLatencies, 0.95),
      adapterMaxQueuedBytes: Math.max(
        retainedActionHealth.body.multiplayer.projection.maxQueuedBytes,
        health.body.multiplayer.projection.maxQueuedBytes,
      ),
      adapterMaxPendingInboundBytes: health.body.multiplayer.projection.maxPendingInboundBytes,
      projectionDurationSamples: accounting.projectionDurationSamples,
      projectionDurationLatestMs: Number(accounting.projectionDurationLatestMs.toFixed(3)),
      projectionDurationAverageMs: Number(accounting.projectionDurationAverageMs.toFixed(3)),
      projectionDurationWorstMs: Number(accounting.projectionDurationWorstMs.toFixed(3)),
      projectionDurationTotalMs: Number(accounting.projectionDurationTotalMs.toFixed(3)),
      pendingReplicationCostMs: Number(accounting.pendingReplicationCostMs.toFixed(3)),
      replicationCostConsumedTotalMs: Number(accounting.replicationCostConsumedTotalMs.toFixed(3)),
      lastSimTickCostMs: Number(accounting.lastSimTickCostMs.toFixed(3)),
      lastReplicationCostConsumedMs: Number(accounting.lastReplicationCostConsumedMs.toFixed(3)),
      lastCombinedSampledCostMs: Number(accounting.lastCombinedSampledCostMs.toFixed(3)),
      skippedProjectionBeats: health.body.multiplayer.projection.skippedBeats,
      projectionErrors: health.body.multiplayer.projection.errors,
      admissionErrors: health.body.multiplayer.projection.admissionErrors,
      resumeFacts,
      shutdownProof,
    };
  } finally {
    await Promise.all(clients.map(closeClient));
    await stopSimServer(port).catch(() => null);
    let listenerGone = false;
    try {
      await fetch(`http://127.0.0.1:${port}/health`);
    } catch {
      listenerGone = true;
    }
    assert(listenerGone, `Sim listener ${port} remained after shutdown`);
  }
}

async function run() {
  const runner = new TestRunner("MultiplayerWsRuntime");
  const measurements = [];

  await runner.run("default-disabled runtime rejects stream promptly and reports disabled health", async () => {
    await startSimServer(DISABLED_PORT, { keepAlive: true });
    try {
      const health = await request(DISABLED_PORT, "/health");
      assert(health.body.multiplayer.enabled === false && health.body.multiplayer.state === "disabled",
        "Default runtime must report multiplayer WebSocket disabled");
      const attempt = socketClient(DISABLED_PORT);
      await waitFor(() => attempt.error || attempt.unexpectedStatus || attempt.close,
        "prompt disabled /stream rejection", 1500);
      assert(!attempt.opened, "Disabled runtime must not accept /stream");
      await closeClient(attempt);
    } finally {
      await stopSimServer(DISABLED_PORT).catch(() => null);
    }
  });

  await runner.run("ticket issuance, expiry, reuse, run rotation, and diagnostics stay authenticated and secret-free", async () => {
    await runSecurityFixture();
  });

  await runner.run("delayed old-run projection cannot charge, unlock, or overlap the new lineage", async () => {
    await runProjectionLineageFixture();
  });

  await runner.run("reliable gameplay actions are bounded, idempotent, reconnect-safe authority commands", async () => {
    await runReliableActionsFixture();
  });

  await runner.run("event journal recovery is private, replayable, ACK-bounded, and membership-scoped", async () => {
    await runEventRecoveryFixture();
  });

  await runner.run("retention overflow rebases explicitly without replaying a partial tail", async () => {
    await runEventGapFixture();
  });

  await runner.run("each projection replays only through its captured journal upper bound", async () => {
    await runEventUpperBoundFixture();
  });

  for (const count of [1, 4, 8]) {
    await runner.run(`${count} real clients share one tick-coupled authority stream`, async () => {
      const measurement = await runCohort(count, {
        proveResumeAndReset: count === 1,
        proveLiveShutdown: count === 8,
      });
      assert(measurement.projectionErrors === 0, "Projection path must remain error-free");
      measurements.push(measurement);
    });
  }

  console.log("\nWebSocket runtime loopback baseline:");
  console.log(JSON.stringify(measurements, null, 2));
  process.exit(runner.summary() ? 0 : 1);
}

run().catch(async (error) => {
  for (const port of [DISABLED_PORT, SECURITY_PORT, LINEAGE_PORT, ACTION_PORT, EVENT_PORT, EVENT_GAP_PORT, EVENT_UPPER_PORT, ...Object.values(COHORT_PORTS)]) {
    await stopSimServer(port).catch(() => null);
  }
  console.error("MultiplayerWsRuntime test fatal error:", error.stack || error.message);
  process.exit(1);
});
