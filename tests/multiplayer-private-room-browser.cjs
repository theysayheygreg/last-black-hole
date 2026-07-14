#!/usr/bin/env node
"use strict";

/**
 * Human-surface private-room proof.
 *
 * Four isolated browsers create/join through the real menus, converge on the
 * same staged roster, ready, launch, and reconnect. A fifth isolated browser
 * follows the same join-code UI and receives the durable room-full state.
 * Test APIs observe authority state and induce one transport interruption;
 * they never create a room, join, ready, or launch.
 */

const fs = require("fs");
const path = require("path");
const {
  TestRunner,
  assert,
  dispatchKey,
  launchGame,
  startServer,
  startSimServer,
  stopServer,
  stopSimServer,
  waitFor,
  withQuery,
} = require("./helpers.cjs");

const HTML_FILE = process.argv[2] || "index-a.html";
const SIM_PORT = Number(process.env.LBH_PRIVATE_ROOM_BROWSER_SIM_PORT || (9300 + process.pid % 300));
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;
const VIEWPORT = Object.freeze({ width: 1280, height: 800, deviceScaleFactor: 1 });
const STAMP = new Date().toISOString().replace(/[:.]/g, "");
const OUTPUT_DIR = path.join(__dirname, "screenshots", `private-room-${STAMP}`);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tap(page, code, key = code, holdMs = 160) {
  await page.waitForFunction(() =>
    window.__TEST_API?.getUiMotionState?.()?.transition?.active !== true,
  { timeout: 5000, polling: 40 });
  await dispatchKey(page, code, key, holdMs);
  await sleep(220);
}

async function waitForPhase(page, phase, timeout = 15000) {
  try {
    await waitFor(page, (expected) => window.__TEST_API?.getGamePhase?.() === expected,
      { timeout }, phase);
  } catch (error) {
    const actual = await page.evaluate(() => window.__TEST_API?.getGamePhase?.() || null).catch(() => null);
    throw new Error(`Expected phase ${phase}, observed ${actual}`);
  }
}

async function journeyState(pilot) {
  return pilot.page.evaluate(() => window.__TEST_API?.getMultiplayerJourneyState?.() || null);
}

async function controlState(pilot) {
  return (await journeyState(pilot))?.control || null;
}

async function clearGeneratedName(page) {
  for (let index = 0; index < 16; index += 1) await page.keyboard.press("Backspace");
}

async function typePlainText(page, text) {
  for (const character of String(text).toUpperCase()) {
    const code = /[0-9]/.test(character) ? `Digit${character}` : `Key${character}`;
    await page.keyboard.press(code);
  }
}

async function bootPilot(name) {
  const target = withQuery(HTML_FILE, {
    renderer: "three",
    simServer: SIM_URL,
    simMaxPlayers: 4,
    capture: 1,
  });
  const pilot = await launchGame(target);
  await pilot.page.setViewport(VIEWPORT);
  await pilot.page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await pilot.page.reload({ waitUntil: "domcontentloaded" });
  await pilot.page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        async writeText(value) {
          window.__LBH_TEST_CLIPBOARD__ = String(value);
        },
      },
    });
  });
  await sleep(1300);

  await waitForPhase(pilot.page, "title");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await tap(pilot.page, "Space", " ");
    try {
      await waitForPhase(pilot.page, "profileSelect", 2500);
      break;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  await tap(pilot.page, "Enter", "Enter");
  await clearGeneratedName(pilot.page);
  await typePlainText(pilot.page, name);
  await tap(pilot.page, "Enter", "Enter");
  await waitForPhase(pilot.page, "home");

  for (let index = 0; index < 6; index += 1) {
    const home = await pilot.page.evaluate(() => window.__TEST_API?.getHomeState?.() || null);
    if (home?.tabName === "LAUNCH") break;
    await tap(pilot.page, "KeyE", "e");
  }
  assert((await pilot.page.evaluate(() => window.__TEST_API?.getHomeState?.()?.tabName)) === "LAUNCH",
    `${name} could not reach the LAUNCH tab through normal input`);
  await tap(pilot.page, "Enter", "Enter");
  await waitForPhase(pilot.page, "mapSelect");
  return { name, ...pilot };
}

