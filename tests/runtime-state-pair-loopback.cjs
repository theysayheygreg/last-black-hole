#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const { WebSocket } = require("ws");
const { TestRunner, assert, startSimServer, stopSimServer } = require("./helpers.cjs");
const { createClientDeltaReceiver } = require("../scripts/client-delta-receiver.cjs");
const { WIRE_PROTOCOL_VERSION_V2, SIM_PROTOCOL_VERSION } = require("../scripts/multiplayer-wire-protocol.cjs");

const PORT = 8906;

async function request(path, { method = "GET", body, authority, headers = {} } = {}) {
  const response = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(authority ? {
      "x-lbh-command-credential": authority.commandCredential,
      "x-lbh-player-id": authority.playerId,
      "x-lbh-run-id": authority.runId,
    } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  return { status: response.status, body: bytes.length ? JSON.parse(bytes.toString("utf8")) : null, bytes };
}

async function waitFor(check, label, timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function run() {
  const runner = new TestRunner("RuntimeStatePairLoopback");
  await startSimServer(PORT, { keepAlive: true, env: {
    LBH_SIM_WS_ENABLED: "true", LBH_SIM_WS_JSON_V2: "true", LBH_SIM_WS_STATE_PAIR_V1: "true",
  } });
  let ws = null;
  try {
    const started = await request("/session/start", { method: "POST", body: {
      mapId: "shallows", requesterId: "state-pair-a", maxPlayers: 4,
    } });
    const joined = await request("/join", { method: "POST", body: {
      runId: started.body.session.runId, clientId: "state-pair-a", joinTicket: started.body.joinTicket,
      name: "State Pair A",
    } });
    const authority = joined.body.authority;

    await runner.run("opt-in runtime binds ticket manifest authority and drives recovery end to end", async () => {
      const issued = await request("/multiplayer/ticket", { method: "POST", authority, body: {
        kind: "admission", supportedVersions: [WIRE_PROTOCOL_VERSION_V2],
        capabilities: ["static-manifest-v1", "state-pair-v1"],
      } });
      assert(issued.status === 200 && issued.body.capabilities.includes("state-pair-v1"), "Runtime must explicitly select state-pair");
      assert(Number.isSafeInteger(issued.body.authorityIncarnation), "Ticket response must bind the per-match authority incarnation");
      const frames = [];
      const rawPairs = [];
      ws = new WebSocket(`ws://127.0.0.1:${PORT}/stream`);
      ws.on("message", (raw) => {
        const text = raw.toString("utf8");
        const frame = JSON.parse(text);
        frames.push(frame);
        if (frame.type === "statePair") rawPairs.push(text);
      });
      await new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
      ws.send(JSON.stringify({
        type: "hello", wireVersion: issued.body.wireVersion, simProtocolVersion: SIM_PROTOCOL_VERSION,
        admissionTicket: issued.body.ticket, capabilities: issued.body.capabilities,
        manifestSchema: issued.body.manifestSchema, manifestHash: issued.body.manifestHash,
      }));
      const welcome = await waitFor(() => frames.find((frame) => frame.type === "welcome"), "state-pair welcome");
      assert(welcome.authorityIncarnation === issued.body.authorityIncarnation, "Welcome must retain ticket authority incarnation");
      const fetched = await request(issued.body.fetchPath, {
        headers: { authorization: `Bearer ${issued.body.manifestCapability}` },
      });
      assert(fetched.status === 200 && fetched.bytes.length === issued.body.manifestBytes, "Manifest capability must redeem after admission");
      assert(`sha256:${crypto.createHash("sha256").update(fetched.bytes).digest("hex")}` === issued.body.manifestHash,
        "Manifest bytes must match the ticket-bound identity");
      ws.send(JSON.stringify({ type: "manifestAck", manifestSchema: issued.body.manifestSchema,
        manifestHash: issued.body.manifestHash, manifestBytes: issued.body.manifestBytes,
        connectionEpoch: welcome.connectionEpoch }));
      await waitFor(() => frames.some((frame) => frame.type === "ownerState"), "legacy admission baseline");
      let firstPairOutcome;
      try {
        firstPairOutcome = await waitFor(() => rawPairs.length >= 1
          ? { accepted: true }
          : frames.find((frame) => frame.type === "error") || null, "state-pair keyframe");
      } catch (error) {
        const health = (await request("/health")).body;
        throw new Error(`${error.message}; frames=${JSON.stringify(frames.map((frame) => frame.type))}; statePair=${JSON.stringify(health.multiplayer?.statePair)}; adapter=${JSON.stringify(health.multiplayer?.adapter?.statePair)}`);
      }
      assert(firstPairOutcome.accepted, `Runtime rejected state-pair projection: ${JSON.stringify(firstPairOutcome)}`);

      const client = createClientDeltaReceiver({ context: {
        matchId: welcome.runId, sessionId: welcome.connectionId,
        authorityIncarnation: welcome.authorityIncarnation, recipientId: welcome.membershipId,
        recipientIncarnation: welcome.connectionEpoch, manifestSchema: welcome.manifestSchema,
        manifestHash: welcome.manifestHash,
      } });
      const first = client.receive(rawPairs[0]);
      assert(first.accepted && rawPairs[0].includes('"kind":"keyframe"'), "First runtime pair must materialize atomically");
      ws.send(JSON.stringify(first.ack));
      let nextIndex = 1;
      let deltaIndex = -1;
      for (let attempt = 0; attempt < 4 && deltaIndex < 0; attempt += 1) {
        await waitFor(() => rawPairs.length > nextIndex, "state-pair delta candidate");
        const parsed = JSON.parse(rawPairs[nextIndex]);
        const received = client.receive(rawPairs[nextIndex]);
        assert(received.accepted, `Runtime pair failed: ${JSON.stringify(received)}`);
        ws.send(JSON.stringify(received.ack));
        if (parsed.public.kind === "delta") deltaIndex = nextIndex;
        nextIndex += 1;
      }
      assert(deltaIndex >= 0, "ACK-based runtime stream must advance to a delta");
      const droppedIndex = nextIndex;
      await waitFor(() => rawPairs.length > droppedIndex + 1, "dropped runtime frame gap");
      const gap = client.receive(rawPairs[droppedIndex + 1]);
      assert(!gap.accepted && gap.recovery?.reason === "frame-gap", "Dropped pair must request keyframe recovery");
      ws.send(JSON.stringify(gap.recovery));
      const beforeRecovery = rawPairs.length;
      await waitFor(() => rawPairs.length > beforeRecovery
        && JSON.parse(rawPairs[rawPairs.length - 1]).public.kind === "keyframe", "recovery keyframe");
      const recovered = client.receive(rawPairs[rawPairs.length - 1]);
      assert(recovered.accepted, `Recovery keyframe failed: ${JSON.stringify(recovered)}`);

      const health = (await request("/health")).body;
      assert(health.multiplayer.statePair.authorityIncarnation === welcome.authorityIncarnation
        && health.multiplayer.statePair.publisher.recipients === 1,
      "Health must expose bounded per-match authority diagnostics without ticket secrets");
      assert(!JSON.stringify(health.multiplayer.statePair).includes(issued.body.ticket), "Diagnostics must not expose ticket material");
      console.log(`  pre-gate runtime pair bytes keyframe=${Buffer.byteLength(rawPairs[0])} delta=${Buffer.byteLength(rawPairs[deltaIndex])}`);
    });
  } finally {
    if (ws?.readyState === WebSocket.OPEN) ws.close();
    await stopSimServer(PORT);
  }
  process.exit(runner.summary() ? 0 : 1);
}

run().catch(async (error) => {
  console.error(error.stack || error.message);
  await stopSimServer(PORT).catch(() => {});
  process.exit(1);
});
