#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const { RAW_OUTPUT, REQUESTED_CLIENTS, SEALED_PREFLIGHT_COMMIT, inspectEligibility } =
  require("../scripts/s24-live-loopback-eligibility.cjs");

const result = inspectEligibility();
assert.strictEqual(result.schema, "lbh-s24-live-loopback-eligibility-v1");
assert.strictEqual(result.eligible, false);
assert.strictEqual(result.decision, "stop-before-live-run");
assert.strictEqual(result.rawRunConsumed, false);
assert.strictEqual(fs.existsSync(RAW_OUTPUT), false);
assert.strictEqual(REQUESTED_CLIENTS, 24);
assert.strictEqual(SEALED_PREFLIGHT_COMMIT, "eaaa811");
assert.strictEqual(result.requested.logicalGameplayWritersPerMatch, 1);
assert.strictEqual(result.requested.workers, 0);
assert.strictEqual(result.observedStaticRuntimeBoundary.websocketAdapterMaxConnections, 16);
assert.strictEqual(result.observedStaticRuntimeBoundary.deepFieldMaxScavengers, 7);
assert(result.reasons.some((reason) => reason.code === "adapter-connection-cap"
  && reason.requested === 24 && reason.supported === 16));
assert(result.reasons.some((reason) => reason.code === "expensive-ai-vector-unavailable"
  && reason.requested === 48 && reason.supported === 7));
assert(result.reasons.some((reason) => reason.code === "body-vector-unconfigured"
  && reason.requested === 400 && reason.supported === null));
console.log("s24 live loopback eligibility correctly blocks before raw run");
