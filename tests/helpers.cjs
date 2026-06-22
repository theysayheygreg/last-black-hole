const { spawn, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const { launchBrowser } = require("./browser-driver.cjs");

const SCREENSHOT_DIR = path.join(__dirname, "screenshots");
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const PORT = 8719; // dedicated transient harness port; separate from dev server on 8080
const ROOT = path.resolve(__dirname, "..");
const TMP = path.join(ROOT, "tmp");
const PID_FILE = path.join(TMP, "harness-server.pid");
const META_FILE = path.join(TMP, "harness-server.json");
const LOG_FILE = path.join(TMP, "harness-server.log");
const SERVER_SCRIPT = path.join(ROOT, "scripts", "static-server.cjs");
const SIM_SERVER_SCRIPT = path.join(ROOT, "scripts", "sim-server.cjs");
const CONTROL_PLANE_SERVER_SCRIPT = path.join(ROOT, "scripts", "control-plane-server.cjs");

let serverProcess = null;
const startedSimPorts = new Set();
const startedControlPorts = new Set();
let cleanupRegistered = false;

function hasProtocol(target) {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(String(target));
}

function withQuery(target, params = {}) {
  const input = String(target || "index-a.html");
  const absolute = hasProtocol(input);
  const url = new URL(input, absolute ? undefined : "http://lbh.local/");
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === false) continue;
    url.searchParams.set(key, String(value));
  }
  return absolute
    ? url.toString()
    : `${url.pathname.replace(/^\//, "")}${url.search}${url.hash}`;
}

function toHarnessUrl(target) {
  const input = String(target || "index-a.html");
  if (hasProtocol(input)) return input;
  return `http://127.0.0.1:${PORT}/${input.replace(/^\//, "")}`;
}

function waitForPidExitSync(pid, timeoutMs = 2500) {
  if (!pid) return;
  const script = `
    const pid = Number(process.argv[1]);
    const deadline = Date.now() + Number(process.argv[2]);
    function alive() {
      try { process.kill(pid, 0); return true; }
      catch { return false; }
    }
    while (alive() && Date.now() < deadline) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
    process.exit(alive() ? 1 : 0);
  `;
  spawnSync(process.execPath, ["-e", script, String(pid), String(timeoutMs)], {
    stdio: "ignore",
    timeout: timeoutMs + 500,
  });
}

