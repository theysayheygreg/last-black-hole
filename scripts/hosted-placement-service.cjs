const crypto = require("crypto");
const { createOpaqueTokenCodec } = require("./hosted-placement-token.cjs");

const ACTIVE_STATES = new Set(["ALLOCATING", "READY", "ACTIVE", "DRAINING"]);
const LIVE_STATES = new Set(["READY", "ACTIVE", "DRAINING"]);
const MAX_SEATS = 4;

class HostedPlacementError extends Error {
  constructor(code) {
    super("hosted placement rejected");
    this.name = "HostedPlacementError";
    this.code = code;
  }
}

function reject(code) { throw new HostedPlacementError(code); }

function id(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 160 || value.trim() !== value) reject("INVALID_REQUEST");
  return value;
}

function integer(value, min, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) reject("INVALID_REQUEST");
  return value;
}

function exact(value, allowed, required = allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)) reject("INVALID_REQUEST");
  const keys = Object.keys(value);
  if (keys.some((key) => !allowed.includes(key)) || required.some((key) => !Object.hasOwn(value, key))) reject("INVALID_REQUEST");
  return value;
}

function strings(values, limit = 32, sort = true) {
  if (!Array.isArray(values) || values.length > limit) reject("INVALID_REQUEST");
  const selected = values.map(id);
  if (new Set(selected).size !== selected.length) reject("INVALID_REQUEST");
  return sort ? [...selected].sort() : selected;
}

function equalArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function createHostedPlacementService({
  repository,
  now = Date.now,
  randomBytes = crypto.randomBytes,
  tokenKey,
  diagnosticKey,
  authenticateWorkload,
  authenticateControlPlane,
  logger = () => {},
  bootstrapTtlMs = 15_000,
  ticketTtlMs = 30_000,
  readinessTtlMs = 20_000,
  leaseTtlMs = 10_000,
  measuredPackingLimit = 1,
} = {}) {
  if (!repository || typeof repository.claimPlacement !== "function"
    || typeof repository.consumeTokenAndUpdateRun !== "function"
    || typeof repository.isTokenConsumed !== "function") reject("INVALID_CONFIG");
  if (typeof now !== "function" || typeof randomBytes !== "function") reject("INVALID_CONFIG");
  if (typeof authenticateWorkload !== "function" || typeof authenticateControlPlane !== "function") reject("INVALID_CONFIG");
  if (!Buffer.isBuffer(diagnosticKey) || diagnosticKey.length < 32) reject("INVALID_CONFIG");
  for (const ttl of [bootstrapTtlMs, ticketTtlMs, readinessTtlMs, leaseTtlMs]) integer(ttl, 1, 300_000);
  integer(measuredPackingLimit, 1, 1_024);
  const codec = createOpaqueTokenCodec({ key: tokenKey, randomBytes });

  function time() {
    const value = now();
    if (!Number.isSafeInteger(value) || value < 0) reject("INVALID_CLOCK");
    return value;
  }

  function opaqueId(prefix) {
    const bytes = randomBytes(18);
    if (!Buffer.isBuffer(bytes) || bytes.length !== 18) reject("INVALID_RANDOM_SOURCE");
    return `${prefix}_${bytes.toString("base64url")}`;
  }

  function alias(kind, value) {
    return `${kind}_${crypto.createHmac("sha256", diagnosticKey).update(String(value)).digest("base64url").slice(0, 14)}`;
  }

  function emit(event, fields = {}) {
    const safe = { event };
    for (const [key, value] of Object.entries(fields)) {
      if (!/^(?:code|state|seatCount|candidateCount|activeCount|runAlias|instanceAlias)$/.test(key)) reject("UNSAFE_DIAGNOSTIC");
      safe[key] = value;
    }
    logger(Object.freeze(safe));
  }

  function workload(credential) {
    const trusted = authenticateWorkload(credential);
    if (!trusted || typeof trusted !== "object") reject("WORKLOAD_AUTH_REQUIRED");
    exact(trusted, ["authorityInstanceId", "authorityIncarnation", "region", "artifactSha", "protocolVersion", "manifestHash", "capabilities", "maxMatches", "maxSeats", "workloadKeyId", "endpoint"]);
    return {
      authorityInstanceId: id(trusted.authorityInstanceId),
      authorityIncarnation: id(trusted.authorityIncarnation),
      region: id(trusted.region),
      artifactSha: id(trusted.artifactSha),
      protocolVersion: id(trusted.protocolVersion),
      manifestHash: id(trusted.manifestHash),
      capabilities: strings(trusted.capabilities),
      maxMatches: integer(trusted.maxMatches, 1, 1_024),
      maxSeats: integer(trusted.maxSeats, 1, MAX_SEATS),
      workloadKeyId: id(trusted.workloadKeyId),
      endpoint: id(trusted.endpoint),
    };
  }

  function control(credential) {
    const trusted = authenticateControlPlane(credential);
    if (!trusted || trusted.role !== "CONTROL_PLANE") reject("CONTROL_PLANE_AUTH_REQUIRED");
    return trusted;
  }

  function requireCurrent(trusted, claims, states = LIVE_STATES) {
    const at = time();
    const run = repository.getRun(id(claims.runId));
    if (!run || !states.has(run.state) || run.leaseStatus !== "ACTIVE" || at >= run.leaseDeadlineAt) reject("STALE_LEASE");
    if (run.authorityInstanceId !== trusted.authorityInstanceId
      || run.authorityIncarnation !== trusted.authorityIncarnation
      || run.authorityLeaseId !== id(claims.authorityLeaseId)
      || run.leaseEpoch !== integer(claims.leaseEpoch, 1)) reject("STALE_LEASE");
    return run;
  }

  function registerCapacity({ credential, registration }) {
    const trusted = workload(credential);
    exact(registration, [
      "authorityInstanceId", "authorityIncarnation", "region", "artifactSha", "protocolVersion", "manifestHash", "capabilities",
      "maxMatches", "maxSeats", "observedAllocation", "maintenance", "draining", "heartbeatTtlMs", "workloadKeyId",
    ]);
    const claimed = {
      authorityInstanceId: id(registration.authorityInstanceId),
      authorityIncarnation: id(registration.authorityIncarnation), region: id(registration.region),
      artifactSha: id(registration.artifactSha), protocolVersion: id(registration.protocolVersion),
      manifestHash: id(registration.manifestHash), capabilities: strings(registration.capabilities),
      maxMatches: integer(registration.maxMatches, 1, 1_024), maxSeats: integer(registration.maxSeats, 1, MAX_SEATS),
      workloadKeyId: id(registration.workloadKeyId),
    };
    for (const field of ["authorityInstanceId", "authorityIncarnation", "region", "artifactSha", "protocolVersion", "manifestHash", "maxMatches", "maxSeats", "workloadKeyId"]) {
      if (claimed[field] !== trusted[field]) reject("WORKLOAD_IDENTITY_MISMATCH");
    }
    if (!equalArray(claimed.capabilities, trusted.capabilities)) reject("WORKLOAD_IDENTITY_MISMATCH");
    const observedAllocation = integer(registration.observedAllocation, 0, trusted.maxMatches);
    const heartbeatTtl = integer(registration.heartbeatTtlMs, 1, 120_000);
    const at = time();
    const record = repository.registerCapacity({
      ...trusted, placementLimit: Math.min(trusted.maxMatches, measuredPackingLimit),
      observedAllocation, maintenance: registration.maintenance === true,
      draining: registration.draining === true, heartbeatDeadlineAt: at + heartbeatTtl, updatedAt: at,
    });
    emit("capacity.registered", { instanceAlias: alias("instance", trusted.authorityInstanceId), activeCount: observedAllocation });
    return { authorityInstanceAlias: alias("instance", record.authorityInstanceId), heartbeatDeadlineAt: record.heartbeatDeadlineAt };
  }

  function setDrain({ credential, draining = true }) {
    const trusted = workload(credential);
    const updated = repository.updateCapacity(trusted.authorityInstanceId, (capacity) => ({ ...capacity, draining: draining === true, updatedAt: time() }));
    if (!updated) reject("CAPACITY_UNKNOWN");
    emit("capacity.drain", { instanceAlias: alias("instance", trusted.authorityInstanceId), state: updated.draining ? "DRAINING" : "READY" });
    return { draining: updated.draining };
  }

  function capacityEligible(request, at, regionRank, capacity) {
    return (
      !capacity.maintenance && !capacity.draining && at < capacity.heartbeatDeadlineAt
      && typeof capacity.authorityIncarnation === "string" && capacity.authorityIncarnation.length > 0
      && capacity.maxSeats >= request.seatCount && capacity.artifactSha === request.artifactSha
      && capacity.protocolVersion === request.protocolVersion && capacity.manifestHash === request.manifestHash
      && request.capabilities.every((capability) => capacity.capabilities.includes(capability))
      && regionRank.has(capacity.region)
    );
  }

  function compatibleCapacity(request, at, regionRank) {
    return repository.listCapacities().filter((capacity) => capacityEligible(request, at, regionRank, capacity))
    .sort((left, right) =>
      regionRank.get(left.region) - regionRank.get(right.region)
      || left.observedAllocation / left.placementLimit - right.observedAllocation / right.placementLimit
      || left.authorityInstanceId.localeCompare(right.authorityInstanceId)
    );
  }

  function normalizedPlacementRequest(request) {
    exact(request, ["requestId", "runId", "sessionId", "seatCount", "regionPreferences", "artifactSha", "protocolVersion", "manifestHash", "capabilities"]);
    return {
      requestId: id(request.requestId), runId: id(request.runId), sessionId: id(request.sessionId),
      seatCount: integer(request.seatCount, 1, MAX_SEATS), regionPreferences: strings(request.regionPreferences, 8, false),
      artifactSha: id(request.artifactSha), protocolVersion: id(request.protocolVersion),
      manifestHash: id(request.manifestHash), capabilities: strings(request.capabilities),
    };
  }

  function claim(credential, request, replacement = false) {
    control(credential);
    const selected = normalizedPlacementRequest(request);
    const at = time();
    const prior = repository.getRun(selected.runId);
    if (replacement && (!prior || prior.state !== "FAILED" || prior.leaseStatus !== "FENCED")) reject("REPLACEMENT_NOT_FENCED");
    if (replacement && prior.admittedCount > 0) reject("RUN_INTERRUPTED");
    const regionRank = new Map(selected.regionPreferences.map((region, index) => [region, index]));
    const candidates = compatibleCapacity(selected, at, regionRank)
      .filter((capacity) => !replacement || capacity.authorityInstanceId !== prior.authorityInstanceId);
    const result = repository.claimPlacement({
      requestId: selected.requestId,
      runId: selected.runId,
      candidates: candidates.map((candidate) => candidate.authorityInstanceId),
      isEligible: (capacity) => capacityEligible(selected, at, regionRank, capacity)
        && (!replacement || capacity.authorityInstanceId !== prior.authorityInstanceId),
      create(capacity, epoch, existing) {
        const authorityLeaseId = opaqueId("lease");
        const placementId = opaqueId("placement");
        const bootstrapId = opaqueId("bootstrap");
        return {
          runId: selected.runId, sessionId: selected.sessionId, seatCount: selected.seatCount,
          requestId: selected.requestId, placementId, placementAttempt: epoch,
          authorityInstanceId: capacity.authorityInstanceId, authorityIncarnation: capacity.authorityIncarnation,
          authorityLeaseId, leaseEpoch: epoch,
          artifactSha: selected.artifactSha, protocolVersion: selected.protocolVersion,
          manifestHash: selected.manifestHash, capabilities: selected.capabilities,
          region: capacity.region, endpoint: capacity.endpoint, workloadKeyId: capacity.workloadKeyId,
          state: "ALLOCATING", leaseStatus: "ACTIVE", readinessDeadlineAt: at + readinessTtlMs,
          leaseDeadlineAt: at + readinessTtlMs, bootstrapId, bootstrapExpiresAt: at + bootstrapTtlMs,
          routeId: null, admittedCount: 0, admittedMemberships: [], admittedSeats: [], bootstrapConsumedAt: null,
          createdAt: at, updatedAt: at,
          history: existing ? [...(existing.history || []), {
            placementId: existing.placementId, authorityInstanceId: existing.authorityInstanceId,
            authorityLeaseId: existing.authorityLeaseId, leaseEpoch: existing.leaseEpoch,
            state: existing.state, leaseStatus: existing.leaseStatus,
          }] : [],
        };
      },
    });
    if (result.conflict) reject("IDEMPOTENCY_CONFLICT");
    if (!result.won || !result.record) {
      emit("placement.lost", { runAlias: alias("run", selected.runId), candidateCount: candidates.length });
      return Object.freeze({ won: false, state: result.record?.state || "UNPLACED" });
    }
    const run = result.record;
    const claims = {
      type: "bootstrap", tokenId: run.bootstrapId, audience: `authority:${run.authorityInstanceId}`,
      runId: run.runId, sessionId: run.sessionId, placementId: run.placementId,
      authorityLeaseId: run.authorityLeaseId, leaseEpoch: run.leaseEpoch,
      authorityInstanceId: run.authorityInstanceId, authorityIncarnation: run.authorityIncarnation,
      artifactSha: run.artifactSha,
      protocolVersion: run.protocolVersion, manifestHash: run.manifestHash,
      capabilities: run.capabilities, seatCount: run.seatCount, maxSeats: MAX_SEATS,
      issuedAt: at, expiresAt: run.bootstrapExpiresAt,
    };
    const bootstrap = codec.seal(claims, claims.audience);
    emit("placement.claimed", { runAlias: alias("run", run.runId), instanceAlias: alias("instance", run.authorityInstanceId), seatCount: run.seatCount });
    return Object.freeze({ won: true, bootstrap, bootstrapAudience: claims.audience, readinessDeadlineAt: run.readinessDeadlineAt });
  }

  function requestPlacement({ credential, request }) { return claim(credential, request, false); }
  function requestReplacement({ credential, request }) { return claim(credential, request, true); }

  function redeemBootstrap({ credential, bootstrap, audience }) {
    const trusted = workload(credential);
    const expectedAudience = `authority:${trusted.authorityInstanceId}`;
    if (audience !== expectedAudience) reject("BOOTSTRAP_REJECTED");
    const claims = codec.open(bootstrap, expectedAudience);
    const at = time();
    if (claims.type !== "bootstrap" || claims.audience !== expectedAudience || at >= claims.expiresAt) reject("BOOTSTRAP_REJECTED");
    const run = requireCurrent(trusted, claims, new Set(["ALLOCATING"]));
    if (run.bootstrapId !== claims.tokenId || run.artifactSha !== claims.artifactSha
      || run.authorityIncarnation !== claims.authorityIncarnation
      || run.protocolVersion !== claims.protocolVersion || run.manifestHash !== claims.manifestHash
      || run.seatCount !== claims.seatCount || claims.maxSeats !== MAX_SEATS
      || !equalArray(run.capabilities, claims.capabilities)) reject("BOOTSTRAP_REJECTED");
    const consumed = repository.consumeTokenAndUpdateRun({
      tokenId: claims.tokenId, expiresAt: claims.expiresAt, consumedAt: at, runId: run.runId,
      predicate: (record) => record.state === "ALLOCATING" && record.leaseStatus === "ACTIVE"
        && record.bootstrapId === claims.tokenId && record.bootstrapConsumedAt === null
        && record.authorityLeaseId === claims.authorityLeaseId && record.leaseEpoch === claims.leaseEpoch,
      mutate: (record) => ({ ...record, bootstrapConsumedAt: at, updatedAt: at }),
    });
    if (!consumed) reject("BOOTSTRAP_REPLAY");
    return Object.freeze({ ...claims, bootstrap: undefined, tokenId: undefined });
  }

  function markReady({ credential, runId, authorityLeaseId, leaseEpoch }) {
    const trusted = workload(credential);
    const at = time();
    const claims = { runId: id(runId), authorityLeaseId: id(authorityLeaseId), leaseEpoch: integer(leaseEpoch, 1) };
    const current = requireCurrent(trusted, claims, new Set(["ALLOCATING"]));
    if (at >= current.readinessDeadlineAt) reject("READINESS_EXPIRED");
    const routeId = opaqueId("route");
    const updated = repository.compareAndSetRun(current.runId,
      (run) => run.state === "ALLOCATING" && run.bootstrapConsumedAt !== null
        && run.authorityLeaseId === current.authorityLeaseId && run.leaseEpoch === current.leaseEpoch,
      (run) => ({ ...run, state: "READY", routeId, leaseDeadlineAt: at + leaseTtlMs, updatedAt: at }));
    if (!updated) reject("DUPLICATE_OR_STALE_READY");
    const route = codec.seal({
      type: "route", tokenId: routeId, audience: `route:${updated.runId}`,
      runId: updated.runId, authorityLeaseId: updated.authorityLeaseId, leaseEpoch: updated.leaseEpoch,
      authorityInstanceId: updated.authorityInstanceId, endpoint: updated.endpoint,
      artifactSha: updated.artifactSha, protocolVersion: updated.protocolVersion,
      manifestHash: updated.manifestHash, issuedAt: at, expiresAt: updated.leaseDeadlineAt,
    }, `route:${updated.runId}`);
    return Object.freeze({ route, routeAudience: `route:${updated.runId}`, leaseDeadlineAt: updated.leaseDeadlineAt });
  }

  function validateRoute({ credential, route, runId }) {
    const trusted = workload(credential);
    const audience = `route:${id(runId)}`;
    const claims = codec.open(route, audience);
    if (claims.type !== "route" || claims.audience !== audience) reject("ROUTE_FENCED");
    const current = requireCurrent(trusted, claims);
    if (current.routeId !== claims.tokenId || current.endpoint !== claims.endpoint
      || current.artifactSha !== claims.artifactSha || current.protocolVersion !== claims.protocolVersion
      || current.manifestHash !== claims.manifestHash) reject("ROUTE_FENCED");
    return Object.freeze({ endpoint: current.endpoint, runAlias: alias("run", current.runId) });
  }

  function heartbeat({ credential, runId, authorityLeaseId, leaseEpoch, metrics = {} }) {
    const trusted = workload(credential);
    exact(metrics, ["connections", "queueDepth", "memoryBytes"], []);
    for (const value of Object.values(metrics)) integer(value, 0);
    const claims = { runId: id(runId), authorityLeaseId: id(authorityLeaseId), leaseEpoch: integer(leaseEpoch, 1) };
    const current = requireCurrent(trusted, claims);
    const at = time();
    const updated = repository.compareAndSetRun(current.runId,
      (run) => LIVE_STATES.has(run.state) && run.leaseStatus === "ACTIVE" && run.authorityLeaseId === current.authorityLeaseId && run.leaseEpoch === current.leaseEpoch,
      (run) => ({ ...run, leaseDeadlineAt: at + leaseTtlMs, updatedAt: at,
        metrics: { connections: metrics.connections || 0, queueDepth: metrics.queueDepth || 0, memoryBytes: metrics.memoryBytes || 0 } }));
    if (!updated) reject("STALE_LEASE");
    return { leaseDeadlineAt: updated.leaseDeadlineAt };
  }

  function issueAdmissionTicket({ credential, runId, member }) {
    control(credential);
    exact(member, ["accountId", "profileId", "sessionMembershipId", "runMembershipId", "playerAlias", "seatNo", "clientIncarnation"]);
    const run = repository.getRun(id(runId));
    const at = time();
    if (!run || !LIVE_STATES.has(run.state) || run.leaseStatus !== "ACTIVE" || at >= run.leaseDeadlineAt) reject("ROUTE_FENCED");
    integer(member.seatNo, 0, MAX_SEATS - 1);
    if (member.seatNo >= run.seatCount) reject("SEAT_CAP");
    const tokenId = opaqueId("ticket");
    const audience = `authority:${run.authorityInstanceId}`;
    const ticket = codec.seal({
      type: "admission", tokenId, audience, runId: run.runId, sessionId: run.sessionId,
      accountId: id(member.accountId), profileId: id(member.profileId), sessionMembershipId: id(member.sessionMembershipId),
      runMembershipId: id(member.runMembershipId), playerAlias: id(member.playerAlias), seatNo: member.seatNo,
      clientIncarnation: id(member.clientIncarnation), authorityLeaseId: run.authorityLeaseId,
      leaseEpoch: run.leaseEpoch, authorityInstanceId: run.authorityInstanceId,
      protocolVersion: run.protocolVersion, manifestHash: run.manifestHash, capabilities: run.capabilities,
      issuedAt: at, expiresAt: at + ticketTtlMs,
    }, audience);
    return Object.freeze({ ticket, audience, expiresAt: at + ticketTtlMs });
  }

  function redeemAdmissionTicket({ credential, ticket }) {
    const trusted = workload(credential);
    const audience = `authority:${trusted.authorityInstanceId}`;
    const claims = codec.open(ticket, audience);
    const at = time();
    if (claims.type !== "admission" || claims.audience !== audience || at >= claims.expiresAt) reject("TICKET_REJECTED");
    const run = requireCurrent(trusted, claims);
    if (claims.seatNo < 0 || claims.seatNo >= run.seatCount || claims.seatNo >= MAX_SEATS
      || run.protocolVersion !== claims.protocolVersion || run.manifestHash !== claims.manifestHash
      || !equalArray(run.capabilities, claims.capabilities)) reject("TICKET_REJECTED");
    const updated = repository.consumeTokenAndUpdateRun({
      tokenId: claims.tokenId, expiresAt: claims.expiresAt, consumedAt: at, runId: run.runId,
      predicate: (record) => LIVE_STATES.has(record.state) && record.leaseStatus === "ACTIVE"
        && record.admittedCount < record.seatCount && !record.admittedMemberships.includes(claims.runMembershipId)
        && !record.admittedSeats.includes(claims.seatNo),
      mutate: (record) => ({ ...record, state: record.state === "READY" ? "ACTIVE" : record.state,
        admittedCount: record.admittedCount + 1,
        admittedMemberships: [...record.admittedMemberships, claims.runMembershipId],
        admittedSeats: [...record.admittedSeats, claims.seatNo], updatedAt: at }),
    });
    if (!updated) {
      if (repository.isTokenConsumed(claims.tokenId)) reject("TICKET_REPLAY");
      if (repository.getRun(run.runId)?.admittedMemberships?.includes(claims.runMembershipId)) reject("MEMBERSHIP_ALREADY_ADMITTED");
      if (repository.getRun(run.runId)?.admittedSeats?.includes(claims.seatNo)) reject("SEAT_ALREADY_ADMITTED");
      reject("TICKET_REPLAY");
    }
    return Object.freeze({ ...claims, tokenId: undefined, accountId: claims.accountId, profileId: claims.profileId });
  }

  function resultEligible({ credential, runId, authorityLeaseId, leaseEpoch }) {
    const trusted = workload(credential);
    requireCurrent(trusted, { runId: id(runId), authorityLeaseId: id(authorityLeaseId), leaseEpoch: integer(leaseEpoch, 1) });
    return true;
  }

  function beginRunDrain({ credential, runId, authorityLeaseId, leaseEpoch }) {
    const trusted = workload(credential);
    const claims = { runId: id(runId), authorityLeaseId: id(authorityLeaseId), leaseEpoch: integer(leaseEpoch, 1) };
    const current = requireCurrent(trusted, claims);
    const at = time();
    const updated = repository.compareAndSetRun(current.runId,
      (run) => ["READY", "ACTIVE"].includes(run.state) && run.authorityLeaseId === current.authorityLeaseId,
      (run) => ({ ...run, state: "DRAINING", updatedAt: at }));
    if (!updated) reject("STALE_LEASE");
    return { state: updated.state };
  }

  function endRun({ credential, runId, authorityLeaseId, leaseEpoch, outcome }) {
    const trusted = workload(credential);
    if (!new Set(["ENDED", "FAILED"]).has(outcome)) reject("INVALID_REQUEST");
    const claims = { runId: id(runId), authorityLeaseId: id(authorityLeaseId), leaseEpoch: integer(leaseEpoch, 1) };
    const current = requireCurrent(trusted, claims);
    const at = time();
    const updated = repository.compareAndSetRun(current.runId,
      (run) => LIVE_STATES.has(run.state) && run.leaseStatus === "ACTIVE" && run.authorityLeaseId === current.authorityLeaseId,
      (run) => ({ ...run, state: outcome, leaseStatus: "ENDED", routeId: null, terminalAt: at, updatedAt: at }));
    if (!updated) reject("DUPLICATE_OR_STALE_END");
    emit("run.terminal", { runAlias: alias("run", updated.runId), state: updated.state, seatCount: updated.seatCount });
    return { state: updated.state };
  }

  function fenceExpired() {
    const at = time();
    let fenced = 0;
    for (const candidate of repository.snapshot().runs) {
      if (!ACTIVE_STATES.has(candidate.state)) continue;
      const expired = candidate.state === "ALLOCATING"
        ? at >= candidate.readinessDeadlineAt
        : at >= candidate.leaseDeadlineAt;
      if (!expired) continue;
      const updated = repository.compareAndSetRun(candidate.runId,
        (run) => ACTIVE_STATES.has(run.state) && run.leaseStatus === "ACTIVE"
          && (run.state === "ALLOCATING" ? at >= run.readinessDeadlineAt : at >= run.leaseDeadlineAt),
        (run) => ({ ...run, state: "FAILED", leaseStatus: "FENCED", routeId: null, terminalAt: at, updatedAt: at }));
      if (updated) fenced += 1;
    }
    emit("lease.sweep", { activeCount: fenced });
    return { fenced };
  }

  function cleanup(options = {}) { return repository.cleanup({ now: time(), ...options }); }

  return Object.freeze({
    registerCapacity, setDrain, requestPlacement, requestReplacement, redeemBootstrap, markReady,
    validateRoute, heartbeat, issueAdmissionTicket, redeemAdmissionTicket, resultEligible,
    beginRunDrain, endRun, fenceExpired, cleanup,
  });
}

module.exports = { MAX_SEATS, HostedPlacementError, createHostedPlacementService };
