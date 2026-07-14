"use strict";

const crypto = require("node:crypto");
const { assertPlainData, assertExactKeys } = require("./hosted-boundary.cjs");

const MAX_SEATS = 4;

class HostedProductPublicError extends Error {
  constructor() {
    super("hosted product request rejected");
    this.name = "HostedProductPublicError";
    this.code = "HOSTED_PRODUCT_REJECTED";
  }
}

class ProductInternalError extends Error {
  constructor(reason, context = {}) {
    super(reason);
    this.reason = reason;
    this.context = context;
  }
}

function fail(reason, context) { throw new ProductInternalError(reason, context); }

function record(value, allowed, required = allowed) {
  try {
    assertPlainData(value, { maxDepth: 12, maxNodes: 512, maxStringBytes: 16 * 1024, maxArrayLength: 256, maxObjectKeys: 128 });
    assertExactKeys(value, allowed, required);
  } catch { fail("invalid_request"); }
  return value;
}

function string(value, { min = 1, max = 512 } = {}) {
  if (typeof value !== "string" || value.length < min || value.length > max || value.trim() !== value) fail("invalid_request");
  return value;
}

function seats(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_SEATS) fail("seat_cap");
  return value;
}

function defaultIds() {
  return {
    next(prefix) { return `${prefix}_${crypto.randomBytes(18).toString("base64url")}`; },
  };
}

const LIFECYCLE_RANK = Object.freeze({
  ALLOCATING: 0, READY: 1, ACTIVE: 2, DRAINING: 3, FENCED: 4, ENDED: 4,
});

function monotonicState(current, observed) {
  if (!Object.hasOwn(LIFECYCLE_RANK, current) || !Object.hasOwn(LIFECYCLE_RANK, observed)) {
    fail("lifecycle_state_invalid");
  }
  return LIFECYCLE_RANK[current] >= LIFECYCLE_RANK[observed] ? current : observed;
}

