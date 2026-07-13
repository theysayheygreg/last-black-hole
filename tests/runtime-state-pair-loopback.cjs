#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const { WebSocket } = require("ws");
const { TestRunner, assert, startSimServer, stopSimServer } = require("./helpers.cjs");
const { createClientDeltaReceiver, RUNTIME_PUBLIC_COMPONENTS_CAPABILITY } = require("../scripts/client-delta-receiver.cjs");
const { projectionHash } = require("../scripts/canonical-structural-delta.cjs");
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
    LBH_SIM_WS_STATE_PAIR_MIXED_V1: "true",
    LBH_SIM_WS_RUNTIME_PUBLIC_COMPONENTS_V1: "true",
    LBH_SIM_WS_ACK_REJECT_DIAGNOSTICS: "true",
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
      const legacyStatePairTicket = await request("/multiplayer/ticket", { method: "POST", authority, body: {
        kind: "admission", supportedVersions: [WIRE_PROTOCOL_VERSION_V2],
        capabilities: ["static-manifest-v1", "state-pair-v1"],
      } });
      assert(legacyStatePairTicket.status === 200
        && !legacyStatePairTicket.body.capabilities.includes("state-pair-mixed-v1")
        && !legacyStatePairTicket.body.capabilities.includes(RUNTIME_PUBLIC_COMPONENTS_CAPABILITY),
      "state-pair-v1 tickets must not be upgraded to mixed lanes without an explicit request");
      const issued = await request("/multiplayer/ticket", { method: "POST", authority, body: {
        kind: "admission", supportedVersions: [WIRE_PROTOCOL_VERSION_V2],
        capabilities: ["static-manifest-v1", "state-pair-v1", "state-pair-mixed-v1",
          RUNTIME_PUBLIC_COMPONENTS_CAPABILITY],
      } });
      assert(issued.status === 200 && issued.body.capabilities.includes("state-pair-mixed-v1"),
        "Runtime must ticket-bind the separately negotiated mixed state-pair capability");
      assert(issued.body.capabilities.includes(RUNTIME_PUBLIC_COMPONENTS_CAPABILITY),
        "Runtime must ticket-bind the separately gated runtime component capability");
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
      }, capabilities: welcome.capabilities });
      const keyframeStarted = process.hrtime.bigint();
      const first = client.receive(rawPairs[0]);
      const keyframeApplyMs = Number(process.hrtime.bigint() - keyframeStarted) / 1e6;
      assert(first.accepted && rawPairs[0].includes('"kind":"keyframe"'), "First runtime pair must materialize atomically");
      assert(first.state.legacyPublicEntities.length === first.state.public.entities.length
        && first.state.legacyPublicEntities.every((entry) => !Object.keys(entry.value)
          .some((key) => /cargo|inventory|credential|private/i.test(key))),
      "Split runtime components must atomically reconstruct every legacy-visible public entity without private fields");
      ws.send(JSON.stringify(first.ack));
      let nextIndex = 1;
      let mixedIndex = -1;
      let mixedApplyMs = null;
      let mixedFullPairBytes = null;
      let inputSeq = welcome.lastInputSeq;
      for (let attempt = 0; attempt < 80 && mixedIndex < 0; attempt += 1) {
        inputSeq += 1;
        ws.send(JSON.stringify({
          type: "input", inputSeq, moveX: attempt % 2 ? 0.75 : -0.75, moveY: 0.25,
          thrust: 1, brake: 0, slingshot: false, ability1: false, ability2: false,
          clientTimeMs: Date.now(),
        }));
        await waitFor(() => rawPairs.length > nextIndex, "state-pair delta candidate");
        const parsed = JSON.parse(rawPairs[nextIndex]);
        const applyStarted = process.hrtime.bigint();
        const received = client.receive(rawPairs[nextIndex]);
        const applyMs = Number(process.hrtime.bigint() - applyStarted) / 1e6;
        if (!received.accepted) {
          assert(received.recovery, `Runtime rejection must request bounded recovery: ${JSON.stringify(received)}`);
          ws.send(JSON.stringify(received.recovery));
          const recoveryStart = rawPairs.length;
          await waitFor(() => rawPairs.length > recoveryStart
            && JSON.parse(rawPairs[rawPairs.length - 1]).public.kind === "keyframe"
            && JSON.parse(rawPairs[rawPairs.length - 1]).owner.kind === "keyframe", "loop recovery keyframes");
          const recoveryIndex = rawPairs.length - 1;
          const recoveredDuringSearch = client.receive(rawPairs[recoveryIndex]);
          assert(recoveredDuringSearch.accepted,
            `Runtime recovery pair failed: ${JSON.stringify(recoveredDuringSearch)}`);
          ws.send(JSON.stringify(recoveredDuringSearch.ack));
          nextIndex = recoveryIndex + 1;
          continue;
        }
        ws.send(JSON.stringify(received.ack));
        if (parsed.public.kind === "delta" && parsed.owner.kind === "keyframe") {
          mixedIndex = nextIndex;
          mixedApplyMs = applyMs;
          const fullPair = {
            ...parsed,
            public: { kind: "keyframe", schema: received.state.public.schema,
              resultHash: projectionHash(received.state.public), projection: received.state.public },
            owner: { kind: "keyframe", schema: received.state.owner.schema,
              resultHash: projectionHash(received.state.owner), projection: received.state.owner },
          };
          mixedFullPairBytes = Buffer.byteLength(JSON.stringify(fullPair), "utf8");
        }
        nextIndex += 1;
      }
      assert(mixedIndex >= 0,
        `ACK-based runtime stream must reach public-delta + owner-keyframe; got ${rawPairs.map((raw) => {
          const frame = JSON.parse(raw);
          return `${frame.public.kind}+${frame.owner.kind}`;
        }).join(",")}`);
      assert(Buffer.byteLength(rawPairs[mixedIndex]) < mixedFullPairBytes,
        "winning mixed pair must be smaller than the exact same-beat full pair");
      const droppedIndex = nextIndex;
      await waitFor(() => rawPairs.length > droppedIndex + 1, "dropped runtime frame gap");
      const gap = client.receive(rawPairs[droppedIndex + 1]);
      assert(!gap.accepted && gap.recovery?.reason === "frame-gap", "Dropped pair must request keyframe recovery");
      ws.send(JSON.stringify(gap.recovery));
      const beforeRecovery = rawPairs.length;
      await waitFor(() => rawPairs.length > beforeRecovery
        && JSON.parse(rawPairs[rawPairs.length - 1]).public.kind === "keyframe"
        && JSON.parse(rawPairs[rawPairs.length - 1]).owner.kind === "keyframe", "recovery keyframes");
      const recovered = client.receive(rawPairs[rawPairs.length - 1]);
      assert(recovered.accepted, `Recovery keyframe failed: ${JSON.stringify(recovered)}`);

      const health = (await request("/health")).body;
      assert(health.multiplayer.statePair.authorityIncarnation === welcome.authorityIncarnation
        && health.multiplayer.statePair.publisher.recipients === 1,
      "Health must expose bounded per-match authority diagnostics without ticket secrets");
      assert(!JSON.stringify(health.multiplayer.statePair).includes(issued.body.ticket), "Diagnostics must not expose ticket material");
      assert(!Object.keys(health.multiplayer.statePair.publisher.keyframeReasons)
        .some((reason) => reason.startsWith("atomic-kind-alignment:")),
      "mixed capability must remove the measured same-kind alignment fallback");
      assert(health.multiplayer.statePair.runtimePublicComponents.enabledAdmissions === 1
        && health.multiplayer.statePair.publisher.ackRejectDiagnostics.total === 0
        && health.multiplayer.adapter.statePair.ackRejectDiagnostics.total === 0,
      "Normal loopback must expose the opt-in schema and exact-zero bounded ACK rejects");
      console.log(`  S4 pre-gate same-beat bytes full=${mixedFullPairBytes} mixed=${Buffer.byteLength(rawPairs[mixedIndex])}`
        + ` clientApplyMs keyframe=${keyframeApplyMs.toFixed(3)} mixed=${mixedApplyMs.toFixed(3)}`);
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
