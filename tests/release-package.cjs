/**
 * Release artifact proof.
 *
 * Unlike desktop-package.cjs, this opens the hash-named release output and
 * boots authority from the bytes inside its real Linux app.asar.
 */
const crypto = require("crypto");
const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const { createRequire } = require("module");
const net = require("net");
const os = require("os");
const path = require("path");
const asar = require("@electron/asar");

const ROOT = path.resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function gitHash() {
  return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
}

function openPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => address?.port ? resolve(address.port) : reject(new Error("Could not allocate port")));
    });
  });
}

function launch(script, args, cwd, env) {
  const output = [];
  const child = spawn(process.execPath, [script, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString()));
  child.runtimeOutput = output;
  return child;
}

async function fetchJson(url) {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok || body.ok === false) throw new Error(body.error || `${url} returned ${response.status}`);
  return body;
}

async function waitFor(check, children, timeout = 10000) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < deadline) {
    for (const child of children) {
      if (child?.exitCode !== null) {
        throw new Error(`Packaged runtime exited with ${child.exitCode}:\n${child.runtimeOutput.join("")}`);
      }
    }
    try {
      return await check();
    } catch (error) {
      lastError = error;
      await sleep(100);
    }
  }
  throw lastError || new Error("Timed out waiting for packaged runtime");
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(2000).then(() => child.exitCode === null && child.kill("SIGKILL")),
  ]);
}

function sha256(filepath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filepath));
  return hash.digest("hex");
}

async function connectCdp(port, child) {
  const target = await waitFor(async () => {
    const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
    const page = targets.find((entry) => entry.type === "page" && entry.url.startsWith("lbh://renderer/"));
    assert(page?.webSocketDebuggerUrl, "Packaged Electron renderer did not expose a page target");
    return page;
  }, [child], 15000);
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 0;
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result || {});
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  return {
    target,
    send,
    async evaluate(expression) {
      const result = await send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Packaged renderer evaluation failed");
      return result.result?.value;
    },
    close() { socket.close(); },
  };
}

async function pressKey(cdp, code, key, virtualKeyCode, text = "") {
  for (const type of ["keyDown", "keyUp"]) {
    await cdp.send("Input.dispatchKeyEvent", {
      type,
      code,
      key,
      text: type === "keyDown" ? text : "",
      windowsVirtualKeyCode: virtualKeyCode,
      nativeVirtualKeyCode: virtualKeyCode,
    });
    if (type === "keyDown") await sleep(90);
  }
}

