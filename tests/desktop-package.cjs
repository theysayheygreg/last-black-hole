/**
 * desktop-package.cjs — packaged Electron authority boot proof.
 *
 * Stages the same server payload used by desktop builds, launches both staged
 * processes, and verifies that the sim becomes healthy and registers with the
 * control plane. This catches missing transitive modules that static scans miss.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { stageDesktopAuthorityRuntime } = require("../scripts/build.cjs");

const ROOT = path.resolve(__dirname, "..");
const DECK_DEPLOY_SCRIPT = path.join(ROOT, "scripts", "deploy", "steam-deck.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runServiceWrapper(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, "scripts", "control-plane-server.cjs"), ...args], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("exit", (code) => resolve({ code, output }));
  });
}

async function proveConcurrentWrapperStarts() {
  const port = await getOpenPort();
  const pidFile = path.join(ROOT, "tmp", `control-plane-${port}.pid`);
  const metaFile = path.join(ROOT, "tmp", `control-plane-${port}.json`);
  try {
    const starts = await Promise.all([
      runServiceWrapper(["start", "--port", String(port)]),
      runServiceWrapper(["start", "--port", String(port)]),
    ]);
    assert(starts.every(({ code }) => code === 0), `Concurrent starts failed: ${JSON.stringify(starts)}`);
    const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
    const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    assert(meta.pid === pid && meta.port === port, "Losing start must not erase the winner pid/meta");
    assert(starts.every(({ output }) =>
      /^LBH control plane (?:already )?running at http:\/\/127\.0\.0\.1:\d+\/ \(pid \d+\)\./.test(output)),
    `Concurrent output drifted from the baseline lifecycle: ${JSON.stringify(starts)}`);
    const stops = await Promise.all([
      runServiceWrapper(["stop", "--port", String(port)]),
      runServiceWrapper(["stop", "--port", String(port)]),
    ]);
    assert(stops.every(({ code }) => code === 0), `Concurrent stops failed: ${JSON.stringify(stops)}`);
    assert(!fs.existsSync(pidFile) && !fs.existsSync(metaFile),
      "Concurrent lifecycle must clean pid and meta files");
  } finally {
    await runServiceWrapper(["stop", "--port", String(port)]);
  }
}

function getOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => port ? resolve(port) : reject(new Error("Could not allocate test port")));
    });
  });
}

function launchRuntime(script, args, options) {
  const output = [];
  const child = spawn(process.execPath, [script, ...args], {
    cwd: options.cwd,
    env: options.env,
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
  if (!response.ok || body.ok === false) {
    throw new Error(body.error || `${url} returned ${response.status}`);
  }
  return body;
}

async function waitFor(check, children, timeout = 8000) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < deadline) {
    for (const child of children) {
      if (child.exitCode !== null) {
        throw new Error(`Staged runtime exited with ${child.exitCode}:\n${child.runtimeOutput.join("")}`);
      }
    }
    try {
      return await check();
    } catch (error) {
      lastError = error;
      await sleep(100);
    }
  }
  throw lastError || new Error("Timed out waiting for staged runtime");
}

async function stopRuntime(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(2000).then(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }),
  ]);
}

async function proveStagedAuthorityBoot() {
  const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lbh-desktop-stage-"));
  const dataDir = path.join(stagingRoot, "runtime-data");
  const serverDir = path.join(stagingRoot, "server");
  fs.mkdirSync(dataDir, { recursive: true });
  stageDesktopAuthorityRuntime(stagingRoot);

  const nestedModule = path.join(serverDir, "sim", "body-masks.cjs");
  assert(fs.existsSync(nestedModule), "Desktop stage must include nested sim runtime modules");
  assert(fs.existsSync(path.join(serverDir, "service-supervisor.cjs")),
    "Desktop stage must include the service wrapper require closure");

  const controlPort = await getOpenPort();
  let simPort = await getOpenPort();
  while (simPort === controlPort) simPort = await getOpenPort();
  const controlUrl = `http://127.0.0.1:${controlPort}`;
  const commonEnv = {
    ...process.env,
    LBH_CONTROL_PLANE_FILE: path.join(dataDir, "control-plane-store.json"),
    LBH_SESSION_REGISTRY_FILE: path.join(dataDir, "session-registry.json"),
  };
  let control = null;
  let sim = null;

  try {
    control = launchRuntime(
      path.join(serverDir, "control-plane-runtime.cjs"),
      ["--host", "127.0.0.1", "--port", String(controlPort), "--label", "lbh-staged-control-test"],
      { cwd: stagingRoot, env: commonEnv }
    );
    await waitFor(() => fetchJson(`${controlUrl}/health`), [control]);

    sim = launchRuntime(
      path.join(serverDir, "sim-runtime.cjs"),
      ["--host", "127.0.0.1", "--port", String(simPort), "--sim-instance-id", "lbh-staged-sim-test"],
      {
        cwd: stagingRoot,
        env: {
          ...commonEnv,
          LBH_CONTROL_PLANE_URL: controlUrl,
          LBH_SIM_KEEP_ALIVE: "true",
        },
      }
    );

    const simHealth = await waitFor(
      () => fetchJson(`http://127.0.0.1:${simPort}/health`),
      [control, sim]
    );
    assert(simHealth.simInstanceId === "lbh-staged-sim-test", "Staged sim health must expose its process identity");

    const controlHealth = await waitFor(async () => {
      const health = await fetchJson(`${controlUrl}/health`);
      assert(
        health.simInstances.some((entry) => entry.simInstanceId === "lbh-staged-sim-test"),
        "Staged sim has not registered with staged control plane"
      );
      return health;
    }, [control, sim]);
    assert(controlHealth.label === "lbh-staged-control-test", "Staged control health must expose its process identity");
  } finally {
    await stopRuntime(sim);
    await stopRuntime(control);
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
}

async function run() {
  await proveConcurrentWrapperStarts();
  await proveStagedAuthorityBoot();

  const deckDeploy = fs.readFileSync(DECK_DEPLOY_SCRIPT, "utf8");
  const electronMain = fs.readFileSync(path.join(ROOT, "desktop", "electron-main.cjs"), "utf8");
  const mainPreload = fs.readFileSync(path.join(ROOT, "desktop", "main-preload.cjs"), "utf8");
  assert(electronMain.includes("protocol.registerSchemesAsPrivileged"), "Packaged renderer must use a privileged app protocol");
  assert(electronMain.includes("://renderer/index.html") && electronMain.includes("loadURL(rendererUrl)"), "Packaged renderer must load through the app protocol");
  assert(electronMain.includes("'application/json; charset=utf-8'"), "App protocol must serve JSON modules with the correct MIME type");
  assert(electronMain.includes("'text/javascript; charset=utf-8'"), "App protocol must serve module scripts with the correct MIME type");
  assert(electronMain.includes("LBH_SIM_KEEP_ALIVE: 'true'"), "Packaged authority must survive an extended title-screen wait");
  assert(electronMain.includes("preload: path.join(__dirname, 'main-preload.cjs')"), "Packaged renderer must receive the main-window preload bridge");
  assert(electronMain.includes("ipcMain.handle('lbh:quit-app'"), "Electron main must own the controller quit action");
  assert(mainPreload.includes("ipcRenderer.invoke('lbh:quit-app')"), "Renderer quit action must use the centralized Electron IPC bridge");
  assert(fs.readFileSync(path.join(ROOT, "scripts", "build.cjs"), "utf8").includes("fs.cpSync(threeBuild"), "Desktop build must copy the complete Three build runtime");

  assert(deckDeploy.includes("--disable-gpu-sandbox"), "Deck launcher must keep the Chromium GPU sandbox workaround");
  assert(deckDeploy.includes("--ignore-gpu-blocklist"), "Deck launcher must keep the Chromium GPU blocklist workaround");
  assert(deckDeploy.includes("--ozone-platform=x11"), "Deck launcher must force Electron through XWayland for current SteamOS WebGL stability");
  assert(deckDeploy.includes("ELECTRON_LOG_FILE"), "Deck launcher must persist Electron logs");
  assert(deckDeploy.includes("LBH_DECK_DISABLE_GPU"), "Deck launcher must expose a software-render rescue switch");
  assert(deckDeploy.includes("StartupWMClass"), "Deck desktop entry must expose a stable window class for Steam/Desktop");
  assert(deckDeploy.includes("last-singularity-icon.png"), "Deck desktop entry must expose the packaged app icon");
  assert(deckDeploy.includes("deck-launch.log"), "Deck launcher must persist stderr/stdout for remote triage");
  assert(deckDeploy.includes("remoteCommand(command)"), "Deck deploy SSH commands must seed a stable remote PATH");
  assert(deckDeploy.includes("--rsync-path=/usr/bin/rsync"), "Deck deploy rsync must not depend on remote shell PATH");
  assert(deckDeploy.includes("--force-build"), "Deck deploy must make rebuilds explicit instead of clobbering complete release folders");
  assert(deckDeploy.includes("Reusing existing Linux Deck artifact"), "Deck deploy must reuse the current hash artifact when present");

  console.log("Desktop package authority runtime stages and boots successfully.");
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
