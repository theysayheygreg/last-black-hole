"use strict";

const assert = require("node:assert/strict");
const { AUTHORITY_ENV, collectorReady } = require("../scripts/v04-authority-benchmark-entrypoint.cjs");

assert.equal(AUTHORITY_ENV.LBH_SIM_WS_REPLICATION_ACCOUNTING, undefined,
  "hosted authority must not enable the test-only replication ledger");
assert.equal(AUTHORITY_ENV.LBH_REPLICATION_BASELINE_CAPTURE, undefined,
  "hosted authority must not masquerade as a test capture");

const calls = [];
const execute = (name, args, options) => {
  calls.push({ name, args, options });
  return { status: name === "tcpdump" ? 255 : 0 };
};

assert.equal(collectorReady("ss", ["--version"], execute), true);
assert.equal(collectorReady("tcpdump", ["-D"], execute), false,
  "an installed collector that lacks packet-capture capability must fail readiness");
assert.deepEqual(calls.map(({ name, args }) => ({ name, args })), [
  { name: "ss", args: ["--version"] },
  { name: "tcpdump", args: ["-D"] },
]);
for (const call of calls) {
  assert.equal(call.options.timeout, 5_000);
  assert.deepEqual(call.options.stdio, ["ignore", "pipe", "pipe"]);
}

assert.equal(collectorReady("tcpdump", ["-D"], () => ({ status: 0 })), true);
assert.equal(collectorReady("tcpdump", ["-D"], () => ({ status: 0, error: new Error("spawn") })), false);

console.log("v0.4 benchmark entrypoint: collector execution readiness PASS");
