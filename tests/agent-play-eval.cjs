/**
 * Agent play eval.
 *
 * This lane proves an agent can enter and understand a real authoritative run.
 * It deliberately avoids sim debug mutation: every consequence below comes
 * from normal menu input, ship controls, world contact, or the public v2 input
 * protocol. Greg remains the final judge of feel and visual taste.
 */
const fs = require("fs");
const path = require("path");
const {
  startServer,
  stopServer,
  withFreshGame,
  withFreshSimServer,
  TestRunner,
  assert,
  waitFor,
  withQuery,
} = require("./helpers.cjs");

const htmlFile = process.argv[2] || "index-a.html?renderer=three";
// Agent evals are commonly run beside other authority lanes. A process-local
// default prevents one fresh-stack test from resetting another test's session.
const SIM_PORT = Number(process.env.LBH_AGENT_EVAL_SIM_PORT || (9200 + process.pid % 500));
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;
const VIEWPORT = Object.freeze({ width: 1280, height: 800, deviceScaleFactor: 1 });
const SHALLOWS_ROUTE = Object.freeze({
  id: "first-current",
  slingshotWellIndex: 1,
});

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function safeName(value) {
  return String(value || "capture")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function wrappedDelta(from, to, worldScale) {
  const scale = Number(worldScale) || 1;
  let delta = (Number(to) || 0) - (Number(from) || 0);
  if (delta > scale / 2) delta -= scale;
  if (delta < -scale / 2) delta += scale;
  return delta;
}

function wrap(value, worldScale) {
  const scale = Number(worldScale) || 1;
  return ((value % scale) + scale) % scale;
}

function wrappedDistance(left, right, worldScale) {
  return Math.hypot(
    wrappedDelta(left.wx, right.wx, worldScale),
    wrappedDelta(left.wy, right.wy, worldScale),
  );
}

async function requestJson(route) {
  const response = await fetch(`${SIM_URL}${route}`);
  const body = await response.json();
  if (!response.ok) throw new Error(`${route} failed (${response.status}): ${body.error || "unknown error"}`);
  return body;
}

async function getSnapshot() {
  return requestJson("/snapshot");
}

async function getEvents(since = 0) {
  const body = await requestJson(`/events?since=${since}`);
  return body.events || [];
}

function localPlayer(snapshot, clientId) {
  return snapshot.players?.find((player) => player.clientId === clientId) || null;
}

async function waitForPlayer(clientId, predicate, { timeout = 12000, interval = 100, label = "player state" } = {}) {
  const deadline = Date.now() + timeout;
  let lastPlayer = null;
  let lastSnapshot = null;
  while (Date.now() < deadline) {
    lastSnapshot = await getSnapshot();
    lastPlayer = localPlayer(lastSnapshot, clientId);
    if (lastPlayer && predicate(lastPlayer, lastSnapshot)) {
      return { player: lastPlayer, snapshot: lastSnapshot };
    }
    await sleep(interval);
  }
  throw new Error(`Timed out waiting for ${label}; last=${JSON.stringify(lastPlayer)}`);
}

async function waitForWorld(predicate, { timeout = 60000, interval = 200 } = {}) {
  const deadline = Date.now() + timeout;
  let lastSnapshot = null;
  while (Date.now() < deadline) {
    lastSnapshot = await getSnapshot();
    const match = predicate(lastSnapshot);
    if (match) return { match, snapshot: lastSnapshot };
    await sleep(interval);
  }
  throw new Error(`Timed out waiting for authoritative world state at tick ${lastSnapshot?.tick ?? "unknown"}`);
}

async function capturePage(page, outputDir, label) {
  const filepath = path.join(outputDir, `${safeName(label)}.png`);
  const result = await page.session.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  fs.writeFileSync(filepath, Buffer.from(result.data, "base64"));
  return path.basename(filepath);
}

async function waitForPhase(page, phase, timeout = 12000) {
  await waitFor(page, (expected) => window.__TEST_API?.getGamePhase?.() === expected, { timeout }, phase);
}

async function waitForSettledResult(page, outcome, timeout = 12000) {
  await waitFor(page, (expected) => {
    const phase = window.__TEST_API?.getGamePhase?.();
    const view = window.__TEST_API?.getRunResultsView?.();
    const motion = window.__TEST_API?.getUiMotionState?.();
    const expectedPhase = expected === "extracted" ? "escaped" : "dead";
    const settledAfter = Math.max(0.8, Number(motion?.settings?.panelDuration || 0) + 0.35);
    return phase === expectedPhase
      && view?.outcome === expected
      && Boolean(view?.status)
      && Boolean(view?.cargoTitle)
      && motion?.phase === expectedPhase
      && Number(motion?.timer || 0) >= settledAfter;
  }, { timeout }, outcome);
}

async function waitForSettledMetaReport(page, timeout = 12000) {
  await waitFor(page, () => {
    const motion = window.__TEST_API?.getUiMotionState?.();
    return window.__TEST_API?.getGamePhase?.() === "meta"
      && motion?.phase === "meta"
      && Number(motion?.timer || 0) >= 0.9;
  }, { timeout });
}

function assertNoBrowserErrors(errors, checkpoint) {
  if (!errors?.length) return;
  throw new Error(`${checkpoint}: browser runtime error: ${errors.join("; ")}`);
}

async function installVirtualGamepad(page) {
  await page.evaluate(() => {
    const button = () => ({ pressed: false, touched: false, value: 0 });
    window.__TEST_GAMEPAD = {
      id: "LBH Agent Eval Pad",
      index: 0,
      connected: true,
      mapping: "standard",
      axes: [0, 0, 0, 0, -1, -1],
      buttons: Array.from({ length: 18 }, button),
      timestamp: Date.now(),
    };
    Object.defineProperty(Navigator.prototype, "getGamepads", {
      configurable: true,
      value: () => [window.__TEST_GAMEPAD],
    });
  });
}

async function setGamepadButton(page, buttonIndex, pressed) {
  await page.evaluate(({ buttonIndex, pressed }) => {
    const value = pressed ? 1 : 0;
    window.__TEST_GAMEPAD.buttons[buttonIndex] = {
      pressed,
      touched: pressed,
      value,
    };
    window.__TEST_GAMEPAD.timestamp = Date.now();
  }, { buttonIndex, pressed: Boolean(pressed) });
}

async function tapGamepadButton(page, buttonIndex, settleMs = 160) {
  await setGamepadButton(page, buttonIndex, true);
  await sleep(90);
  await setGamepadButton(page, buttonIndex, false);
  await sleep(settleMs);
}

async function setGamepadDrive(page, nx = 0, ny = 0, { thrust = 0, brake = 0 } = {}) {
  await page.evaluate(({ nx, ny, thrust, brake }) => {
    const pad = window.__TEST_GAMEPAD;
    pad.axes[0] = Math.max(-1, Math.min(1, nx));
    pad.axes[1] = Math.max(-1, Math.min(1, ny));
    for (const [index, value] of [[7, thrust], [6, brake]]) {
      const amount = Math.max(0, Math.min(1, value));
      pad.buttons[index] = { pressed: amount > 0.05, touched: amount > 0, value: amount };
    }
    pad.timestamp = Date.now();
  }, { nx, ny, thrust, brake });
}

async function moveHomeTab(page, tabName) {
  const tabs = ["SHIP", "VAULT", "RIG", "CHRONICLE", "LAUNCH"];
  const targetIndex = tabs.indexOf(tabName);
  assert(targetIndex >= 0, `Unknown Home tab ${tabName}`);
  for (let i = 0; i < tabs.length + 2; i++) {
    const state = await page.evaluate(() => window.__TEST_API?.getHomeState?.() || null);
    const current = state?.tabName || null;
    if (current === tabName) return;
    const currentIndex = Number.isInteger(state?.tabIndex) ? state.tabIndex : tabs.indexOf(current);
    const forward = (targetIndex - currentIndex + tabs.length) % tabs.length;
    const backward = (currentIndex - targetIndex + tabs.length) % tabs.length;
    await tapGamepadButton(page, forward <= backward ? 5 : 4);
  }
  const current = await page.evaluate(() => window.__TEST_API?.getHomeState?.()?.tabName || null);
  throw new Error(`Expected Home tab ${tabName}, got ${current}`);
}

async function configureEvidenceView(page) {
  await page.setViewport(VIEWPORT);
  await installVirtualGamepad(page);
  await page.evaluate(() => {
    window.__TEST_API?.setOverlayVisible?.(true);
    window.__TEST_API?.setConfig?.("debug.showFPS", false);
    window.__TEST_API?.setConfig?.("debug.showWellRadii", false);
    window.__TEST_API?.setConfig?.("debug.showFluidDiagnostic", false);
    window.__TEST_API?.setConfig?.("debug.showVelocityField", false);
    window.__TEST_API?.setConfig?.("debug.showCoordDiagnostic", false);
  });
  await sleep(250);
}

async function enterFirstRunThroughMenus(page, outputDir, screenshots, browserErrors) {
  await waitForPhase(page, "title");
  await sleep(650);
  screenshots.push(await capturePage(page, outputDir, "01-title-fresh"));

  await tapGamepadButton(page, 0);
  await waitForPhase(page, "profileSelect");
  await tapGamepadButton(page, 0);
  await tapGamepadButton(page, 0);
  await waitForPhase(page, "home");
  screenshots.push(await capturePage(page, outputDir, "02-home-profile"));
  assertNoBrowserErrors(browserErrors, "Home entry");

  const profile = await page.evaluate(() => window.__TEST_API?.getProfile?.() || null);
  assert(profile?.id, "Expected a real profile after the profile-select flow");

  await moveHomeTab(page, "LAUNCH");
  await tapGamepadButton(page, 0);
  await waitForPhase(page, "mapSelect");
  const briefing = await page.evaluate(() => window.__TEST_API?.getMapSelectState?.() || null);
  assert(briefing?.mapName === "The Shallows", `Expected The Shallows briefing, got ${briefing?.mapName}`);
  screenshots.push(await capturePage(page, outputDir, "03-shallows-route-briefing"));

  await tapGamepadButton(page, 0);
  await waitForPhase(page, "playing", 15000);
  await waitFor(page, () => {
    const net = window.__TEST_API?.getNetworkState?.();
    return net?.remoteAuthorityActive && net.sessionMapId === "shallows" && Number.isFinite(net.remoteTick);
  }, { timeout: 15000 });
  return { profile, briefing };
}

async function steerTo(page, clientId, target, options = {}) {
  const timeout = options.timeout ?? 40000;
  const radius = options.radius ?? 0.065;
  const maxCruiseSpeed = options.maxCruiseSpeed ?? 0.38;
  const deadline = Date.now() + timeout;
  let start = null;
  let closest = Infinity;
  let last = null;
  let recharging = false;

  try {
    while (Date.now() < deadline) {
      const snapshot = await getSnapshot();
      const player = localPlayer(snapshot, clientId);
      assert(player, "Authoritative player disappeared while steering");
      if (options.acceptDeath && player.status === "dead") {
        return { start, end: last, closest, target: { ...target }, died: true, snapshot, player };
      }
      assert(player.status === "alive", `Player became ${player.status} while steering toward ${target.id || "target"}`);
      if (!start) start = { wx: player.wx, wy: player.wy };
      const ws = snapshot.session?.worldScale || 3;
      const dx = wrappedDelta(player.wx, target.wx, ws);
      const dy = wrappedDelta(player.wy, target.wy, ws);
      const dist = Math.hypot(dx, dy);
      const speed = Math.hypot(player.vx || 0, player.vy || 0);
      const fuelRatio = player.deltaVRatio || 0;
      closest = Math.min(closest, dist);
      const commitDistance = Math.max(radius * 4, 0.16);
      if (recharging) {
        if (fuelRatio > 0.42) recharging = false;
      } else if (fuelRatio < 0.015 || (fuelRatio < 0.08 && dist >= commitDistance)) {
        recharging = true;
      }
      last = { wx: player.wx, wy: player.wy, vx: player.vx, vy: player.vy, dist, speed, fuelRatio, recharging };

      if (dist <= radius && (options.allowFlyby || speed <= (options.arrivalSpeed ?? 0.32))) {
        return { start, end: last, closest, target: { ...target } };
      }

      const nx = dist > 1e-6 ? dx / dist : 1;
      const ny = dist > 1e-6 ? dy / dist : 0;
      const desiredSpeed = options.allowFlyby
        ? maxCruiseSpeed
        : Math.max(0.06, Math.min(maxCruiseSpeed, dist * 1.35));
      const correctionX = nx * desiredSpeed - (player.vx || 0);
      const correctionY = ny * desiredSpeed - (player.vy || 0);
      const correctionMagnitude = Math.hypot(correctionX, correctionY);
      const emergencyBrake = speed > Math.max(0.52, maxCruiseSpeed * 1.6);
      if (recharging) {
        await setGamepadDrive(page);
        await sleep(150);
        continue;
      }
      await setGamepadDrive(page,
        emergencyBrake && speed > 0.01 ? (player.vx || 0) / speed : correctionX / (correctionMagnitude || 1),
        emergencyBrake && speed > 0.01 ? (player.vy || 0) / speed : correctionY / (correctionMagnitude || 1),
        {
          thrust: !emergencyBrake && fuelRatio > 0.01 && correctionMagnitude > 0.035 ? 1 : 0,
          brake: emergencyBrake && fuelRatio > 0.01 ? 1 : 0,
        },
      );
      await sleep(110);
    }
  } finally {
    await setGamepadDrive(page).catch(() => null);
  }

  throw new Error(
    `Could not reach ${target.id || "target"}; closest=${closest.toFixed(4)} last=${JSON.stringify(last)}`,
  );
}

async function brakeToLowSpeed(page, clientId, timeout = 5000) {
  const deadline = Date.now() + timeout;
  try {
    while (Date.now() < deadline) {
      const snapshot = await getSnapshot();
      const player = localPlayer(snapshot, clientId);
      if (!player || player.status !== "alive") return player;
      const speed = Math.hypot(player.vx || 0, player.vy || 0);
      if (speed < 0.12) return player;
      await setGamepadDrive(page, (player.vx || 0) / speed, (player.vy || 0) / speed, { brake: 1 });
      await sleep(100);
    }
  } finally {
    await setGamepadDrive(page).catch(() => null);
  }
  return localPlayer(await getSnapshot(), clientId);
}

async function rechargeForManeuver(page, clientId, minimumRatio = 0.42, timeout = 10000) {
  await setGamepadDrive(page);
  return waitForPlayer(
    clientId,
    (player) => player.status === "alive" && player.deltaVRatio >= minimumRatio,
    { timeout, interval: 120 },
  );
}

async function performRouteSlingshot(page, clientId, outputDir, screenshots) {
  let snapshot = await getSnapshot();
  const player = localPlayer(snapshot, clientId);
  const anchor = snapshot.world?.wells?.[SHALLOWS_ROUTE.slingshotWellIndex];
  assert(player && anchor, "Expected the authored Shallows slingshot anchor");
  const ws = snapshot.session.worldScale;
  let awayX = wrappedDelta(anchor.wx, player.wx, ws);
  let awayY = wrappedDelta(anchor.wy, player.wy, ws);
  let awayMag = Math.hypot(awayX, awayY);
  if (awayMag < 1e-4) { awayX = 1; awayY = 0; awayMag = 1; }
  const ringPoint = {
    id: `${anchor.id || "well-1"}-inner-current`,
    wx: wrap(anchor.wx + awayX / awayMag * 0.22, ws),
    wy: wrap(anchor.wy + awayY / awayMag * 0.22, ws),
  };
  const approach = await steerTo(page, clientId, ringPoint, {
    radius: 0.09,
    maxCruiseSpeed: 0.31,
    arrivalSpeed: 0.30,
    // A slingshot approach should preserve orbital momentum; stopping at the
    // outer-current waypoint would test docking, not route execution.
    allowFlyby: true,
  });

  const baselineSeq = (await getEvents(0)).reduce((max, event) => Math.max(max, event.seq || 0), 0);
  let engaged = null;
  let engageError = null;
  for (let attempt = 0; attempt < 3 && !engaged; attempt++) {
    snapshot = await getSnapshot();
    let atRing = localPlayer(snapshot, clientId);
    if ((atRing.deltaVRatio || 0) < 0.20) {
      await rechargeForManeuver(page, clientId);
      await steerTo(page, clientId, ringPoint, {
        radius: 0.09,
        maxCruiseSpeed: 0.31,
        allowFlyby: true,
        timeout: 40000,
      });
      snapshot = await getSnapshot();
      atRing = localPlayer(snapshot, clientId);
    }
    const radialX = wrappedDelta(anchor.wx, atRing.wx, ws);
    const radialY = wrappedDelta(anchor.wy, atRing.wy, ws);
    const radialMag = Math.hypot(radialX, radialY) || 1;
    const tangent = { x: -radialY / radialMag, y: radialX / radialMag };
    await setGamepadDrive(page, tangent.x, tangent.y, { thrust: 1 });
    await sleep(140);
    await tapGamepadButton(page, 3, 80);
    try {
      engaged = await waitForPlayer(
        clientId,
        (entry) => entry.slingshot?.engaged === true,
        { timeout: 3000, label: "slingshot engagement" },
      );
    } catch (error) {
      engageError = error;
      await setGamepadDrive(page);
      await steerTo(page, clientId, ringPoint, {
        radius: 0.09,
        maxCruiseSpeed: 0.31,
        allowFlyby: true,
        timeout: 40000,
      });
    }
  }
  assert(engaged, `Could not engage authored slingshot after reacquiring the current; ${engageError?.message || "unknown"}`);
  await setGamepadDrive(page);
  screenshots.push(await capturePage(page, outputDir, "05-route-slingshot-engaged"));
  await sleep(650);
  await tapGamepadButton(page, 3, 80);
  const released = await waitForPlayer(
    clientId,
    (entry) => entry.slingshot?.engaged === false,
    { timeout: 6000, label: "slingshot release" },
  );
  const routeEvents = (await getEvents(baselineSeq)).filter((event) =>
    event.payload?.clientId === clientId && event.type.startsWith("player.slingshot")
  );
  assert(routeEvents.some((event) => event.type === "player.slingshotEngaged"), "Expected a public slingshot-engaged event");
  assert(routeEvents.some((event) => event.type === "player.slingshotReleased"), "Expected a public slingshot-released event");
  await brakeToLowSpeed(page, clientId);
  return {
    routeId: SHALLOWS_ROUTE.id,
    anchorId: engaged.player.slingshot.anchorId,
    anchorType: engaged.player.slingshot.anchorType,
    approach,
    releaseSpeed: Math.hypot(released.player.vx || 0, released.player.vy || 0),
    events: routeEvents.map((event) => event.type),
  };
}

async function collectRouteLootAndRaiseSignal(page, clientId, outputDir, screenshots) {
  let snapshot = await getSnapshot();
  const before = localPlayer(snapshot, clientId);
  assert(before, "Expected the authoritative player before salvage routing");
  const worldScale = snapshot.session.worldScale;
  const candidates = (snapshot.world?.wrecks || [])
    .filter((entry) => entry.alive !== false && !entry.looted && entry.loot?.length)
    .sort((left, right) =>
      wrappedDistance(before, left, worldScale) - wrappedDistance(before, right, worldScale)
    );
  let movement = null;
  let wreck = (before.cargoCount || 0) > 0 ? { id: "natural-route-contact" } : null;
  let looted = { player: before, snapshot };
  if ((before.cargoCount || 0) === 0) {
    for (const candidate of candidates.slice(0, 3)) {
      try {
        movement = await steerTo(page, clientId, candidate, {
          radius: 0.075,
          maxCruiseSpeed: 0.24,
          arrivalSpeed: 0.22,
          timeout: 45000,
        });
        looted = await waitForPlayer(clientId, (player) => player.cargoCount > 0, { timeout: 5000 });
        wreck = candidate;
        break;
      } catch {
        // Scavengers may claim a target while the agent is in transit. Retry
        // the next nearest live wreck instead of mutating world state.
      }
    }
  }
  assert(looted.player.cargoCount > 0, "Expected a natural wreck contact to add cargo");
  wreck ||= { id: "natural-route-contact" };
  screenshots.push(await capturePage(page, outputDir, "06-route-wreck-looted"));

  const pulse = await page.evaluate(() => window.__TEST_API?.sendRemoteInput?.({ pulse: true }));
  assert(pulse?.ok === true, "Expected the public protocol-v2 pulse command to be accepted");
  const escalated = await waitForPlayer(
    clientId,
    (player) => player.signal?.zone !== "ghost" || player.signal?.level > 0.04,
    { timeout: 6000 },
  );
  await waitForWorld((world) => world.inhibitor?.pressureFrac > 0 ? world.inhibitor : null, { timeout: 6000 });
  screenshots.push(await capturePage(page, outputDir, "07-signal-escalated"));
  return {
    wreckId: wreck.id,
    movement,
    cargoBefore: before.cargoCount || 0,
    cargoAfter: looted.player.cargoCount,
    signalLevel: escalated.player.signal.level,
    signalZone: escalated.player.signal.zone,
  };
}

async function enterAndConfirmPortal(page, clientId, outputDir, screenshots) {
  const protocol = await requestJson("/protocol");
  assert(
    JSON.stringify(protocol).includes("extractConfirm"),
    "Protocol v2 dependency missing: input.extractConfirm must be public before the natural eval can prove extraction",
  );

  const { match: initialPortal } = await waitForWorld((snapshot) =>
    snapshot.world?.portals?.find((portal) => portal.alive !== false && !portal.blockedByInhibitor)
  );
  const travel = await steerTo(page, clientId, initialPortal, {
    radius: Math.max(0.045, (Number(initialPortal.radius) || 0.06) * 0.6),
    maxCruiseSpeed: 0.27,
    arrivalSpeed: 0.19,
    timeout: 70000,
  });
  const ready = await waitForPlayer(
    clientId,
    (player) => player.portalInteraction?.portalId === initialPortal.id && player.portalInteraction?.ready === true,
    { timeout: 7000 },
  );
  assert(ready.player.status === "alive", "Entering an aperture must not auto-extract before confirmation");
  screenshots.push(await capturePage(page, outputDir, "08-portal-zone-awaiting-confirm"));

  // Deck A reaches the sim through InputManager -> SimClient -> protocol v2.
  await tapGamepadButton(page, 0, 100);
  const escaped = await waitForPlayer(clientId, (player) => player.status === "escaped", { timeout: 8000 });
  await waitForPhase(page, "escaped", 8000);
  await waitForSettledResult(page, "extracted", 12000);
  screenshots.push(await capturePage(page, outputDir, "09-authoritative-extraction-result"));
  return {
    portalId: initialPortal.id,
    portalType: initialPortal.type,
    readyTick: ready.snapshot.tick,
    escapedTick: escaped.snapshot.tick,
    travel,
  };
}

async function proveNaturalWellDeath(page, clientId, outputDir, screenshots) {
  const initial = await getSnapshot();
  const player = localPlayer(initial, clientId);
  assert(player, "Expected a live player for natural death proof");
  const worldScale = initial.session?.worldScale || 3;
  const well = (initial.world?.wells || [])
    .filter((entry) => entry.alive !== false && !entry.consumedByInhibitor)
    .sort((left, right) =>
      (Number(right.killRadius) || 0) - (Number(left.killRadius) || 0)
      || wrappedDistance(player, left, worldScale) - wrappedDistance(player, right, worldScale)
    )[0];
  assert(well, "Expected a visible well for natural death proof");
  const initialDX = wrappedDelta(player.wx, well.wx, worldScale);
  const initialDY = wrappedDelta(player.wy, well.wy, worldScale);
  const initialDistance = Math.hypot(initialDX, initialDY) || 1;
  const approachDirection = {
    x: initialDX / initialDistance,
    y: initialDY / initialDistance,
  };
  const baselineSeq = (await getEvents(0)).reduce((max, event) => Math.max(max, event.seq || 0), 0);
  const nearOffset = Math.max(0.34, (Number(well.killRadius) || 0.04) * 6);
  const nearPoint = {
    id: `${well.id}-near-side`,
    wx: wrap(well.wx - approachDirection.x * nearOffset, worldScale),
    wy: wrap(well.wy - approachDirection.y * nearOffset, worldScale),
  };
  await steerTo(page, clientId, nearPoint, {
    radius: 0.08,
    maxCruiseSpeed: 0.38,
    allowFlyby: true,
    timeout: 60000,
  });
  screenshots.push(await capturePage(page, outputDir, "16-well-contact-approach"));
  await tapGamepadButton(page, 4, 80);
  await waitForPlayer(clientId, (entry) => entry.abilityState?.burnActive === true, { timeout: 5000 });

  let dead = null;
  let lastInterceptError = null;
  for (let attempt = 0; attempt < 3 && !dead?.died; attempt++) {
    try {
      dead = await steerTo(page, clientId, { ...well, id: `${well.id}-center` }, {
        acceptDeath: true,
        radius: 0.005,
        maxCruiseSpeed: 0.65,
        allowFlyby: true,
        timeout: 22000,
      });
    } catch (error) {
      lastInterceptError = error;
    }
  }
  assert(
    dead?.died && dead.player?.status === "dead",
    `Expected natural well death while crossing ${well.id}; ${lastInterceptError?.message || "no terminal contact"}`,
  );
  const deathEvent = (await getEvents(baselineSeq)).find((event) =>
    event.type === "player.died" && event.payload?.clientId === clientId
  );
  assert(deathEvent?.payload?.cause === "well", `Expected a public well death event, got ${deathEvent?.payload?.cause}`);
  assert(deathEvent.payload.wellId === well.id, `Expected death at ${well.id}, got ${deathEvent.payload.wellId}`);
  await waitForPhase(page, "dead", 8000);
  await waitForSettledResult(page, "dead", 12000);
  screenshots.push(await capturePage(page, outputDir, "17-natural-well-death"));

  // The result screen deliberately locks confirm for one beat. This proves the
  // same Deck A path a player uses, including authority leave and Home recovery.
  await sleep(1300);
  await tapGamepadButton(page, 0, 220);
  await waitForPhase(page, "home", 10000);
  screenshots.push(await capturePage(page, outputDir, "18-death-return-home"));
  return {
    cause: deathEvent.payload.cause,
    wellId: deathEvent.payload.wellId || well.id,
    wellName: deathEvent.payload.wellName || well.name || well.id,
    tick: dead.snapshot.tick,
  };
}

async function proveHomeAndSecondRun(page, firstRun, outputDir, screenshots) {
  await sleep(2400);
  await tapGamepadButton(page, 0, 220);
  await waitForPhase(page, "meta", 10000);
  await waitForSettledMetaReport(page, 10000);
  screenshots.push(await capturePage(page, outputDir, "10-salvage-report"));
  await sleep(1400);
  await tapGamepadButton(page, 0, 220);
  await waitForPhase(page, "home", 10000);

  const profile = await page.evaluate(() => window.__TEST_API?.getProfile?.() || null);
  assert(profile?.totalExtractions >= 1, `Expected profile extraction write-back, got ${profile?.totalExtractions}`);

  await moveHomeTab(page, "RIG");
  const rig = await page.evaluate(() => window.__TEST_API?.getHomeState?.() || null);
  assert(rig?.rig?.tracks?.length === 3, `Expected three public rig tracks, got ${rig?.rig?.tracks?.length}`);
  screenshots.push(await capturePage(page, outputDir, "11-home-rig-evidence"));

  await moveHomeTab(page, "CHRONICLE");
  const chronicle = await page.evaluate(() => window.__TEST_API?.getChronicleView?.() || null);
  assert(chronicle?.records?.some((record) => record.outcome === "extracted"), "Expected extraction in Chronicle after returning Home");
  screenshots.push(await capturePage(page, outputDir, "12-home-chronicle-evidence"));

  await moveHomeTab(page, "LAUNCH");
  await tapGamepadButton(page, 0);
  await waitForPhase(page, "mapSelect");
  const beforeReroll = await page.evaluate(() => window.__TEST_API?.getMapSelectState?.() || null);
  await tapGamepadButton(page, 2);
  const afterReroll = await page.evaluate(() => window.__TEST_API?.getMapSelectState?.() || null);
  assert(afterReroll.seed !== beforeReroll.seed, "Expected the second route preview to reroll its seed");
  screenshots.push(await capturePage(page, outputDir, "13-second-run-rerolled-briefing"));
  await tapGamepadButton(page, 0);
  await waitForPhase(page, "playing", 15000);

  const second = await waitForWorld((snapshot) => {
    const netRun = snapshot.session?.runId || snapshot.runId;
    return netRun && netRun !== firstRun.runId ? snapshot : null;
  }, { timeout: 15000 });
  const network = await page.evaluate(() => window.__TEST_API?.getNetworkState?.() || null);
  assert(network?.clientId, "Expected a protocol-v2 player identity in the second run");
  const movementStart = localPlayer(second.snapshot, network.clientId);
  const ws = second.snapshot.session.worldScale;
  const movementTarget = {
    id: "second-run-intent",
    wx: wrap(movementStart.wx + 0.28, ws),
    wy: movementStart.wy,
  };
  const movement = await steerTo(page, network.clientId, movementTarget, {
    radius: 0.09,
    maxCruiseSpeed: 0.30,
    arrivalSpeed: 0.30,
    timeout: 20000,
  });
  screenshots.push(await capturePage(page, outputDir, "14-second-run-changed-and-moving"));
  return {
    profile,
    rig: {
      hullType: rig.hullType,
      levels: rig.rig.levels,
      tracks: rig.rig.tracks.map((track) => track.key),
      exoticMatter: rig.exoticMatter,
    },
    chronicle: {
      recordCount: chronicle.records.length,
      latest: chronicle.records[0],
    },
    runId: second.snapshot.session.runId || second.snapshot.runId,
    seed: second.snapshot.session.seed,
    previewSeed: afterReroll.seed,
    movement,
  };
}

function writeReport(outputDir, report) {
  const jsonPath = path.join(outputDir, "report.json");
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

  const proof = report.journey || {};
  const lines = [
    "# Agent Play Eval",
    "",
    `Generated: ${report.generatedAt}`,
    `Verdict: ${report.verdict}`,
    `Viewport: ${VIEWPORT.width}x${VIEWPORT.height}`,
    "",
    "## Product Proof",
    "",
    `- Fresh authority: sim PID boundary plus a disposable browser profile; protocol ${proof.protocolVersion || "unavailable"}.`,
    `- Route: ${proof.slingshot?.routeId || "not reached"}; slingshot ${proof.slingshot?.anchorType || "n/a"}:${proof.slingshot?.anchorId || "n/a"}.`,
    `- Salvage: ${proof.loot?.wreckId || "not reached"}; cargo ${proof.loot?.cargoBefore ?? "?"} -> ${proof.loot?.cargoAfter ?? "?"}.`,
    `- Signal: ${proof.loot?.signalZone || "not reached"} at ${Number(proof.loot?.signalLevel || 0).toFixed(3)}.`,
    `- Extraction: ${proof.portal?.portalId || "not reached"}; ${proof.portal ? "entered ready zone before explicit confirmation" : "portal proof not reached"}.`,
    `- Profile: ${proof.home?.profile?.totalExtractions ?? "?"} extraction(s); ${proof.home?.chronicle?.recordCount ?? "?"} Chronicle record(s).`,
    `- Second run: ${proof.secondRun?.runId || "not reached"}; changed from ${proof.firstRun?.runId || "not reached"}.`,
    `- Death recovery: ${proof.death?.cause || "not reached"} at ${proof.death?.wellName || "n/a"}; returned Home through normal input.`,
    "",
    "## Evidence",
    "",
    ...(report.screenshots || []).map((shot) => `- ${shot}`),
    "",
    "## Human Review Still Required",
    "",
    "- Movement feel, route pleasure, visual rhythm, and final polish.",
    "- Physical Steam Deck readability and controller feel in Gaming Mode.",
    "- Whether any frame is strong enough for public promotion.",
    "",
  ];

  if (report.failure) {
    lines.push("## Failure / Dependency", "", `- ${report.failure}`, "");
  }

  const mdPath = path.join(outputDir, "summary.md");
  fs.writeFileSync(mdPath, `${lines.join("\n")}\n`);
  return { jsonPath, mdPath };
}

async function runJourney(page, outputDir, report, browserErrors) {
  await configureEvidenceView(page);
  const entry = await enterFirstRunThroughMenus(page, outputDir, report.screenshots, browserErrors);
  const network = await page.evaluate(() => window.__TEST_API?.getNetworkState?.() || null);
  assert(network?.clientId, "Expected a server-issued protocol-v2 player identity");
  const firstSnapshot = await getSnapshot();
  const firstPlayer = localPlayer(firstSnapshot, network.clientId);
  assert(firstPlayer?.status === "alive", "Expected a live authoritative player after launch");
  assert(firstSnapshot.protocolVersion === "lbh-local-v2", `Expected lbh-local-v2, got ${firstSnapshot.protocolVersion}`);
  report.screenshots.push(await capturePage(page, outputDir, "04-shallows-authoritative-start"));

  const slingshot = await performRouteSlingshot(page, network.clientId, outputDir, report.screenshots);
  const loot = await collectRouteLootAndRaiseSignal(page, network.clientId, outputDir, report.screenshots);
  const portal = await enterAndConfirmPortal(page, network.clientId, outputDir, report.screenshots);
  const firstRun = {
    runId: firstSnapshot.session.runId || firstSnapshot.runId,
    seed: firstSnapshot.session.seed,
    start: { wx: firstPlayer.wx, wy: firstPlayer.wy },
  };
  const homeAndSecond = await proveHomeAndSecondRun(page, firstRun, outputDir, report.screenshots);

  const errors = await page.evaluate(() => ({ phase: window.__TEST_API?.getGamePhase?.() || null }));
  report.journey = {
    protocolVersion: firstSnapshot.protocolVersion,
    profileAtEntry: entry.profile,
    briefing: entry.briefing,
    firstRun,
    slingshot,
    loot,
    portal,
    home: {
      profile: homeAndSecond.profile,
      rig: homeAndSecond.rig,
      chronicle: homeAndSecond.chronicle,
    },
    secondRun: {
      runId: homeAndSecond.runId,
      seed: homeAndSecond.seed,
      previewSeed: homeAndSecond.previewSeed,
      movement: homeAndSecond.movement,
      phase: errors.phase,
    },
  };
}

async function enterFreshDeathRun(page, browserErrors) {
  await configureEvidenceView(page);
  await waitForPhase(page, "title");
  await sleep(650);
  await tapGamepadButton(page, 0);
  await waitForPhase(page, "profileSelect");
  await tapGamepadButton(page, 0);
  await tapGamepadButton(page, 0);
  await waitForPhase(page, "home");
  const initialHome = await page.evaluate(() => window.__TEST_API?.getHomeState?.() || null);
  if (initialHome?.hullType !== "breacher") {
    await tapGamepadButton(page, 15);
  }
  await waitFor(
    page,
    () => window.__TEST_API?.getHomeState?.()?.hullType === "breacher",
    { timeout: 5000 },
  );
  await moveHomeTab(page, "LAUNCH");
  await tapGamepadButton(page, 0);
  await waitForPhase(page, "mapSelect");
  await tapGamepadButton(page, 0);
  await waitForPhase(page, "playing", 15000);
  await waitFor(page, () => {
    const net = window.__TEST_API?.getNetworkState?.();
    return net?.remoteAuthorityActive && net.sessionMapId === "shallows" && Number.isFinite(net.remoteTick);
  }, { timeout: 15000 });
  assertNoBrowserErrors(browserErrors, "Natural death launch");
  const network = await page.evaluate(() => window.__TEST_API?.getNetworkState?.() || null);
  assert(network?.clientId, "Expected a protocol-v2 identity for natural death proof");
  return network.clientId;
}

async function runDeathJourney(page, outputDir, report, browserErrors) {
  const clientId = await enterFreshDeathRun(page, browserErrors);
  report.screenshots.push(await capturePage(page, outputDir, "15-natural-death-run-start"));
  const death = await proveNaturalWellDeath(page, clientId, outputDir, report.screenshots);
  report.journey ||= {};
  report.journey.death = death;
  assertNoBrowserErrors(browserErrors, "Natural death recovery");
}

async function run() {
  console.log(`\n=== AGENT PLAY EVAL (${htmlFile}) ===\n`);
  const runner = new TestRunner("AgentPlayEval");
  const runStamp = new Date().toISOString().replace(/[:.]/g, "");
  const outputDir = path.join(__dirname, "screenshots", `agent-play-eval-${runStamp}`);
  fs.mkdirSync(outputDir, { recursive: true });

  const report = {
    generatedAt: new Date().toISOString(),
    htmlFile,
    simUrl: SIM_URL,
    outputDir,
    verdict: "pending",
    screenshots: [],
    journey: null,
    failure: null,
  };

  await startServer();
  try {
    if (process.env.LBH_AGENT_EVAL_DEATH_ONLY !== "1") {
      await runner.run("fresh protocol-v2 Shallows journey reaches a changed second run", async () => {
        await withFreshSimServer(SIM_PORT, async () => {
          await withFreshGame(
            withQuery(htmlFile, { simServer: SIM_URL, capture: 1, deck: 1 }),
            async ({ page, errors }) => {
              await runJourney(page, outputDir, report, errors);
              assertNoBrowserErrors(errors, "Journey complete");
            },
            { resetState: true },
          );
        }, { idleShutdownMs: 30000 });
      });
    }
    await runner.run("fresh controller journey dies to a visible well and returns Home", async () => {
      await withFreshSimServer(SIM_PORT, async () => {
        await withFreshGame(
          withQuery(htmlFile, { simServer: SIM_URL, capture: 1, deck: 1 }),
          async ({ page, errors }) => runDeathJourney(page, outputDir, report, errors),
          { resetState: true },
        );
      }, { idleShutdownMs: 30000 });
    });
  } catch (error) {
    report.failure = error.message;
  } finally {
    stopServer();
  }

  const passed = runner.summary();
  if (!passed && !report.failure) {
    report.failure = runner.results.find((result) => !result.passed)?.error || "Unknown eval failure";
  }
  report.verdict = passed ? "pass" : "fail";
  const paths = writeReport(outputDir, report);
  console.log(`\nAgent eval report: ${paths.mdPath}`);
  console.log(`Agent eval data:   ${paths.jsonPath}`);
  process.exit(passed ? 0 : 1);
}

run().catch((error) => {
  console.error(error);
  stopServer();
  process.exit(1);
});