function createHostedProductService({
  identity,
  placement,
  outbox,
  settlement,
  repository,
  ids = defaultIds(),
  clock = { now: () => Date.now() },
  controlCredential,
  authenticateControl,
  resolveWorkloadIdentity,
  placementPolicy,
  diagnostics = () => {},
  diagnosticKey,
  fault = () => {},
} = {}) {
  const repositoryMethods = [
    "transaction", "createMatch", "getMatch", "getMatchByJoinCode", "getMatchByAllocation", "updateMatch",
    "addMembership", "getMembership", "listMemberships", "markMembershipAdmitted",
    "putWorkloadContext", "getWorkloadContext", "updateWorkloadContext",
  ];
  if (!identity || typeof identity.authorizeProfile !== "function"
      || !placement || typeof placement.requestPlacement !== "function"
      || typeof placement.cancelUnredeemedPlacement !== "function"
      || typeof placement.admittedMemberships !== "function"
      || !outbox || typeof outbox.enqueue !== "function"
      || !settlement || typeof settlement.deliverOne !== "function"
      || !repository || repositoryMethods.some((method) => typeof repository[method] !== "function")
      || !ids || typeof ids.next !== "function" || !clock || typeof clock.now !== "function"
      || typeof authenticateControl !== "function" || typeof resolveWorkloadIdentity !== "function"
      || typeof placementPolicy !== "function"
      || typeof fault !== "function"
      || !(typeof diagnosticKey === "string" || Buffer.isBuffer(diagnosticKey))
      || Buffer.byteLength(diagnosticKey) < 32) {
    throw new TypeError("hosted product dependencies invalid");
  }

  function alias(kind, value) {
    return `${kind}_${crypto.createHmac("sha256", diagnosticKey).update(String(value)).digest("base64url").slice(0, 16)}`;
  }

  function allocationReplayDigest(audience, bootstrap) {
    return crypto.createHmac("sha256", diagnosticKey)
      .update(string(audience, { max: 512 })).update("\0")
      .update(string(bootstrap, { max: 16 * 1024 })).digest("base64url");
  }

  function emit(operation, reason, context = {}) {
    const event = { operation, outcome: "rejected", reason };
    for (const field of ["matchId", "runId", "accountId"]) {
      if (context[field]) event[`${field.replace(/Id$/, "")}Alias`] = alias(field.replace(/Id$/, ""), context[field]);
    }
    try { diagnostics(Object.freeze(event)); } catch {}
  }

  function guarded(operation, fn) {
    try { return fn(); }
    catch (error) {
      const internal = error instanceof ProductInternalError
        ? error : new ProductInternalError(error?.code || "component_rejected");
      emit(operation, internal.reason, internal.context);
      throw new HostedProductPublicError();
    }
  }

  function control(credential) {
    const principal = authenticateControl(credential);
    if (!principal || principal.role !== "CONTROL_PLANE") fail("control_auth_required");
    return principal;
  }

  function policy() {
    const selected = placementPolicy();
    record(selected, ["regionPreferences", "artifactSha", "protocolVersion", "manifestHash", "capabilities"]);
    if (!Array.isArray(selected.regionPreferences) || !selected.regionPreferences.length
        || !Array.isArray(selected.capabilities)) fail("placement_policy_invalid");
    selected.regionPreferences.forEach((value) => string(value, { max: 80 }));
    selected.capabilities.forEach((value) => string(value, { max: 80 }));
    return selected;
  }

  function authorize(accessToken, profileId) {
    return identity.authorizeProfile({ accessToken: string(accessToken, { min: 32 }), profileId: string(profileId, { max: 160 }) });
  }

  function membershipFor(repo, match, principal) {
    const membership = repo.getMembership(match.matchId, principal.profileId);
    if (!membership || membership.accountId !== principal.accountId) {
      fail("membership_forbidden", { matchId: match.matchId, accountId: principal.accountId });
    }
    return membership;
  }

  function exchangeProviderProof(input) {
    return guarded("provider_exchange", () => identity.exchangeProviderProof(input));
  }
  function refresh(input) { return guarded("refresh", () => identity.refresh(input)); }
  function reconcileEntitlement(input) {
    return guarded("entitlement_reconcile", () => identity.reconcileEntitlement(input));
  }
  function createProfile(input) { return guarded("profile_create", () => identity.createProfile(input)); }

  function clientCreateMatch(input) {
    return guarded("match_create", () => {
      record(input, ["accessToken", "profileId", "seatCount", "clientIncarnation", "playerAlias"]);
      const principal = authorize(input.accessToken, input.profileId);
      const seatCount = seats(input.seatCount);
      const now = clock.now();
      const matchId = ids.next("match");
      const runId = ids.next("run");
      const sessionId = ids.next("session");
      const joinCode = ids.next("join");
      const membership = {
        membershipId: ids.next("membership"), sessionMembershipId: ids.next("session_member"),
        runMembershipId: ids.next("run_member"), matchId, runId, sessionId,
        accountId: principal.accountId, profileId: principal.profileId, seatNo: 0,
        clientIncarnation: string(input.clientIncarnation, { max: 160 }),
        playerAlias: string(input.playerAlias, { max: 80 }), createdAt: now,
      };
      const selected = policy();
      const requestId = ids.next("placement_request");
      let placementResult = null;
      try {
        placementResult = placement.requestPlacement({ credential: controlCredential, request: {
          requestId, runId, sessionId, seatCount, ...selected,
        } });
        if (!placementResult?.won || typeof placementResult.bootstrap !== "string") fail("placement_unavailable", { runId });
        fault("after-create-placement-before-product");
        const allocationHandle = ids.next("allocation");
        repository.transaction((repo) => {
          repo.createMatch({ matchId, runId, sessionId, joinCode, seatCount, state: "ALLOCATING",
            ownerAccountId: principal.accountId, allocationHandle, placementRequestId: requestId,
            bootstrap: placementResult.bootstrap, bootstrapAudience: placementResult.bootstrapAudience,
            createdAt: now });
          repo.addMembership(membership);
        });
      } catch (error) {
        if (placementResult?.won) {
          try { placement.cancelUnredeemedPlacement({ credential: controlCredential, requestId, runId }); }
          catch (cancelError) {
            emit("match_create", "placement_compensation_deferred", { runId });
          }
        }
        throw error;
      }
      return Object.freeze({ matchId, joinCode, seatCount, state: "ALLOCATING" });
    });
  }

  function clientJoinMatch(input) {
    return guarded("match_join", () => {
      record(input, ["accessToken", "profileId", "joinCode", "clientIncarnation", "playerAlias"]);
      const principal = authorize(input.accessToken, input.profileId);
      return repository.transaction((repo) => {
        const match = repo.getMatchByJoinCode(string(input.joinCode, { max: 160 }));
        if (!match || !["ALLOCATING", "READY", "ACTIVE"].includes(match.state)) fail("match_unavailable");
        const prior = repo.getMembership(match.matchId, principal.profileId);
        if (prior) {
          if (prior.accountId !== principal.accountId) fail("membership_forbidden", { matchId: match.matchId });
          return Object.freeze({ matchId: match.matchId, seatNo: prior.seatNo, joined: true });
        }
        const members = repo.listMemberships(match.matchId);
        if (members.length >= match.seatCount || members.length >= MAX_SEATS) fail("seat_cap", { matchId: match.matchId });
        if (members.some((member) => member.accountId === principal.accountId)) fail("duplicate_account", { matchId: match.matchId });
        const occupied = new Set(members.map((member) => member.seatNo));
        let seatNo = 0; while (occupied.has(seatNo)) seatNo += 1;
        repo.addMembership({
          membershipId: ids.next("membership"), sessionMembershipId: ids.next("session_member"),
          runMembershipId: ids.next("run_member"), matchId: match.matchId, runId: match.runId,
          sessionId: match.sessionId, accountId: principal.accountId, profileId: principal.profileId,
          seatNo, clientIncarnation: string(input.clientIncarnation, { max: 160 }),
          playerAlias: string(input.playerAlias, { max: 80 }), createdAt: clock.now(),
        });
        return Object.freeze({ matchId: match.matchId, seatNo, joined: true });
      });
    });
  }

  function clientAdmission(input) {
    return guarded("match_admission", () => {
      record(input, ["accessToken", "profileId", "matchId"]);
      const principal = authorize(input.accessToken, input.profileId);
      const { match, member } = repository.transaction((repo) => {
        const match = repo.getMatch(string(input.matchId, { max: 160 }));
        if (!match || !["READY", "ACTIVE"].includes(match.state)) fail("match_not_ready");
        return { match, member: membershipFor(repo, match, principal) };
      });
      return placement.issueAdmissionTicket({ credential: controlCredential, runId: match.runId, member: {
        accountId: member.accountId, profileId: member.profileId,
        sessionMembershipId: member.sessionMembershipId, runMembershipId: member.runMembershipId,
        playerAlias: member.playerAlias, seatNo: member.seatNo, clientIncarnation: member.clientIncarnation,
      } });
    });
  }

  function controlGetAllocation(input) {
    return guarded("allocation_get", () => {
      record(input, ["credential", "matchId"]);
      control(input.credential);
      const match = repository.transaction((repo) => repo.getMatch(string(input.matchId, { max: 160 })));
      if (!match || match.state !== "ALLOCATING" || !match.bootstrap) fail("allocation_unavailable");
      return Object.freeze({ allocationHandle: match.allocationHandle, bootstrap: match.bootstrap, audience: match.bootstrapAudience });
    });
  }

  function workloadRedeem(input) {
    return guarded("workload_redeem", () => {
      record(input, ["credential", "allocationHandle", "bootstrap", "audience"]);
      const match = repository.transaction((repo) => repo.getMatchByAllocation(string(input.allocationHandle, { max: 160 })));
      const workload = resolveWorkloadIdentity(input.credential);
      if (!workload) fail("workload_identity_mismatch");
      const replayDigest = allocationReplayDigest(input.audience, input.bootstrap);
      if (!match) fail("allocation_forbidden");
      if (match.bootstrap == null) {
        const context = typeof match.workloadRunHandle === "string"
          ? repository.transaction((repo) => repo.getWorkloadContext(match.workloadRunHandle)) : null;
        if (!context || match.redeemedBootstrapDigest !== replayDigest
          || match.redeemedBootstrapAudience !== input.audience
          || context.authorityInstanceId !== workload.authorityInstanceId
          || context.authorityIncarnation !== workload.authorityIncarnation
          || context.credentialBinding !== workload.credentialBinding) fail("allocation_forbidden");
        return Object.freeze({ workloadRunHandle: context.workloadRunHandle });
      }
      if (!match || match.bootstrap !== input.bootstrap || match.bootstrapAudience !== input.audience) fail("allocation_forbidden");
      const claims = placement.redeemBootstrap({ credential: input.credential, bootstrap: input.bootstrap, audience: input.audience });
      if (claims.runId !== match.runId || claims.sessionId !== match.sessionId) fail("allocation_smuggling", { runId: match.runId });
      if (!workload || workload.authorityInstanceId !== claims.authorityInstanceId) fail("workload_identity_mismatch");
      fault("after-bootstrap-placement-before-product");
      const workloadRunHandle = ids.next("workload_run");
      repository.transaction((repo) => {
        repo.putWorkloadContext({ workloadRunHandle, matchId: match.matchId, runId: match.runId,
          authorityLeaseId: claims.authorityLeaseId, leaseEpoch: claims.leaseEpoch,
          authorityInstanceId: claims.authorityInstanceId, authorityIncarnation: string(workload.authorityIncarnation, { max: 160 }),
          credentialBinding: string(workload.credentialBinding, { max: 160 }), state: "ALLOCATING" });
        repo.updateMatch(match.matchId, (current) => ({ ...current, bootstrap: null, bootstrapAudience: null,
          workloadRunHandle, redeemedBootstrapDigest: replayDigest,
          redeemedBootstrapAudience: input.audience }));
      });
      return Object.freeze({ workloadRunHandle });
    });
  }

  function workloadContext(credential, handle) {
    const trusted = resolveWorkloadIdentity(credential);
    const context = repository.transaction((repo) => repo.getWorkloadContext(string(handle, { max: 160 })));
    if (!trusted || !context || trusted.authorityInstanceId !== context.authorityInstanceId
        || trusted.authorityIncarnation !== context.authorityIncarnation
        || trusted.credentialBinding !== context.credentialBinding) fail("workload_context_forbidden", { runId: context?.runId });
    return context;
  }

  function workloadReady(input) {
    return guarded("workload_ready", () => {
      record(input, ["credential", "workloadRunHandle"]);
      const context = workloadContext(input.credential, input.workloadRunHandle);
      placement.markReady({ credential: input.credential, runId: context.runId,
        authorityLeaseId: context.authorityLeaseId, leaseEpoch: context.leaseEpoch });
      fault("after-ready-placement-before-product");
      const route = placement.markReady({ credential: input.credential, runId: context.runId,
        authorityLeaseId: context.authorityLeaseId, leaseEpoch: context.leaseEpoch });
      if (!route || !["READY", "ACTIVE", "DRAINING"].includes(route.state)) fail("ready_reconciliation_invalid");
      repository.transaction((repo) => {
        repo.updateWorkloadContext(context.workloadRunHandle, (current) => ({ ...current,
          state: monotonicState(current.state, route.state) }));
        repo.updateMatch(context.matchId, (current) => ({ ...current,
          state: monotonicState(current.state, route.state) }));
      });
      return route;
    });
  }

  function workloadHeartbeat(input) {
    return guarded("workload_heartbeat", () => {
      record(input, ["credential", "workloadRunHandle", "metrics"]);
      const context = workloadContext(input.credential, input.workloadRunHandle);
      return placement.heartbeat({ credential: input.credential, runId: context.runId,
        authorityLeaseId: context.authorityLeaseId, leaseEpoch: context.leaseEpoch, metrics: input.metrics });
    });
  }

  function workloadRedeemAdmission(input) {
    return guarded("workload_admit", () => {
      record(input, ["credential", "workloadRunHandle", "ticket"]);
      const context = workloadContext(input.credential, input.workloadRunHandle);
      const admitted = placement.redeemAdmissionTicket({ credential: input.credential, ticket: input.ticket });
      if (admitted.runId !== context.runId) fail("cross_run_smuggling", { runId: context.runId });
      fault("after-admission-placement-before-product");
      repository.transaction((repo) => {
        const marked = repo.markMembershipAdmitted(context.matchId, admitted.runMembershipId, clock.now());
        if (!marked || marked.profileId !== admitted.profileId || marked.accountId !== admitted.accountId
            || marked.seatNo !== admitted.seatNo) fail("admission_membership_mismatch", { runId: context.runId });
        repo.updateWorkloadContext(context.workloadRunHandle, (current) => ({ ...current,
          state: monotonicState(current.state, "ACTIVE") }));
        repo.updateMatch(context.matchId, (current) => ({ ...current,
          state: monotonicState(current.state, "ACTIVE") }));
      });
      return Object.freeze({ admitted: true, seatNo: admitted.seatNo });
    });
  }

  function workloadBeginDrain(input) {
    return guarded("workload_drain", () => {
      record(input, ["credential", "workloadRunHandle"]);
      const context = workloadContext(input.credential, input.workloadRunHandle);
      const result = placement.beginRunDrain({ credential: input.credential, runId: context.runId,
        authorityLeaseId: context.authorityLeaseId, leaseEpoch: context.leaseEpoch });
      fault("after-drain-placement-before-product");
      repository.transaction((repo) => {
        repo.updateWorkloadContext(context.workloadRunHandle, (current) => ({ ...current,
          state: monotonicState(current.state, "DRAINING") }));
        repo.updateMatch(context.matchId, (current) => ({ ...current,
          state: monotonicState(current.state, "DRAINING") }));
      });
      return result;
    });
  }

  function workloadSubmitResult(input) {
    return guarded("workload_result", () => {
      record(input, ["credential", "workloadRunHandle", "payload"]);
      const context = workloadContext(input.credential, input.workloadRunHandle);
      if (context.state !== "DRAINING") fail("result_not_terminal", { runId: context.runId });
      const admitted = repository.transaction((repo) => repo.listMemberships(context.matchId)
        .filter((member) => member.admittedAt != null)
        .map((member) => member.runMembershipId).sort());
      const authoritative = placement.admittedMemberships({ credential: input.credential,
        runId: context.runId, authorityLeaseId: context.authorityLeaseId, leaseEpoch: context.leaseEpoch });
      if (!authoritative || authoritative.admittedCount !== authoritative.runMembershipIds?.length
          || admitted.length !== authoritative.admittedCount
          || admitted.some((id, index) => id !== authoritative.runMembershipIds[index])) {
        fail("admission_reconciliation_required", { runId: context.runId });
      }
      const outcomeIds = Object.keys(input.payload?.outcomes || {}).sort();
      if (admitted.length < 1 || admitted.length > MAX_SEATS || outcomeIds.length !== admitted.length
          || outcomeIds.some((id, index) => id !== admitted[index])) {
        fail("result_membership_mismatch", { runId: context.runId });
      }
      const accepted = outbox.enqueue({ authority: {
        run_id: context.runId, lease_id: context.authorityLeaseId, lease_epoch: context.leaseEpoch,
        authority_incarnation: context.authorityIncarnation,
      }, payload: input.payload });
      // The placement-owned acceptance CAS is the immutable terminal
      // transition. Once accepted, placement deliberately rejects every later
      // lease mutation, including endRun. Persist the recoverable product-side
      // acknowledgement only after the outbox confirms that exact lineage.
      repository.transaction((repo) => {
        repo.updateWorkloadContext(context.workloadRunHandle, (current) => ({ ...current,
          state: "ENDED", acceptedResultId: accepted.result_id }));
        repo.updateMatch(context.matchId, (current) => ({ ...current,
          state: "ENDED", acceptedResultId: accepted.result_id }));
      });
      return accepted;
    });
  }

  function workloadEnd(input) {
    return guarded("workload_end", () => {
      record(input, ["credential", "workloadRunHandle"]);
      const context = workloadContext(input.credential, input.workloadRunHandle);
      if (context.state !== "ENDED" || typeof context.acceptedResultId !== "string") {
        fail("end_without_accepted_result", { runId: context.runId });
      }
      return Object.freeze({ state: "ENDED", acceptedResultId: context.acceptedResultId });
    });
  }

  function controlFenceExpired(input) {
    return guarded("lease_sweep", () => { record(input, ["credential"]); control(input.credential); return placement.fenceExpired(); });
  }

  function controlReplaceMatch(input) {
    return guarded("match_replace", () => {
      record(input, ["credential", "matchId"]); control(input.credential);
      const match = repository.transaction((repo) => repo.getMatch(string(input.matchId, { max: 160 })));
      if (!match || ["ENDED", "DRAINING"].includes(match.state)) fail("replacement_forbidden");
      const selected = policy();
      const requestId = ids.next("placement_request");
      const replacement = placement.requestReplacement({ credential: controlCredential, request: {
        requestId, runId: match.runId, sessionId: match.sessionId, seatCount: match.seatCount, ...selected,
      } });
      if (!replacement?.won) fail("replacement_unavailable", { runId: match.runId });
      const allocationHandle = ids.next("allocation");
      repository.transaction((repo) => repo.updateMatch(match.matchId, (current) => ({ ...current,
        state: "ALLOCATING", allocationHandle, bootstrap: replacement.bootstrap,
        bootstrapAudience: replacement.bootstrapAudience, placementRequestId: requestId,
        workloadRunHandle: null, redeemedBootstrapDigest: null, redeemedBootstrapAudience: null,
      })));
      return Object.freeze({ matchId: match.matchId, state: "ALLOCATING" });
    });
  }

  function controlDeliverSettlement(input) {
    return guarded("settlement_deliver", () => { record(input, ["credential"]); control(input.credential); return settlement.deliverOne(); });
  }

  return Object.freeze({
    exchangeProviderProof, refresh, reconcileEntitlement, createProfile,
    clientCreateMatch, clientJoinMatch, clientAdmission,
    controlGetAllocation, controlFenceExpired, controlReplaceMatch, controlDeliverSettlement,
    workloadRedeem, workloadReady, workloadHeartbeat, workloadRedeemAdmission,
    workloadBeginDrain, workloadSubmitResult, workloadEnd,
  });
}

module.exports = { MAX_SEATS, HostedProductPublicError, createHostedProductService };
