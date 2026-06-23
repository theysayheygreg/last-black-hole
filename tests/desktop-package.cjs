/**
 * desktop-package.cjs — static guard for packaged Electron server runtime.
 *
 * The Deck build runs control-plane-runtime.cjs and sim-runtime.cjs from the
 * desktop package. Any top-level local CJS dependency they require must be
 * copied into the packaged server folder, or the app boots into Stack Status.
 */
const fs = require("fs");
const path = require("path");
const { DESKTOP_SERVER_SCRIPTS } = require("../scripts/build.cjs");

const ROOT = path.resolve(__dirname, "..");
const SCRIPTS_DIR = path.join(ROOT, "scripts");
const DECK_DEPLOY_SCRIPT = path.join(ROOT, "scripts", "deploy", "steam-deck.cjs");
const bundled = new Set(DESKTOP_SERVER_SCRIPTS);
const visited = new Set();
const missing = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function localRequireTargets(source) {
  const targets = [];
  const pattern = /require\((['"])(\.[^'"]+)\1\)/g;
  let match;
  while ((match = pattern.exec(source))) {
    targets.push(match[2]);
  }
  return targets;
}

function visit(script) {
  if (visited.has(script)) return;
  visited.add(script);

  const filepath = path.join(SCRIPTS_DIR, script);
  assert(fs.existsSync(filepath), `Desktop server bundle references missing script: ${script}`);

  const source = fs.readFileSync(filepath, "utf8");
  for (const target of localRequireTargets(source)) {
    // The desktop stage copies scripts/content plus src/content as directories.
    if (target.startsWith("./content/")) continue;
    if (target.startsWith("../")) continue;

    const resolved = path.normalize(path.join(path.dirname(script), target));
    if (path.dirname(resolved) !== ".") continue;
    if (!resolved.endsWith(".cjs")) continue;

    if (!bundled.has(resolved)) {
      missing.push(`${script} requires ${resolved}`);
      continue;
    }
    visit(resolved);
  }
}

function run() {
  assert(bundled.has("control-plane-runtime.cjs"), "Desktop package must include control-plane runtime");
  assert(bundled.has("sim-runtime.cjs"), "Desktop package must include sim runtime");

  for (const entry of ["control-plane-runtime.cjs", "sim-runtime.cjs"]) {
    visit(entry);
  }

  if (missing.length) {
    throw new Error(`Desktop package server bundle is incomplete:\n- ${missing.join("\n- ")}`);
  }

  const deckDeploy = fs.readFileSync(DECK_DEPLOY_SCRIPT, "utf8");
  const electronMain = fs.readFileSync(path.join(ROOT, "desktop", "electron-main.cjs"), "utf8");
  assert(electronMain.includes("protocol.registerSchemesAsPrivileged"), "Packaged renderer must use a privileged app protocol");
  assert(electronMain.includes("://renderer/index.html") && electronMain.includes("loadURL(rendererUrl)"), "Packaged renderer must load through the app protocol");
  assert(electronMain.includes("'application/json; charset=utf-8'"), "App protocol must serve JSON modules with the correct MIME type");
  assert(electronMain.includes("'text/javascript; charset=utf-8'"), "App protocol must serve module scripts with the correct MIME type");
  assert(fs.readFileSync(path.join(ROOT, "scripts", "build.cjs"), "utf8").includes("fs.cpSync(threeBuild"), "Desktop build must copy the complete Three build runtime");

  assert(deckDeploy.includes("--disable-gpu-sandbox"), "Deck launcher must keep the Chromium GPU sandbox workaround");
  assert(deckDeploy.includes("--ignore-gpu-blocklist"), "Deck launcher must keep the Chromium GPU blocklist workaround");
  assert(deckDeploy.includes("--ozone-platform=x11"), "Deck launcher must force Electron through XWayland for current SteamOS WebGL stability");
  assert(deckDeploy.includes("ELECTRON_LOG_FILE"), "Deck launcher must persist Electron logs");
  assert(deckDeploy.includes("LBH_DECK_DISABLE_GPU"), "Deck launcher must expose a software-render rescue switch");
  assert(deckDeploy.includes("StartupWMClass"), "Deck desktop entry must expose a stable window class for Steam/Desktop");
  assert(deckDeploy.includes("deck-launch.log"), "Deck launcher must persist stderr/stdout for remote triage");
  assert(deckDeploy.includes("remoteCommand(command)"), "Deck deploy SSH commands must seed a stable remote PATH");
  assert(deckDeploy.includes("--rsync-path=/usr/bin/rsync"), "Deck deploy rsync must not depend on remote shell PATH");

  console.log("Desktop package server bundle closure is complete.");
}

run();
