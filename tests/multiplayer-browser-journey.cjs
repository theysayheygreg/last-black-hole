/**
 * Real multi-browser stream journey. Local loopback evidence only.
 *
 * Four-client runs repeat twice; the eight-client run executes once. Every
 * participant enters through the product menus and the explicit stream mode.
 * Debug placement shortens travel, but browser input and the authority remain
 * the only writers of the asserted gameplay consequences.
 */
const fs = require('fs');
const path = require('path');
const {
  startServer,
  stopServer,
  startSimServer,
  stopSimServer,
  launchGame,
  dispatchKey,
  waitFor,
  withQuery,
  assert,
} = require('./helpers.cjs');

const htmlFile = process.argv[2] || 'index-a.html?renderer=three';
const SIM_PORT = Number(process.env.LBH_MULTIPLAYER_BROWSER_SIM_PORT || (9700 + process.pid % 200));
const SIM_URL = `http://127.0.0.1:${SIM_PORT}`;
const VIEWPORT = Object.freeze({ width: 1280, height: 800, deviceScaleFactor: 1 });
const runStamp = new Date().toISOString().replace(/[:.]/g, '');
const outputDir = path.join(__dirname, 'screenshots', `multiplayer-playable-${runStamp}`);

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function safeName(value) { return String(value).replace(/[^a-z0-9_-]+/gi, '-').toLowerCase(); }

function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function waitForPidExit(pid, timeoutMs = 2500) {
  const deadline = Date.now() + timeoutMs;
  while (pidAlive(pid) && Date.now() < deadline) await sleep(50);
  return !pidAlive(pid);
}

async function waitForSimStopped(timeoutMs = 2500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(`${SIM_URL}/health`, { signal: AbortSignal.timeout(250) });
    } catch {
      return true;
    }
    await sleep(50);
  }
  return false;
}

function summarizeNumbers(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return { count: 0, min: null, median: null, p95: null, max: null };
  const at = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
  return { count: sorted.length, min: at(0), median: at(0.5), p95: at(0.95), max: at(1) };
}

async function tap(page, code, key = code, holdMs = 70) {
  await dispatchKey(page, code, key, holdMs);
  await sleep(120);
}

async function waitForPhase(page, phase, timeout = 15000) {
  await waitFor(page, (expected) => window.__TEST_API?.getGamePhase?.() === expected, { timeout }, phase);
}

async function tapUntilPhase(page, code, key, phase, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.evaluate((expected) => window.__TEST_API?.getGamePhase?.() === expected, phase)) return;
    await tap(page, code, key);
    await sleep(120);
  }
  const current = await page.evaluate(() => window.__TEST_API?.getGamePhase?.() || null);
  throw new Error(`Timed out driving ${code} from ${current} to ${phase}`);
}

async function moveHomeToLaunch(page) {
  for (let i = 0; i < 7; i++) {
    const state = await page.evaluate(() => window.__TEST_API?.getHomeState?.() || null);
    if (state?.tabName === 'LAUNCH') return;
    await tap(page, 'KeyE', 'e');
  }
  throw new Error('Could not select the LAUNCH home tab');
}

