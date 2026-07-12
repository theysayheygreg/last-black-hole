const assert = require("assert");
const fs = require("fs");
const net = require("net");
const path = require("path");
const { ManagedToxiproxy } = require("./network/toxiproxy-control.cjs");

function startEchoServer() {
  const server = net.createServer((socket) => socket.pipe(socket));
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

function echoThrough(port, payload) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const chunks = [];
    let bytes = 0;
    const timer = setTimeout(() => socket.destroy(new Error("Timed out waiting for proxied echo")), 4_000);
    socket.on("connect", () => socket.write(payload));
    socket.on("data", (chunk) => {
      chunks.push(chunk);
      bytes += chunk.length;
      if (bytes >= payload.length) socket.end();
    });
    socket.on("end", () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks));
    });
    socket.on("error", (error) => { clearTimeout(timer); reject(error); });
  });
}

async function main() {
  const echo = await startEchoServer();
  const upstream = `127.0.0.1:${echo.address().port}`;
  const workDir = path.resolve("tmp", `toxiproxy-control-proof-${process.pid}`);
  const controller = new ManagedToxiproxy({ workDir });
  let cleanup = null;
  let handlingSignal = false;
  const onSignal = async (name) => {
    if (handlingSignal) return;
    handlingSignal = true;
    try { await controller.cleanup(); } catch (error) { console.error(`Toxiproxy signal cleanup failed: ${error.message}`); }
    try { await closeServer(echo); } catch {}
    process.exit(name === "SIGINT" ? 130 : 143);
  };
  process.once("SIGINT", onSignal.bind(null, "SIGINT"));
  process.once("SIGTERM", onSignal.bind(null, "SIGTERM"));
  try {
    const daemon = await controller.start();
    assert.strictEqual(daemon.version, "2.12.0");
    assert.strictEqual(daemon.sha256, controller.tool.asset.sha256, "daemon must use the selected platform's pinned hash");

    const proxyA = await controller.createProxy({ name: "control_a", upstream });
    const proxyB = await controller.createProxy({ name: "control_b", upstream });
    assert.notStrictEqual(proxyA.listen, proxyB.listen, "two owned proxies must receive independent ephemeral listeners");

    const profile = { upstreamLatencyMs: 25, upstreamRateKBps: 66, downstreamLatencyMs: 45, downstreamRateKBps: 328 };
    await controller.createInactiveProfile("control_a", profile);
    await controller.createInactiveProfile("control_b", profile);
    const before = await controller.snapshot();
    const expectedChain = [
      { attributes: { jitter: 0, latency: 25 }, name: "upstream_latency", stream: "upstream", toxicity: 0, type: "latency" },
      { attributes: { rate: 66 }, name: "upstream_bandwidth", stream: "upstream", toxicity: 0, type: "bandwidth" },
      { attributes: { jitter: 0, latency: 45 }, name: "downstream_latency", stream: "downstream", toxicity: 0, type: "latency" },
      { attributes: { rate: 328 }, name: "downstream_bandwidth", stream: "downstream", toxicity: 0, type: "bandwidth" },
    ];
    for (const name of ["control_a", "control_b"]) {
      assert.deepStrictEqual(before[name].toxics, expectedChain, `${name} must preserve the exact ordered inactive profile`);
    }

    const activated = await controller.patchToxic("control_a", "upstream_latency", { toxicity: 1 });
    assert.strictEqual(activated.toxicity, 1, "typed PATCH must activate the named toxic");
    const restored = await controller.patchToxic("control_a", "upstream_latency", { toxicity: 0 });
    assert.strictEqual(restored.toxicity, 0, "typed PATCH must restore the named toxic");
    assert.strictEqual(await controller.removeToxic("control_b", "downstream_bandwidth"), true);
    assert.strictEqual(await controller.removeToxic("control_b", "downstream_bandwidth"), false, "toxic removal must be idempotent");

    const payloadA = Buffer.alloc(24 * 1024, 0x41);
    const payloadB = Buffer.alloc(4 * 1024, 0x42);
    assert.deepStrictEqual(await echoThrough(proxyA.listener.port, payloadA), payloadA);
    assert.deepStrictEqual(await echoThrough(proxyB.listener.port, payloadB), payloadB);
    const metrics = await controller.metrics();
    const directional = new Map(metrics.directionalBytes.map((row) => [`${row.family}:${row.proxy}:${row.direction}`, row.value]));
    for (const name of ["control_a", "control_b"]) {
      for (const family of ["toxiproxy_proxy_received_bytes_total", "toxiproxy_proxy_sent_bytes_total"]) {
        assert(directional.get(`${family}:${name}:upstream`) > 0, `${name} must expose ${family} upstream growth after the echo socket ends`);
        assert(directional.get(`${family}:${name}:downstream`) > 0, `${name} must expose ${family} downstream growth after the echo socket ends`);
      }
    }
    assert(directional.get("toxiproxy_proxy_received_bytes_total:control_a:upstream")
      > directional.get("toxiproxy_proxy_received_bytes_total:control_b:upstream"), "proxy byte counters must remain independently attributable");

    cleanup = await controller.cleanup();
    assert.deepStrictEqual(await controller.cleanup(), cleanup, "controller cleanup must be idempotent");
    assert(cleanup.toxicsRemoved && cleanup.proxiesDeleted && cleanup.daemonStopped && cleanup.controlPortClosed && cleanup.proxyPortsClosed);
    assert.strictEqual(cleanup.forcedKill, false, "healthy control proof should stop with bounded SIGTERM");
    assert(fs.statSync(controller.journalPath).size > 0, "controller must persist its command journal");
    assert(fs.statSync(controller.stdoutPath).isFile() && fs.statSync(controller.stderrPath).isFile(), "controller must own daemon logs");
    assert(controller.journal.every((entry) => Number.isFinite(entry.monoMs) && entry.wallTime), "every journal entry must carry wall and monotonic time");
    assert.strictEqual(controller.firstFailure, null, "healthy proof must not record a control failure");
    console.log(`PASS Toxiproxy control (non-timing lifecycle proof only; active latency/rate shaping is deferred to T1): pid=${daemon.pid} listeners=${proxyA.listen},${proxyB.listen} journal=${controller.journalPath}`);
  } finally {
    try { if (!cleanup) await controller.cleanup(); } catch (error) { console.error(`Toxiproxy cleanup failed: ${error.message}`); }
    await closeServer(echo);
  }

  const faultEcho = await startEchoServer();
  const faultWorkDir = path.resolve("tmp", `toxiproxy-control-fault-proof-${process.pid}`);
  const faultController = new ManagedToxiproxy({ workDir: faultWorkDir });
  try {
    await faultController.start();
    const faultUpstream = `127.0.0.1:${faultEcho.address().port}`;
    await faultController.createProxy({ name: "fault_toxic_proxy", upstream: faultUpstream });
    const originalRequest = faultController.request.bind(faultController);
    faultController.request = async (method, route, body, options) => {
      const response = await originalRequest(method, route, body, options);
      if (method === "POST" && route === "/proxies" && body?.name === "fault_proxy_requested") {
        return { ...response, name: "fault_proxy_returned" };
      }
      if (method === "POST" && route === "/proxies/fault_toxic_proxy/toxics" && body?.name === "fault_toxic_requested") {
        return { ...response, name: "fault_toxic_returned" };
      }
      return response;
    };
    await assert.rejects(
      faultController.createToxic("fault_toxic_proxy", {
        name: "fault_toxic_requested", type: "latency", stream: "upstream", toxicity: 0, attributes: { latency: 25, jitter: 0 },
      }),
      /invalid toxic object/,
    );
    await assert.rejects(
      faultController.createProxy({ name: "fault_proxy_requested", upstream: faultUpstream }),
      /invalid proxy object/,
    );
    assert.strictEqual(faultController.toxics.get("fault_toxic_proxy").get("fault_toxic_requested").apiName, "fault_toxic_requested");
    assert.strictEqual(faultController.proxies.get("fault_proxy_requested").apiName, "fault_proxy_requested");
    await faultController.cleanup();
    const deleteRoutes = faultController.journal
      .filter((entry) => entry.phase === "request" && entry.method === "DELETE")
      .map((entry) => entry.route);
    assert(deleteRoutes.includes("/proxies/fault_toxic_proxy/toxics/fault_toxic_requested"), "malformed toxic response cleanup must DELETE the requested POST-body name");
    assert(deleteRoutes.includes("/proxies/fault_proxy_requested"), "malformed proxy response cleanup must DELETE the requested POST-body name");
    assert(!deleteRoutes.some((route) => route.includes("fault_toxic_returned") || route.includes("fault_proxy_returned")), "cleanup must never trust a mismatched returned name");
    console.log("PASS Toxiproxy malformed-response cleanup keeps requested POST-body identities");
  } finally {
    try { await faultController.cleanup(); } catch {}
    await closeServer(faultEcho);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