async function hostRoom(pilot) {
  const before = await controlState(pilot);
  assert(before?.roomAction === "host", "Map select must default to Host Private Game");
  await tap(pilot.page, "Enter", "Enter");
  await waitForPhase(pilot.page, "crewMuster", 20000);
  await waitFor(pilot.page, () => {
    const state = window.__TEST_API?.getMultiplayerJourneyState?.();
    return state?.control?.isHost && /^[A-Z2-9]{6}$/.test(state.control.roomCode || "");
  }, { timeout: 10000 });
  return journeyState(pilot);
}

async function enterRoomCode(page, roomCode, { paste = false } = {}) {
  if (paste) {
    await page.evaluate((code) => {
      const data = new DataTransfer();
      data.setData("text/plain", `room code: ${code}`);
      window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
    }, roomCode);
    return;
  }
  for (const character of roomCode) {
    const code = /[0-9]/.test(character) ? `Digit${character}` : `Key${character}`;
    await page.keyboard.press(code);
  }
}

async function joinRoom(pilot, roomCode, { expectError = null, paste = false } = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if ((await controlState(pilot))?.roomAction === "join") break;
    await tap(pilot.page, "ArrowRight", "ArrowRight", 140);
  }
  assert((await controlState(pilot))?.roomAction === "join",
    `${pilot.name} could not select Join Private Game`);
  await tap(pilot.page, "Enter", "Enter");
  assert((await controlState(pilot))?.roomCodeInputActive === true,
    `${pilot.name} did not enter room-code input`);
  await enterRoomCode(pilot.page, roomCode, { paste });
  await tap(pilot.page, "Enter", "Enter");
  if (expectError) {
    try {
      await waitFor(pilot.page, (expected) => {
        const state = window.__TEST_API?.getMultiplayerJourneyState?.();
        return window.__TEST_API?.getGamePhase?.() === "mapSelect"
          && state?.control?.joinErrorCode === expected;
      }, { timeout: 20000 }, expectError);
    } catch (error) {
      const observed = await pilot.page.evaluate(() => ({
        phase: window.__TEST_API?.getGamePhase?.() || null,
        control: window.__TEST_API?.getMultiplayerJourneyState?.()?.control || null,
      })).catch(() => null);
      throw new Error(`${pilot.name} expected ${expectError}: ${JSON.stringify(observed)}`);
    }
    const observed = await controlState(pilot);
    assert(observed?.joinErrorCode === expectError,
      `${pilot.name} expected ${expectError}, observed ${observed?.joinErrorCode}`);
    return journeyState(pilot);
  }
  await waitForPhase(pilot.page, "crewMuster", 20000);
  return journeyState(pilot);
}

async function waitForRoster(pilot, count = 4) {
  try {
    await waitFor(pilot.page, (expected) => {
      const roster = window.__TEST_API?.getMultiplayerJourneyState?.()?.control?.roster || [];
      return roster.filter((seat) => seat.occupied).length === expected;
    }, { timeout: 15000 }, count);
  } catch (error) {
    throw new Error(`${pilot.name} roster did not reach ${count}: ${JSON.stringify(await controlState(pilot))}`);
  }
  return controlState(pilot);
}

function compactRoster(control) {
  return (control?.roster || []).slice(0, 4).map((seat) => ({
    seatNo: seat.seatNo,
    clientId: seat.player?.clientId || null,
    name: seat.player?.name || null,
    host: Boolean(seat.isHost),
    ready: Boolean(seat.ready),
    connected: Boolean(seat.connected),
  }));
}

async function setReady(pilot) {
  await tap(pilot.page, "Enter", "Enter");
  await waitFor(pilot.page, () =>
    window.__TEST_API?.getMultiplayerJourneyState?.()?.control?.localReady === true,
  { timeout: 10000 });
}

async function capture(pilot, label) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const file = path.join(OUTPUT_DIR, `${label}.png`);
  await pilot.page.screenshot({ path: file });
  const bytes = fs.readFileSync(file);
  assert(bytes.length > 1024, `Expected nonempty screenshot ${file}`);
  return file;
}

