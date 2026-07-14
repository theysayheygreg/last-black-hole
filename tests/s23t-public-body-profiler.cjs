#!/usr/bin/env node
"use strict";

const assert = require("assert");
const path = require("path");
const { spawnSync } = require("child_process");
const { STAGES, SAMPLE_CAPACITY, createS23tPublicBodyProfiler } =
  require("../scripts/s23t-public-body-profiler.cjs");

function main() {
  const profiler = createS23tPublicBodyProfiler();
  for (let index = 0; index < SAMPLE_CAPACITY + 7; index += 1) {
    profiler.beginBeat();
    profiler.measureSync(STAGES.PUBLIC_CORE, `private-recipient-${index % 3}`, () => index);
    profiler.measureSync(STAGES.BODY_NORMALIZE_VALIDATE, null, () => index);
    profiler.endBeat();
  }
  profiler.observe(STAGES.SIM_TICK, 1.25);
  const finish = profiler.startAsync(STAGES.SOCKET_CALLBACK);
  finish();
  const snapshot = profiler.snapshot();
  assert.strictEqual(snapshot.schema, "lbh-s23t-public-body-profile-v1");
  assert.strictEqual(snapshot.completeSourceBeats, SAMPLE_CAPACITY);
  assert.strictEqual(snapshot.sourceBeats[0].ordinal, 8);
  assert.strictEqual(snapshot.recipientSlots, 3);
  assert.strictEqual(snapshot.overflowRecipientObservations, 0);
  assert.strictEqual(snapshot.nestedTimerViolations, 0);
  assert(snapshot.stages[STAGES.PUBLIC_CORE].duration.count === SAMPLE_CAPACITY);
  assert(snapshot.stages[STAGES.SIM_TICK].duration.count === 1);
  assert(snapshot.stages[STAGES.SOCKET_CALLBACK].duration.count === 1);
  const text = JSON.stringify(snapshot.sourceBeats);
  assert(!text.includes("private-recipient"), "snapshot leaked a recipient identifier");
  assert(!text.includes("world") && !text.includes("ownerState"), "snapshot leaked value-bearing names");

  profiler.reset();
  profiler.beginBeat();
  assert.throws(() => profiler.measureSync(STAGES.PUBLIC_CORE, null, () =>
    profiler.measureSync(STAGES.BODY_NORMALIZE_VALIDATE, null, () => true)), /nesting/);
  assert.strictEqual(profiler.snapshot().nestedTimerViolations, 1);
  profiler.stop();

  const runtime = path.join(__dirname, "..", "scripts", "sim-runtime.cjs");
  const rejected = spawnSync(process.execPath, [runtime], { encoding: "utf8",
    env: { ...process.env, NODE_ENV: "production", LBH_S23T_PUBLIC_BODY_PROFILE: "1" } });
  assert.notStrictEqual(rejected.status, 0, "product mode unexpectedly enabled the S23T profiler");
  assert(`${rejected.stdout}${rejected.stderr}`.includes("restricted to the S23T evidence harness"));
  console.log("S23T bounded profiler tests passed");
}

main();
