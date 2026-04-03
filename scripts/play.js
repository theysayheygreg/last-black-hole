#!/usr/bin/env node

// play.js — One command to play the game.
// Starts control plane + sim server + dev server, opens browser.
// Usage: node scripts/play.js [--no-open]
//        npm start
//
// Stop everything: npm run stop

const { execSync, spawn } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OPEN_BROWSER = !process.argv.includes("--no-open");
const DEV_URL = "http://localhost:8080";

function run(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, stdio: "pipe" }).toString().trim();
  } catch {
    return "";
  }
}

function isRunning(script) {
  const out = run(`node ${script} status`);
  return out.includes("is running");
}

function start(script, label) {
  if (isRunning(script)) {
    console.log(`  ${label} already running`);
    return;
  }
  const out = run(`node ${script} start`);
  const url = out.match(/http:\/\/[^\s)]+/)?.[0] || "";
  console.log(`  ${label} started${url ? " at " + url : ""}`);
}

function openBrowser(url) {
  const platform = process.platform;
  try {
    if (platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else if (platform === "win32") {
      spawn("cmd", ["/c", "start", url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    console.log(`  Open ${url} in your browser`);
  }
}

console.log("Starting Last Singularity...\n");

start("scripts/control-plane-server.js", "Control plane");
start("scripts/sim-server.js", "Sim server");
start("scripts/dev-server.js", "Dev server");

console.log("");

if (OPEN_BROWSER) {
  console.log(`Opening ${DEV_URL}\n`);
  openBrowser(DEV_URL);
} else {
  console.log(`Game ready at ${DEV_URL}\n`);
}