async function debugState(route, body) {
  const response = await fetch(`${SIM_URL}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  assert(response.ok, `${route} failed (${response.status}): ${payload.error || "unknown"}`);
  return payload;
}

async function closePilot(pilot) {
  if (!pilot?.browser) return;
  await pilot.browser.close().catch(() => null);
}

async function run() {
  const runner = new TestRunner("MultiplayerPrivateRoomBrowser");
  const pilots = [];
  let offlinePilot = null;
  let fifth = null;
  const report = {
    generatedAt: new Date().toISOString(),
    scope: "local five-browser human-surface proof; not WAN or Greg feel evidence",
    simUrl: SIM_URL,
    screenshots: {},
  };

  await startServer();
  await startSimServer(SIM_PORT, {
    keepAlive: true,
    env: {
      LBH_SIM_WS_ENABLED: "true",
      LBH_SIM_WS_JSON_V2: "true",
      LBH_SIM_WS_STATE_PAIR_V1: "true",
      LBH_SIM_WS_STATE_PAIR_MIXED_V1: "true",
      LBH_SIM_WS_RUNTIME_PUBLIC_COMPONENTS_V1: "true",
      LBH_DISCONNECTED_BODY_RESERVATION_SECONDS: "3",
    },
  });

  try {
    await runner.run("four humans host join ready launch reject fifth and reconnect", async () => {
      report.stage = "unavailable-offline-recovery";
      offlinePilot = await bootPilot("SCOUT");
      report.stage = "unavailable-join";
      const unavailable = await joinRoom(offlinePilot, "AAAAAA", { expectError: "room-unavailable" });
      assert(unavailable.control.joinError.includes("AUTHORITY UNAVAILABLE"),
        "Idle authority must offer a human-readable offline recovery path");
      report.stage = "unavailable-select-offline";
      await tap(offlinePilot.page, "ArrowRight", "ArrowRight", 140);
      assert((await controlState(offlinePilot))?.roomAction === "offline",
        "Unavailable authority must not obstruct explicit offline selection");
      report.stage = "unavailable-launch-offline";
      await tap(offlinePilot.page, "Enter", "Enter");
      await waitForPhase(offlinePilot.page, "playing", 15000);
      const unavailableOfflineNetwork = await offlinePilot.page.evaluate(() =>
        window.__TEST_API?.getNetworkState?.() || null);
      assert(unavailableOfflineNetwork?.remoteAuthorityActive === false,
        "Unavailable-authority recovery must launch the local simulation");
      await closePilot(offlinePilot);
      offlinePilot = null;

      report.stage = "boot-host";
      const names = ["ALPHA", "BRAVO", "COMET", "DELTA"];
      const host = await bootPilot(names[0]);
      pilots.push(host);
      assert((await host.page.evaluate(() => window.__TEST_API?.getMapSelectState?.()?.configuredTransport)) === "stream",
        "Configured multiplayer must default to the admitted stream transport");
      const hosted = await hostRoom(host);
      const roomCode = hosted.control.roomCode;
      assert(/^[A-Z2-9]{6}$/.test(roomCode), `Invalid private room code ${roomCode}`);
      assert(hosted.tick === 0 && hosted.simTime === 0, "Staged authority must begin frozen");
      assert(hosted.control.localSeat?.seatNo === 0 && hosted.control.localSeat?.isHost,
        "Host must own deterministic leader seat zero");
      await tap(host.page, "KeyC", "c");
      await waitFor(host.page, (expected) => {
        const state = window.__TEST_API?.getMultiplayerJourneyState?.();
        return state?.control?.inviteCopyState === "copied"
          && window.__LBH_TEST_CLIPBOARD__ === expected;
      }, { timeout: 5000 }, roomCode);
      report.invite = { copied: true, codeLength: roomCode.length };

      for (let index = 1; index < names.length; index += 1) {
        report.stage = `join-${names[index]}`;
        const pilot = await bootPilot(names[index]);
        pilots.push(pilot);
        const joined = await joinRoom(pilot, roomCode, { paste: index === 1 });
        assert(joined.runId === hosted.runId, `${names[index]} joined a different authority`);
      }

      report.stage = "converge-four-rosters";
      const rosters = [];
      for (const pilot of pilots) rosters.push(compactRoster(await waitForRoster(pilot, 4)));
      assert(rosters.every((roster) => JSON.stringify(roster) === JSON.stringify(rosters[0])),
        `Browsers disagree on staged roster: ${JSON.stringify(rosters)}`);
      assert(rosters[0].every((seat, index) => seat.seatNo === index && seat.connected && !seat.ready),
        `Expected ordered linked unready seats: ${JSON.stringify(rosters[0])}`);
      assert((await Promise.all(pilots.map(journeyState))).every((entry) => entry.tick === 0 && entry.simTime === 0),
        "World time advanced while humans staged");

      report.stage = "reject-fifth";
      fifth = await bootPilot("ECHO");
      const invalidCode = roomCode === "AAAAAA" ? "BBBBBB" : "AAAAAA";
      const invalid = await joinRoom(fifth, invalidCode, { expectError: "room-code-invalid" });
      assert(invalid.control.joinError.includes("NOT FOUND OR EXPIRED"),
        "Wrong-code recovery copy must be durable and human-readable");
      report.screenshots.invalidRoom = await capture(fifth, "room-invalid");
      await tap(fifth.page, "Enter", "Enter");
      assert((await controlState(fifth))?.roomCodeInputActive === true,
        "Confirm after a room error must reopen clean code entry");
      await enterRoomCode(fifth.page, roomCode);
      await tap(fifth.page, "Enter", "Enter");
      await waitFor(fifth.page, () =>
        window.__TEST_API?.getMultiplayerJourneyState?.()?.control?.joinErrorCode === "room-full",
      { timeout: 20000 });
      const rejected = await journeyState(fifth);
      assert(rejected.control.joinErrorCode === "room-full", "Fifth browser must see durable room-full state");
      report.screenshots.roomFull = await capture(fifth, "room-full");
      for (const pilot of pilots) {
        assert((await waitForRoster(pilot, 4)).sessionHumanPlayerCount === 4,
          "Fifth rejection mutated the admitted roster");
      }

      report.stage = "fifth-offline";
      await tap(fifth.page, "ArrowRight", "ArrowRight", 140);
      assert((await controlState(fifth))?.roomAction === "offline",
        "A rejected fifth pilot must be able to select explicit offline play");
      report.screenshots.offlineChoice = await capture(fifth, "offline-choice");
      await tap(fifth.page, "Enter", "Enter");
      await waitForPhase(fifth.page, "playing", 15000);
      const offlineNetwork = await fifth.page.evaluate(() => window.__TEST_API?.getNetworkState?.() || null);
      assert(offlineNetwork?.remoteAuthorityActive === false,
        "Explicit offline play must not attach to the configured authority");

      // Ready the leader first to prove that readiness alone cannot launch.
      report.stage = "ready-crew";
      await setReady(pilots[0]);
      assert((await controlState(pilots[0])).canLaunch === false,
        "Leader readiness must not launch before the crew is ready");
      for (let index = 1; index < pilots.length; index += 1) await setReady(pilots[index]);
      await Promise.all(pilots.map((pilot) => waitFor(pilot.page, () => {
        const control = window.__TEST_API?.getMultiplayerJourneyState?.()?.control;
        return control?.allReady === true;
      }, { timeout: 10000 })));
      assert((await controlState(pilots[0])).canLaunch === true, "Only the ready leader should receive launch authority");
      report.screenshots.readyCrew = await capture(pilots[0], "ready-crew");

      report.stage = "launch-shared-run";
      await tap(pilots[0].page, "Enter", "Enter");
      await Promise.all(pilots.map((pilot) => waitForPhase(pilot.page, "playing", 25000)));
      await Promise.all(pilots.map((pilot) => waitFor(pilot.page, () => {
        const state = window.__TEST_API?.getMultiplayerJourneyState?.();
        return state?.transport?.activeTransport === "stream"
          && state.transport.streamState === "open"
          && state.owner;
      }, { timeout: 20000 })));

      const running = await Promise.all(pilots.map(journeyState));
      assert(new Set(running.map((entry) => entry.runId)).size === 1, "Four browsers do not share one run lineage");
      assert(new Set(running.map((entry) => entry.clientId)).size === 4, "Client identities are not unique");
      assert(new Set(running.map((entry) => entry.membershipId)).size === 4, "Membership identities are not unique");
      assert(running.every((entry) => entry.session?.status === "running"), "Every browser must observe running status");
      assert(running.every((entry) => entry.players.filter((player) => !player.isAI).length === 4),
        "Every browser must observe four human players");
      assert(running.every((entry) => entry.transport.hotPathHttpOccurred === false),
        "Admitted S20 stream used a forbidden hot-path HTTP request");
      await Promise.all(pilots.map((pilot) => waitFor(pilot.page, () => {
        const rows = [...document.querySelectorAll('#hud-crew .hud-crew-row')];
        return rows.length === 4
          && rows.map((row) => row.textContent).join('|').includes('P1')
          && rows.map((row) => row.textContent).join('|').includes('P4')
          && rows.filter((row) => row.dataset.local === 'true').length === 1;
      }, { timeout: 10000 })));
      const crewRails = await Promise.all(pilots.map((pilot) => pilot.page.evaluate(() =>
        [...document.querySelectorAll('#hud-crew .hud-crew-row')].map((row) => ({
          text: row.textContent.trim(),
          local: row.dataset.local,
          state: row.dataset.state,
        }))
      )));
      assert(crewRails.every((rail) => rail.length === 4
        && rail.every((row, index) => row.text.startsWith(`P${index + 1}`))
        && rail.filter((row) => row.local === 'true').length === 1
        && rail.every((row) => row.state === 'alive')),
      `Shared-run crew rails disagree: ${JSON.stringify(crewRails)}`);
      report.crewRails = crewRails;
      report.screenshots.sharedRun = await capture(pilots[0], "shared-run");

      report.stage = "shared-consequences";
      await debugState("/debug/inhibitor-state", {
        form: 0,
        pressure: 0.6,
        intensity: 0,
        wx: 1.5,
        wy: 1.5,
      });
      await waitFor(pilots[0].page, () => {
        const panel = document.querySelector('#hud-inhibitor');
        const value = document.querySelector('#hud-inhibitor-form')?.textContent || '';
        return panel && getComputedStyle(panel).display !== 'none'
          && value.toLowerCase().includes('building')
          && value.includes('%');
      }, { timeout: 10000 });

      const deathPilot = pilots[2];
      const deathState = await journeyState(deathPilot);
      await debugState("/debug/player-state", {
        clientId: deathState.clientId,
        status: "dead",
        cause: "consequence-proof",
      });
      await waitFor(pilots[0].page, (name) => {
        const row = document.querySelector('#hud-crew .hud-crew-row:nth-child(4)');
        const warnings = [...document.querySelectorAll('#hud-warnings .hud-warning')]
          .map((entry) => entry.textContent.toLowerCase());
        return row?.dataset.state === 'dead'
          && warnings.some((entry) => entry.includes(name) && entry.includes('lost'));
      }, { timeout: 10000 }, deathPilot.name.toLowerCase());

      const extractPilot = pilots[3];
      const extractState = await journeyState(extractPilot);
      const extractPoint = { wx: 2.65, wy: 2.65 };
      await debugState("/debug/player-state", {
        clientId: extractState.clientId,
        ...extractPoint,
        vx: 0,
        vy: 0,
      });
      await debugState("/debug/portal-state", {
        id: "private-room-consequence-portal",
        ...extractPoint,
        type: "stable",
        alive: true,
        lifespan: 60,
      });
      await waitFor(extractPilot.page, () =>
        window.__TEST_API?.getMultiplayerJourneyState?.()?.owner?.portalInteraction?.ready === true,
      { timeout: 10000 });
      await tap(extractPilot.page, "Enter", "Enter", 250);
      await waitFor(extractPilot.page, () =>
        window.__TEST_API?.getMultiplayerJourneyState?.()?.owner?.status === 'escaped',
      { timeout: 10000 });
      await waitFor(pilots[0].page, (name) => {
        const row = document.querySelector('#hud-crew .hud-crew-row:nth-child(5)');
        const warnings = [...document.querySelectorAll('#hud-warnings .hud-warning')]
          .map((entry) => entry.textContent.toLowerCase());
        return row?.dataset.state === 'extracted'
          && warnings.some((entry) => entry.includes(name) && entry.includes('extracted'));
      }, { timeout: 10000 }, extractPilot.name.toLowerCase());
      report.screenshots.sharedConsequences = await capture(pilots[0], "shared-consequences");
      await debugState("/debug/inhibitor-state", {
        form: 0,
        pressure: 0,
        intensity: 0,
        wx: 1.5,
        wy: 1.5,
      });

      report.stage = "reconnect-guest";
      const reconnectPilot = pilots[1];
      const beforeReconnect = await journeyState(reconnectPilot);
      const interrupted = await reconnectPilot.page.evaluate(() =>
        window.__TEST_API?.interruptMultiplayerStreamForTest?.(null, { holdReconnectMs: 900 }));
      assert(interrupted?.connectionEpoch === beforeReconnect.connectionEpoch,
        "Reconnect hook did not close the current connection epoch");
      await waitFor(reconnectPilot.page, () => {
        const local = document.querySelector('#hud-crew .hud-crew-row[data-local="true"]');
        const warnings = [...document.querySelectorAll('#hud-warnings .hud-warning')]
          .map((entry) => entry.textContent.toLowerCase());
        return local?.dataset.state === 'link-lost'
          && warnings.some((entry) => entry.includes('reconnecting'));
      }, { timeout: 5000 });
      await waitFor(pilots[0].page, (name) => {
        const rows = [...document.querySelectorAll('#hud-crew .hud-crew-row')];
        const row = rows.find((entry) => entry.textContent.toLowerCase().includes(name));
        const warnings = [...document.querySelectorAll('#hud-warnings .hud-warning')]
          .map((entry) => entry.textContent.toLowerCase());
        return row?.dataset.state === 'link-lost'
          && warnings.some((entry) => entry.includes(name) && entry.includes('link lost'));
      }, { timeout: 5000 }, reconnectPilot.name.toLowerCase());
      report.screenshots.linkLost = await capture(pilots[0], "link-lost");
      await waitFor(reconnectPilot.page, (before) => {
        const state = window.__TEST_API?.getMultiplayerJourneyState?.();
        return state?.clientId === before.clientId
          && state?.membershipId === before.membershipId
          && state?.runId === before.runId
          && state?.connectionEpoch > before.connectionEpoch
          && state?.transport?.reconnectCount > before.reconnectCount
          && state?.transport?.streamState === "open"
          && state?.owner?.clientId === before.clientId;
      }, { timeout: 20000 }, {
        clientId: beforeReconnect.clientId,
        membershipId: beforeReconnect.membershipId,
        runId: beforeReconnect.runId,
        connectionEpoch: beforeReconnect.connectionEpoch,
        reconnectCount: beforeReconnect.transport.reconnectCount,
      });
      const afterReconnect = await journeyState(reconnectPilot);
      await waitFor(pilots[0].page, (name) => {
        const rows = [...document.querySelectorAll('#hud-crew .hud-crew-row')];
        const row = rows.find((entry) => entry.textContent.toLowerCase().includes(name));
        const warnings = [...document.querySelectorAll('#hud-warnings .hud-warning')]
          .map((entry) => entry.textContent.toLowerCase());
        return row?.dataset.state === 'alive'
          && warnings.some((entry) => entry.includes(name) && entry.includes('recovered'));
      }, { timeout: 10000 }, reconnectPilot.name.toLowerCase());
      report.reconnect = {
        clientId: afterReconnect.clientId,
        membershipId: afterReconnect.membershipId,
        beforeEpoch: beforeReconnect.connectionEpoch,
        afterEpoch: afterReconnect.connectionEpoch,
        reconnectCount: afterReconnect.transport.reconnectCount,
      };
      report.room = { roomCodeLength: roomCode.length, roster: rosters[0], runId: afterReconnect.runId };
      report.screenshots.reconnected = await capture(reconnectPilot, "reconnected");

      report.stage = "leave-crew";
      await sleep(2500);
      await tap(extractPilot.page, "Enter", "Enter", 250);
      await waitForPhase(extractPilot.page, "meta", 15000);
      await waitFor(pilots[0].page, (name) => {
        const rows = [...document.querySelectorAll('#hud-crew .hud-crew-row')];
        const warnings = [...document.querySelectorAll('#hud-warnings .hud-warning')]
          .map((entry) => entry.textContent.toLowerCase());
        return rows.length === 3
          && warnings.some((entry) => entry.includes(name) && entry.includes('left the crew'));
      }, { timeout: 10000 }, extractPilot.name.toLowerCase());
      report.screenshots.crewLeft = await capture(pilots[0], "crew-left");

      report.stage = "host-reservation-expiry";
      const hostBeforeLoss = await journeyState(pilots[0]);
      const hostInterrupted = await pilots[0].page.evaluate(() =>
        window.__TEST_API?.interruptMultiplayerStreamForTest?.(null, { reconnectable: false }));
      assert(hostInterrupted?.connectionEpoch === hostBeforeLoss.connectionEpoch,
        "Host reservation proof did not close the current connection epoch");
      await waitFor(reconnectPilot.page, (hostName) => {
        const rows = [...document.querySelectorAll('#hud-crew .hud-crew-row')];
        const row = rows.find((entry) => entry.textContent.toLowerCase().includes(hostName));
        return row?.dataset.state === 'link-lost' && /\d+s/i.test(row.textContent);
      }, { timeout: 5000 }, pilots[0].name.toLowerCase());
      report.screenshots.hostReserved = await capture(reconnectPilot, "host-reserved");
      await waitFor(reconnectPilot.page, (state) => {
        const journey = window.__TEST_API?.getMultiplayerJourneyState?.();
        const rows = [...document.querySelectorAll('#hud-crew .hud-crew-row')];
        const warnings = [...document.querySelectorAll('#hud-warnings .hud-warning')]
          .map((entry) => entry.textContent.toLowerCase());
        return rows.length === 2
          && journey?.session?.hostClientId === state.clientId
          && warnings.some((entry) => entry.includes('you are crew leader'));
      }, { timeout: 10000 }, { clientId: beforeReconnect.clientId });
      report.screenshots.hostPromoted = await capture(reconnectPilot, "host-promoted");

      const health = await fetch(`${SIM_URL}/health`).then((response) => response.json());
      assert(health.session?.status === "running" && health.session?.maxPlayers === 4,
        "Authority health must remain a four-seat running match");
      assert(health.session?.overloadState === "NORMAL", `Authority left NORMAL: ${health.session?.overloadState}`);
      assert([...pilots, fifth].every((pilot) => pilot.errors.length === 0),
        `Browser errors occurred: ${JSON.stringify([...pilots, fifth].map((pilot) => pilot.errors))}`);
      report.stage = "complete";
    });
    if (runner.results.some((result) => !result.passed)) {
      report.diagnostics = await Promise.all(pilots.map(async (pilot) => ({
        name: pilot.name,
        phase: await pilot.page.evaluate(() => window.__TEST_API?.getGamePhase?.() || null).catch(() => null),
        uiMotion: await pilot.page.evaluate(() => window.__TEST_API?.getUiMotionState?.() || null).catch(() => null),
        journey: await journeyState(pilot).catch(() => null),
        errors: pilot.errors,
      })));
      if (fifth) report.fifthDiagnostic = {
        phase: await fifth.page.evaluate(() => window.__TEST_API?.getGamePhase?.() || null).catch(() => null),
        journey: await journeyState(fifth).catch(() => null),
        errors: fifth.errors,
      };
    }
  } finally {
    await closePilot(offlinePilot);
    await closePilot(fifth);
    await Promise.allSettled(pilots.map(closePilot));
    await stopSimServer(SIM_PORT).catch(() => null);
    stopServer();
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  report.results = runner.results;
  report.passed = runner.results.length > 0 && runner.results.every((result) => result.passed);
  fs.writeFileSync(path.join(OUTPUT_DIR, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Private-room browser evidence: ${path.join(OUTPUT_DIR, "report.json")}`);
  process.exit(runner.summary() ? 0 : 1);
}

run().catch(async (error) => {
  console.error(error.stack || error.message);
  await stopSimServer(SIM_PORT).catch(() => null);
  stopServer();
  process.exit(1);
});
