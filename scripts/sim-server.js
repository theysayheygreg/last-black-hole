#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const net = require("net");
const { spawn, execFileSync } = require("child_process");
const { DEFAULT_SIM_PORT } = require("./sim-protocol.js");

const ROOT = path.resolve(__dirname, "..");
const TMP = path.join(ROOT, "tmp");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

const cliArgs = parseArgs(process.argv.slice(3));
const HOST = cliArgs.host || process.env.LBH_SIM_HOST || "127.0.0.1";
const PORT = Number(cliArgs.port || process.env.LBH_SIM_PORT || DEFAULT_SIM_PORT);
const PID_FILE = path.join(TMP, `sim-server-${PORT}.pid`);
const META_FILE = path.join(TMP, `sim-server-${PORT}.json`);
const LOG_FILE = path.join(TMP, `sim-server-${PORT}.log`);
const SERVER_SCRIPT = path.join(ROOT, "scripts", "sim-runtime.js");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureTmp() {
  fs.mkdirSync(TMP, { recursive: true });
}

function readPid() {
  try {
    return Number(fs.readFileSync(PID_FILE, "utf8").trim());
  } catch {
    return null;
  }
}

function readMeta() {
  try {
    return JSON.parse(fs.readFileSync(META_FILE, "utf8"));
  } catch {
    return null;
  }
}

function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function cleanupFiles() {
  for (const file of [PID_FILE, META_FILE]) {
    try {
      fs.rmSync(file, { force: true });
    } catch {}
  }
}

function getPortListener(port) {
  try {
    const output = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const lines = output.split("\n").slice(1);
    if (!lines.length) return null;
    const parts = lines[0].trim().split(/\s+/);
    return {
      command: parts[0],
      pid: Number(parts[1]),
    };
  } catch {
    return null;
  }
}

async function waitForPort(port, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const socket = net.connect({ host: HOST, port }, () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
    });
    if (ok) return true;
    await sleep(100);
  }
  return false;
}

async function start() {
  ensureTmp();
  const existingPid = readPid();
  if (isAlive(existingPid)) {
    const meta = readMeta();
    console.log(`LBH sim server already running at ${meta?.url || `http://${HOST}:${PORT}/`} (pid ${existingPid}).`);
    return;
  }

  cleanupFiles();

  const listener = getPortListener(PORT);
  if (listener) {
    console.error(`Port ${PORT} is already occupied by ${listener.command} (pid ${listener.pid}).`);
    process.exit(1);
  }

  const logFd = fs.openSync(LOG_FILE, "a");
  const child = spawn(process.execPath, [
    SERVER_SCRIPT,
    "--host", HOST,
    "--port", String(PORT),
    "--pid-file", PID_FILE,
    "--meta-file", META_FILE,
    "--label", "lbh-sim",
  ], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();

  const up = await waitForPort(PORT, 3000);
  if (!up) {
    console.error(`LBH sim server did not start cleanly on port ${PORT}. See ${LOG_FILE}.`);
    process.exit(1);
  }

  const meta = readMeta();
  console.log(`LBH sim server running at ${meta?.url || `http://${HOST}:${PORT}/`} (pid ${meta?.pid || child.pid}).`);
  console.log(`Log: ${LOG_FILE}`);
}

async function stop() {
  const pid = readPid();
  if (!pid || !isAlive(pid)) {
    cleanupFiles();
    console.log("LBH sim server is not running.");
    return;
  }

  process.kill(pid, "SIGTERM");
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) {
      cleanupFiles();
      console.log(`Stopped LBH sim server (pid ${pid}).`);
      return;
    }
    await sleep(100);
  }

  process.kill(pid, "SIGKILL");
  cleanupFiles();
  console.log(`Force-stopped LBH sim server (pid ${pid}).`);
}

function status() {
  const pid = readPid();
  const meta = readMeta();
  const listener = getPortListener(PORT);

  if (pid && isAlive(pid)) {
    console.log(`LBH sim server is running at ${meta?.url || `http://${HOST}:${PORT}/`} (pid ${pid}).`);
    console.log(`Log: ${LOG_FILE}`);
    return;
  }

  if (listener) {
    console.log(`LBH sim server is not running, but port ${PORT} is occupied by ${listener.command} (pid ${listener.pid}).`);
    return;
  }

  console.log("LBH sim server is not running.");
}

async function restart() {
  await stop();
  await start();
}

async function main() {
  const command = process.argv[2] || "start";
  if (command === "start") return start();
  if (command === "stop") return stop();
  if (command === "status") return status();
  if (command === "restart") return restart();
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
