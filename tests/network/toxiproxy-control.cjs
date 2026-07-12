const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");
const { performance } = require("perf_hooks");
const { spawn, spawnSync } = require("child_process");
const { verifyCachedBinary } = require("./provision-toxiproxy.cjs");

const REQUEST_TIMEOUT_MS = 3_000;
const MAX_REQUEST_BYTES = 32 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_JOURNAL_ENTRIES = 20_000;
const TERM_TIMEOUT_MS = 2_500;
const KILL_TIMEOUT_MS = 1_000;
const LOOPBACK = "127.0.0.1";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertLoopbackAddress(value, label, { allowZero = false } = {}) {
  const match = /^127\.0\.0\.1:(\d+)$/.exec(String(value));
  const port = match ? Number(match[1]) : NaN;
  if (!match || !Number.isInteger(port) || port < (allowZero ? 0 : 1) || port > 65535) {
    throw new Error(`${label} must be an explicit IPv4 loopback address, got ${value}`);
  }
  return { host: LOOPBACK, port };
}

function assertOwnedName(value, label) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(String(value))) throw new Error(`${label} is not a bounded Toxiproxy identifier`);
  return String(value);
}

async function freeLoopbackPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, LOOPBACK, resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function listenerPids(port) {
  const result = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
    encoding: "utf8",
    timeout: 1_500,
  });
  if (result.error?.code === "ENOENT") throw new Error("lsof is required to verify Toxiproxy listener ownership");
  if (result.status !== 0 && !result.stdout.trim()) return [];
  return [...new Set(result.stdout.trim().split(/\s+/).map(Number).filter(Number.isInteger))];
}

async function portAccepts(port, timeoutMs = 250) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: LOOPBACK, port });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

function parseAddress(value, label) {
  return assertLoopbackAddress(value, label);
}

function parsePrometheusLabels(raw) {
  const labels = {};
  const pattern = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"\\])*)"(?:,|$)/g;
  let match;
  let cursor = 0;
  while ((match = pattern.exec(raw))) {
    if (match.index !== cursor || Object.prototype.hasOwnProperty.call(labels, match[1])) throw new Error(`Malformed or duplicate Prometheus label near '${raw.slice(cursor, cursor + 80)}'`);
    labels[match[1]] = match[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    cursor = pattern.lastIndex;
  }
  if (cursor !== raw.length) throw new Error(`Malformed Prometheus labels: ${raw.slice(0, 200)}`);
  return labels;
}

function parseDirectionalBytes(text, ownedProxies = []) {
  const descriptors = new Map(ownedProxies.map((proxy) => [proxy.name, proxy]));
  if (descriptors.size !== ownedProxies.length) throw new Error("Owned proxy names must be unique for metrics parsing");
  const families = new Set(["toxiproxy_proxy_received_bytes_total", "toxiproxy_proxy_sent_bytes_total"]);
  const rows = [];
  for (const line of String(text).split("\n")) {
    const trimmed = line.trim();
    if (![...families].some((family) => trimmed.startsWith(family))) continue;
    const match = /^(toxiproxy_proxy_(?:received|sent)_bytes_total)\{([^}]*)\}\s+([-+0-9.eE]+)$/.exec(trimmed);
    if (!match) {
      if ([...descriptors.keys()].some((name) => trimmed.includes(`proxy="${name}"`))) throw new Error(`Malformed owned Toxiproxy byte metric: ${trimmed.slice(0, 300)}`);
      continue;
    }
    const family = match[1];
    const labels = parsePrometheusLabels(match[2]);
    const proxy = labels.proxy;
    const direction = labels.direction;
    const value = Number(match[3]);
    if (!descriptors.has(proxy)) continue;
    const descriptor = descriptors.get(proxy);
    if (Object.keys(labels).sort().join(",") !== "direction,listener,proxy,upstream"
      || !["upstream", "downstream"].includes(direction)
      || labels.listener !== descriptor.listen || labels.upstream !== descriptor.upstream) {
      throw new Error(`Owned Toxiproxy metric has invalid exact labels: ${trimmed.slice(0, 300)}`);
    }
    if (!Number.isFinite(value) || value < 0) throw new Error(`Owned Toxiproxy byte metric must be finite and nonnegative: ${trimmed.slice(0, 300)}`);
    if (rows.some((row) => row.family === family && row.proxy === proxy && row.direction === direction)) throw new Error(`Duplicate Toxiproxy byte metric for ${family}/${proxy}/${direction}`);
    rows.push({ family, proxy, direction, listener: labels.listener, upstream: labels.upstream, value });
  }
  for (const proxy of descriptors.keys()) {
    for (const family of families) {
      for (const direction of ["upstream", "downstream"]) {
        if (rows.filter((row) => row.family === family && row.proxy === proxy && row.direction === direction).length !== 1) {
          throw new Error(`Expected exactly one ${family} row for ${proxy}/${direction}`);
        }
      }
    }
  }
  return rows;
}