async function launchPilot(index, count) {
  const target = withQuery(htmlFile, {
    simServer: SIM_URL,
    simTransport: 'stream',
    simMaxPlayers: count,
    capture: 1,
    deck: 1,
  });
  const launched = await launchGame(target);
  const { page, errors } = launched;
  await page.setViewport(VIEWPORT);
  const wire = {
    inboundBytes: 0, outboundBytes: 0, inboundFrames: 0, outboundFrames: 0,
    hotPathHttpRequests: [],
  };
  await page.session.send('Network.enable');
  page.session.on('Network.webSocketFrameReceived', ({ response }) => {
    wire.inboundFrames += 1;
    wire.inboundBytes += Buffer.byteLength(response?.payloadData || '');
  });
  page.session.on('Network.webSocketFrameSent', ({ response }) => {
    wire.outboundFrames += 1;
    wire.outboundBytes += Buffer.byteLength(response?.payloadData || '');
  });
  page.session.on('Network.requestWillBeSent', ({ request }) => {
    try {
      const url = new URL(request?.url || '');
      if (['/input', '/snapshot', '/events', '/inventory/action'].includes(url.pathname)) {
        wire.hotPathHttpRequests.push({ method: request.method, url: request.url });
      }
    } catch {}
  });

  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(1800);
  await waitForPhase(page, 'title');
  await tapUntilPhase(page, 'Space', ' ', 'profileSelect');
  await tapUntilPhase(page, 'Enter', 'Enter', 'home');
  await page.evaluate((pilotIndex) => window.__TEST_API.seedProfileConsumable(0, {
      id: `journey-fuel-cell-${pilotIndex}`, name: `Journey Fuel Cell ${pilotIndex}`, category: 'artifact',
      subcategory: 'consumable', tier: 'common', value: 35,
      useEffect: 'fuelRefill', useDesc: 'journey proof', amount: 35, charges: 1,
    }), index);
  await page.evaluate(() => window.__TEST_API.setHomeTabForTest(4));
  assert((await page.evaluate(() => window.__TEST_API.getHomeState().tabName)) === 'LAUNCH',
    'Expected assisted focus on the real LAUNCH tab');
  await tapUntilPhase(page, 'Enter', 'Enter', 'mapSelect');
  await tapUntilPhase(page, 'Enter', 'Enter', 'playing', 20000);
  try {
    await waitFor(page, () => {
      const state = window.__TEST_API?.getMultiplayerJourneyState?.();
      return state?.transport?.activeTransport === 'stream'
        && state.transport.streamState === 'open'
        && Number.isFinite(state.tick);
    }, { timeout: 20000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      phase: window.__TEST_API?.getGamePhase?.(),
      journey: window.__TEST_API?.getMultiplayerJourneyState?.(),
      network: window.__TEST_API?.getNetworkState?.(),
    })).catch(() => null);
    const pid = launched.browser.proc?.pid;
    await launched.browser.close().catch(() => null);
    if (pid) {
      try { process.kill(pid, 0); process.kill(pid, 'SIGKILL'); } catch {}
    }
    throw new Error(`Stream admission timed out: ${JSON.stringify(diagnostic)}; ${error.message}`);
  }
  return { index, ...launched, wire };
}

async function state(pilot) {
  return pilot.page.evaluate(() => window.__TEST_API.getMultiplayerJourneyState());
}

async function capture(pilot, label) {
  const file = path.join(outputDir, `${safeName(label)}.png`);
  await pilot.page.screenshot({ path: file });
  const png = fs.readFileSync(file);
  assert(png.length > 1024 && png.readUInt32BE(16) === VIEWPORT.width && png.readUInt32BE(20) === VIEWPORT.height,
    `Expected nonempty ${VIEWPORT.width}x${VIEWPORT.height} evidence at ${file}`);
  return path.basename(file);
}

async function requestJson(route, options = {}) {
  const response = await fetch(`${SIM_URL}${route}`, options);
  const body = await response.json();
  if (!response.ok) throw new Error(`${route} failed (${response.status}): ${body.error || 'unknown'}`);
  return body;
}