function commandForPid(pid) {
  const result = spawnSync("ps", ["-p", String(pid), "-o", "command="], {
    encoding: "utf8",
    timeout: 1000,
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function killHarnessPidSync(pid) {
  if (!pid || pid === process.pid) return;
  const command = commandForPid(pid);
  if (!command.includes(SERVER_SCRIPT) || !command.includes("lbh-harness")) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
  waitForPidExitSync(pid);
}

function killStaleHarnessServerSync() {
  try {
    const pid = Number(fs.readFileSync(PID_FILE, "utf8").trim());
    if (Number.isFinite(pid)) killHarnessPidSync(pid);
  } catch {}

  const listeners = spawnSync("lsof", [`-tiTCP:${PORT}`, "-sTCP:LISTEN"], {
    encoding: "utf8",
    timeout: 1000,
  });
  if (listeners.status !== 0 && !listeners.stdout) return;
  for (const line of listeners.stdout.split("\n")) {
    const pid = Number(line.trim());
    if (Number.isFinite(pid)) killHarnessPidSync(pid);
  }
}

function registerProcessCleanup() {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  const cleanup = () => {
    for (const port of startedSimPorts) {
      spawn(process.execPath, [SIM_SERVER_SCRIPT, "stop", "--host", "127.0.0.1", "--port", String(port)], { cwd: ROOT, stdio: "ignore" });
    }
    for (const port of startedControlPorts) {
      spawn(process.execPath, [CONTROL_PLANE_SERVER_SCRIPT, "stop", "--host", "127.0.0.1", "--port", String(port)], { cwd: ROOT, stdio: "ignore" });
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(130); });
  process.on("SIGTERM", () => { cleanup(); process.exit(143); });
}

/**
 * Start a simple HTTP server in the project root.
 * Returns when the server is ready.
 */
async function startServer() {
  return new Promise((resolve, reject) => {
    stopServer();
    fs.mkdirSync(TMP, { recursive: true });
    fs.rmSync(LOG_FILE, { force: true });
    fs.writeFileSync(LOG_FILE, "", "utf8");

    serverProcess = spawn(process.execPath, [
      SERVER_SCRIPT,
      "--host", "127.0.0.1",
      "--port", String(PORT),
      "--root", ROOT,
      "--pid-file", PID_FILE,
      "--meta-file", META_FILE,
      "--label", "lbh-harness",
    ], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let started = false;
    let exited = false;

    serverProcess.stderr.on("data", (data) => {
      const msg = data.toString();
      fs.appendFileSync(LOG_FILE, msg);
      if (!started && msg.includes("Serving HTTP")) {
        started = true;
        resolve();
      }
    });

    // Also resolve on stdout for some python versions
    serverProcess.stdout.on("data", (data) => {
      const msg = data.toString();
      fs.appendFileSync(LOG_FILE, msg);
      if (!started && msg.includes("Serving HTTP")) {
        started = true;
        resolve();
      }
    });

    serverProcess.on("error", reject);
    serverProcess.on("close", (code, signal) => {
      exited = true;
      if (!started) {
        reject(new Error(`Harness server exited before ready (code=${code}, signal=${signal}). See ${LOG_FILE}.`));
      }
    });

    // Fallback: assume ready after 1.5s if no log detected
    setTimeout(() => {
      if (!started && !exited) {
        started = true;
        resolve();
      }
    }, 1500);
  });
}

function stopServer() {
  if (serverProcess) {
    const pid = serverProcess.pid;
    serverProcess.kill();
    waitForPidExitSync(pid);
    serverProcess = null;
  }
  // Browser suites are often run one-per-process. If a previous suite
  // crashed after spawning the transient server, the child handle is gone
  // but the pid file or listener can remain and poison the next suite.
  killStaleHarnessServerSync();
  for (const file of [PID_FILE, META_FILE, LOG_FILE]) {
    try {
      fs.rmSync(file, { force: true });
    } catch {}
  }
}

/**
 * Launch a headless browser and open the game page.
 * Returns { browser, page }.
 *
 * @param {string} htmlFile - filename relative to project root (e.g. "index.html" or "index-a.html")
 */
async function launchGame(htmlFile = "index.html") {
  const target = toHarnessUrl(htmlFile);
  const browser = await launchBrowser();
  const page = await browser.newPage();

  // Collect console errors
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 10000 });

  // Wait a moment for WebGL init
  await new Promise((r) => setTimeout(r, 2000));

  return { browser, page, errors };
}

async function stepGameFrames(page, frames = 1, dt = 1 / 60) {
  return page.evaluate((count, stepDt) => {
    if (!window.__TEST_API?.stepFrameForTest) return null;
    let last = null;
    for (let i = 0; i < count; i++) {
      last = window.__TEST_API.stepFrameForTest(stepDt);
    }
    return last;
  }, Math.max(1, Number(frames) || 1), dt);
}

async function startSimServer(port = 8788, options = {}) {
  registerProcessCleanup();
  try { await stopSimServer(port); } catch {}
  fs.mkdirSync(TMP, { recursive: true });
  const args = [SIM_SERVER_SCRIPT, "start", "--host", "127.0.0.1", "--port", String(port)];
  if (options.keepAlive) args.push("--keep-alive", "true");
  if (options.idleShutdownMs) args.push("--idle-shutdown-ms", String(options.idleShutdownMs));
  const defaultEnv = {
    LBH_SESSION_REGISTRY_FILE: path.join(TMP, `session-registry-${port}.json`),
  };
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, args, {
      cwd: ROOT,
      env: { ...process.env, ...defaultEnv, ...(options.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (data) => { stdout += data.toString(); });
    proc.stderr.on("data", (data) => { stderr += data.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) { startedSimPorts.add(port); resolve({ port, stdout, stderr }); }
      else reject(new Error(`Failed to start sim server on ${port}: ${stderr || stdout || `exit ${code}`}`));
    });
  });
}

async function stopSimServer(port = 8788) {
  const args = [SIM_SERVER_SCRIPT, "stop", "--host", "127.0.0.1", "--port", String(port)];
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, args, {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (data) => { stdout += data.toString(); });
    proc.stderr.on("data", (data) => { stderr += data.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        for (const file of [path.join(TMP, `session-registry-${port}.json`)]) {
          try { fs.rmSync(file, { force: true }); } catch {}
        }
        startedSimPorts.delete(port);
        resolve({ port, stdout, stderr });
      }
      else reject(new Error(`Failed to stop sim server on ${port}: ${stderr || stdout || `exit ${code}`}`));
    });
  });
}

async function startControlPlane(port = 8791, options = {}) {
  registerProcessCleanup();
  try { await stopControlPlane(port); } catch {}
  fs.mkdirSync(TMP, { recursive: true });
  const args = [CONTROL_PLANE_SERVER_SCRIPT, "start", "--host", "127.0.0.1", "--port", String(port)];
  const defaultEnv = {
    LBH_CONTROL_PLANE_FILE: path.join(TMP, `control-plane-store-${port}.json`),
    LBH_SESSION_REGISTRY_FILE: path.join(TMP, `session-registry-${port}.json`),
  };
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, args, {
      cwd: ROOT,
      env: { ...process.env, ...defaultEnv, ...(options.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (data) => { stdout += data.toString(); });
    proc.stderr.on("data", (data) => { stderr += data.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) { startedControlPorts.add(port); resolve({ port, stdout, stderr }); }
      else reject(new Error(`Failed to start control plane on ${port}: ${stderr || stdout || `exit ${code}`}`));
    });
  });
}

