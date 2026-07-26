const fs = require("fs");
const net = require("net");
const { spawn, execFileSync } = require("child_process");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createServiceSupervisor({
  serviceName,
  host,
  port,
  root,
  tmpDir,
  pidFile,
  metaFile,
  logFile,
  serverScript,
  runtimeArgs,
  alreadyPreposition = "at",
  occupiedAdvice,
  statusDetail,
}) {
  const fallbackUrl = `http://${host}:${port}/`;
  const lockFile = `${pidFile}.lock`;

  function readPid() {
    try {
      return Number(fs.readFileSync(pidFile, "utf8").trim());
    } catch {
      return null;
    }
  }

  function readMeta() {
    try {
      return JSON.parse(fs.readFileSync(metaFile, "utf8"));
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
    for (const file of [pidFile, metaFile]) {
      try {
        fs.rmSync(file, { force: true });
      } catch {}
    }
  }

  async function withLifecycleLock(action) {
    fs.mkdirSync(tmpDir, { recursive: true });
    let lockFd = null;
    while (lockFd == null) {
      try {
        lockFd = fs.openSync(lockFile, "wx");
        fs.writeFileSync(lockFd, `${process.pid}\n`);
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        let ownerPid = null;
        try {
          ownerPid = Number(fs.readFileSync(lockFile, "utf8").trim());
        } catch {}
        if (!isAlive(ownerPid)) {
          try {
            fs.rmSync(lockFile, { force: true });
          } catch {}
          continue;
        }
        await sleep(50);
      }
    }

    try {
      return await action();
    } finally {
      fs.closeSync(lockFd);
      try {
        fs.rmSync(lockFile, { force: true });
      } catch {}
    }
  }

  function getPortListener() {
    try {
      const output = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      const parts = output.split("\n")[1]?.trim().split(/\s+/);
      return parts ? { command: parts[0], pid: Number(parts[1]) } : null;
    } catch {
      return null;
    }
  }

  async function waitForPort(timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const open = await new Promise((resolve) => {
        const socket = net.connect({ host, port }, () => {
          socket.destroy();
          resolve(true);
        });
        socket.on("error", () => resolve(false));
      });
      if (open) return true;
      await sleep(100);
    }
    return false;
  }

  async function startUnlocked() {
    fs.mkdirSync(tmpDir, { recursive: true });
    const existingPid = readPid();
    if (isAlive(existingPid)) {
      const meta = readMeta();
      console.log(`${serviceName} already running ${alreadyPreposition} ${meta?.url || fallbackUrl} (pid ${existingPid}).`);
      return;
    }

    cleanupFiles();
    const listener = getPortListener();
    if (listener) {
      console.error(`Port ${port} is already occupied by ${listener.command} (pid ${listener.pid}).`);
      occupiedAdvice?.(listener);
      process.exitCode = 1;
      return;
    }

    const logFd = fs.openSync(logFile, "a");
    const child = spawn(process.execPath, [serverScript, ...runtimeArgs], {
      cwd: root,
      detached: true,
      stdio: ["ignore", logFd, logFd],
    });
    child.unref();

    const up = await waitForPort();
    const meta = readMeta();
    const managedPid = meta?.pid || child.pid;
    if (!up || !isAlive(managedPid)) {
      if (isAlive(child.pid)) process.kill(child.pid, "SIGTERM");
      cleanupFiles();
      console.error(`${serviceName} did not start cleanly on port ${port}. See ${logFile}.`);
      process.exitCode = 1;
      return;
    }

    console.log(`${serviceName} running at ${meta?.url || fallbackUrl} (pid ${managedPid}).`);
    console.log(`Log: ${logFile}`);
  }

  async function stopUnlocked() {
    const pid = readPid();
    if (!pid || !isAlive(pid)) {
      cleanupFiles();
      console.log(`${serviceName} is not running.`);
      return;
    }

    process.kill(pid, "SIGTERM");
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      if (!isAlive(pid)) {
        cleanupFiles();
        console.log(`Stopped ${serviceName} (pid ${pid}).`);
        return;
      }
      await sleep(100);
    }

    process.kill(pid, "SIGKILL");
    cleanupFiles();
    console.log(`Force-stopped ${serviceName} (pid ${pid}).`);
  }

  function start() {
    return withLifecycleLock(startUnlocked);
  }

  function stop() {
    return withLifecycleLock(stopUnlocked);
  }

  function restart() {
    return withLifecycleLock(async () => {
      await stopUnlocked();
      return startUnlocked();
    });
  }

  async function status() {
    const pid = readPid();
    const meta = readMeta();
    const listener = getPortListener();
    if (pid && isAlive(pid)) {
      console.log(`${serviceName} is running at ${meta?.url || fallbackUrl} (pid ${pid}).`);
      console.log(`Log: ${logFile}`);
      return statusDetail?.({ meta, pid });
    }
    if (listener) {
      console.log(`${serviceName} is not running, but port ${port} is occupied by ${listener.command} (pid ${listener.pid}).`);
      return;
    }
    console.log(`${serviceName} is not running.`);
  }

  async function run(command = "start") {
    if (command === "start") return start();
    if (command === "stop") return stop();
    if (command === "status") return status();
    if (command === "restart") return restart();
    console.error(`Unknown command: ${command}`);
    process.exitCode = 1;
  }
  return { run, start, stop, status, restart };
}

module.exports = { createServiceSupervisor, parseArgs };
