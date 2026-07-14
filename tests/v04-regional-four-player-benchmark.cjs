#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const {
  analyze,
  signRawArtifact,
  smokeFixture,
  measured,
} = require("../scripts/v04-regional-four-player-benchmark.cjs");
const { TestRunner, assert } = require("./helpers.cjs");

function keys() { return crypto.generateKeyPairSync("ed25519"); }

function signedFixture(pair, mutate = () => {}) {
  const raw = smokeFixture(pair.publicKey);
  mutate(raw);
  return signRawArtifact(raw, pair.privateKey, pair.publicKey);
}

function externalFixture(pair, mutate = () => {}) {
  return signedFixture(pair, (raw) => {
    raw.metadata.runClass = "external-one-shot";
    raw.metadata.admissionEligible = true;
    raw.metadata.provider = "fixture-provider";
    raw.metadata.region = "fixture-region-1";
    raw.metadata.hostClass = "fixture-dedicated-cpu";
    raw.metadata.invoice = {
      currency: "USD",
      computeRate: measured("USD/hour", 0.05),
      egressRate: measured("USD/GB", 0.02),
      billingSource: "fixture-invoice-line-items",
      invoiceObserved: true,
    };
    raw.chronology.replacementMs = measured("ms", 1_200);
    raw.clients.forEach((client) => {
      client.reconnectMs = measured("ms", 850);
      Object.assign(client.network, {
        socketAccountingSource: "fixture-host-socket-counters",
        onWireAccountingSource: "fixture-packet-capture",
        socketBytesPerSecondMean: measured("B/s", 33_000), socketBytesPerSecondP95: measured("B/s", 36_000),
        onWireBytesPerSecondMean: measured("B/s", 35_000), onWireBytesPerSecondP95: measured("B/s", 39_000),
        packetsPerSecondMean: measured("packets/s", 20), packetsPerSecondP95: measured("packets/s", 24),
        retransmittedBytes: measured("bytes", 0), retransmittedPackets: measured("packets", 0), lossRate: measured("ratio", 0),
      });
    });
    Object.assign(raw.metrics.matchNetwork, {
      socketBytesPerSecondMean: measured("B/s", 132_000), onWireBytesPerSecondMean: measured("B/s", 140_000),
      packetsPerSecondMean: measured("packets/s", 80), retransmittedBytes: measured("bytes", 0),
      retransmittedPackets: measured("packets", 0), lossRate: measured("ratio", 0),
    });
    raw.metrics.networkReconciliation = {
      applicationCounterSource: "fixture-application-ledger", socketCounterSource: "fixture-host-socket-counters",
      packetCaptureSource: "fixture-packet-capture", capturedConnections: 4,
      unexplainedByteRatio: measured("ratio", 0.01),
    };
    mutate(raw);
  });
}

function mustReject(pair, mutate, pattern, { external = false } = {}) {
  const artifact = external ? externalFixture(pair, mutate) : signedFixture(pair, mutate);
  let error = null;
  try { analyze(artifact, { trustedPublicKeyPem: pair.publicKey }); } catch (caught) { error = caught; }
  assert(error && pattern.test(error.message), `expected ${pattern}, got ${error?.message || "no rejection"}`);
}

function rejectCall(callback, pattern) {
  let error = null;
  try { callback(); } catch (caught) { error = caught; }
  assert(error && pattern.test(error.message), `expected ${pattern}, got ${error?.message || "no rejection"}`);
}