function exactAttributes(actual, expected) {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index] && actual[key] === expected[key]);
}

function safeInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be a safe integer in [${minimum}, ${maximum}], got ${value}`);
  }
  return value;
}

class ManagedToxiproxy {
  constructor({ workDir, binary = null, requestTimeoutMs = REQUEST_TIMEOUT_MS } = {}) {
    this.tool = verifyCachedBinary();
    this.binary = binary || this.tool.file;
    if (path.resolve(this.binary) !== path.resolve(this.tool.file)) {
      throw new Error(`Controller only executes the hash-verified cached binary: ${this.tool.file}`);
    }
    this.workDir = path.resolve(workDir || path.join(process.cwd(), "tmp", `toxiproxy-${process.pid}`));
    this.requestTimeoutMs = Math.min(Math.max(100, requestTimeoutMs), 10_000);
    this.child = null;
    this.controlPort = null;
    this.proxies = new Map();
    this.toxics = new Map();
    this.journal = [];
    this.firstFailure = null;
    this.cleanupPromise = null;
    this.stdoutPath = path.join(this.workDir, "toxiproxy-stdout.log");
    this.stderrPath = path.join(this.workDir, "toxiproxy-stderr.log");
    this.journalPath = path.join(this.workDir, "toxiproxy-commands.jsonl");
  }

  record(entry) {
    if (this.journal.length >= MAX_JOURNAL_ENTRIES) throw new Error(`Toxiproxy journal exceeded ${MAX_JOURNAL_ENTRIES} entries`);
    const bounded = { wallTime: new Date().toISOString(), monoMs: performance.now(), ...entry };
    this.journal.push(bounded);
    fs.appendFileSync(this.journalPath, `${JSON.stringify(bounded)}\n`, "utf8");
    return bounded;
  }

  ownershipFacts(extra = {}) {
    return {
      pid: this.child?.pid || null,
      controlPort: this.controlPort,
      proxies: [...this.proxies.entries()].slice(0, 100).map(([name, proxy]) => ({ name, listen: proxy?.listen || null, listenerPort: proxy?.listener?.port || null })),
      toxics: [...this.toxics.entries()].slice(0, 100).flatMap(([proxyName, toxics]) => [...toxics.entries()].slice(0, 20).map(([name, toxic]) => ({ proxyName, name, type: toxic?.type || null, stream: toxic?.stream || null, toxicity: toxic?.toxicity ?? null }))),
      ...extra,
    };
  }

  captureFirstFailure(error, context = {}) {
    if (this.firstFailure) return this.firstFailure;
    this.firstFailure = {
      wallTime: new Date().toISOString(),
      monoMs: performance.now(),
      message: String(error?.message || error).slice(0, 500),
      ...this.ownershipFacts(context),
    };
    try { this.record({ phase: "first-failure", ...this.firstFailure }); } catch {}
    return this.firstFailure;
  }

  async request(method, route, body = undefined, { expectJson = true } = {}) {
    if (!this.controlPort) throw new Error("Toxiproxy daemon is not started");
    if (!/^\/[a-zA-Z0-9_?&=./%:-]*$/.test(route) || route.includes("..")) throw new Error(`Unsafe Toxiproxy route: ${route}`);
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    if (payload && payload.length > MAX_REQUEST_BYTES) throw new Error(`Toxiproxy request exceeds ${MAX_REQUEST_BYTES} bytes`);
    const sent = this.record({ phase: "request", method, route, body: body === undefined ? null : body });
    try {
      const result = await new Promise((resolve, reject) => {
        const request = http.request({
          host: LOOPBACK,
          port: this.controlPort,
          method,
          path: route,
          timeout: this.requestTimeoutMs,
          headers: payload ? { "content-type": "application/json", "content-length": payload.length } : {},
        }, (response) => {
          const chunks = [];
          let bytes = 0;
          response.on("data", (chunk) => {
            bytes += chunk.length;
            if (bytes > MAX_RESPONSE_BYTES) response.destroy(new Error(`Toxiproxy response exceeds ${MAX_RESPONSE_BYTES} bytes`));
            else chunks.push(chunk);
          });
          response.on("end", () => resolve({ status: response.statusCode, text: Buffer.concat(chunks).toString("utf8") }));
          response.on("error", reject);
        });
        request.on("timeout", () => request.destroy(new Error(`Toxiproxy ${method} ${route} timed out`)));
        request.on("error", reject);
        if (payload) request.end(payload); else request.end();
      });
      let parsed = null;
      if (expectJson && result.text.trim()) {
        try { parsed = JSON.parse(result.text); }
        catch { throw new Error(`Toxiproxy ${method} ${route} returned invalid JSON`); }
      }
      if (result.status < 200 || result.status >= 300) {
        throw new Error(`Toxiproxy ${method} ${route} returned HTTP ${result.status}: ${result.text.slice(0, 300)}`);
      }
      this.record({ phase: "response", requestMonoMs: sent.monoMs, method, route, status: result.status, responseBytes: Buffer.byteLength(result.text) });
      return expectJson ? parsed : result.text;
    } catch (error) {
      this.captureFirstFailure(error, { method, route });
      this.record({ phase: "failure", requestMonoMs: sent.monoMs, method, route, error: error.message.slice(0, 500) });
      throw error;
    }
  }

  async start() {
    if (this.child) {
      const error = new Error("Toxiproxy daemon is already started");
      this.captureFirstFailure(error, { operation: "start" });
      throw error;
    }
    fs.mkdirSync(this.workDir, { recursive: true });
    fs.writeFileSync(this.stdoutPath, "", "utf8");
    fs.writeFileSync(this.stderrPath, "", "utf8");
    fs.writeFileSync(this.journalPath, "", "utf8");
    this.controlPort = await freeLoopbackPort();
    const stdout = fs.openSync(this.stdoutPath, "a");
    const stderr = fs.openSync(this.stderrPath, "a");
    try {
      this.child = spawn(this.binary, ["-host", LOOPBACK, "-port", String(this.controlPort), "-proxy-metrics"], {
        cwd: this.workDir,
        stdio: ["ignore", stdout, stderr],
        detached: false,
      });
    } catch (error) {
      fs.closeSync(stdout);
      fs.closeSync(stderr);
      this.captureFirstFailure(error, { operation: "spawn" });
      throw error;
    }
    fs.closeSync(stdout);
    fs.closeSync(stderr);
    const pid = this.child.pid;
    this.record({ phase: "daemon-spawn", pid, controlPort: this.controlPort, binary: this.binary, sha256: this.tool.sha256 });
    this.childError = null;
    this.childClosed = null;
    this.closePromise = new Promise((resolve) => {
      this.child.once("close", (code, signal) => { this.childClosed = { code, signal }; resolve({ kind: "close", code, signal }); });
    });
    this.errorPromise = new Promise((resolve) => {
      this.child.once("error", (error) => { this.childError = error; this.captureFirstFailure(error, { operation: "child-error" }); resolve({ kind: "error", error }); });
    });
    this.terminationPromise = Promise.race([this.closePromise, this.errorPromise]);
    try {
      const deadline = Date.now() + 5_000;
      let version = null;
      while (Date.now() < deadline) {
        if (this.childError) throw this.childError;
        if (this.childClosed) throw new Error(`Toxiproxy closed before readiness with code ${this.childClosed.code} signal ${this.childClosed.signal}`);
        if (!(await portAccepts(this.controlPort, 100))) { await sleep(40); continue; }
        version = await this.request("GET", "/version");
        break;
      }
      if (!version) throw new Error("Toxiproxy control API did not become ready within 5000ms");
      if (!version || Object.keys(version).length !== 1 || version.version !== this.tool.fixture.version) {
        throw new Error(`Toxiproxy /version must be exactly {version:${this.tool.fixture.version}}, got ${JSON.stringify(version)}`);
      }
      const pids = listenerPids(this.controlPort);
      if (pids.length !== 1 || pids[0] !== pid) throw new Error(`Control port ${this.controlPort} listener PID mismatch: expected ${pid}, got ${pids.join(",") || "none"}`);
      this.record({ phase: "daemon-ready", pid, controlPort: this.controlPort, version: version.version, listenerPids: pids });
      return this.describe();
    } catch (error) {
      this.captureFirstFailure(error, { operation: "readiness" });
      throw error;
    }
  }

  describe() {
    return {
      pid: this.child?.pid || null,
      controlPort: this.controlPort,
      binary: this.binary,
      version: this.tool.fixture.version,
      sha256: this.tool.sha256,
      stdoutPath: this.stdoutPath,
      stderrPath: this.stderrPath,
      journalPath: this.journalPath,
    };
  }

  async createProxy({ name, upstream }) {
    try {
      name = assertOwnedName(name, "proxy name");
      if (this.proxies.has(name)) throw new Error(`Proxy ${name} is already owned by this controller`);
      assertLoopbackAddress(upstream, "proxy upstream");
    } catch (error) {
      this.captureFirstFailure(error, { operation: "validate-create-proxy", requestedName: String(name).slice(0, 80) });
      throw error;
    }
    const proxy = await this.request("POST", "/proxies", { name, listen: `${LOOPBACK}:0`, upstream, enabled: true });
    this.proxies.set(name, { name, apiName: name, upstream, enabled: true, listen: proxy?.listen || null, returnedName: proxy?.name || null, provisionalResponse: proxy });
    this.toxics.set(name, new Map());
    this.record({ phase: "proxy-owned", name, listen: proxy?.listen || null, upstream });
    try {
      if (proxy?.name !== name || proxy?.upstream !== upstream || proxy?.enabled !== true) {
        throw new Error(`Toxiproxy returned an invalid proxy object: ${JSON.stringify(proxy)}`);
      }
      const listener = parseAddress(proxy.listen, "returned proxy listener");
      const pids = listenerPids(listener.port);
      if (pids.length !== 1 || pids[0] !== this.child.pid) throw new Error(`Proxy ${name} listener PID mismatch: ${pids.join(",") || "none"}`);
      this.proxies.set(name, { ...proxy, listener });
      return this.proxies.get(name);
    } catch (error) {
      this.captureFirstFailure(error, { operation: "validate-proxy", proxyName: name, returnedListen: proxy?.listen || null });
      throw error;
    }
  }

  async getProxies() {
    const proxies = await this.request("GET", "/proxies");
    if (!proxies || Array.isArray(proxies) || typeof proxies !== "object") throw new Error("Toxiproxy /proxies returned a non-object");
    return proxies;
  }

  async createToxic(proxyName, definition) {
    let name;
    try {
      proxyName = assertOwnedName(proxyName, "proxy name");
      if (!this.proxies.has(proxyName)) throw new Error(`Proxy ${proxyName} is not owned by this controller`);
      name = assertOwnedName(definition.name, "toxic name");
      if (!['upstream', 'downstream'].includes(definition.stream)) throw new Error(`Invalid toxic stream: ${definition.stream}`);
      if (!['latency', 'bandwidth'].includes(definition.type)) throw new Error(`Unsupported toxic type: ${definition.type}`);
      if (!Number.isFinite(definition.toxicity) || definition.toxicity < 0 || definition.toxicity > 1) throw new Error("Toxic toxicity must be finite and in [0,1]");
    } catch (error) {
      this.captureFirstFailure(error, { operation: "validate-create-toxic", proxyName: String(proxyName).slice(0, 80), toxicName: String(definition?.name).slice(0, 80) });
      throw error;
    }
    const toxic = await this.request("POST", `/proxies/${proxyName}/toxics`, definition);
    this.toxics.get(proxyName).set(name, { ...definition, apiName: name, returnedName: toxic?.name || null, provisionalResponse: toxic });
    this.record({ phase: "toxic-owned", proxyName, name, type: definition.type, stream: definition.stream });
    try {
      if (toxic?.name !== name || toxic?.type !== definition.type || toxic?.stream !== definition.stream
        || toxic?.toxicity !== definition.toxicity || !exactAttributes(toxic?.attributes, definition.attributes)) {
        throw new Error(`Toxiproxy returned an invalid toxic object: ${JSON.stringify(toxic)}`);
      }
      this.toxics.get(proxyName).set(name, toxic);
      return toxic;
    } catch (error) {
      this.captureFirstFailure(error, { operation: "validate-toxic", proxyName, toxicName: name });
      throw error;
    }
  }

  async patchToxic(proxyName, toxicName, { toxicity }) {
    try {
      proxyName = assertOwnedName(proxyName, "proxy name");
      toxicName = assertOwnedName(toxicName, "toxic name");
      if (!this.toxics.get(proxyName)?.has(toxicName)) throw new Error(`Toxic ${proxyName}/${toxicName} is not owned by this controller`);
      if (!Number.isFinite(toxicity) || toxicity < 0 || toxicity > 1) throw new Error("Toxic toxicity must be finite and in [0,1]");
    } catch (error) {
      this.captureFirstFailure(error, { operation: "validate-patch", proxyName: String(proxyName).slice(0, 80), toxicName: String(toxicName).slice(0, 80) });
      throw error;
    }
    const previous = this.toxics.get(proxyName).get(toxicName);
    const toxic = await this.request("PATCH", `/proxies/${proxyName}/toxics/${toxicName}`, { toxicity });
    if (toxic?.name !== toxicName || toxic?.toxicity !== toxicity || toxic?.type !== previous.type
      || toxic?.stream !== previous.stream || !exactAttributes(toxic?.attributes, previous.attributes)) {
      const error = new Error(`Typed toxic PATCH changed fields other than toxicity: ${JSON.stringify(toxic)}`);
      this.captureFirstFailure(error, { operation: "validate-patch", proxyName, toxicName });
      throw error;
    }
    this.toxics.get(proxyName).set(toxicName, toxic);
    return toxic;
  }

  async removeToxic(proxyName, toxicName) {
    proxyName = assertOwnedName(proxyName, "proxy name");
    toxicName = assertOwnedName(toxicName, "toxic name");
    if (!this.toxics.get(proxyName)?.has(toxicName)) return false;
    const proxyApiName = this.proxies.get(proxyName)?.apiName || proxyName;
    const toxicApiName = this.toxics.get(proxyName).get(toxicName)?.apiName || toxicName;
    await this.request("DELETE", `/proxies/${proxyApiName}/toxics/${toxicApiName}`);
    this.toxics.get(proxyName).delete(toxicName);
    return true;
  }

  async createInactiveProfile(proxyName, { upstreamLatencyMs, upstreamRateKBps, downstreamLatencyMs, downstreamRateKBps }) {
    try {
      upstreamLatencyMs = safeInteger(upstreamLatencyMs, "upstreamLatencyMs", 0, 10_000);
      downstreamLatencyMs = safeInteger(downstreamLatencyMs, "downstreamLatencyMs", 0, 10_000);
      upstreamRateKBps = safeInteger(upstreamRateKBps, "upstreamRateKBps", 1, 1_000_000);
      downstreamRateKBps = safeInteger(downstreamRateKBps, "downstreamRateKBps", 1, 1_000_000);
    } catch (error) {
      this.captureFirstFailure(error, { operation: "validate-profile", proxyName });
      throw error;
    }
    const chain = [
      { name: "upstream_latency", type: "latency", stream: "upstream", toxicity: 0, attributes: { latency: upstreamLatencyMs, jitter: 0 } },
      { name: "upstream_bandwidth", type: "bandwidth", stream: "upstream", toxicity: 0, attributes: { rate: upstreamRateKBps } },
      { name: "downstream_latency", type: "latency", stream: "downstream", toxicity: 0, attributes: { latency: downstreamLatencyMs, jitter: 0 } },
      { name: "downstream_bandwidth", type: "bandwidth", stream: "downstream", toxicity: 0, attributes: { rate: downstreamRateKBps } },
    ];
    for (const toxic of chain) await this.createToxic(proxyName, toxic);
    return chain.map((toxic) => this.toxics.get(proxyName).get(toxic.name));
  }

  async snapshot() {
    try {
      const proxies = await this.getProxies();
      const owned = {};
      for (const name of this.proxies.keys()) {
        if (!proxies[name]) throw new Error(`Owned proxy ${name} is absent from daemon config`);
        owned[name] = proxies[name];
      }
      return owned;
    } catch (error) {
      this.captureFirstFailure(error, { operation: "validate-snapshot" });
      throw error;
    }
  }

  async metrics() {
    try {
      const text = await this.request("GET", "/metrics", undefined, { expectJson: false });
      const owned = [...this.proxies.entries()].map(([name, proxy]) => ({ name, listen: proxy.listen, upstream: proxy.upstream }));
      return { text, directionalBytes: parseDirectionalBytes(text, owned) };
    } catch (error) {
      this.captureFirstFailure(error, { operation: "validate-metrics" });
      throw error;
    }
  }

  async deleteProxy(name) {
    name = assertOwnedName(name, "proxy name");
    if (!this.proxies.has(name)) return false;
    let removalError = null;
    for (const toxicName of [...(this.toxics.get(name)?.keys() || [])]) {
      try { await this.removeToxic(name, toxicName); }
      catch (error) { removalError ||= error; this.firstFailure ||= { wallTime: new Date().toISOString(), monoMs: performance.now(), message: error.message }; }
    }
    const proxyApiName = this.proxies.get(name)?.apiName || name;
    await this.request("DELETE", `/proxies/${proxyApiName}`);
    this.proxies.delete(name);
    this.toxics.delete(name);
    if (removalError) throw removalError;
    return true;
  }

  async stopDaemon() {
    if (!this.child) return { daemonStopped: true, forcedKill: false };
    const child = this.child;
    const pid = child.pid;
    let forcedKill = false;
    if (!Number.isInteger(pid) || pid <= 0) {
      const outcome = await Promise.race([this.terminationPromise, sleep(KILL_TIMEOUT_MS).then(() => ({ kind: "timeout" }))]);
      if (outcome.kind === "timeout") throw new Error("Spawn-failed Toxiproxy child emitted neither error nor close within its bound");
      this.record({ phase: "daemon-stopped", pid: null, forcedKill, outcome: outcome.kind });
      return { daemonStopped: true, forcedKill };
    }
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      let exited = await Promise.race([this.closePromise.then(() => true), sleep(TERM_TIMEOUT_MS).then(() => false)]);
      if (!exited) {
        forcedKill = true;
        child.kill("SIGKILL");
        exited = await Promise.race([this.closePromise.then(() => true), sleep(KILL_TIMEOUT_MS).then(() => false)]);
        if (!exited) throw new Error(`Toxiproxy PID ${pid} remained alive after SIGKILL bound`);
      }
    }
    let alive = true;
    try { process.kill(pid, 0); } catch { alive = false; }
    if (alive) throw new Error(`Toxiproxy PID ${pid} remains alive after exit`);
    this.record({ phase: "daemon-stopped", pid, forcedKill });
    return { daemonStopped: true, forcedKill };
  }

  async cleanup() {
    if (this.cleanupPromise) return this.cleanupPromise;
    this.cleanupPromise = (async () => {
      const proxyPorts = [...this.proxies.values()].map((proxy) => proxy.listener?.port).filter(Number.isInteger);
      const verdict = { toxicsRemoved: false, proxiesDeleted: false, daemonStopped: false, controlPortClosed: false, proxyPortsClosed: false, forcedKill: false };
      let cleanupError = null;
      for (const name of [...this.proxies.keys()]) {
        try { await this.deleteProxy(name); }
        catch (error) { this.captureFirstFailure(error, { operation: "cleanup-proxy", proxyName: name }); cleanupError ||= error; }
      }
      verdict.toxicsRemoved = [...this.toxics.values()].every((toxics) => toxics.size === 0);
      verdict.proxiesDeleted = this.proxies.size === 0;
      try {
        const stopped = await this.stopDaemon();
        verdict.daemonStopped = stopped.daemonStopped;
        verdict.forcedKill = stopped.forcedKill;
      } catch (error) { this.captureFirstFailure(error, { operation: "cleanup-daemon" }); cleanupError ||= error; }
      verdict.controlPortClosed = this.controlPort ? !(await portAccepts(this.controlPort)) : true;
      verdict.proxyPortsClosed = (await Promise.all(proxyPorts.map((port) => portAccepts(port)))).every((open) => !open);
      this.record({ phase: "cleanup-verdict", ...verdict });
      if (cleanupError) throw cleanupError;
      if (!verdict.daemonStopped || !verdict.controlPortClosed || !verdict.proxyPortsClosed) {
        throw new Error(`Incomplete Toxiproxy cleanup: ${JSON.stringify(verdict)}`);
      }
      return verdict;
    })();
    return this.cleanupPromise;
  }
}

module.exports = {
  ManagedToxiproxy,
  parseDirectionalBytes,
  assertLoopbackAddress,
  freeLoopbackPort,
  portAccepts,
};
