"use strict";

const http = require("http");
const { WebSocket } = require("ws");
const { createSimWebSocketAdapter } = require("../scripts/sim-ws-adapter.cjs");
const {
  WIRE_PROTOCOL_VERSION,
  SIM_PROTOCOL_VERSION,
  SERVER_TO_CLIENT,
  parseWireFrame,
} = require("../scripts/multiplayer-wire-protocol.cjs");

function waitFor(predicate, { timeout = 2_000, interval = 5, label = "condition" } = {}) {
  const deadline = Date.now() + timeout;
  return new Promise((resolve, reject) => {
    const poll = () => {
      let value;
      try {
        value = predicate();
      } catch (error) {
        reject(error);
        return;
      }
      if (value) return resolve(value);
      if (Date.now() >= deadline) return reject(new Error(`Timed out waiting for ${label}`));
      setTimeout(poll, interval);
    };
    poll();
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function upgradeStatus(url) {
  const ws = new WebSocket(url);
  return new Promise((resolve, reject) => {
    ws.once("unexpected-response", (_request, response) => {
      resolve(response.statusCode);
      ws.terminate();
    });
    ws.once("error", reject);
  });
}

function nextFrame(messages, type, after = -1) {
  return messages.find((frame, index) => index > after && frame.type === type);
}

async function openClient(url, { collect = true } = {}) {
  const ws = new WebSocket(url);
  const messages = [];
  const rawMessages = [];
  const close = { code: null, reason: null };
  if (collect) {
    ws.on("message", (raw) => {
      rawMessages.push(raw.toString());
      messages.push(parseWireFrame(raw, { direction: SERVER_TO_CLIENT }));
    });
  }
  ws.on("close", (code, reason) => {
    close.code = code;
    close.reason = reason.toString();
  });
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  return { ws, messages, rawMessages, close };
}

function hello(ticket) {
  return {
    type: "hello",
    wireVersion: WIRE_PROTOCOL_VERSION,
    simProtocolVersion: SIM_PROTOCOL_VERSION,
    admissionTicket: ticket,
  };
}

function inputFrame(inputSeq = 1) {
  return {
    type: "input",
    inputSeq,
    moveX: 0.6,
    moveY: 0.8,
    thrust: 1,
    brake: 0,
    slingshot: false,
    ability1: false,
    ability2: true,
    clientTimeMs: Date.now(),
  };
}

function actionFrame(actionSeq = 1, commandSeq = 1) {
  return {
    type: "action",
    actionId: `action-${actionSeq}`,
    actionSeq,
    commandSeq,
    actionKind: "pulse",
    payload: {},
    clientTimeMs: Date.now(),
  };
}

function eventFrame(runId, eventSeq, marker = `event-${eventSeq}`) {
  return {
    type: "event",
    runId,
    eventSeq,
    tick: eventSeq,
    visibility: "owner",
    eventType: "test.event",
    payload: { marker },
  };
}

async function createHarness(options = {}) {
  const server = http.createServer((_request, response) => response.writeHead(404).end());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `ws://127.0.0.1:${server.address().port}`;
  const tickets = new Map();
  const bindings = [];
  const inputs = [];
  const actions = [];
  const pongs = [];
  const acks = [];
  const validations = [];
  const callbackContexts = [];
  let snapshotId = 0;
  let redemptionCount = 0;

  function issueTicket(name, overrides = {}) {
    const ticket = overrides.ticket || `ticket-${name}-${Math.random().toString(36).slice(2)}`;
    tickets.set(ticket, {
      name,
      playerId: `player-${name}`,
      membershipId: `membership-${name}`,
      credential: `credential-${name}`,
      expiresAt: Date.now() + 5_000,
      ...overrides,
    });
    return ticket;
  }

  const adapter = createSimWebSocketAdapter({
    server,
    runId: "run-a",
    helloTimeoutMs: options.helloTimeoutMs || 80,
    heartbeatIntervalMs: options.heartbeatIntervalMs || 1_000,
    backpressureTimeoutMs: options.backpressureTimeoutMs || 1_000,
    closeGraceMs: options.closeGraceMs,
    sweepIntervalMs: options.sweepIntervalMs,
    maxConnections: options.maxConnections,
    maxPendingHello: options.maxPendingHello,
    maxPendingInbound: options.maxPendingInbound,
    maxPendingInboundBytes: options.maxPendingInboundBytes,
    maxPendingInboundBytesTotal: options.maxPendingInboundBytesTotal,
    queueOptions: options.queueOptions,
    async redeemHello(frame, context) {
      redemptionCount += 1;
      callbackContexts.push(context);
      if (options.beforeRedeem) await options.beforeRedeem(frame, context);
      const claim = tickets.get(frame.admissionTicket);
      if (!claim || claim.expiresAt <= Date.now()) {
        throw Object.assign(new Error("opaque ticket rejected"), { publicCode: "admission-rejected", closeCode: 4401 });
      }
      tickets.delete(frame.admissionTicket);
      const binding = {
        name: claim.name,
        runId: "run-a",
        playerId: claim.playerId,
        membershipId: claim.membershipId,
        current: true,
        snapshotId: 1,
        lastEventSeq: 0,
      };
      bindings.push(binding);
      const baselinePublic = {
        type: "publicState",
        runId: binding.runId,
        snapshotId: 1,
        tick: 0,
        simTime: 0,
        lastEventSeq: 0,
        fieldRevision: 1,
        overloadMode: "NORMAL",
        lastInputSeq: 0,
        lastActionSeq: 0,
        manifestHash: "sha256:test",
        full: true,
        state: { bodies: [{ id: "public-body", x: 0.25, y: 0.5 }], despawns: [] },
      };
      const baselineOwner = {
        type: "ownerState",
        runId: binding.runId,
        membershipId: binding.membershipId,
        playerId: binding.playerId,
        snapshotId: 1,
        tick: 0,
        simTime: 0,
        lastEventSeq: 0,
        fieldRevision: 1,
        overloadMode: "NORMAL",
        lastInputSeq: 0,
        lastActionSeq: 0,
        state: { privateMarker: `private-${binding.name}` },
      };
      const result = {
        binding,
        welcome: {
          type: "welcome",
          wireVersion: WIRE_PROTOCOL_VERSION,
          simProtocolVersion: SIM_PROTOCOL_VERSION,
          runId: binding.runId,
          membershipId: binding.membershipId,
          playerId: binding.playerId,
          connectionId: `connection-${claim.name}`,
          connectionEpoch: claim.epoch || 1,
          commandCredential: claim.credential,
          lastCommandSeq: 0,
          nextCommandSeq: 1,
          lastInputSeq: 0,
          lastActionSeq: 0,
          heartbeatIntervalMs: options.welcomeHeartbeatIntervalMs || options.heartbeatIntervalMs || 1_000,
          reconnected: false,
        },
        rebase: { type: "rebase", runId: binding.runId, reason: "initial", snapshotId: 1, lastEventSeq: 0 },
        baselineFrames: [
          baselinePublic,
          options.helloOwnerFrameMutation
            ? options.helloOwnerFrameMutation(baselineOwner, binding)
            : baselineOwner,
        ],
      };
      if (options.afterRedeem) await options.afterRedeem(result, context);
      return result;
    },
    async revalidateBinding(binding, context) {
      callbackContexts.push(context);
      validations.push({ name: binding.name, purpose: context.purpose });
      return binding.current;
    },
    async onInput(binding, frame, context) {
      callbackContexts.push(context);
      if (options.beforeInput) await options.beforeInput(binding, frame, context);
      inputs.push({ binding, frame });
      const reply = { type: "ack", ackKind: "input", inputSeq: frame.inputSeq };
      return options.inputReplyMutation ? options.inputReplyMutation(reply, binding, frame) : reply;
    },
    async onAction(binding, frame, context) {
      callbackContexts.push(context);
      if (options.beforeAction) await options.beforeAction(binding, frame, context);
      actions.push({ binding, frame });
      return {
        type: "ack",
        ackKind: "action",
        actionId: frame.actionId,
        actionSeq: frame.actionSeq,
        commandSeq: frame.commandSeq,
        status: "accepted",
        result: { pulsed: true },
      };
    },
    async onPong(binding, frame, context) {
      callbackContexts.push(context);
      pongs.push({ binding, frame });
    },
    async onAck(binding, frame, context) {
      callbackContexts.push(context);
      acks.push({ binding, frame });
    },
    async buildPublicState(context = {}, lifecycleContext) {
      callbackContexts.push(lifecycleContext);
      if (options.beforePublicState) await options.beforePublicState(context, lifecycleContext);
      snapshotId += 1;
      return {
        type: "publicState",
        runId: "run-a",
        snapshotId,
        tick: snapshotId * 2,
        simTime: snapshotId / 10,
        lastEventSeq: snapshotId,
        fieldRevision: 1,
        overloadMode: "NORMAL",
        lastInputSeq: 0,
        lastActionSeq: 0,
        manifestHash: "sha256:test",
        full: true,
        state: context.payload || { bodies: [{ id: "public-body", x: 0.25, y: 0.5 }], despawns: [] },
      };
    },
    async buildOwnerState(binding, publicFrame, _context, lifecycleContext) {
      callbackContexts.push(lifecycleContext);
      if (options.beforeOwnerState) await options.beforeOwnerState(binding, publicFrame, lifecycleContext);
      const frame = {
        type: "ownerState",
        runId: publicFrame.runId,
        membershipId: binding.membershipId,
        playerId: binding.playerId,
        snapshotId: publicFrame.snapshotId,
        tick: publicFrame.tick,
        simTime: publicFrame.simTime,
        lastEventSeq: publicFrame.lastEventSeq,
        fieldRevision: publicFrame.fieldRevision,
        overloadMode: publicFrame.overloadMode,
        lastInputSeq: 0,
        lastActionSeq: 0,
        state: { privateMarker: `private-${binding.name}` },
      };
      return options.ownerFrameMutation ? options.ownerFrameMutation(frame, binding) : frame;
    },
    buildEventRecovery: options.buildEventRecovery,
  });

  async function admit(name, overrides = {}) {
    const ticket = issueTicket(name, overrides);
    const client = await openClient(`${baseUrl}/stream`);
    client.ws.send(JSON.stringify(hello(ticket)));
    await waitFor(
      () => nextFrame(client.messages, "welcome") && nextFrame(client.messages, "rebase"),
      { label: `${name} welcome and rebase` },
    );
    client.binding = bindings.findLast((binding) => binding.name === name);
    return client;
  }

  async function close() {
    await adapter.shutdown();
    await new Promise((resolve) => server.close(resolve));
  }

  return {
    server,
    baseUrl,
    adapter,
    tickets,
    bindings,
    inputs,
    actions,
    pongs,
    acks,
    validations,
    callbackContexts,
    getRedemptionCount: () => redemptionCount,
    issueTicket,
    admit,
    close,
  };
}

module.exports = {
  WIRE_PROTOCOL_VERSION,
  waitFor,
  deferred,
  upgradeStatus,
  nextFrame,
  openClient,
  hello,
  inputFrame,
  actionFrame,
  eventFrame,
  createHarness,
};
