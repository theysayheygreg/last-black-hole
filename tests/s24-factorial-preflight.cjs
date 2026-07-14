#!/usr/bin/env node
"use strict";

const assert = require("assert");
const {
  SCHEMA,
  FACTORS,
  H_VECTORS,
  combinations,
  ols,
  predict,
  replicationBeat,
  runH24,
  makeBodies,
} = require("../scripts/s24-factorial-preflight.cjs");

async function main() {
  const design = combinations();
  assert.strictEqual(design.length, 128, "S24 writer design must remain a full 2^7 factorial");
  for (const [name, levels] of Object.entries(FACTORS)) {
    assert.deepStrictEqual([...new Set(design.map((row) => row[name]))].sort((a, b) => a - b), levels,
      `${name} must retain both independently varied levels`);
  }

  const exactRows = [];
  for (let x = 0; x < 8; x += 1) {
    for (let y = 0; y < 5; y += 1) exactRows.push({ x, y, ms: 2 + 3 * x + 5 * y });
  }
  const fit = ols(exactRows, "ms", ["x", "y"]);
  assert(Math.abs(fit.coefficients.intercept - 2) < 1e-9);
  assert(Math.abs(fit.coefficients.x - 3) < 1e-9);
  assert(Math.abs(fit.coefficients.y - 5) < 1e-9);
  assert(fit.rSquared > 0.999999);
  const forecast = predict(fit, { x: 10, y: 7 });
  assert(Math.abs(forecast.base - 67) < 1e-9, "factor forecast must use fitted coefficients");

  assert.deepStrictEqual(
    Object.fromEntries(Object.entries(H_VECTORS).map(([name, vector]) =>
      [name, [vector.humans, vector.bodies, vector.ai]])),
    { H24: [24, 400, 48], H48: [48, 900, 96], H96: [96, 1800, 192], X96: [96, 3000, 384] },
    "scale vectors must match the v0.4 roadmap",
  );

  const bodies = makeBodies(400, false, 1);
  const frame = replicationBeat({ bodies, recipients: 24, changedBodies: 100, tick: 1 });
  assert(frame.compressedPublicBytes > 0 && frame.compressedOwnerBytes > 0);
  assert.strictEqual(frame.messages, 48, "one shared public and one owner frame per recipient are accounted");
  assert.strictEqual(frame.matchBytes,
    frame.compressedPublicBytes * 24 + frame.compressedOwnerBytes,
    "match egress must fan the public fragment to every client and add owner overlays");
  assert(!JSON.stringify(frame).includes("clientId") && !JSON.stringify(frame).includes("recipientId"),
    "S24 accounting must not retain raw client identifiers");

  const h24 = await runH24({ beats: 60, dense: false });
  assert.strictEqual(h24.fixture, "H24-representative");
  assert.strictEqual(h24.vector.humans, 24);
  assert.strictEqual(h24.vector.bodies, 400);
  assert.strictEqual(h24.vector.ai, 48);
  assert.strictEqual(h24.writer.count, 60);
  assert(h24.network.applicationPayloadBytesPerSecondPerClient > 0);
  assert(h24.cpu.meanBillableCores > 0 && h24.cpu.p99TickCoreDemandAt30Hz > 0);
  assert(h24.memory.peakSyntheticQueueBytes > 0);
  assert.strictEqual(h24.classification,
    "measured deterministic synthetic fixture using production Ballpark and Node Brotli; not live sim or socket proof");
  assert.strictEqual(SCHEMA, "lbh-s24-factorial-preflight-v1");
  console.log("S24 factorial preflight contract tests passed");
}

main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
