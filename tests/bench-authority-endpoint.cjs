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
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path: route }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch (error) { reject(error); }
      });
    });
    req.on("error", reject);
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
    assert.deepStrictEqual(response.body.adapters, []);
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
