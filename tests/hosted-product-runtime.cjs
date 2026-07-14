"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { HOSTED_SCHEMA_VERSION, wrapHostedRequest } = require("../scripts/hosted-boundary.cjs");
const { ERROR_BODY, validateHostedRuntimeOptions } = require("../scripts/hosted-product-runtime.cjs");
const { listenHostedProductServer } = require("../scripts/hosted-product-server.cjs");

const CONTROL = "control-credential-" + "c".repeat(40);
const WORKLOAD = "workload-credential-" + "w".repeat(40);
const REINCARNATED = "workload-reincarnated-" + "x".repeat(40);
const KEY = "runtime-secret-" + "k".repeat(40);

function token(prefix, value) { return `${prefix}-${crypto.createHash("sha256").update(value).digest("base64url")}`; }
function copy(value) { return structuredClone(value); }

class DurableTransportService {
  constructor(filename, provider) {
    this.db = new DatabaseSync(filename);
    this.db.exec("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS transport_state (singleton INTEGER PRIMARY KEY CHECK(singleton=1), json TEXT NOT NULL)");
    this.provider = provider;
    if (!this.db.prepare("SELECT 1 FROM transport_state WHERE singleton=1").get()) this.save({ sequence: 0, users: {}, access: {}, profiles: {}, matches: {}, allocations: {}, workloads: {}, results: {}, settled: {} });
  }
  close() { this.db.close(); }
  load() { return JSON.parse(this.db.prepare("SELECT json FROM transport_state WHERE singleton=1").get().json); }
  save(value) { this.db.prepare("INSERT INTO transport_state VALUES (1, ?) ON CONFLICT(singleton) DO UPDATE SET json=excluded.json").run(JSON.stringify(value)); }
  tx(fn) { const state = this.load(); const result = fn(state); this.save(state); return copy(result); }
  id(state, prefix) { state.sequence += 1; return `${prefix}_${state.sequence}`; }
  principal(state, accessToken, profileId) {
    const accountId = state.access[accessToken]; const profile = state.profiles[profileId];
    if (!accountId || !profile || profile.accountId !== accountId) throw new Error("rejected");
    return { accountId, profileId };
  }
  exchangeProviderProof(input) {
    return this.tx((state) => {
      const observation = this.provider.verifyGrant(input);
      if (!observation || observation.state !== "active") throw new Error("rejected");
      let user = state.users[observation.subject];
      if (!user) user = state.users[observation.subject] = { accountId: this.id(state, "account") };
      const accessToken = token("access", `${observation.subject}:${input.callbackId}`);
      const refreshToken = token("refresh", `${observation.subject}:${input.callbackId}`);
      state.access[accessToken] = user.accountId;
      return { accessToken, refreshToken };
    });
  }
  refresh(input) { return this.exchangeProviderProof({ provider: "test", proof: input.refreshToken, callbackId: "refresh" }); }
  reconcileEntitlement(input) { this.provider.verifyGrant(input); return { reconciled: true, state: "active" }; }
  createProfile(input) {
    return this.tx((state) => {
      const accountId = state.access[input.accessToken]; if (!accountId) throw new Error("rejected");
      const profileId = this.id(state, "profile"); state.profiles[profileId] = { accountId, displayName: input.displayName };
      return { profileId, displayName: input.displayName };
    });
  }
  clientCreateMatch(input) {
    return this.tx((state) => {
      const principal = this.principal(state, input.accessToken, input.profileId);
      if (!Number.isSafeInteger(input.seatCount) || input.seatCount < 1 || input.seatCount > 4) throw new Error("rejected");
      const matchId = this.id(state, "match"); const joinCode = this.id(state, "join"); const allocationHandle = this.id(state, "allocation");
      state.matches[matchId] = { matchId, joinCode, allocationHandle, seatCount: input.seatCount, state: "ALLOCATING",
        members: [{ ...principal, seatNo: 0, clientIncarnation: input.clientIncarnation, playerAlias: input.playerAlias }] };
      state.allocations[allocationHandle] = { matchId, bootstrap: this.id(state, "bootstrap"), audience: "authority:authority-1", redeemed: false };
      return { matchId, joinCode, seatCount: input.seatCount, state: "ALLOCATING" };
    });
  }
  clientJoinMatch(input) {
    return this.tx((state) => {
      const principal = this.principal(state, input.accessToken, input.profileId);
      const match = Object.values(state.matches).find((row) => row.joinCode === input.joinCode);
      if (!match || match.members.length >= match.seatCount || match.members.length >= 4) throw new Error("rejected");
      if (match.members.some((member) => member.accountId === principal.accountId)) throw new Error("rejected");
      const seatNo = match.members.length; match.members.push({ ...principal, seatNo, clientIncarnation: input.clientIncarnation, playerAlias: input.playerAlias });
      return { matchId: match.matchId, seatNo, joined: true };
    });
  }
  clientAdmission(input) {
    return this.tx((state) => {
      const principal = this.principal(state, input.accessToken, input.profileId); const match = state.matches[input.matchId];
      const member = match?.members.find((row) => row.accountId === principal.accountId && row.profileId === principal.profileId);
      if (!member || !["READY", "ACTIVE"].includes(match.state)) throw new Error("rejected");
      return { ticket: token("ticket", `${match.matchId}:${member.profileId}`), audience: "authority:authority-1", seatNo: member.seatNo };
    });
  }
  controlGetAllocation(input) {
    const state = this.load(); const match = state.matches[input.matchId]; const allocation = match && state.allocations[match.allocationHandle];
    if (!allocation) throw new Error("rejected");
    return { allocationHandle: match.allocationHandle, bootstrap: allocation.bootstrap, audience: allocation.audience };
  }
  workloadRedeem(input) {
    return this.tx((state) => {
      if (input.credential !== "workload-1") throw new Error("rejected");
      const allocation = state.allocations[input.allocationHandle];
      if (!allocation || allocation.redeemed || allocation.bootstrap !== input.bootstrap || allocation.audience !== input.audience) throw new Error("rejected");
      allocation.redeemed = true; const workloadRunHandle = this.id(state, "workload_run");
      state.workloads[workloadRunHandle] = { matchId: allocation.matchId, authorityInstanceId: "authority-1", authorityIncarnation: "incarnation-1", admitted: [] };
      return { workloadRunHandle };
    });
  }
  workload(input, state) {
    const row = state.workloads[input.workloadRunHandle];
    if (!row || input.credential !== "workload-1" || row.authorityIncarnation !== "incarnation-1") throw new Error("rejected");
    return row;
  }
  workloadReady(input) { return this.tx((state) => { const row = this.workload(input, state); state.matches[row.matchId].state = "READY"; return { state: "READY" }; }); }
  workloadHeartbeat(input) { return this.tx((state) => { this.workload(input, state); return { alive: true }; }); }
  workloadRedeemAdmission(input) {
    return this.tx((state) => {
      const row = this.workload(input, state); const match = state.matches[row.matchId];
      const member = match.members.find((candidate) => token("ticket", `${match.matchId}:${candidate.profileId}`) === input.ticket);
      if (!member || row.admitted.includes(member.profileId)) throw new Error("rejected");
      row.admitted.push(member.profileId); match.state = "ACTIVE"; return { admitted: true, seatNo: member.seatNo };
    });
  }
  workloadBeginDrain(input) { return this.tx((state) => { const row = this.workload(input, state); state.matches[row.matchId].state = "DRAINING"; return { state: "DRAINING" }; }); }
  workloadSubmitResult(input) {
    return this.tx((state) => {
      const row = this.workload(input, state); const match = state.matches[row.matchId];
      if (match.state !== "DRAINING" || state.results[row.matchId]) throw new Error("rejected");
      const resultId = this.id(state, "result"); state.results[row.matchId] = { resultId, payload: input.payload }; match.state = "ENDED";
      return { result_id: resultId };
    });
  }
  workloadEnd(input) { const state = this.load(); const row = this.workload(input, state); const result = state.results[row.matchId]; if (!result) throw new Error("rejected"); return { state: "ENDED", acceptedResultId: result.resultId }; }
  controlFenceExpired() { return { fenced: 0 }; }
  controlReplaceMatch() { throw new Error("rejected"); }
  controlDeliverSettlement() { return this.tx((state) => { const pending = Object.entries(state.results).find(([id]) => !state.settled[id]); if (!pending) return null; state.settled[pending[0]] = pending[1].resultId; return { resultId: pending[1].resultId, committed: true }; }); }
}

