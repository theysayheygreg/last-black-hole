const puppeteer = require("puppeteer");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const SCREENSHOT_DIR = path.join(__dirname, "screenshots");
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const PORT = 8719; // dedicated transient harness port; separate from dev server on 8080
const ROOT = path.resolve(__dirname, "..");
const TMP = path.join(ROOT, "tmp");
const PID_FILE = path.join(TMP, "harness-server.pid");
const META_FILE = path.join(TMP, "harness-server.json");
const SERVER_SCRIPT = path.join(ROOT, "scripts", "static-server.js");
const SIM_SERVER_SCRIPT = path.join(ROOT, "scripts", "sim-server.js");
const CONTROL_PLANE_SERVER_SCRIPT = path.join(ROOT, "scripts", "control-plane-server.js");

let serverProcess = null;

/**
 * Start a simple HTTP server in the project root.
 * Returns when the server is ready.
 */
async function startServer() {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(TMP, { recursive: true });

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

    serverProcess.stderr.on("data", (data) => {
      const msg = data.toString();
      if (!started && msg.includes("Serving HTTP")) {
        started = true;
        resolve();
      }
    });

    // Also resolve on stdout for some python versions
    serverProcess.stdout.on("data", (data) => {
      const msg = data.toString();
      if (!started && msg.includes("Serving HTTP")) {
        started = true;
        resolve();
      }
    });

    serverProcess.on("error", reject);

    // Fallback: assume ready after 1.5s if no log detected
    setTimeout(() => {
      if (!started) {
        started = true;
        resolve();
      }
    }, 1500);
  });
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  for (const file of [PID_FILE, META_FILE]) {
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
  let target = htmlFile;
  if (!String(target).startsWith("http://") && !String(target).startsWith("https://")) {
    target = `http://localhost:${PORT}/${String(target).replace(/^\//, "")}`;
  }
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  // Collect console errors
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 10000 });

  // Wait a moment for WebGL init
  await new Promise((r) => setTimeout(r, 2000));

  return { browser, page, errors };
}

async function startSimServer(port = 8788, options = {}) {
  fs.mkdirSync(TMP, { recursive: true });
  const args = [SIM_SERVER_SCRIPT, "start", "--host", "127.0.0.1", "--port", String(port)];
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
      if (code === 0) resolve({ port, stdout, stderr });
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
        resolve({ port, stdout, stderr });
      }
      else reject(new Error(`Failed to stop sim server on ${port}: ${stderr || stdout || `exit ${code}`}`));
    });
  });
}

async function startControlPlane(port = 8791, options = {}) {
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
      if (code === 0) resolve({ port, stdout, stderr });
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
  await page.screenshot({ path: filepath });
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
  PORT,
};
