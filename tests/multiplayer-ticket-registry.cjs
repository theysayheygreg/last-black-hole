const { TestRunner, assert } = require("./helpers.cjs");
const {
  DEFAULT_TTL_MS,
  MultiplayerTicketError,
  createMultiplayerTicketRegistry,
} = require("../scripts/multiplayer-ticket-registry.cjs");

function expectTicketError(fn, code) {
  try {
    fn();
  } catch (error) {
    assert(error instanceof MultiplayerTicketError, `Expected MultiplayerTicketError, got ${error?.name}`);
    assert(error.code === code, `Expected ${code}, got ${error.code}: ${error.message}`);
    return error;
  }
  throw new Error(`Expected ticket error ${code}`);
}

function claims(suffix = "a") {
  return {
    membershipId: `membership-${suffix}`,
    playerId: `authority-player-${suffix}`,
    profileId: `profile-${suffix}`,
  };
}

async function run() {
  const runner = new TestRunner("MultiplayerTicketRegistry");

  await runner.run("admission tickets are opaque, single-use, and reserve authority identity", async () => {
    let clock = 1_000;
    const registry = createMultiplayerTicketRegistry({ runId: "run-a", now: () => clock });
    const issued = registry.issueAdmission(claims());
    assert(/^[A-Za-z0-9_-]{43}$/.test(issued.ticket), "Ticket should be an opaque 32-byte base64url token");
    assert(!issued.ticket.includes("player") && !issued.ticket.includes("membership"), "Ticket must not encode claims");
    clock += 25;
    const redeemed = registry.redeem(issued.ticket, { kind: "admission", runId: "run-a" });
    assert(redeemed.claims.membershipId === "membership-a", "Membership must come from reserved authority claim");
    assert(redeemed.claims.playerId === "authority-player-a", "Player id must come from reserved authority claim");
    assert(redeemed.redeemedAt === clock, "Injected clock should govern redemption");
    expectTicketError(
      () => registry.redeem(issued.ticket, { kind: "admission", runId: "run-a" }),
      "reused-ticket",
    );
  });

  await runner.run("resume tickets bind membership, profile, connection id, and epoch", async () => {
    const registry = createMultiplayerTicketRegistry({ runId: "run-a", now: () => 2_000 });
    const issued = registry.issueResume({
      ...claims("resume"),
      connectionId: "connection-a",
      connectionEpoch: 7,
    });
    const redeemed = registry.redeem(issued.ticket, { kind: "resume", runId: "run-a" });
    assert(redeemed.claims.connectionId === "connection-a", "Resume should bind connection id");
    assert(redeemed.claims.connectionEpoch === 7, "Resume should bind connection epoch");
    expectTicketError(
      () => registry.issueResume({ ...claims("bad"), connectionId: "connection-b", connectionEpoch: 0 }),
      "invalid-claim",
    );
  });

  await runner.run("protocol selection and manifest identity are registry-bound and immutable", async () => {
    const registry = createMultiplayerTicketRegistry({ runId: "run-a", now: () => 2_500 });
    const issued = registry.issueAdmission({
      ...claims("v2"),
      wireVersion: "lbh-multiplayer-json-v2",
      capabilities: ["static-manifest-v1"],
      manifestSchema: "lbh-session-replication-manifest-v1",
      manifestHash: "sha256:abc",
    });
    const redeemed = registry.redeem(issued.ticket, { kind: "admission", runId: "run-a" });
    assert(redeemed.claims.wireVersion === "lbh-multiplayer-json-v2", "Selected wire must survive redemption");
    assert(redeemed.claims.manifestHash === "sha256:abc", "Manifest hash must be registry-bound");
    expectTicketError(() => registry.issueAdmission({
      ...claims("bad-v1"), wireVersion: "lbh-multiplayer-json-v1", capabilities: [], manifestHash: "sha256:smuggled",
    }), "invalid-claim");
    expectTicketError(() => registry.issueAdmission({
      ...claims("unknown"), wireVersion: "lbh-multiplayer-json-v9", capabilities: [],
    }), "invalid-claim");
  });

  await runner.run("state-pair capability binds the authority incarnation into the opaque ticket", async () => {
    const registry = createMultiplayerTicketRegistry({ runId: "run-a", now: () => 2_750 });
    const issued = registry.issueAdmission({
      ...claims("pair"), wireVersion: "lbh-multiplayer-json-v2",
      capabilities: ["static-manifest-v1", "state-pair-v1"],
      manifestSchema: "lbh-session-replication-manifest-v1", manifestHash: "sha256:pair",
      authorityIncarnation: 9,
    });
    const redeemed = registry.redeem(issued.ticket, { kind: "admission", runId: "run-a" });
    assert(redeemed.claims.authorityIncarnation === 9, "Authority incarnation must survive redemption");
    assert(JSON.stringify(redeemed.claims.capabilities) === JSON.stringify(["state-pair-v1", "static-manifest-v1"]),
      "Capabilities must be deterministic and ticket-bound");
    expectTicketError(() => registry.issueAdmission({
      ...claims("missing-incarnation"), wireVersion: "lbh-multiplayer-json-v2",
      capabilities: ["static-manifest-v1", "state-pair-v1"],
      manifestSchema: "lbh-session-replication-manifest-v1", manifestHash: "sha256:pair",
    }), "invalid-claim");
    expectTicketError(() => registry.issueAdmission({
      ...claims("smuggled-incarnation"), wireVersion: "lbh-multiplayer-json-v2",
      capabilities: ["static-manifest-v1"], manifestSchema: "lbh-session-replication-manifest-v1",
      manifestHash: "sha256:pair", authorityIncarnation: 9,
    }), "invalid-claim");
  });

  await runner.run("mixed state-pair capability cannot be ticketed without the base protocol", async () => {
    const registry = createMultiplayerTicketRegistry({ runId: "run-a" });
    expectTicketError(() => registry.issueAdmission({
      membershipId: "membership-a", playerId: "player-a", profileId: "profile-a",
      wireVersion: "lbh-multiplayer-json-v2",
      capabilities: ["static-manifest-v1", "state-pair-mixed-v1"],
      manifestSchema: "lbh-session-replication-manifest-v1", manifestHash: "sha256:manifest",
      authorityIncarnation: 1,
    }), "invalid-claim");
    expectTicketError(() => registry.issueAdmission({
      membershipId: "membership-a", playerId: "player-a", profileId: "profile-a",
      wireVersion: "lbh-multiplayer-json-v2",
      capabilities: ["static-manifest-v1", "state-pair-v1", "runtime-public-components-v1"],
      manifestSchema: "lbh-session-replication-manifest-v1", manifestHash: "sha256:manifest",
      authorityIncarnation: 1,
    }), "invalid-claim");
    expectTicketError(() => registry.issueAdmission({
      membershipId: "membership-a", playerId: "player-a", profileId: "profile-a",
      wireVersion: "lbh-multiplayer-json-v2",
      capabilities: ["static-manifest-v1", "state-pair-v1", "state-pair-mixed-v1",
        "state-pair-positional-json-v1"],
      manifestSchema: "lbh-session-replication-manifest-v1", manifestHash: "sha256:manifest",
      authorityIncarnation: 1,
    }), "invalid-claim");
  });

  await runner.run("positional codec capability is immutable only with its full dependency chain", async () => {
    const registry = createMultiplayerTicketRegistry({ runId: "run-a" });
    const issued = registry.issueAdmission({
      membershipId: "membership-positional", playerId: "player-positional", profileId: "profile-positional",
      wireVersion: "lbh-multiplayer-json-v2",
      capabilities: ["static-manifest-v1", "state-pair-v1", "state-pair-mixed-v1",
        "runtime-public-components-v1", "state-pair-positional-json-v1"],
      manifestSchema: "lbh-session-replication-manifest-v1", manifestHash: "sha256:manifest",
      authorityIncarnation: 1,
    });
    const redeemed = registry.redeem(issued.ticket, { kind: "admission", runId: "run-a" });
    assert(redeemed.claims.capabilities.includes("state-pair-positional-json-v1"),
      "Positional capability must survive opaque ticket redemption");
  });

  await runner.run("binary codec capability is immutable and requires the exact positional fallback chain", async () => {
    const registry = createMultiplayerTicketRegistry({ runId: "run-a" });
    expectTicketError(() => registry.issueAdmission({
      membershipId: "membership-binary-bad", playerId: "player-binary-bad", profileId: "profile-binary-bad",
      wireVersion: "lbh-multiplayer-json-v2",
      capabilities: ["static-manifest-v1", "state-pair-v1", "state-pair-mixed-v1",
        "runtime-public-components-v1", "state-pair-binary-v1"],
      manifestSchema: "lbh-session-replication-manifest-v1", manifestHash: "sha256:manifest",
      authorityIncarnation: 1,
    }), "invalid-claim");
    const issued = registry.issueAdmission({
      membershipId: "membership-binary", playerId: "player-binary", profileId: "profile-binary",
      wireVersion: "lbh-multiplayer-json-v2",
      capabilities: ["static-manifest-v1", "state-pair-v1", "state-pair-mixed-v1",
        "runtime-public-components-v1", "state-pair-positional-json-v1", "state-pair-binary-v1"],
      manifestSchema: "lbh-session-replication-manifest-v1", manifestHash: "sha256:manifest",
      authorityIncarnation: 1,
    });
    const redeemed = registry.redeem(issued.ticket, { kind: "admission", runId: "run-a" });
    assert(redeemed.claims.capabilities.includes("state-pair-binary-v1"));
    assert(redeemed.claims.capabilities.includes("state-pair-positional-json-v1"));
  });

  await runner.run("compression capability is immutable, positional-only, and excludes binary", async () => {
    const registry = createMultiplayerTicketRegistry({ runId: "run-a" });
    const dependencies = ["static-manifest-v1", "state-pair-v1", "state-pair-mixed-v1",
      "runtime-public-components-v1", "state-pair-positional-json-v1"];
    expectTicketError(() => registry.issueAdmission({
      membershipId: "membership-compression-bad", playerId: "player-compression-bad",
      profileId: "profile-compression-bad", wireVersion: "lbh-multiplayer-json-v2",
      capabilities: [...dependencies.slice(0, -1), "state-pair-brotli-v1"],
      manifestSchema: "lbh-session-replication-manifest-v1", manifestHash: "sha256:manifest",
      authorityIncarnation: 1,
    }), "invalid-claim");
    expectTicketError(() => registry.issueAdmission({
      membershipId: "membership-compression-binary", playerId: "player-compression-binary",
      profileId: "profile-compression-binary", wireVersion: "lbh-multiplayer-json-v2",
      capabilities: [...dependencies, "state-pair-binary-v1", "state-pair-brotli-v1"],
      manifestSchema: "lbh-session-replication-manifest-v1", manifestHash: "sha256:manifest",
      authorityIncarnation: 1,
    }), "invalid-claim");
    const issued = registry.issueAdmission({
      membershipId: "membership-compression", playerId: "player-compression",
      profileId: "profile-compression", wireVersion: "lbh-multiplayer-json-v2",
      capabilities: [...dependencies, "state-pair-brotli-v1"],
      manifestSchema: "lbh-session-replication-manifest-v1", manifestHash: "sha256:manifest",
      authorityIncarnation: 1,
    });
    const redeemed = registry.redeem(issued.ticket, { kind: "admission", runId: "run-a" });
    const expected = [...dependencies, "state-pair-brotli-v1"].sort();
    assert(JSON.stringify(redeemed.claims.capabilities) === JSON.stringify(expected),
      "Redemption must return the exact deterministic compression capability set");
    assert(!redeemed.claims.capabilities.includes("state-pair-binary-v1"),
      "Compression ticket must remain outside the binary codec branch");
  });

  await runner.run("expiry is deterministic under an injected clock", async () => {
    let clock = 10_000;
    const registry = createMultiplayerTicketRegistry({ runId: "run-a", now: () => clock });
    const issued = registry.issueAdmission(claims("expiry"));
    assert(issued.expiresAt === clock + DEFAULT_TTL_MS, "Default TTL should be 30 seconds");
    clock = issued.expiresAt;
    expectTicketError(
      () => registry.redeem(issued.ticket, { kind: "admission", runId: "run-a" }),
      "expired-ticket",
    );
    assert(registry.diagnostics().retained === 0, "Expired ticket should be pruned after rejection");
  });

  await runner.run("wrong-kind and cross-run redemption fail without consuming the ticket", async () => {
    const registry = createMultiplayerTicketRegistry({ runId: "run-a", now: () => 20_000 });
    const issued = registry.issueAdmission(claims("scope"));
    expectTicketError(
      () => registry.redeem(issued.ticket, { kind: "resume", runId: "run-a" }),
      "wrong-ticket-kind",
    );
    expectTicketError(
      () => registry.redeem(issued.ticket, { kind: "admission", runId: "run-b" }),
      "cross-run-ticket",
    );
    const redeemed = registry.redeem(issued.ticket, { kind: "admission", runId: "run-a" });
    assert(redeemed.claims.profileId === "profile-scope", "Rejected scope checks must not consume ticket");
  });

  await runner.run("capacity includes replay tombstones and recovers only after deterministic expiry", async () => {
    let clock = 30_000;
    let byte = 1;
    const registry = createMultiplayerTicketRegistry({
      runId: "run-a",
      now: () => clock,
      ttlMs: 100,
      capacity: 2,
      randomBytes(size) {
        const buffer = Buffer.alloc(size, byte);
        byte += 1;
        return buffer;
      },
    });
    const first = registry.issueAdmission(claims("1"));
    registry.issueAdmission(claims("2"));
    registry.redeem(first.ticket, { kind: "admission", runId: "run-a" });
    expectTicketError(() => registry.issueAdmission(claims("3")), "ticket-capacity-exceeded");
    clock += 100;
    const third = registry.issueAdmission(claims("3"));
    assert(third.ticket !== first.ticket, "Fresh issuance should not recycle an old secret");
    assert(registry.diagnostics().retained === 1, "Issuance should prune all expired records first");
  });

  await runner.run("reset and run rotation invalidate every outstanding ticket", async () => {
    const registry = createMultiplayerTicketRegistry({ runId: "run-a", now: () => 40_000 });
    const resetTicket = registry.issueAdmission(claims("reset"));
    assert(registry.reset() === 1, "Reset should report invalidated tickets");
    expectTicketError(
      () => registry.redeem(resetTicket.ticket, { kind: "admission", runId: "run-a" }),
      "unknown-ticket",
    );

    const rotateTicket = registry.issueAdmission(claims("rotate"));
    const rotation = registry.rotateRun("run-b");
    assert(rotation.runId === "run-b" && rotation.invalidated === 1, "Rotation should clear tickets and report new run");
    expectTicketError(
      () => registry.redeem(rotateTicket.ticket, { kind: "admission", runId: "run-a" }),
      "unknown-ticket",
    );
    const current = registry.issueAdmission(claims("current"));
    registry.redeem(current.ticket, { kind: "admission", runId: "run-b" });
  });

  await runner.run("malformed tickets and caller-selected identity fields are rejected", async () => {
    const registry = createMultiplayerTicketRegistry({ runId: "run-a", now: () => 50_000 });
    expectTicketError(
      () => registry.redeem("membership-a", { kind: "admission", runId: "run-a" }),
      "malformed-ticket",
    );
    expectTicketError(
      () => registry.issueAdmission({ ...claims(), clientId: "browser-client" }),
      "invalid-claim",
    );
  });

  await runner.run("diagnostics contain counts but no ticket, digest, or claim secrets", async () => {
    const registry = createMultiplayerTicketRegistry({ runId: "run-safe", now: () => 60_000 });
    const issued = registry.issueResume({
      ...claims("diagnostic-secret"),
      connectionId: "connection-secret",
      connectionEpoch: 2,
    });
    const diagnosticText = JSON.stringify(registry.diagnostics());
    for (const secret of [issued.ticket, "membership-diagnostic-secret", "authority-player-diagnostic-secret", "profile-diagnostic-secret", "connection-secret"]) {
      assert(!diagnosticText.includes(secret), `Diagnostics leaked secret ${secret}`);
    }
    assert(registry.diagnostics().counts.resume === 1, "Diagnostics should expose safe kind counts");
  });

  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