function request(port, method, url, payload, auth, raw) {
  const body = raw == null ? JSON.stringify(wrapHostedRequest(payload)) : raw;
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: url, headers: {
      "content-type": "application/json", "content-length": Buffer.byteLength(body), ...(auth ? { authorization: `Bearer ${auth}` } : {}),
    } }, (res) => { const chunks = []; res.on("data", (chunk) => chunks.push(chunk)); res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks)) })); });
    req.on("error", reject); req.end(body);
  });
}

function runtimeOptions(service, sqlitePath, provider) {
  const identities = {
    [WORKLOAD]: { credential: "workload-1", authorityInstanceId: "authority-1", authorityIncarnation: "incarnation-1", workloadKeyId: "key-1", credentialBinding: "binding-1" },
    [REINCARNATED]: { credential: "workload-2", authorityInstanceId: "authority-1", authorityIncarnation: "incarnation-2", workloadKeyId: "key-2", credentialBinding: "binding-2" },
  };
  return { mode: "hosted", production: false, service, sqlitePath, providerAdapters: { test: provider },
    diagnosticKey: KEY, hmacKey: KEY, encryptionKey: KEY, tokenKey: KEY, controlToken: CONTROL,
    authenticateWorkloadToken: (value) => identities[value] || null };
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-hosted-runtime-")); const sqlitePath = path.join(root, "hosted.sqlite");
  const provider = { testOnly: true, verifyGrant(input) { if (input.provider !== "test" || !input.proof.startsWith("proof-")) throw new Error("rejected"); return { subject: input.proof.slice(6), state: "active" }; } };
  let service = new DurableTransportService(sqlitePath, provider);
  const options = runtimeOptions(service, sqlitePath, provider);
  assert.throws(() => validateHostedRuntimeOptions({ ...options, production: true }), /test provider forbidden/);
  assert.throws(() => validateHostedRuntimeOptions({ ...options, sqlitePaths: { a: sqlitePath, b: path.join(root, "other.sqlite") } }), /ambiguous sqlite/);
  assert.throws(() => validateHostedRuntimeOptions({ ...options, tokenKey: "short" }), /32 bytes/);
  let server = await listenHostedProductServer(options); let port = server.address().port;
  try {
    const health = await request(port, "GET", "/health", {}, null, "");
    assert.deepEqual(health.body, { ok: true, schemaVersion: HOSTED_SCHEMA_VERSION });
    assert.equal(JSON.stringify(health.body).includes("count"), false);
    const users = [];
    for (const name of ["ada", "bea", "cy", "dee", "eve"]) {
      const exchanged = await request(port, "POST", "/v1/provider/exchange", { provider: "test", proof: `proof-${name}`, callbackId: `callback-${name}` });
      assert.equal(exchanged.status, 200);
      const profiled = await request(port, "POST", "/v1/profile", { displayName: name }, exchanged.body.result.accessToken);
      users.push({ ...exchanged.body.result, ...profiled.body.result });
    }
    const created = await request(port, "POST", "/v1/matches", { profileId: users[0].profileId, seatCount: 4, clientIncarnation: "client-0", playerAlias: "Ada" }, users[0].accessToken);
    assert.equal(created.status, 200); const match = created.body.result;
    for (let i = 1; i < 4; i += 1) assert.equal((await request(port, "POST", "/v1/matches/join", { profileId: users[i].profileId, joinCode: match.joinCode, clientIncarnation: `client-${i}`, playerAlias: `P${i}` }, users[i].accessToken)).status, 200);
    const fifth = await request(port, "POST", "/v1/matches/join", { profileId: users[4].profileId, joinCode: match.joinCode, clientIncarnation: "client-4", playerAlias: "Eve" }, users[4].accessToken);
    assert.equal(fifth.status, 400); assert.deepEqual(fifth.body, ERROR_BODY);
    assert.deepEqual((await request(port, "POST", "/v1/control/sweep", {})).body, ERROR_BODY);
    const allocation = (await request(port, "POST", "/v1/control/allocation", { matchId: match.matchId }, CONTROL)).body.result;
    assert.ok(allocation.bootstrap);
    assert.deepEqual((await request(port, "POST", "/v1/workload/redeem", allocation)).body, ERROR_BODY);
    const redeemed = (await request(port, "POST", "/v1/workload/redeem", allocation, WORKLOAD)).body.result;
    assert.equal((await request(port, "POST", "/v1/workload/ready", { workloadRunHandle: redeemed.workloadRunHandle }, WORKLOAD)).status, 200);
    const reincarnated = await request(port, "POST", "/v1/workload/heartbeat", { workloadRunHandle: redeemed.workloadRunHandle, metrics: { connections: 0, queueDepth: 0, memoryBytes: 1 } }, REINCARNATED);
    assert.deepEqual(reincarnated.body, ERROR_BODY);
    for (const user of users.slice(0, 4)) {
      const admission = (await request(port, "POST", "/v1/matches/admission", { profileId: user.profileId, matchId: match.matchId }, user.accessToken)).body.result;
      assert.equal((await request(port, "POST", "/v1/workload/admit", { workloadRunHandle: redeemed.workloadRunHandle, ticket: admission.ticket }, WORKLOAD)).body.result.admitted, true);
    }
    assert.equal((await request(port, "POST", "/v1/workload/drain", { workloadRunHandle: redeemed.workloadRunHandle }, WORKLOAD)).status, 200);
    const accepted = await request(port, "POST", "/v1/workload/result", { workloadRunHandle: redeemed.workloadRunHandle, payload: { result_version: 1, outcomes: {} } }, WORKLOAD);
    assert.equal(accepted.status, 200);
    assert.equal((await request(port, "POST", "/v1/workload/end", { workloadRunHandle: redeemed.workloadRunHandle }, WORKLOAD)).body.result.state, "ENDED");
    assert.equal((await request(port, "POST", "/v1/control/settlement", {}, CONTROL)).body.result.committed, true);
    const duplicate = await request(port, "POST", "/v1/provider/exchange", {}, null, `{"schemaVersion":"${HOSTED_SCHEMA_VERSION}","schemaVersion":"${HOSTED_SCHEMA_VERSION}","payload":{}}`);
    assert.deepEqual(duplicate.body, ERROR_BODY);
    const oversize = await request(port, "POST", "/v1/provider/exchange", {}, null, JSON.stringify({ schemaVersion: HOSTED_SCHEMA_VERSION, payload: { provider: "test", proof: "x".repeat(300000), callbackId: "x" } }));
    assert.deepEqual(oversize.body, ERROR_BODY);
  } finally { await new Promise((resolve) => server.close(resolve)); service.close(); }

  service = new DurableTransportService(sqlitePath, provider); server = await listenHostedProductServer(runtimeOptions(service, sqlitePath, provider)); port = server.address().port;
  try {
    const state = service.load(); const workloadRunHandle = Object.keys(state.workloads)[0];
    const replay = await request(port, "POST", "/v1/workload/result", { workloadRunHandle, payload: { result_version: 1, outcomes: {} } }, WORKLOAD);
    assert.deepEqual(replay.body, ERROR_BODY);
    assert.equal((await request(port, "POST", "/v1/control/settlement", {}, CONTROL)).body.result, null);
  } finally { await new Promise((resolve) => server.close(resolve)); service.close(); fs.rmSync(root, { recursive: true, force: true }); }
  console.log("hosted product runtime: network auth planes, four seats, bounds, and restart replay PASS");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
