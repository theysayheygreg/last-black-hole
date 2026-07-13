"use strict";

const crypto = require("crypto");
const path = require("path");
const { pathToFileURL } = require("url");
const { WebSocket } = require("ws");
const { TestRunner, assert, startSimServer, stopSimServer } = require("./helpers.cjs");
const { WIRE_PROTOCOL_VERSION, WIRE_PROTOCOL_VERSION_V2, SIM_PROTOCOL_VERSION } = require("../scripts/multiplayer-wire-protocol.cjs");

const PORT = 8894;
const measured = { manifestBytes: 0, v1PublicBytes: 0, v2PublicBytes: 0, savedBytes: 0 };

async function request(path, { method = "GET", body, authority, headers = {} } = {}) {
  const response = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(authority ? {
        "x-lbh-command-credential": authority.commandCredential,
        "x-lbh-player-id": authority.playerId,
        "x-lbh-run-id": authority.runId,
      } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, bytes: Buffer.from(await response.arrayBuffer()) };
}

async function waitFor(check, label, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function open(ticket) {
  const client = { ws: new WebSocket(`ws://127.0.0.1:${PORT}/stream`), frames: [], close: null };
  client.ws.on("message", (raw) => client.frames.push(JSON.parse(raw.toString("utf8"))));
  client.ws.on("close", (code) => { client.close = code; });
  await new Promise((resolve, reject) => { client.ws.once("open", resolve); client.ws.once("error", reject); });
  const v2 = ticket.wireVersion === WIRE_PROTOCOL_VERSION_V2;
  client.ws.send(JSON.stringify({
    type: "hello", wireVersion: ticket.wireVersion, simProtocolVersion: SIM_PROTOCOL_VERSION,
    admissionTicket: ticket.ticket,
    ...(v2 ? { capabilities: ticket.capabilities, manifestSchema: ticket.manifestSchema, manifestHash: ticket.manifestHash } : {}),
  }));
  await waitFor(() => client.frames.find((frame) => frame.type === "welcome") || client.close, "welcome");
  if (!client.frames.find((frame) => frame.type === "welcome")) {
    throw new Error(`Admission closed before welcome: ${client.close}; frames=${JSON.stringify(client.frames)}`);
  }
  return client;
}

async function close(client) {
  if (client?.ws.readyState === WebSocket.OPEN) client.ws.close();
}

async function run() {
  const runner = new TestRunner("MultiplayerSessionManifestRuntime");
  await startSimServer(PORT, { keepAlive: true, env: { LBH_SIM_WS_ENABLED: "true", LBH_SIM_WS_JSON_V2: "true" } });
  const clients = [];
  try {
    const started = await request("/session/start", { method: "POST", body: { mapId: "shallows", requesterId: "manifest-a", maxPlayers: 4 } });
    const session = JSON.parse(started.bytes).session;
    const joinTicket = JSON.parse(started.bytes).joinTicket;
    const joined = await request("/join", { method: "POST", body: { runId: session.runId, clientId: "manifest-a", joinTicket, name: "Manifest A" } });
    const authority = JSON.parse(joined.bytes).authority;
    const joinedB = await request("/join", { method: "POST", body: { runId: session.runId, clientId: "manifest-b", name: "Manifest B" } });
    const authorityB = JSON.parse(joinedB.bytes).authority;
    const joinedC = await request("/join", { method: "POST", body: { runId: session.runId, clientId: "manifest-c", name: "Manifest C" } });
    const authorityC = JSON.parse(joinedC.bytes).authority;

    await runner.run("default ticket and socket remain exact v1 rollback path", async () => {
      const issued = await request("/multiplayer/ticket", { method: "POST", authority, body: { kind: "admission" } });
      const ticket = JSON.parse(issued.bytes);
      assert(ticket.wireVersion === WIRE_PROTOCOL_VERSION && ticket.manifestHash === undefined, "Default ticket must stay v1 without manifest fields");
      const client = await open(ticket); clients.push(client);
      await waitFor(() => client.frames.find((frame) => frame.type === "ownerState"), "v1 owner baseline");
      assert(client.frames.findIndex((frame) => frame.type === "rebase") > client.frames.findIndex((frame) => frame.type === "welcome"), "v1 welcome must retain immediate baseline order");
    });

    await runner.run("v2 fetch is authenticated, content-addressed, cache-stable, and gates all gameplay", async () => {
      const issued = await request("/multiplayer/ticket", {
        method: "POST", authority: authorityB,
        body: { kind: "admission", supportedVersions: [WIRE_PROTOCOL_VERSION_V2, WIRE_PROTOCOL_VERSION], capabilities: ["static-manifest-v1"] },
      });
      const ticket = JSON.parse(issued.bytes);
      assert(ticket.wireVersion === WIRE_PROTOCOL_VERSION_V2 && ticket.manifestCapability, "Server must select and bind v2 plus one initial fetch capability");
      assert(!ticket.fetchPath.includes("?") && !JSON.stringify(ticket).includes(`${ticket.fetchPath}?`), "Fetch URL must contain no capability");
      const premature = await request(ticket.fetchPath, { headers: { authorization: `Bearer ${ticket.manifestCapability}` } });
      assert(premature.response.status === 401, "Capability must not redeem before its exact live admission epoch");
      const client = await open(ticket); clients.push(client);
      const admittedWelcome = client.frames.find((frame) => frame.type === "welcome");
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert(!client.frames.some((frame) => ["rebase", "publicState", "ownerState", "event"].includes(frame.type)), "MANIFEST_REQUIRED must emit no gameplay/private frames");

      const unauthenticated = await request(ticket.fetchPath);
      assert(unauthenticated.response.status === 401, "Missing fetch capability must fail closed");
      const query = await request(`${ticket.fetchPath}?cap=${ticket.manifestCapability}`);
      assert(query.response.status === 404, "Capability in URL must not be accepted");
      const retryIssued = await request("/multiplayer/manifest/retry", {
        method: "POST", authority: authorityB,
        body: { manifestSchema: ticket.manifestSchema, manifestHash: ticket.manifestHash, connectionEpoch: admittedWelcome.connectionEpoch },
      });
      const retryCapability = JSON.parse(retryIssued.bytes).manifestCapability;
      const first = await request(ticket.fetchPath, { headers: { authorization: `Bearer ${retryCapability}` } });
      assert(first.response.status === 200 && first.bytes.length === ticket.manifestBytes, "Fresh retry fetch must return exact advertised bytes");
      assert(`sha256:${crypto.createHash("sha256").update(first.bytes).digest("hex")}` === ticket.manifestHash, "Served-byte hash must match advertisement");
      const manifestText = first.bytes.toString("utf8");
      for (const secret of [authorityB.commandCredential, authorityB.membershipId, authorityB.playerId, ticket.ticket, ticket.manifestCapability, retryCapability]) {
        assert(!manifestText.includes(secret), `Public manifest leaked private marker ${secret}`);
      }
      const replay = await request(ticket.fetchPath, { headers: { authorization: `Bearer ${retryCapability}` } });
      assert(replay.response.status === 401, "Fetch capability must be one-use");
      const health = JSON.parse((await request("/health")).bytes);
      const transfers = health.multiplayer.manifestTransfers;
      assert(transfers.servedFetches === 1 && transfers.servedBytes === ticket.manifestBytes && transfers.rejectedFetches === 3,
        `Cold manifest accounting must count only successful served bytes separately: ${JSON.stringify(transfers)}`);
      assert(!JSON.stringify(transfers).includes(authorityB.membershipId), "Manifest transfer attribution must anonymize membership identity");

      const welcome = admittedWelcome;
      client.ws.send(JSON.stringify({
        type: "manifestAck", manifestSchema: ticket.manifestSchema, manifestHash: ticket.manifestHash,
        manifestBytes: ticket.manifestBytes, connectionEpoch: welcome.connectionEpoch,
      }));
      await waitFor(() => client.frames.find((frame) => frame.type === "ownerState"), "v2 owner baseline");
      const publicFrame = client.frames.find((frame) => frame.type === "publicState");
      assert(publicFrame.manifestHash === ticket.manifestHash, "V2 state must bind the installed manifest");
      const well = publicFrame.state.world.wells.find((entry) => entry.id === "well-1");
      assert(well && well.spinRate === undefined && well.points === undefined && well.wx === undefined && well.wy === undefined,
        `V2 full state must omit manifest-proven static fields while retaining changed dynamics: ${JSON.stringify(well)}`);
      const v1Frames = clients[0].frames.filter((frame) => frame.type === "publicState");
      const closestV1 = v1Frames.reduce((best, candidate) => !best || Math.abs(candidate.tick - publicFrame.tick) < Math.abs(best.tick - publicFrame.tick) ? candidate : best, null);
      measured.manifestBytes = ticket.manifestBytes;
      measured.v1PublicBytes = Buffer.byteLength(JSON.stringify(closestV1));
      measured.v2PublicBytes = Buffer.byteLength(JSON.stringify(publicFrame));
      measured.savedBytes = measured.v1PublicBytes - measured.v2PublicBytes;
      assert(measured.savedBytes > 0, `Static manifest must reduce later v2 projection bytes: ${JSON.stringify(measured)}`);
    });

    await runner.run("manifest metadata ACK without a redeemed fetch proof fails closed", async () => {
      const issued = await request("/multiplayer/ticket", {
        method: "POST", authority: authorityC,
        body: { kind: "admission", supportedVersions: [WIRE_PROTOCOL_VERSION_V2], capabilities: ["static-manifest-v1"] },
      });
      const ticket = JSON.parse(issued.bytes);
      const client = await open(ticket); clients.push(client);
      const welcome = client.frames.find((frame) => frame.type === "welcome");
      client.ws.send(JSON.stringify({
        type: "manifestAck", manifestSchema: ticket.manifestSchema, manifestHash: ticket.manifestHash,
        manifestBytes: ticket.manifestBytes, connectionEpoch: welcome.connectionEpoch,
      }));
      await waitFor(() => client.close, "unproved ACK close");
      assert(!client.frames.some((frame) => frame.type === "ownerState"), "Unproved ACK must not release private baseline");
      const staleFetch = await request(ticket.fetchPath, { headers: { authorization: `Bearer ${ticket.manifestCapability}` } });
      assert(staleFetch.response.status === 401, "Closed admission must invalidate capability use for its old connection epoch");
    });

    await runner.run("SimClient verifies, hydrates, caches, and reconnects v2 while v1 remains live", async () => {
      const { SimClient } = await import(pathToFileURL(path.resolve(__dirname, "../src/sim/sim-client.js")));
      const simClient = new SimClient(`http://127.0.0.1:${PORT}`, {
        transport: "stream",
        WebSocketImpl: WebSocket,
        supportedWireVersions: [WIRE_PROTOCOL_VERSION_V2, WIRE_PROTOCOL_VERSION],
      });
      simClient.runId = session.runId;
      await simClient.join({ name: "Manifest SimClient" });
      assert(simClient.latestSnapshot?.world?.wells?.[0]?.orbitalDir !== undefined, "Client must hydrate omitted static fields before publishing gameplay state");
      assert(simClient._manifestCache.size === 1 && typeof [...simClient._manifestCache.values()][0] === "string"
        && Object.isFrozen(simClient._acceptedManifest) && Object.isFrozen(simClient._acceptedManifest.map.wells),
      "Client must retain exactly one immutable accepted cache entry and parsed manifest");
      const priorEpoch = simClient.connectionEpoch;
      await simClient._connectStream("resume");
      assert(simClient.connectionEpoch === priorEpoch + 1, "Resume must rotate the connection epoch");
      assert(simClient._manifestCache.size === 1, "Same immutable manifest must reuse one byte-identical cache entry");
      assert(clients[0].ws.readyState === WebSocket.OPEN, "Independent v1 socket must remain live during v2 admission/reconnect");
      const v2Epoch = simClient.connectionEpoch;
      simClient.supportedWireVersions = Object.freeze([WIRE_PROTOCOL_VERSION]);
      await simClient._connectStream("resume");
      assert(simClient.connectionEpoch === v2Epoch + 1, "Explicit rollback must use a fresh registry-bound resume epoch");
      assert(simClient.latestSnapshot?.world?.wells?.[0]?.spinRate !== undefined, "Rollback v1 must restore the unchanged full-state shape");
      await simClient.shutdown();
    });
  } finally {
    await Promise.all(clients.map(close));
    await stopSimServer(PORT);
  }
  console.log(`  MEASURED: manifest=${measured.manifestBytes}B v1-public=${measured.v1PublicBytes}B v2-public=${measured.v2PublicBytes}B saved=${measured.savedBytes}B/frame`);
  process.exit(runner.summary() ? 0 : 1);
}

run().catch(async (error) => { console.error(error.stack || error.message); await stopSimServer(PORT).catch(() => {}); process.exit(1); });