async function debugPlayer(body) {
  return requestJson('/debug/player-state', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

async function debugPortal(body) {
  return requestJson('/debug/portal-state', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

async function debugInhibitor(body) {
  return requestJson('/debug/inhibitor-state', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

async function waitForOwner(pilot, predicate, label, timeout = 10000) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    last = await state(pilot);
    if (last?.owner && predicate(last.owner, last)) return last;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify({ owner: last?.owner, transport: last?.transport, connectionId: last?.connectionId, connectionEpoch: last?.connectionEpoch })}`);
}

async function heldMovement(pilot) {
  const before = await state(pilot);
  await pilot.page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
  });
  await sleep(900);
  await pilot.page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight', key: 'ArrowRight', bubbles: true }));
  });
  const after = await waitForOwner(pilot, (owner) => Math.hypot(
    owner.wx - before.owner.wx, owner.wy - before.owner.wy,
  ) > 0.001, 'held movement');
  return { before: { wx: before.owner.wx, wy: before.owner.wy }, after: { wx: after.owner.wx, wy: after.owner.wy } };
}

function privateKeys(player) {
  return [
    'profileId', 'rigLevels', 'abilityState', 'deltaV', 'deltaVMax', 'deltaVRatio',
    'lastInputSeq', 'lastInputBrake', 'pendingSlingshotEdgeCount', 'cargo', 'cargoCount',
    'equipped', 'consumables', 'activeEffects', 'effectState', 'portalInteraction',
    'signal', 'controlDebuff', 'runResult', 'recentRuns',
  ]
    .filter((key) => Object.prototype.hasOwnProperty.call(player || {}, key));
}

function rivalPrivateSlingshotKeys(player) {
  return ['energy', 'chainCount', 'engageRadius']
    .filter((key) => Object.prototype.hasOwnProperty.call(player?.slingshot || {}, key));
}

async function runCohort(count, repetition) {
  const pilots = [];
  const cohortStartedAt = Date.now();
  let sampling = false;
  let samplingTask = null;
  const clientSamples = Array.from({ length: count }, () => []);
  const healthSamples = [];
  const result = { count, repetition, startedAt: new Date().toISOString(), screenshots: [], assistance: [], failures: [] };
  await startSimServer(SIM_PORT, {
    idleShutdownMs: 60000,
    env: { LBH_SIM_WS_ENABLED: 'true', LBH_SIM_MAX_SIM_TIME: '600' },
  });
  try {
    // Establish the authority through the host browser before guests enter the
    // normal join path. Chrome/menu boot stays sequential for deterministic UI
    // readiness; the explicit steady window below removes measurement bias.
    pilots.push(await launchPilot(0, count));
    const hostLaunch = await state(pilots[0]);
    assert(hostLaunch.session?.maxPlayers === count,
      `Normal host launch must create a ${count}-seat cycle, got ${hostLaunch.session?.maxPlayers}`);
    assert(hostLaunch.session?.hostClientId === hostLaunch.clientId,
      'Normal first browser must become host before any guest joins');
    assert(hostLaunch.control?.sessionHumanPlayerCount === 1,
      `Expected one human after host launch, got ${hostLaunch.control?.sessionHumanPlayerCount}`);
    result.hostLaunch = {
      runId: hostLaunch.runId,
      clientId: hostLaunch.clientId,
      maxPlayers: hostLaunch.session.maxPlayers,
      humanPlayerCount: hostLaunch.control.sessionHumanPlayerCount,
    };
    const earlySnapshot = await requestJson('/snapshot');
    const earlyWreck = earlySnapshot.world?.wrecks?.find((entry) =>
      entry.alive !== false && !entry.looted && entry.loot?.length);
    assert(earlyWreck, 'Expected an authored lootable wreck at host launch');
    result.assistance.push('placed host at an authored wreck before guest boot; pickup outcome remained authoritative');
    await debugPlayer({ clientId: hostLaunch.clientId, wx: earlyWreck.wx, wy: earlyWreck.wy, vx: 0, vy: 0 });
    const earlyLoot = await waitForOwner(pilots[0], (owner) => owner.cargo?.some(Boolean),
      'early private salvage inventory', 12000);
    result.salvage = { cargoCount: earlyLoot.owner.cargoCount, signalLevel: earlyLoot.owner.signal?.level ?? null };
    for (let index = 1; index < count; index++) pilots.push(await launchPilot(index, count));
    await Promise.all(pilots.map((pilot) => waitFor(pilot.page, (expected) => {
      const current = window.__TEST_API?.getMultiplayerJourneyState?.();
      return current?.players?.filter((player) => !player.isAI).length === expected;
    }, { timeout: 20000 }, count)));

    const initial = await Promise.all(pilots.map(state));
    const runIds = new Set(initial.map((entry) => entry.runId));
    const clientIds = new Set(initial.map((entry) => entry.clientId));
    const profileIds = new Set(initial.map((entry) => entry.owner?.profileId).filter(Boolean));
    assert(runIds.size === 1, `Expected one shared run, got ${[...runIds]}`);
    assert(clientIds.size === count, `Expected ${count} unique client ids, got ${clientIds.size}`);
    assert(profileIds.size === count, `Expected ${count} unique non-null profile ids, got ${profileIds.size}`);
    assert(initial.every((entry) => entry.players.filter((player) => !player.isAI).length === count),
      'Every browser must see the complete human roster');
    assert(initial.every((entry) => entry.session?.maxPlayers === count), 'Authority participant cap must match cohort');
    assert(initial.every((entry) => entry.transport.hotPathHttpOccurred === false), 'Stream mode used a hot-path HTTP request');
    for (const entry of initial) {
      for (const player of entry.players) {
        if (player.clientId === entry.clientId) continue;
        assert(privateKeys(player).length === 0, `Rival private fields leaked to ${entry.clientId}: ${privateKeys(player)}`);
        assert(rivalPrivateSlingshotKeys(player).length === 0,
          `Rival private slingshot fields leaked to ${entry.clientId}: ${rivalPrivateSlingshotKeys(player)}`);
      }
    }

    sampling = true;
    samplingTask = (async () => {
      while (sampling) {
        const sampledAt = Date.now();
        const states = await Promise.all(pilots.map((pilot) => state(pilot).catch(() => null)));
        states.forEach((entry, index) => {
          if (!entry?.transport) return;
          clientSamples[index].push({
            at: sampledAt,
            tick: entry.tick,
            snapshotId: entry.snapshotId,
            inputAckRttMs: entry.transport.lastInputAckRttMs,
            snapshotIntervalMs: entry.transport.lastSnapshotIntervalMs,
            snapshotAgeMs: entry.transport.lastSnapshotLagMs,
            pendingInputs: entry.transport.pendingInputCount,
            pendingActions: entry.transport.pendingActionCount,
            reconnectCount: entry.transport.reconnectCount,
          });
        });
        try {
          const health = await requestJson('/health');
          healthSamples.push({
            at: sampledAt,
            tick: health.tick,
            mode: health.session?.overloadState,
            tickHz: health.session?.tickHz,
            snapshotHz: health.session?.snapshotHz,
            projection: health.multiplayer?.projection,
          });
        } catch {}
        await sleep(250);
      }
    })();

    const steadyStartedAt = Date.now();
    const steadyBaseline = pilots.map((pilot) => ({
      inboundBytes: pilot.wire.inboundBytes,
      outboundBytes: pilot.wire.outboundBytes,
    }));
    await sleep(5000);
    const steadyWallMs = Date.now() - steadyStartedAt;
    result.steadyStateApplicationRate = {
      wallMs: steadyWallMs,
      perClient: pilots.map((pilot, index) => {
        const inboundBytes = pilot.wire.inboundBytes - steadyBaseline[index].inboundBytes;
        const outboundBytes = pilot.wire.outboundBytes - steadyBaseline[index].outboundBytes;
        return {
          clientId: initial[index].clientId,
          inboundBytes,
          outboundBytes,
          inboundBytesPerSec: inboundBytes / (steadyWallMs / 1000),
          outboundBytesPerSec: outboundBytes / (steadyWallMs / 1000),
          totalBytesPerSec: (inboundBytes + outboundBytes) / (steadyWallMs / 1000),
        };
      }),
    };
    result.steadyStateApplicationRate.aggregateBytesPerSec = result.steadyStateApplicationRate.perClient
      .reduce((sum, entry) => sum + entry.totalBytesPerSec, 0);

    result.screenshots.push(await capture(pilots[0], `${count}p-r${repetition}-host-live`));
    result.screenshots.push(await capture(pilots[1], `${count}p-r${repetition}-pilot-live`));
    result.movement = await heldMovement(pilots[1]);

    // Salvage was completed by the host at run start before AI could exhaust
    // the authored wrecks during sequential browser boot.
    let hostState = await state(pilots[0]);

    // Reliable pulse and consumable actions travel through the browser stream.
    await debugPlayer({ clientId: hostState.clientId, signalLevel: 0.69 });
    result.assistance.push('raised host signal near a consequence threshold before a normal pulse action');
    await tap(pilots[0].page, 'KeyE', 'e');
    const pulsed = await waitForOwner(pilots[0], (owner, entry) =>
      entry.transport.lastActionAck > 0 && owner.signal?.level > 0.69,
    'pulse action and signal consequence');
    result.signal = { level: pulsed.owner.signal.level, zone: pulsed.owner.signal.zone };
    await tap(pilots[0].page, 'Digit1', '1');
    await waitForOwner(pilots[0], (owner) => owner.consumables?.[0] === null, 'consumable consequence');

    // Put the pilot in an authored anchor's engage ring, then use the normal F
    // edge. Placement is assisted; slingshot adjudication is not.
    hostState = await state(pilots[0]);
    const publicSnapshot = await requestJson('/snapshot');
    const star = publicSnapshot.world?.stars?.find((entry) => entry.alive !== false);
    const planetoid = publicSnapshot.world?.planetoids?.find((entry) => entry.alive !== false);
    const anchor = star || planetoid || publicSnapshot.world?.wells?.[0];
    assert(anchor, 'Expected a slingshot anchor');
    const startOffset = star ? 0.18 : planetoid ? 0.09 : 0.25;
    const startX = (anchor.wx + startOffset) % (publicSnapshot.session?.worldScale || 3);
    result.assistance.push('placed host in an authored slingshot engage ring');
    let engaged = false;
    let slingshotAttempts = 0;
    for (let attempt = 0; attempt < 4 && !engaged; attempt++) {
      slingshotAttempts = attempt + 1;
      await debugPlayer({
        clientId: hostState.clientId,
        wx: startX,
        wy: anchor.wy,
        vx: 0,
        vy: -1.2,
        deltaV: 40,
        resetSlingshot: true,
      });
      await sleep(30);
      await tap(pilots[0].page, 'KeyF', 'f', 50);
      engaged = await waitForOwner(pilots[0], (owner) => owner.slingshot?.engaged === true,
        `slingshot engagement attempt ${attempt + 1}`, 1500).then(() => true, () => false);
    }
    assert(engaged, 'Normal F input did not engage the assisted authored slingshot after four attempts');
    result.slingshot = { attempts: slingshotAttempts, input: 'KeyF' };

    // Close immediately behind a reliable action. The browser must resume with
    // a rotated connection and the action may have only one consequence.
    const reconnectPilot = pilots[1];
    const reconnectBefore = await state(reconnectPilot);
    const reconnectStartedAt = Date.now();
    const eventsBefore = await requestJson('/events?since=0');
    const pulseBefore = (eventsBefore.events || []).filter((event) => event.type === 'player.pulse'
      && event.payload?.clientId === reconnectBefore.clientId).length;
    const interrupted = await reconnectPilot.page.evaluate(() =>
      window.__TEST_API.interruptMultiplayerStreamForTest({ pulse: true }));
    assert(interrupted?.connectionId === reconnectBefore.connectionId,
      'Expected stream interruption hook to close the active connection');
    assert(interrupted.pendingActionCount > 0 || interrupted.pendingInputCount > 0,
      'Expected interruption with unresolved reliable or continuous work');
    const reconnected = await waitForOwner(reconnectPilot, (_owner, entry) =>
      entry.transport.reconnectCount > reconnectBefore.transport.reconnectCount
      && entry.connectionEpoch > reconnectBefore.connectionEpoch
      && entry.transport.lastActionAck > reconnectBefore.transport.lastActionAck,
    'stream reconnect', 15000);
    const eventsAfter = await requestJson('/events?since=0');
    const pulseAfter = (eventsAfter.events || []).filter((event) => event.type === 'player.pulse'
      && event.payload?.clientId === reconnectBefore.clientId).length;
    assert(reconnected.transport.lastActionAck > reconnectBefore.transport.lastActionAck,
      'Reconnect must settle the interrupted reliable pulse');
    assert(pulseAfter - pulseBefore === 1,
      `Reconnect must produce exactly one pulse consequence, got ${pulseAfter - pulseBefore}`);
    result.reconnect = {
      elapsedMs: Date.now() - reconnectStartedAt,
      beforeConnectionEpoch: reconnectBefore.connectionEpoch,
      afterConnectionEpoch: reconnected.connectionEpoch,
      reconnectCount: reconnected.transport.reconnectCount,
      pulseConsequences: pulseAfter - pulseBefore,
    };
    result.screenshots.push(await capture(reconnectPilot, `${count}p-r${repetition}-reconnected`));

    // Keep the extraction pilot outside the Vessel fixture before the death
    // proof. The later portal confirmation still comes from real input.
    const extractPilot = pilots[Math.min(3, count - 1)];
    const extractState = await state(extractPilot);
    const extractPoint = { wx: 2.65, wy: 2.65 };
    await debugPlayer({ clientId: extractState.clientId, ...extractPoint, vx: 0, vy: 0 });

    // A third browser dies to a live Vessel contact. The harness positions the
    // hazard; the next authority tick owns the death and profile consequence.
    const deathPilot = pilots[Math.min(2, count - 1)];
    const deathState = await state(deathPilot);
    result.assistance.push('placed the Inhibitor Vessel on one pilot; the authority tick produced contact death');
    const deathPoint = { wx: 0.25, wy: 0.25 };
    const preDeathStates = await Promise.all(pilots.map(state));
    for (const entry of preDeathStates) {
      if (entry.clientId === deathState.clientId || entry.owner?.status !== 'alive') continue;
      await debugPlayer({ clientId: entry.clientId, wx: 2.65, wy: 2.65, vx: 0, vy: 0 });
    }
    await debugPlayer({ clientId: deathState.clientId, ...deathPoint, vx: 0, vy: 0, signalLevel: 1 });
    await debugInhibitor({ form: 3, ...deathPoint, radius: 0.4, intensity: 1, pressure: 1 });
    await waitForOwner(deathPilot, (owner) => owner.status === 'dead', 'natural Inhibitor contact death', 12000);
    result.screenshots.push(await capture(deathPilot, `${count}p-r${repetition}-death`));
    await debugInhibitor({ form: 0, pressure: 0, intensity: 0, radius: 0 });
    const postDeathStates = await Promise.all(pilots.map(state));
    const newlyDeadHumans = postDeathStates.filter((entry, index) =>
      entry.owner?.status === 'dead' && preDeathStates[index]?.owner?.status === 'alive');
    assert(newlyDeadHumans.length === 1 && newlyDeadHumans[0].clientId === deathState.clientId,
      `Vessel fixture must kill only its target: ${newlyDeadHumans.map((entry) => entry.clientId)}`);
    assert((await state(extractPilot)).owner?.status === 'alive',
      'Extraction pilot must remain alive after the isolated Vessel proof');

    // A fourth browser enters an assisted portal position and confirms through
    // the normal Enter input edge.
    result.assistance.push('placed a stable portal at one pilot; extraction confirmation remained a browser action');
    await debugPortal({ id: `journey-portal-${count}-${repetition}`, ...extractPoint, type: 'stable', alive: true, lifespan: 60 });
    let extracted = false;
    let extractionAttempts = 0;
    for (let attempt = 0; attempt < 4 && !extracted; attempt++) {
      extractionAttempts = attempt + 1;
      await debugPlayer({ clientId: extractState.clientId, ...extractPoint, vx: 0, vy: 0 });
      await waitForOwner(extractPilot, (owner) => owner.portalInteraction?.ready === true,
        `portal ready state attempt ${attempt + 1}`);
      const beforeExtractAction = await state(extractPilot);
      await tap(extractPilot.page, 'Enter', 'Enter', 250);
      extracted = await waitForOwner(extractPilot, (owner, entry) => owner.status === 'escaped'
        && entry.transport.lastActionAck > beforeExtractAction.transport.lastActionAck,
        `portal extraction attempt ${attempt + 1}`, 1800).then(() => true, () => false);
    }
    assert(extracted, 'Normal Enter input did not confirm extraction after four ready-state attempts');
    result.extraction = { attempts: extractionAttempts, input: 'Enter', holdMs: 250 };
    result.screenshots.push(await capture(extractPilot, `${count}p-r${repetition}-extraction`));

    // Exercise a real leave command and a browser rejoin to the same live run.
    const leavePilot = pilots[count - 1 === Math.min(3, count - 1) ? 1 : count - 1];
    const leaveBefore = await state(leavePilot);
    await tap(leavePilot.page, 'Escape', 'Escape', 100);
    await waitForPhase(leavePilot.page, 'paused');
    await tap(leavePilot.page, 'ArrowDown', 'ArrowDown', 120);
    await tap(leavePilot.page, 'Enter', 'Enter', 250);
    await waitForPhase(leavePilot.page, 'title', 15000);
    await tapUntilPhase(leavePilot.page, 'Space', ' ', 'profileSelect');
    await tapUntilPhase(leavePilot.page, 'Enter', 'Enter', 'home');
    await leavePilot.page.evaluate(() => window.__TEST_API.setHomeTabForTest(4));
    await tapUntilPhase(leavePilot.page, 'Enter', 'Enter', 'mapSelect');
    await tapUntilPhase(leavePilot.page, 'Enter', 'Enter', 'playing', 20000);
    const rejoined = await waitForOwner(leavePilot, (_owner, entry) => entry.runId === leaveBefore.runId
      && entry.players.filter((player) => !player.isAI).length === count, 'leave/rejoin roster', 15000);
    assert(rejoined.connectionId !== leaveBefore.connectionId,
      'Leave/rejoin must establish a fresh connection authority');
    result.leaveRejoin = {
      clientIdStable: rejoined.clientId === leaveBefore.clientId,
      membershipIdBefore: leaveBefore.membershipId,
      membershipIdAfter: rejoined.membershipId,
      connectionIdRotated: rejoined.connectionId !== leaveBefore.connectionId,
    };

    await sleep(1200);
    sampling = false;
    await samplingTask;
    const finalStates = await Promise.all(pilots.map(state));
    const health = await requestJson('/health');
    result.health = health;
    result.clients = finalStates.map((entry, index) => ({
      index,
      clientId: entry.clientId,
      membershipId: entry.membershipId,
      connectionEpoch: entry.connectionEpoch,
      tick: entry.tick,
      snapshotId: entry.snapshotId,
      lastEventSeq: entry.lastEventSeq,
      transport: entry.transport,
      wire: pilots[index].wire,
      browserErrors: pilots[index].errors,
    }));
    assert(finalStates.every((entry) => entry.transport.hotPathHttpOccurred === false), 'Stream hot-path HTTP remained zero');
    assert(pilots.every((pilot) => pilot.wire.hotPathHttpRequests.length === 0),
      `CDP observed hot-path HTTP: ${JSON.stringify(pilots.flatMap((pilot) => pilot.wire.hotPathHttpRequests))}`);
    assert(pilots.every((pilot) => pilot.errors.length === 0), `Browser errors: ${pilots.flatMap((pilot) => pilot.errors).join('; ')}`);
    assert(health.session?.overloadState === 'NORMAL', `Authority mode was ${health.session?.overloadState}`);
    result.aggregateApplicationBytes = result.clients.reduce((sum, client) =>
      sum + client.wire.inboundBytes + client.wire.outboundBytes, 0);
    result.wallMs = Date.now() - cohortStartedAt;
    result.applicationRate = {
      aggregateBytesPerSec: result.aggregateApplicationBytes / (result.wallMs / 1000),
      perClient: result.clients.map((client) => ({
        clientId: client.clientId,
        inboundBytesPerSec: client.wire.inboundBytes / (result.wallMs / 1000),
        outboundBytesPerSec: client.wire.outboundBytes / (result.wallMs / 1000),
        totalBytesPerSec: (client.wire.inboundBytes + client.wire.outboundBytes) / (result.wallMs / 1000),
      })),
    };
    result.sampleSummary = {
      clients: clientSamples.map((samples, index) => ({
        clientId: result.clients[index].clientId,
        inputAckRttMs: summarizeNumbers(samples.map((sample) => sample.inputAckRttMs)),
        snapshotIntervalMs: summarizeNumbers(samples.map((sample) => sample.snapshotIntervalMs)),
        snapshotAgeMs: summarizeNumbers(samples.map((sample) => sample.snapshotAgeMs)),
        pendingInputs: summarizeNumbers(samples.map((sample) => sample.pendingInputs)),
        pendingActions: summarizeNumbers(samples.map((sample) => sample.pendingActions)),
      })),
      authority: {
        samples: healthSamples.length,
        modes: [...new Set(healthSamples.map((sample) => sample.mode))],
        tickHz: [...new Set(healthSamples.map((sample) => sample.tickHz))],
        snapshotHz: [...new Set(healthSamples.map((sample) => sample.snapshotHz))],
        projectionAverageMs: summarizeNumbers(healthSamples.map((sample) => sample.projection?.accounting?.projectionDurationAverageMs)),
        projectionWorstMs: summarizeNumbers(healthSamples.map((sample) => sample.projection?.accounting?.projectionDurationWorstMs)),
        simTickMs: summarizeNumbers(healthSamples.map((sample) => sample.projection?.accounting?.lastSimTickCostMs)),
        maxQueuedBytes: Math.max(0, ...healthSamples.map((sample) => sample.projection?.maxQueuedBytes || 0)),
        maxPendingInboundBytes: Math.max(0, ...healthSamples.map((sample) => sample.projection?.maxPendingInboundBytes || 0)),
      },
    };
    result.completedAt = new Date().toISOString();
    return result;
  } finally {
    sampling = false;
    await samplingTask?.catch(() => null);
    let forcedBrowserKills = 0;
    const browserCleanup = await Promise.all(pilots.map(async (pilot) => {
      const pid = pilot.browser.proc?.pid;
      await pilot.browser.close().catch(() => null);
      if (pidAlive(pid)) {
        forcedBrowserKills += 1;
        try { process.kill(pid, 'SIGKILL'); } catch {}
      }
      return { pid, stopped: await waitForPidExit(pid) };
    }));
    await stopSimServer(SIM_PORT);
    const simStopped = await waitForSimStopped();
    result.cleanup = {
      browserCount: browserCleanup.length,
      forcedBrowserKills,
      browserPidsStopped: browserCleanup.every((entry) => entry.stopped),
      browserPids: browserCleanup,
      simStopped,
    };
    assert(result.cleanup.browserPidsStopped,
      `Browser cleanup leaked PIDs: ${JSON.stringify(browserCleanup.filter((entry) => !entry.stopped))}`);
    assert(simStopped, `Sim listener remained reachable at ${SIM_URL}`);
  }
}

async function runCadenceProbe() {
  const pilots = [];
  await startSimServer(SIM_PORT, {
    idleShutdownMs: 60000,
    env: { LBH_SIM_WS_ENABLED: 'true', LBH_SIM_MAX_SIM_TIME: '600' },
  });
  try {
    const pilot = await launchPilot(0, 4);
    pilots.push(pilot);
    const before = await state(pilot);
    const startedAt = Date.now();
    await sleep(20000);
    const after = await state(pilot);
    return {
      count: 1,
      kind: '20-second-stream-cadence',
      wallMs: Date.now() - startedAt,
      inputAckBefore: before.transport.lastInputAck,
      inputAckAfter: after.transport.lastInputAck,
      inputAckDelta: after.transport.lastInputAck - before.transport.lastInputAck,
      reconnectBefore: before.transport.reconnectCount,
      reconnectAfter: after.transport.reconnectCount,
      reconnectDelta: after.transport.reconnectCount - before.transport.reconnectCount,
      streamState: after.transport.streamState,
      hotPathHttpOccurred: after.transport.hotPathHttpOccurred,
      wire: pilot.wire,
      health: await requestJson('/health'),
      browserErrors: pilot.errors,
    };
  } finally {
    await Promise.allSettled(pilots.map(async (pilot) => {
      const pid = pilot.browser.proc?.pid;
      await pilot.browser.close().catch(() => null);
      if (pid) { try { process.kill(pid, 0); process.kill(pid, 'SIGKILL'); } catch {} }
    }));
    await stopSimServer(SIM_PORT).catch(() => null);
  }
}

async function run() {
  fs.mkdirSync(outputDir, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    commit: require('child_process').execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    simUrl: SIM_URL,
    viewport: VIEWPORT,
    scope: 'local loopback browser proof; not WAN, hosted, TLS-edge, or human feel proof',
    gregHandsOnPending: true,
    results: [],
    failure: null,
  };
  await startServer();
  try {
    if (process.env.LBH_MULTIPLAYER_BROWSER_CADENCE === '1') {
      report.results.push(await runCadenceProbe());
      fs.writeFileSync(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
      console.log(`Multiplayer browser report: ${path.join(outputDir, 'report.json')}`);
      return;
    }
    const only = Number(process.env.LBH_MULTIPLAYER_BROWSER_ONLY || 0);
    if (!only || only === 4) {
      report.results.push(await runCohort(4, 1));
      report.results.push(await runCohort(4, 2));
    }
    if (!only || only === 8) report.results.push(await runCohort(8, 1));
  } catch (error) {
    report.failure = error.stack || error.message;
  } finally {
    stopServer();
  }
  fs.writeFileSync(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Multiplayer browser report: ${path.join(outputDir, 'report.json')}`);
  if (report.failure) {
    console.error(report.failure);
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(error);
  stopServer();
  process.exit(1);
});