async function provePackagedClientBoot(buildRoot) {
  if (process.platform !== "darwin") {
    console.log("Packaged client launch proof skipped: macOS app execution requires Darwin.");
    return;
  }

  const binary = path.join(buildRoot, "Last Singularity.app", "Contents", "MacOS", "Last Singularity");
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-packaged-client-"));
  const debugPort = await openPort();
  let controlPort = await openPort();
  while (controlPort === debugPort) controlPort = await openPort();
  let simPort = await openPort();
  while (simPort === debugPort || simPort === controlPort) simPort = await openPort();
  const output = [];
  const appProcess = spawn(binary, [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
  ], {
    env: {
      ...process.env,
      LBH_EMBEDDED_CONTROL_PORT: String(controlPort),
      LBH_EMBEDDED_SIM_PORT: String(simPort),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  appProcess.stdout.on("data", (chunk) => output.push(chunk.toString()));
  appProcess.stderr.on("data", (chunk) => output.push(chunk.toString()));
  appProcess.runtimeOutput = output;
  let cdp = null;
  try {
    await waitFor(() => fetchJson(`http://127.0.0.1:${debugPort}/json/list`), [appProcess], 15000);
    cdp = await connectCdp(debugPort, appProcess);
    const boot = await waitFor(async () => {
      const state = await cdp.evaluate("({ title: document.title, boot: window.__LBH_BOOT_STATE__ || null })");
      assert(state?.title === "Last Singularity", "Packaged renderer title mismatch");
      assert(state.boot?.stage === "init.completed", `Packaged renderer boot stalled at ${state.boot?.stage || "unknown"}`);
      assert(state.boot?.details?.rendererBackend === "three", "Packaged renderer did not boot Three");
      return state;
    }, [appProcess], 15000);
    assert(boot.boot.details.phase === "title", "Packaged renderer did not reach title");

    // Empty app-owned authority must remain available while a player lingers
    // on the attract screen; the sim itself idles because no human has joined.
    await sleep(31000);
    await fetchJson(`http://127.0.0.1:${simPort}/health`);

    const space = () => pressKey(cdp, "Space", " ", 32, " ");
    const tabRight = () => pressKey(cdp, "KeyE", "e", 69, "e");
    await space();
    await sleep(900);
    await space();
    await sleep(350);
    await space();
    await sleep(1200);
    for (let index = 0; index < 4; index++) {
      await tabRight();
      await sleep(250);
    }
    await space();
    await sleep(700);
    await space();

    const launched = await waitFor(async () => {
      const snapshot = await fetchJson(`http://127.0.0.1:${simPort}/snapshot`);
      assert(snapshot.players?.some((player) => !player.isAI && player.status === "alive"), "Packaged client has not joined authority");
      return snapshot;
    }, [appProcess], 15000);
    assert(launched.protocolVersion === "lbh-local-v2", "Packaged client launched against the wrong protocol");
  } finally {
    cdp?.close();
    await stop(appProcess);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function run() {
  const version = require(path.join(ROOT, "package.json")).version;
  const hash = gitHash();
  const buildVersion = `${version}.${hash}`;
  const buildRoot = path.join(ROOT, "builds", `v${buildVersion}`);
  const linuxRoot = path.join(buildRoot, "Last Singularity-linux-x64");
  const appAsar = path.join(linuxRoot, "resources", "app.asar");
  const zip = path.join(ROOT, "builds", `last-singularity-playtest-v${buildVersion}.zip`);

  for (const expected of [
    path.join(buildRoot, "last-singularity-web"),
    path.join(buildRoot, "last-singularity-ipad-webapp"),
    path.join(buildRoot, "Last Singularity.app"),
    path.join(buildRoot, "Last Singularity-win32-x64"),
    linuxRoot,
    appAsar,
    zip,
  ]) {
    assert(fs.existsSync(expected), `Missing release output for ${buildVersion}: ${expected}`);
  }

  const extractRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-release-package-"));
  const appRoot = path.join(extractRoot, "app");
  const dataRoot = path.join(extractRoot, "data");
  asar.extractAll(appAsar, appRoot);
  fs.mkdirSync(dataRoot, { recursive: true });

  for (const expected of [
    path.join(appRoot, "renderer", "index.html"),
    path.join(appRoot, "renderer", "src", "main.js"),
    path.join(appRoot, "renderer", "node_modules", "three", "build", "three.module.js"),
    path.join(appRoot, "package.json"),
    path.join(appRoot, "node_modules", "ws", "package.json"),
    path.join(appRoot, "server", "control-plane-runtime.cjs"),
    path.join(appRoot, "server", "sim-runtime.cjs"),
    path.join(appRoot, "server", "sim", "world-geometry.cjs"),
  ]) {
    assert(fs.existsSync(expected), `Extracted app.asar is missing ${path.relative(appRoot, expected)}`);
  }

  const sourcePackage = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const shellPackage = JSON.parse(fs.readFileSync(path.join(appRoot, "package.json"), "utf8"));
  const packagedWs = JSON.parse(fs.readFileSync(path.join(appRoot, "node_modules", "ws", "package.json"), "utf8"));
  assert(shellPackage.dependencies?.ws === sourcePackage.dependencies.ws, "Packaged shell must declare the exact ws dependency");
  assert(packagedWs.version === sourcePackage.dependencies.ws, "Packaged app must contain the exactly pinned ws version");
  const packagedRequire = createRequire(path.join(appRoot, "server", "sim-runtime.cjs"));
  const packagedWsEntry = packagedRequire.resolve("ws");
  assert(
    path.relative(fs.realpathSync(appRoot), fs.realpathSync(packagedWsEntry)).split(path.sep).slice(0, 2).join("/") === "node_modules/ws",
    "Packaged sim runtime must resolve ws from app node_modules"
  );
  assert(typeof packagedRequire("ws").WebSocketServer === "function", "Packaged ws dependency must expose WebSocketServer");

  const controlPort = await openPort();
  let simPort = await openPort();
  while (simPort === controlPort) simPort = await openPort();
  const controlUrl = `http://127.0.0.1:${controlPort}`;
  const commonEnv = {
    LBH_CONTROL_PLANE_FILE: path.join(dataRoot, "control-plane-store.json"),
    LBH_SESSION_REGISTRY_FILE: path.join(dataRoot, "session-registry.json"),
  };
  let control = null;
  let sim = null;

  try {
    control = launch(
      path.join(appRoot, "server", "control-plane-runtime.cjs"),
      ["--host", "127.0.0.1", "--port", String(controlPort), "--label", "packaged-control"],
      appRoot,
      commonEnv,
    );
    await waitFor(() => fetchJson(`${controlUrl}/health`), [control]);

    sim = launch(
      path.join(appRoot, "server", "sim-runtime.cjs"),
      ["--host", "127.0.0.1", "--port", String(simPort), "--sim-instance-id", "packaged-sim"],
      appRoot,
      { ...commonEnv, LBH_CONTROL_PLANE_URL: controlUrl, LBH_SIM_KEEP_ALIVE: "true" },
    );
    const simUrl = `http://127.0.0.1:${simPort}`;
    const simHealth = await waitFor(() => fetchJson(`${simUrl}/health`), [control, sim]);
    assert(simHealth.simInstanceId === "packaged-sim", "Packaged sim identity mismatch");
    const protocol = await fetchJson(`${simUrl}/protocol`);
    assert(JSON.stringify(protocol).includes("lbh-local-v2"), "Packaged sim did not expose protocol v2");
    const registered = await waitFor(async () => {
      const health = await fetchJson(`${controlUrl}/health`);
      assert(health.simInstances.some((entry) => entry.simInstanceId === "packaged-sim"), "Packaged sim not registered");
      return health;
    }, [control, sim]);
    assert(registered.label === "packaged-control", "Packaged control identity mismatch");
  } finally {
    await stop(sim);
    await stop(control);
    fs.rmSync(extractRoot, { recursive: true, force: true });
  }

  await provePackagedClientBoot(buildRoot);

  console.log(JSON.stringify({ buildVersion, buildRoot, zip, sha256: sha256(zip), protocolVersion: "lbh-local-v2" }, null, 2));
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
