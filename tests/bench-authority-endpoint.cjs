#!/usr/bin/env node
"use strict";

const assert = require("assert");
const http = require("http");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function getJson(port, route) {
  return requestJson(port, "GET", route);
}

function requestJson(port, method, route, payload) {
  return new Promise((resolve, reject) => {
    const body = payload === undefined ? "" : JSON.stringify(payload);
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: route,
      method,
      headers: body ? { "content-type": "application/json", "content-length": Buffer.byteLength(body) } : {},
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch (error) { reject(error); }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function waitForBench(port) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try { return await getJson(port, "/bench"); } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Bench endpoint did not start");
}

(async () => {
  const port = await freePort();
  const child = spawn(process.execPath, [
    "scripts/sim-runtime.cjs",
    "--host", "127.0.0.1",
    "--port", String(port),
    "--bench", "true",
    "--keep-alive", "true",
  ], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    const response = await waitForBench(port);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.ok, true);
    assert.strictEqual(response.body.enabled, true);
    assert.strictEqual(response.body.gallery.id, "bench-gallery-v1");
    assert.strictEqual(response.body.gallery.bays.filter((bay) => bay.simulation === "active").length, 1);
    const wellAdapter = response.body.adapters.find((adapter) => adapter.id === "well.standard");
    assert.strictEqual(wellAdapter.properties[0].currentValue, 220);
    const initialWells = response.body.world.entities.filter((entity) => entity.archetype === "well.standard");
    assert.strictEqual(initialWells.length, 2);
    assert.ok(initialWells.every((well) => well.influenceRadius === 220 && well.rulerFacts[0].distance === 220));

    const edit = await requestJson(port, "POST", "/bench/edit", {
      adapterId: "well.standard",
      propertyId: "influenceRadius",
      value: 300,
    });
    assert.strictEqual(edit.status, 200);
    assert.ok(edit.body.state.world.entities.filter((entity) => entity.archetype === "well.standard")
      .every((well) => well.influenceRadius === 300 && well.linkedSlingshot.captureDistance === 210));
    assert.strictEqual(edit.body.state.adapters[0].properties[0].currentValue, 300);

    const replayEdited = await requestJson(port, "POST", "/bench/replay", {});
    assert.ok(replayEdited.body.authorityTruth.world.entities
      .filter((entity) => entity.archetype === "well.standard")
      .every((well) => well.influenceRadius === 300));

    const resetWell = await requestJson(port, "POST", "/bench/reset", {
      adapterId: "well.standard",
      propertyId: "influenceRadius",
    });
    assert.strictEqual(resetWell.status, 200);
    const resetState = await getJson(port, "/bench");
    assert.ok(resetState.body.world.entities.filter((entity) => entity.archetype === "well.standard")
      .every((well) => well.influenceRadius === 220));
    const health = await getJson(port, "/health");
    assert.strictEqual(health.body.mapId, "bench-gallery-v1");
    assert.strictEqual(health.body.idleState.idle, false);
    assert.strictEqual(health.body.idleState.shutdownInMs, null);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const snapshot = await getJson(port, "/snapshot");
    assert.strictEqual(snapshot.status, 200);
    assert.strictEqual(snapshot.body.bench.galleryId, "bench-gallery-v1");
    assert.ok(snapshot.body.bench.world.entities.length > 0);
    const probe = snapshot.body.bench.world.entities.find((entity) => entity.family === "probe-ship");
    assert.strictEqual(probe.invulnerable, true);
    assert.strictEqual(probe.infiniteFuel, true);
    assert.ok(snapshot.body.bench.world.entities.filter((entity) => entity.active)
      .every((entity) => entity.scenarioTicks > 0));
    assert.ok(snapshot.body.bench.world.entities.filter((entity) => !entity.active)
      .every((entity) => entity.scenarioTicks === 0));

    const maps = await getJson(port, "/maps");
    assert.ok(!maps.body.maps.some((map) => map.id === "bench-gallery-v1"));

    const replayA = await requestJson(port, "POST", "/bench/replay", {});
    await new Promise((resolve) => setTimeout(resolve, 50));
    const replayB = await requestJson(port, "POST", "/bench/replay", { worldTruth: { forged: true } });
    assert.deepStrictEqual(replayA.body.authorityTruth, replayB.body.authorityTruth);

    const badBay = await requestJson(port, "POST", "/bench/bay", { activeBayId: "not-a-bay" });
    assert.strictEqual(badBay.status, 400);
    assert.strictEqual(badBay.body.code, "bench-validation");
    const badPatch = await requestJson(port, "POST", "/bench/patch", { patch: { schema: "wrong", edits: [] } });
    assert.strictEqual(badPatch.status, 400);
    assert.strictEqual(badPatch.body.code, "bench-validation");
    const badReset = await requestJson(port, "POST", "/bench/reset", { adapterId: "not-an-adapter" });
    assert.strictEqual(badReset.status, 400);
    assert.strictEqual(badReset.body.code, "bench-validation");
    console.log("Bench authority endpoint: PASS");
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
  if (stderr) process.stderr.write(stderr);
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
