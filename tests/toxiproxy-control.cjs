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

function openEchoConnection(port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const state = { socket, bytes: 0, closed: false, error: null };
    socket.on("data", (chunk) => { state.bytes += chunk.length; });
    socket.on("close", () => { state.closed = true; });
    socket.on("error", (error) => { state.error = error; });
    socket.once("connect", () => resolve(state));
    socket.once("error", reject);
  });
}

async function waitFor(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function writeAndAwaitEcho(connection, payload, timeoutMs = 2_000) {
  if (connection.closed) throw new Error("Cannot write to a closed echo connection");
  const target = connection.bytes + payload.length;
  connection.socket.write(payload);
  await waitFor(() => connection.bytes >= target, timeoutMs, `${payload.length} echoed bytes`);
}

async function closeConnection(connection) {
  if (!connection || connection.closed) return;
  connection.socket.end();
  await waitFor(() => connection.closed, 1_000, "echo connection close");
}

function installSignalCleanup(controller, echo) {
  let handlingSignal = false;
  const handlers = {};
  for (const name of ["SIGINT", "SIGTERM"]) {
    handlers[name] = async () => {
      if (handlingSignal) return;
      handlingSignal = true;
      try { await controller.cleanup(); } catch (error) { console.error(`Toxiproxy signal cleanup failed: ${error.message}`); }
      try { await closeServer(echo); } catch {}
      process.exit(name === "SIGINT" ? 130 : 143);
    };
    process.once(name, handlers[name]);
  }
  return () => {
    for (const name of ["SIGINT", "SIGTERM"]) process.removeListener(name, handlers[name]);
  };
}

async function main() {
  const baselineSignalListeners = Object.fromEntries(["SIGINT", "SIGTERM"].map((name) => [name, process.listenerCount(name)]));
  const echo = await startEchoServer();
  const upstream = `127.0.0.1:${echo.address().port}`;
  const workDir = path.resolve("tmp", `toxiproxy-control-proof-${process.pid}`);
  const controller = new ManagedToxiproxy({ workDir });
  let cleanup = null;
  const removePrimarySignalCleanup = installSignalCleanup(controller, echo);
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

    for (const name of ["control_a", "control_b"]) {
      for (const toxic of [...controller.toxics.get(name).keys()]) await controller.removeToxic(name, toxic);
    }
    await controller.createToxic("control_a", {
      name: "blackout_upstream", type: "timeout", stream: "upstream", toxicity: 0, attributes: { timeout: 0 },
    });
    await controller.createToxic("control_a", {
      name: "blackout_downstream", type: "timeout", stream: "downstream", toxicity: 0, attributes: { timeout: 0 },
    });
    const impaired = await openEchoConnection(proxyA.listener.port);
    const healthy = await openEchoConnection(proxyB.listener.port);
    await writeAndAwaitEcho(impaired, Buffer.from("impaired-before-cut"));
    await writeAndAwaitEcho(healthy, Buffer.from("healthy-before-cut"));

    const activation = await Promise.allSettled([
      controller.patchToxic("control_a", "blackout_upstream", { toxicity: 1 }),
      controller.patchToxic("control_a", "blackout_downstream", { toxicity: 1 }),
    ]);
    assert(activation.every((result) => result.status === "fulfilled"), "both timeout toxics must activate transactionally");
    let blackoutSnapshot = await controller.snapshot();
    const exactActiveTimeouts = [
      { attributes: { timeout: 0 }, name: "blackout_upstream", stream: "upstream", toxicity: 1, type: "timeout" },
      { attributes: { timeout: 0 }, name: "blackout_downstream", stream: "downstream", toxicity: 1, type: "timeout" },
    ];
    assert.deepStrictEqual(blackoutSnapshot.control_a.toxics, exactActiveTimeouts, "the impaired path must expose the exact active bidirectional timeout pair");
    await new Promise((resolve) => setTimeout(resolve, 250));
    blackoutSnapshot = await controller.snapshot();
    assert.deepStrictEqual(blackoutSnapshot.control_a.toxics, exactActiveTimeouts, "guarded GET must retain the exact ordered active timeout pair");
    const impairedBytesAtGuard = impaired.bytes;
    impaired.socket.write(Buffer.from("must-not-progress"));
    await writeAndAwaitEcho(healthy, Buffer.from("healthy-during-blackout"));
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.strictEqual(impaired.bytes, impairedBytesAtGuard, "established impaired endpoint must make no echo progress during bounded observation");
    assert.strictEqual(impaired.closed, false, "timeout blackhole must retain the established impaired endpoint until the explicit fence");
    assert.strictEqual(healthy.closed, false, "healthy established endpoint must remain open during the other path's blackout");

    const disabled = await controller.updateProxyEnabled("control_a", false);
    assert.strictEqual(disabled.enabled, false);
    await waitFor(() => impaired.closed, 2_000, "disabled impaired connection close");
    assert.strictEqual(healthy.closed, false, "disabling the impaired proxy must not close the healthy connection");
    await writeAndAwaitEcho(healthy, Buffer.from("healthy-after-fence"));
    await controller.patchToxic("control_a", "blackout_upstream", { toxicity: 0 });
    await controller.patchToxic("control_a", "blackout_downstream", { toxicity: 0 });
    await controller.removeToxic("control_a", "blackout_upstream");
    await controller.removeToxic("control_a", "blackout_downstream");
    const pristineDisabled = await controller.snapshot();
    assert.strictEqual(pristineDisabled.control_a.enabled, false);
    assert.deepStrictEqual(pristineDisabled.control_a.toxics, [], "disabled impaired proxy must be pristine before re-enable");
    const reenabled = await controller.updateProxyEnabled("control_a", true);
    assert.strictEqual(reenabled.listen, proxyA.listen, "re-enable must preserve the exact listener");
    assert.strictEqual(reenabled.upstream, upstream, "re-enable must preserve the exact upstream");
    assert.deepStrictEqual(reenabled.toxics, [], "re-enable must not recreate removed timeout toxics");
    assert.deepStrictEqual(await echoThrough(proxyA.listener.port, Buffer.from("fresh-impaired-connection")), Buffer.from("fresh-impaired-connection"));
    assert.strictEqual(healthy.closed, false, "healthy connection must remain open across the complete impaired-path fence");
    await writeAndAwaitEcho(healthy, Buffer.from("healthy-final"));
    await closeConnection(healthy);

    cleanup = await controller.cleanup();
    assert.deepStrictEqual(await controller.cleanup(), cleanup, "controller cleanup must be idempotent");
    assert(cleanup.toxicsRemoved && cleanup.proxiesDeleted && cleanup.daemonStopped && cleanup.controlPortClosed && cleanup.proxyPortsClosed);
    assert.strictEqual(cleanup.forcedKill, false, "healthy control proof should stop with bounded SIGTERM");
    assert(fs.statSync(controller.journalPath).size > 0, "controller must persist its command journal");
    assert(fs.statSync(controller.stdoutPath).isFile() && fs.statSync(controller.stderrPath).isFile(), "controller must own daemon logs");
    assert(controller.journal.every((entry) => Number.isFinite(entry.monoMs) && entry.wallTime), "every journal entry must carry wall and monotonic time");
    assert.strictEqual(controller.firstFailure, null, "healthy proof must not record a control failure");
    console.log(`PASS Toxiproxy control and bounded one-path timeout/fence proof (userspace endpoint behavior only): pid=${daemon.pid} listeners=${proxyA.listen},${proxyB.listen} journal=${controller.journalPath}`);
  } finally {
    try { if (!cleanup) await controller.cleanup(); } catch (error) { console.error(`Toxiproxy cleanup failed: ${error.message}`); }
    await closeServer(echo);
    removePrimarySignalCleanup();
  }
  for (const name of ["SIGINT", "SIGTERM"]) assert.strictEqual(process.listenerCount(name), baselineSignalListeners[name], `${name} primary-phase handler must not leak`);

  const faultEcho = await startEchoServer();
  const faultWorkDir = path.resolve("tmp", `toxiproxy-control-fault-proof-${process.pid}`);
  const faultController = new ManagedToxiproxy({ workDir: faultWorkDir });
  const removeFaultSignalCleanup = installSignalCleanup(faultController, faultEcho);
  try {
    await faultController.start();
    const faultUpstream = `127.0.0.1:${faultEcho.address().port}`;
    await faultController.createProxy({ name: "fault_toxic_proxy", upstream: faultUpstream });
    await faultController.createProxy({ name: "fault_blackout_proxy", upstream: faultUpstream });
    await faultController.createToxic("fault_blackout_proxy", {
      name: "blackout_upstream", type: "timeout", stream: "upstream", toxicity: 0, attributes: { timeout: 0 },
    });
    await faultController.createToxic("fault_blackout_proxy", {
      name: "blackout_downstream", type: "timeout", stream: "downstream", toxicity: 0, attributes: { timeout: 0 },
    });
    await assert.rejects(
      faultController.createToxic("fault_toxic_proxy", {
        name: "invalid_timeout", type: "timeout", stream: "upstream", toxicity: 0, attributes: { timeout: 1 },
      }),
      /exactly integer timeout:0/,
    );
    await assert.rejects(
      faultController.createToxic("fault_toxic_proxy", {
        name: "invalid_timeout_extra", type: "timeout", stream: "upstream", toxicity: 0, attributes: { timeout: 0, extra: 1 },
      }),
      /exactly integer timeout:0/,
    );
    const originalRequest = faultController.request.bind(faultController);
    faultController.request = async (method, route, body, options) => {
      const response = await originalRequest(method, route, body, options);
      if (method === "POST" && route === "/proxies" && body?.name === "fault_proxy_requested") {
        return { ...response, name: "fault_proxy_returned" };
      }
      if (method === "POST" && route === "/proxies/fault_toxic_proxy/toxics" && body?.name === "fault_toxic_requested") {
        return { ...response, name: "fault_toxic_returned" };
      }
      if (method === "PATCH" && route === "/proxies/fault_toxic_proxy" && body?.enabled === false) {
        return { ...response, name: "fault_proxy_returned" };
      }
      if (method === "PATCH" && route === "/proxies/fault_blackout_proxy/toxics/blackout_downstream" && body?.toxicity === 1) {
        return { ...response, stream: "upstream" };
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
    await assert.rejects(
      faultController.updateProxyEnabled("fault_toxic_proxy", false),
      /changed fields other than enabled/,
    );
    assert.strictEqual(faultController.proxies.get("fault_toxic_proxy").apiName, "fault_toxic_proxy", "malformed PATCH must retain requested ownership identity");
    assert.strictEqual(faultController.proxies.get("fault_toxic_proxy").enabled, false, "malformed PATCH must retain provisional requested state for conservative cleanup");
    const partialActivation = await Promise.allSettled([
      faultController.patchToxic("fault_blackout_proxy", "blackout_upstream", { toxicity: 1 }),
      faultController.patchToxic("fault_blackout_proxy", "blackout_downstream", { toxicity: 1 }),
    ]);
    assert.deepStrictEqual(partialActivation.map((result) => result.status), ["fulfilled", "rejected"], "fault injection must prove a partial activation result");
    await Promise.allSettled([
      faultController.patchToxic("fault_blackout_proxy", "blackout_upstream", { toxicity: 0 }),
      faultController.patchToxic("fault_blackout_proxy", "blackout_downstream", { toxicity: 0 }),
    ]);
    const rolledBack = await faultController.snapshot();
    assert.deepStrictEqual(rolledBack.fault_blackout_proxy.toxics, [
      { attributes: { timeout: 0 }, name: "blackout_upstream", stream: "upstream", toxicity: 0, type: "timeout" },
      { attributes: { timeout: 0 }, name: "blackout_downstream", stream: "downstream", toxicity: 0, type: "timeout" },
    ], "partial activation cleanup must restore the exact ordered inactive timeout pair");
    assert.strictEqual(faultController.toxics.get("fault_toxic_proxy").get("fault_toxic_requested").apiName, "fault_toxic_requested");
    assert.strictEqual(faultController.proxies.get("fault_proxy_requested").apiName, "fault_proxy_requested");
    await faultController.cleanup();
    const deleteRoutes = faultController.journal
      .filter((entry) => entry.phase === "request" && entry.method === "DELETE")
      .map((entry) => entry.route);
    assert(deleteRoutes.includes("/proxies/fault_toxic_proxy/toxics/fault_toxic_requested"), "malformed toxic response cleanup must DELETE the requested POST-body name");
    assert(deleteRoutes.includes("/proxies/fault_proxy_requested"), "malformed proxy response cleanup must DELETE the requested POST-body name");
    assert(deleteRoutes.includes("/proxies/fault_toxic_proxy"), "malformed proxy PATCH cleanup must DELETE the requested owned identity");
    assert(!deleteRoutes.some((route) => route.includes("fault_toxic_returned") || route.includes("fault_proxy_returned")), "cleanup must never trust a mismatched returned name");
    console.log("PASS Toxiproxy malformed-response cleanup keeps requested POST-body identities");
  } finally {
    try { await faultController.cleanup(); } catch {}
    await closeServer(faultEcho);
    removeFaultSignalCleanup();
  }
  for (const name of ["SIGINT", "SIGTERM"]) assert.strictEqual(process.listenerCount(name), baselineSignalListeners[name], `${name} fault-phase handler must not leak`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
