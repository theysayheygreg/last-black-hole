const puppeteer = require("puppeteer");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const SCREENSHOT_DIR = path.join(__dirname, "screenshots");
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const PORT = 8719; // arbitrary high port unlikely to collide
const ROOT = path.resolve(__dirname, "..");

let serverProcess = null;

/**
 * Start a simple HTTP server in the project root.
 * Returns when the server is ready.
 */
async function startServer() {
  return new Promise((resolve, reject) => {
    // Use python3 http.server — available on macOS/Linux, no npm dep
    serverProcess = spawn("python3", ["-m", "http.server", String(PORT)], {
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
}

/**
 * Launch a headless browser and open the game page.
 * Returns { browser, page }.
 *
 * @param {string} htmlFile - filename relative to project root (e.g. "index.html" or "index-a.html")
 */
async function launchGame(htmlFile = "index.html") {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  // Collect console errors
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));

  const url = `http://localhost:${PORT}/${htmlFile}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });

  // Wait a moment for WebGL init
  await new Promise((r) => setTimeout(r, 2000));

  return { browser, page, errors };
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
  launchGame,
  screenshot,
  TestRunner,
  assert,
  PORT,
};
