#!/usr/bin/env node

const http = require("http");
const path = require("path");
const { DEFAULT_SIM_PORT } = require("./sim-protocol.cjs");
const { createServiceSupervisor, parseArgs } = require("./service-supervisor.cjs");

const ROOT = path.resolve(__dirname, "..");
const TMP = path.join(ROOT, "tmp");
const cliArgs = parseArgs(process.argv.slice(3));
const HOST = cliArgs.host || process.env.LBH_SIM_HOST || "127.0.0.1";
const PORT = Number(cliArgs.port || process.env.LBH_SIM_PORT || DEFAULT_SIM_PORT);
const PID_FILE = path.join(TMP, `sim-server-${PORT}.pid`);
const META_FILE = path.join(TMP, `sim-server-${PORT}.json`);

function requestJson(route, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: HOST, port: PORT, path: route, timeout: timeoutMs }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("request timed out")));
  });
}

const supervisor = createServiceSupervisor({
  serviceName: "LBH sim server",
  host: HOST,
  port: PORT,
  root: ROOT,
  tmpDir: TMP,
  pidFile: PID_FILE,
  metaFile: META_FILE,
  logFile: path.join(TMP, `sim-server-${PORT}.log`),
  serverScript: path.join(ROOT, "scripts", "sim-runtime.cjs"),
  runtimeArgs: [
    "--host", HOST,
    "--port", String(PORT),
    "--pid-file", PID_FILE,
    "--meta-file", META_FILE,
    "--label", "lbh-sim",
    ...(cliArgs.bench ? ["--bench", String(cliArgs.bench)] : []),
    ...(cliArgs["keep-alive"] ? ["--keep-alive", String(cliArgs["keep-alive"])] : []),
    ...(cliArgs["idle-shutdown-ms"] ? ["--idle-shutdown-ms", String(cliArgs["idle-shutdown-ms"])] : []),
  ],
  statusDetail() {
    return requestJson("/health")
      .then((health) => {
        const idle = health?.idleState || {};
        console.log(`Session: ${health?.session?.status || "unknown"} | map=${health?.mapId || "unknown"} | players=${idle.humanPlayerCount ?? health?.playerCount ?? "?"} human + ${idle.aiPlayerCount ?? "?"} AI`);
        console.log(`Loop: ${idle.currentLoopTickHz ?? "?"}Hz${idle.idle ? " (idle)" : ""} | keepAlive=${idle.keepAlive ? "true" : "false"} | overload=${health?.session?.overloadState || "unknown"}`);
        if (idle.idle) {
          const shutdownIn = idle.shutdownInMs == null ? "pinned" : `${Math.round(idle.shutdownInMs)}ms`;
          console.log(`Idle for: ${Math.round((idle.idleForMs || 0) / 1000)}s | auto-stop in: ${shutdownIn}`);
        }
      })
      .catch(() => null);
  },
});

supervisor.run(process.argv[2] || "start").catch((error) => {
  console.error(error.message);
  process.exit(1);
});
