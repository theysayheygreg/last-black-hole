const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const path = require("path");
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

function processIsAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readClaim(lockFile) {
  let fd = null;
  try {
    fd = fs.openSync(lockFile, "r");
    const stat = fs.fstatSync(fd);
    let claim = {};
    try {
      claim = JSON.parse(fs.readFileSync(fd, "utf8"));
    } catch {}
    return { ...claim, dev: stat.dev, ino: stat.ino };
  } catch {
    return null;
  } finally {
    if (fd != null) fs.closeSync(fd);
  }
}

function sameClaim(left, right) {
  return Boolean(left && right
    && left.token === right.token
    && left.dev === right.dev
    && left.ino === right.ino);
}

// Publish a complete claim in one link operation; token plus inode keeps stale
// owners from unlinking a successor that reused the same service path.
function createLifecycleLock(lockFile, {
  pid = process.pid,
  isAlive = processIsAlive,
  hooks = {},
} = {}) {
  async function acquire() {
    fs.mkdirSync(path.dirname(lockFile), { recursive: true });
    while (true) {
      const claim = { pid, token: crypto.randomUUID() };
      const tempFile = `${lockFile}.${claim.token}.tmp`;
      let fd = null;
      try {
        fd = fs.openSync(tempFile, "wx");
        fs.writeFileSync(fd, `${JSON.stringify(claim)}\n`);
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fd = null;
        await hooks.afterClaimPrepared?.({ claim, lockFile, tempFile });
        try {
          fs.linkSync(tempFile, lockFile);
          const owned = readClaim(lockFile);
          if (!owned || owned.token !== claim.token) throw new Error(`Could not verify lifecycle lock ${lockFile}`);
          return owned;
        } catch (error) {
          if (error.code !== "EEXIST") throw error;
        }
      } finally {
        if (fd != null) fs.closeSync(fd);
        try {
          fs.rmSync(tempFile, { force: true });
        } catch {}
      }

      const observed = readClaim(lockFile);
      await hooks.onContention?.({ observed, lockFile });
      if (!observed || isAlive(observed.pid)) {
        await sleep(50);
        continue;
      }

      await hooks.beforeStaleRecheck?.({ observed, lockFile });
      if (!sameClaim(observed, readClaim(lockFile))) continue;
      try {
        fs.rmSync(lockFile);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }

  async function release(owned) {
    await hooks.beforeReleaseRecheck?.({ owned, lockFile });
    if (!sameClaim(owned, readClaim(lockFile))) return false;
    try {
      fs.rmSync(lockFile);
      return true;
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
  }

  return { acquire, release };
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
  const lifecycleLock = createLifecycleLock(lockFile);

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
    const claim = await lifecycleLock.acquire();
    try {
      return await action();
    } finally {
      await lifecycleLock.release(claim);
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

module.exports = {
  createServiceSupervisor,
  parseArgs,
  _createLifecycleLock: createLifecycleLock,
};