async function stopControlPlane(port = 8791) {
  const args = [CONTROL_PLANE_SERVER_SCRIPT, "stop", "--host", "127.0.0.1", "--port", String(port)];
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, args, {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (data) => { stdout += data.toString(); });
    proc.stderr.on("data", (data) => { stderr += data.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        for (const file of [
          path.join(TMP, `control-plane-store-${port}.json`),
          path.join(TMP, `session-registry-${port}.json`),
        ]) {
          try { fs.rmSync(file, { force: true }); } catch {}
        }
        startedControlPorts.delete(port);
        resolve({ port, stdout, stderr });
      }
      else reject(new Error(`Failed to stop control plane on ${port}: ${stderr || stdout || `exit ${code}`}`));
    });
  });
}

async function dispatchKey(page, code, key, holdMs = 60) {
  await page.evaluate(({ code, key }) => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      code,
      key,
      bubbles: true,
    }));
  }, { code, key });
  await new Promise((r) => setTimeout(r, holdMs));
  await page.evaluate(({ code, key }) => {
    window.dispatchEvent(new KeyboardEvent("keyup", {
      code,
      key,
      bubbles: true,
    }));
  }, { code, key });
}

async function waitFor(page, predicate, options = {}, ...args) {
  const timeout = options.timeout ?? 5000;
  const polling = options.polling ?? 50;
  return page.waitForFunction(predicate, { timeout, polling }, ...args);
}

/**
 * Take a timestamped screenshot.
 */
async function screenshot(page, label) {
  const ts = new Date().toISOString().replace(/[:.]/g, "");
  const filepath = path.join(SCREENSHOT_DIR, `${label}-${ts}.png`);
  const dataUrl = await page.evaluate(() => {
    const canvasId = window.__TEST_API?.getRenderCanvasId?.();
    const fluidCanvas = document.getElementById("fluid-canvas");
    const overlay = document.getElementById("overlay-canvas");
    const source = document.getElementById(canvasId || "fluid-canvas") || fluidCanvas;
    if (!source || !source.width || !source.height) return null;

    const out = document.createElement("canvas");
    out.width = source.width;
    out.height = source.height;
    const ctx = out.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(source, 0, 0);
    if (overlay && getComputedStyle(overlay).opacity !== "0") {
      ctx.drawImage(overlay, 0, 0);
    }
    return out.toDataURL("image/png");
  }).catch(() => null);
  if (dataUrl) {
    fs.writeFileSync(filepath, Buffer.from(dataUrl.split(",")[1], "base64"));
  } else {
    await page.screenshot({ path: filepath });
  }
  return filepath;
}

/**
 * Simple test runner. Collects pass/fail, prints results.
 */
class TestRunner {
  constructor(suiteName) {
    this.suite = suiteName;
    this.results = [];
  }

  async run(name, fn) {
    try {
      await fn();
      this.results.push({ name, passed: true });
      console.log(`  PASS: ${name}`);
    } catch (err) {
      this.results.push({ name, passed: false, error: err.message });
      console.log(`  FAIL: ${name}`);
      console.log(`        ${err.message}`);
    }
  }

  summary() {
    const passed = this.results.filter((r) => r.passed).length;
    const failed = this.results.filter((r) => !r.passed).length;
    console.log(`\n${this.suite}: ${passed} passed, ${failed} failed`);
    return failed === 0;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}

function harnessLogFile() {
  return LOG_FILE;
}

function simLogFile(port = 8788) {
  return path.join(TMP, `sim-server-${port}.log`);
}

function controlPlaneLogFile(port = 8791) {
  return path.join(TMP, `control-plane-${port}.log`);
}

function readLogLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8").split("\n").map((line) => line.trim()).filter(Boolean);
}

function readJsonLogEvents(filePath) {
  return readLogLines(filePath)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function waitForLogEvent(filePath, predicate, options = {}) {
  const timeout = options.timeout ?? 5000;
  const interval = options.interval ?? 100;
  const deadline = Date.now() + timeout;
  let lastEvents = [];
  while (Date.now() < deadline) {
    lastEvents = readJsonLogEvents(filePath);
    const match = lastEvents.find(predicate);
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  const seen = lastEvents.map((event) => event.event).filter(Boolean).join(", ");
  throw new Error(`Timed out waiting for telemetry event in ${path.basename(filePath)}${seen ? ` (saw: ${seen})` : ""}`);
}

module.exports = {
  startServer,
  stopServer,
  startSimServer,
  stopSimServer,
  startControlPlane,
  stopControlPlane,
  launchGame,
  screenshot,
  TestRunner,
  assert,
  dispatchKey,
  waitFor,
  harnessLogFile,
  simLogFile,
  controlPlaneLogFile,
  readJsonLogEvents,
  waitForLogEvent,
  withQuery,
  toHarnessUrl,
  stepGameFrames,
  PORT,
};
