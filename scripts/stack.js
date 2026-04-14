#!/usr/bin/env node

const { spawn } = require("child_process");
const path = require("path");
const { createRuntimeLogger } = require("./runtime-telemetry.js");
const {
  DEV_URL,
  LOCAL_SIM_URL,
  getStackSnapshot,
  formatStackSummary,
  startService,
  stopService,
  statusService,
} = require("./runtime-status.js");

const ROOT = path.resolve(__dirname, "..");
const telemetry = createRuntimeLogger("stack", { cwd: ROOT });

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i += 1;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(arg);
    }
  }
  return args;
}

const MODES = {
  "local-browser": {
    name: "local-browser",
    description: "Client-only browser play against no authority stack.",
    services: ["dev"],
    query: {},
  },
  "local-host": {
    name: "local-host",
    description: "Dev server + local control plane + local sim + browser client bound to local authority.",
    services: ["control", "sim", "dev"],
    query: { simServer: LOCAL_SIM_URL },
  },
  "remote-client": {
    name: "remote-client",
    description: "Local browser client pointed at a remote authoritative sim.",
    services: ["dev"],
    query: null,
  },
};

function buildUrl(base, query) {
  const url = new URL(base);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value != null && value !== "") url.searchParams.set(key, value);
  });
  return url.toString();
}

function openUrl(url) {
  const platform = process.platform;
  if (platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  if (platform === "win32") {
    spawn("cmd", ["/c", "start", url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

async function printStackStatus() {
  console.log("LBH runtime modes:");
  Object.values(MODES).forEach((entry) => {
    console.log(`- ${entry.name}: ${entry.description}`);
  });
  console.log("");
  const snapshot = await getStackSnapshot();
  console.log(formatStackSummary(snapshot));
}

function assertMode(selectedMode) {
  if (MODES[selectedMode]) return MODES[selectedMode];
  throw new Error(`Unknown mode "${selectedMode}". Use one of: ${Object.keys(MODES).join(", ")}`);
}

async function start({ mode = "local-host", openBrowser = true, remoteSimUrl = "" } = {}) {
  const selected = assertMode(mode);
  telemetry.info("stack.start", { mode: selected.name, openBrowser: Boolean(openBrowser) });
  console.log(`Starting LBH in ${selected.name} mode...\n`);

  for (const service of selected.services) {
    const output = startService(service);
    if (output) console.log(output);
  }

  let url = DEV_URL;
  if (selected.name === "local-host") {
    url = buildUrl(DEV_URL, selected.query);
  } else if (selected.name === "remote-client") {
    if (!remoteSimUrl) {
      throw new Error("remote-client mode requires --sim=http://host:port");
    }
    url = buildUrl(DEV_URL, { simServer: remoteSimUrl });
  }

  telemetry.info("stack.clientReady", { mode: selected.name, url });
  console.log(`\nClient URL: ${url}`);
  if (openBrowser) {
    openUrl(url);
    console.log("Opened in browser.");
  }
}

async function stop() {
  telemetry.info("stack.stop", {});
  console.log("Stopping LBH stack...\n");
  console.log(stopService("dev"));
  console.log(stopService("sim"));
  console.log(stopService("control"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || "status";
  const mode = String(args.mode || "local-host");
  const openBrowser = !args["no-open"];
  const remoteSimUrl = String(args.sim || args.simServer || "").trim();

  if (command === "start") return start({ mode, openBrowser, remoteSimUrl });
  if (command === "stop") return stop();
  if (command === "status") return printStackStatus();
  if (command === "restart") {
    await stop();
    return start({ mode, openBrowser, remoteSimUrl });
  }
  throw new Error(`Unknown command "${command}"`);
}

module.exports = {
  MODES,
  start,
  stop,
  printStackStatus,
  main,
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