async function run() {
  const runner = new TestRunner("V04RegionalFourPlayerBenchmark");

  await runner.run("accepts a signed local contract smoke only as non-admission evidence", async () => {
    const pair = keys();
    const analysis = analyze(signedFixture(pair), { trustedPublicKeyPem: pair.publicKey });
    assert(analysis.verdict === "LOCAL_NON_ADMISSION" && analysis.admissionEligible === false,
      "local smoke must never produce an admission verdict");
    assert(analysis.checks.find((entry) => entry.id === "network-reconciled").passed === false,
      "local smoke must make unavailable external network evidence explicit");
    assert(analysis.safeAuthoritiesPerHost.status === "unavailable", "packing stays unknown");
  });

  await runner.run("accepts a valid external artifact and preserves measured versus derived labels", async () => {
    const pair = keys();
    const analysis = analyze(externalFixture(pair), { trustedPublicKeyPem: pair.publicKey });
    assert(analysis.verdict === "PASS" && analysis.admissionEligible === true, "external passing evidence should pass");
    assert(analysis.evidenceLabels.measuredVsDerivedPreserved, "analysis must preserve evidence labels");
  });

  await runner.run("rejects missing provider/runtime/invoice metadata", async () => {
    const pair = keys();
    mustReject(pair, (raw) => { delete raw.metadata.provider; }, /metadata\.provider is required/);
    mustReject(pair, (raw) => { delete raw.metadata.invoice.egressRate; }, /metadata\.invoice\.egressRate is required/);
  });

  await runner.run("rejects forged SHA, signature, chronology, and untrusted signer", async () => {
    const pair = keys();
    const artifact = signedFixture(pair);
    artifact.metadata.region = "forged-region";
    rejectCall(() => analyze(artifact, { trustedPublicKeyPem: pair.publicKey }), /SHA-256 mismatch/);
    const resigned = signedFixture(pair, (raw) => { raw.chronology.captureEndedAt = raw.chronology.captureStartedAt; });
    rejectCall(() => analyze(resigned, { trustedPublicKeyPem: pair.publicKey }), /paced capture must be at least 20 seconds/);
    const other = keys();
    rejectCall(() => analyze(signedFixture(pair), { trustedPublicKeyPem: other.publicKey }), /not the trusted capture signer/);
    const badSignature = signedFixture(pair);
    badSignature.integrity.signatureBase64 = Buffer.alloc(64).toString("base64");
    rejectCall(() => analyze(badSignature, { trustedPublicKeyPem: pair.publicKey }), /signature verification failed/);
  });

  await runner.run("rejects retries and mixed commits in final external evidence", async () => {
    const pair = keys();
    mustReject(pair, (raw) => { raw.metadata.retries = 1; }, /zero retries/, { external: true });
    mustReject(pair, (raw) => { raw.processes[0].gitCommit = "f".repeat(40); }, /mixed commits/, { external: true });
  });

  await runner.run("rejects application bytes relabeled as wire bytes", async () => {
    const pair = keys();
    mustReject(pair, (raw) => {
      const client = raw.clients[0];
      client.network.onWireAccountingSource = "application-only";
      client.network.onWireBytesPerSecondMean = structuredClone(client.network.applicationBytesPerSecondMean);
    }, /cannot be relabeled as real socket\/on-wire bytes/, { external: true });
    mustReject(pair, (raw) => {
      raw.clients[1].network.onWireBytesPerSecondMean = {
        status: "unavailable", unit: "B/s", reason: "packet capture missing",
      };
    }, /cannot be unavailable/, { external: true });
  });

  await runner.run("rejects unavailable metrics masquerading as zero", async () => {
    const pair = keys();
    mustReject(pair, (raw) => {
      raw.clients[0].reconnectMs = { status: "unavailable", unit: "ms", value: 0, reason: "not run" };
    }, /unavailable must not masquerade as zero\/value/);
    mustReject(pair, (raw) => {
      raw.metrics.process.gcPauseMs = { status: "unavailable", unit: "ms", reason: "not instrumented" };
    }, /cannot be unavailable/);
  });

  await runner.run("rejects partial clients and any admitted fifth seat", async () => {
    const pair = keys();
    mustReject(pair, (raw) => { raw.clients.pop(); }, /exactly four isolated clients/);
    mustReject(pair, (raw) => { raw.admission = { admittedSeats: 5, fifthSeat: "admitted" }; }, /fifth seat must be rejected/);
  });

  await runner.run("rejects secret or durable PII keys anywhere in public evidence", async () => {
    const pair = keys();
    mustReject(pair, (raw) => { raw.clients[0].accountId = "acct-private"; }, /secret\/PII leakage/);
    mustReject(pair, (raw) => { raw.outcomes.cleanup.admissionTicket = "secret"; }, /secret\/PII leakage/);
    mustReject(pair, (raw) => { raw.outcomes.cleanup.note = "Bearer abc.def.ghi"; }, /secret\/PII leakage/);
  });

  await runner.run("rejects a false packing claim from single-authority evidence", async () => {
    const pair = keys();
    mustReject(pair, (raw) => {
      raw.packing.safeAuthoritiesPerHost = { status: "derived", unit: "authorities/host", value: 2,
        formula: "copies/ccu", inputs: ["copies"] };
    }, /stays unknown until density evidence/);
  });

  await runner.run("rejects a second authority process and non-monotonic percentiles", async () => {
    const pair = keys();
    mustReject(pair, (raw) => { raw.processes.push(structuredClone(raw.processes[0])); }, /exactly one authority process/);
    mustReject(pair, (raw) => { raw.metrics.latencyMs.projection.p95.value = 80; }, /percentiles are not monotonic/);
  });

  await runner.run("returns FAIL rather than fabricating PASS when an admission gate misses", async () => {
    const pair = keys();
    const artifact = externalFixture(pair, (raw) => {
      raw.metrics.latencyMs.projection.p95.value = 55;
      raw.metrics.latencyMs.projection.p99.value = 65;
    });
    const analysis = analyze(artifact, { trustedPublicKeyPem: pair.publicKey });
    assert(analysis.verdict === "FAIL", "valid but gate-failing evidence must be retained as FAIL");
    assert(analysis.checks.find((entry) => entry.id === "projection-p95").passed === false,
      "failure must identify the exact gate");
  });

  runner.summary();
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
