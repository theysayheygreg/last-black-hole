const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { EventEmitter } = require("events");

const DEFAULT_VIEWPORT = { width: 1280, height: 720, deviceScaleFactor: 1 };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chromeCandidates() {
  return [
    process.env.LBH_CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
}

function findChrome() {
  const found = chromeCandidates().find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error("Chrome not found. Set LBH_CHROME_PATH to a Chrome/Chromium executable.");
  }
  return found;
}

async function readDevtoolsPort(userDataDir, timeoutMs = 7000) {
  const file = path.join(userDataDir, "DevToolsActivePort");
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(file)) {
      const [port] = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
      if (port) return Number(port);
    }
    await sleep(50);
  }
  throw new Error("Chrome did not expose a DevTools port in time");
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Chrome DevTools request failed ${response.status}: ${url}`);
  }
  return response.json();
}

function keyFor(code) {
  const map = {
    Space: { key: " ", text: " ", windowsVirtualKeyCode: 32 },
    Enter: { key: "Enter", windowsVirtualKeyCode: 13 },
    Escape: { key: "Escape", windowsVirtualKeyCode: 27 },
    ArrowUp: { key: "ArrowUp", windowsVirtualKeyCode: 38 },
    ArrowDown: { key: "ArrowDown", windowsVirtualKeyCode: 40 },
    ArrowLeft: { key: "ArrowLeft", windowsVirtualKeyCode: 37 },
    ArrowRight: { key: "ArrowRight", windowsVirtualKeyCode: 39 },
    Tab: { key: "Tab", windowsVirtualKeyCode: 9 },
    ControlLeft: { key: "Control", windowsVirtualKeyCode: 17 },
    ShiftLeft: { key: "Shift", windowsVirtualKeyCode: 16 },
  };
  if (map[code]) return { code, ...map[code] };
  if (/^Key[A-Z]$/.test(code)) {
    const key = code.slice(3).toLowerCase();
    return { code, key, text: key, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0) };
  }
  if (/^Digit[0-9]$/.test(code)) {
    const key = code.slice(5);
    return { code, key, text: key, windowsVirtualKeyCode: key.charCodeAt(0) };
  }
  return { code, key: code, windowsVirtualKeyCode: 0 };
}

class CdpSession extends EventEmitter {
  constructor(wsUrl) {
    super();
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.ws = null;
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    this.ws.addEventListener("message", (event) => this._handleMessage(event.data));
    this.ws.addEventListener("error", (event) => this.emit("error", event.error || event));
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("CDP WebSocket open timed out")), 5000);
      this.ws.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      this.ws.addEventListener("error", (event) => {
        clearTimeout(timeout);
        reject(event.error || new Error("CDP WebSocket error"));
      }, { once: true });
    });
  }

  _handleMessage(raw) {
    const msg = JSON.parse(raw);
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message}${msg.error.data ? `: ${msg.error.data}` : ""}`));
      else resolve(msg.result || {});
      return;
    }
    if (msg.method) this.emit(msg.method, msg.params || {});
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    this.ws.send(payload);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  close() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.close();
  }
}

