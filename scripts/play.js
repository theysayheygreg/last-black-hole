#!/usr/bin/env node

/**
 * play.js — canonical local launch for Last Singularity.
 *
 * Starts the dev stack (dev-server + control plane + sim) and opens the
 * game inside a local Electron window — NOT a browser tab. The Electron
 * window enforces a minimum content size (960x540) so the game always
 * loads at a playable resolution and can't be resized below the render
 * minimum. This is the player-facing path; the browser-tab path via
 * `npm start` remains available for dev.
 */

const path = require('path');
const { spawn } = require('child_process');
const { start, DEV_URL } = require('./stack.js');

const HTML_FILE = 'index-a.html';

async function run() {
  // Bring up dev + control-plane + sim, but don't open a browser tab —
  // Electron is the client surface here.
  await start({ mode: 'local-host', openBrowser: false });

  // Match stack.js local-host URL shape — sim server runs on 8787.
  const url = new URL(
    `${HTML_FILE}?simServer=http://127.0.0.1:8787`,
    DEV_URL || 'http://127.0.0.1:8080/',
  ).toString();
  const electronBin = require('electron');
  const electronMain = path.join(__dirname, '..', 'desktop', 'electron-main.cjs');

  console.log(`\nLaunching Electron window → ${url}\n`);
  const child = spawn(electronBin, [electronMain], {
    stdio: 'inherit',
    env: { ...process.env, LBH_DEV_URL: url },
  });

  child.on('exit', (code) => {
    console.log(`\nElectron exited with code ${code ?? 0}. Dev stack still running; run 'npm run dev:stop' if you want to shut it down.`);
    process.exit(code ?? 0);
  });
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