class BrowserPage extends EventEmitter {
  constructor(session) {
    super();
    this.session = session;
    this.keyboard = {
      down: (code) => this._dispatchKey(code, "keyDown"),
      up: (code) => this._dispatchKey(code, "keyUp"),
      press: async (code) => {
        await this._dispatchKey(code, "keyDown");
        await this._dispatchKey(code, "keyUp");
      },
    };
    this.mouse = {
      move: async (x, y) => {
        this._mousePos = { x, y };
        await this.session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
      },
      down: ({ button = "left" } = {}) => this.session.send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: this._mousePos.x,
        y: this._mousePos.y,
        button,
        clickCount: 1,
      }),
      up: ({ button = "left" } = {}) => this.session.send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: this._mousePos.x,
        y: this._mousePos.y,
        button,
        clickCount: 1,
      }),
    };
    this._mousePos = { x: 0, y: 0 };
    this._wireEvents();
  }

  _wireEvents() {
    this.session.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
      const text = exceptionDetails?.exception?.description || exceptionDetails?.text || "Runtime exception";
      this.emit("pageerror", new Error(text));
    });
    this.session.on("Runtime.consoleAPICalled", ({ type, args }) => {
      const text = (args || []).map((arg) => arg.value ?? arg.description ?? "").join(" ");
      this.emit("console", { type: () => type, text: () => text });
    });
    this.session.on("Log.entryAdded", ({ entry }) => {
      if (entry?.level === "error") {
        this.emit("console", { type: () => "error", text: () => entry.text || "" });
      }
    });
  }

  async init(viewport = DEFAULT_VIEWPORT) {
    await this.session.send("Page.enable");
    await this.session.send("Runtime.enable");
    await this.session.send("Log.enable");
    await this.setViewport(viewport);
  }

  async setViewport({ width, height, deviceScaleFactor = 1 }) {
    await this.session.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor,
      mobile: false,
    });
  }

  async goto(url, { timeout = 10000 } = {}) {
    const loadPromise = this._waitForEvent("Page.domContentEventFired", timeout).catch(() => null);
    await this.session.send("Page.navigate", { url });
    await loadPromise;
  }

  async reload({ timeout = 10000 } = {}) {
    const loadPromise = this._waitForEvent("Page.domContentEventFired", timeout).catch(() => null);
    await this.session.send("Page.reload", { ignoreCache: true });
    await loadPromise;
  }

  async title() {
    return this.evaluate(() => document.title);
  }

  async evaluate(fn, ...args) {
    const expression = typeof fn === "function"
      ? `(${fn.toString()})(...${JSON.stringify(args)})`
      : String(fn);
    const result = await this.session.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails;
      throw new Error(detail.exception?.description || detail.text || "Page evaluation failed");
    }
    return result.result?.value;
  }

  async waitForFunction(predicate, { timeout = 5000, polling = 50 } = {}, ...args) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await this.evaluate(predicate, ...args)) return true;
      await sleep(typeof polling === "number" ? polling : 50);
    }
    throw new Error("waitForFunction timed out");
  }

  async screenshot({ path: filePath }) {
    const result = await this.session.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    fs.writeFileSync(filePath, Buffer.from(result.data, "base64"));
  }

  async _dispatchKey(code, type) {
    const key = keyFor(code);
    await this.session.send("Input.dispatchKeyEvent", {
      type,
      key: key.key,
      code: key.code,
      text: type === "keyDown" ? key.text || "" : "",
      windowsVirtualKeyCode: key.windowsVirtualKeyCode,
      nativeVirtualKeyCode: key.windowsVirtualKeyCode,
    });
  }

  async _waitForEvent(eventName, timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.session.off(eventName, onEvent);
        reject(new Error(`${eventName} timed out`));
      }, timeout);
      const onEvent = (params) => {
        clearTimeout(timer);
        resolve(params);
      };
      this.session.once(eventName, onEvent);
    });
  }
}

class BrowserInstance {
  constructor(proc, userDataDir, port) {
    this.proc = proc;
    this.userDataDir = userDataDir;
    this.port = port;
    this.pages = [];
  }

  async newPage(viewport = DEFAULT_VIEWPORT) {
    let target;
    try {
      target = await requestJson(`http://127.0.0.1:${this.port}/json/new?about:blank`, { method: "PUT" });
    } catch {
      target = await requestJson(`http://127.0.0.1:${this.port}/json/new?about:blank`);
    }
    const session = new CdpSession(target.webSocketDebuggerUrl);
    await session.connect();
    const page = new BrowserPage(session);
    await page.init(viewport);
    this.pages.push(page);
    return page;
  }

  async close() {
    for (const page of this.pages) page.session.close();
    if (this.proc && !this.proc.killed) {
      const closed = new Promise((resolve) => this.proc.once("close", resolve));
      this.proc.kill("SIGTERM");
      await Promise.race([closed, sleep(1500)]);
      if (!this.proc.killed) this.proc.kill("SIGKILL");
    }
    fs.rmSync(this.userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

async function launchBrowser({ viewport = DEFAULT_VIEWPORT } = {}) {
  const chromePath = findChrome();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-chrome-"));
  const proc = spawn(chromePath, [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    `--window-size=${viewport.width},${viewport.height}`,
    "about:blank",
  ], {
    stdio: ["ignore", "ignore", "ignore"],
  });
  proc.unref();
  const port = await readDevtoolsPort(userDataDir);
  return new BrowserInstance(proc, userDataDir, port);
}

module.exports = {
  launchBrowser,
  findChrome,
};
