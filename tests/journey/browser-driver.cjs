const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { wrappedDelta, wrappedDistance } = require('../../scripts/sim/world-geometry.cjs');

const MAP_INDEX = Object.freeze({ shallows: 0, expanse: 1, 'deep-field': 2, deep_field: 2 });

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function serviceAuthorityFrame(page) {
  const readState = () => page.evaluate(() => {
    const api = window.__TEST_API;
    const network = api?.getNetworkState?.() || {};
    const journey = api?.getJourneyState?.() || {};
    return {
      phase: api?.getGamePhase?.() || null,
      authorityActive: network.remoteAuthorityActive === true,
      sentInputSeq: Number(network.lastRemoteInput?.seq) || 0,
      acceptedInputSeq: Number(network.networkMetrics?.lastAcceptedSeq) || 0,
      snapshotInputSeq: Number(journey.player?.lastInputSeq) || 0,
    };
  });
  const before = await readState() || {};
  await page.evaluate(() => window.__TEST_API?.stepFrameForTest?.(1 / 60));
  if (!before.authorityActive || before.phase !== 'playing') {
    await sleep(20);
    return;
  }

  // Headless Chrome can suspend ambient requestAnimationFrame delivery. A
  // frame starts the ordinary async input and snapshot requests, but returning
  // after a blind delay can strand held product input behind an in-flight
  // request until the authority's 750ms lease expires. Keep servicing the
  // product loop until one input produced after this call is both HTTP-acked
  // and visible in an authenticated authority snapshot.
  const deadline = Date.now() + 650;
  let targetInputSeq = null;
  while (Date.now() < deadline) {
    await sleep(20);
    const state = await readState() || {};
    if (!state.authorityActive || state.phase !== 'playing') return;
    if (targetInputSeq === null && state.sentInputSeq > before.sentInputSeq) {
      targetInputSeq = state.sentInputSeq;
    }
    if (targetInputSeq !== null
      && state.acceptedInputSeq >= targetInputSeq
      && state.snapshotInputSeq >= targetInputSeq) {
      return;
    }
    await page.evaluate(() => window.__TEST_API?.stepFrameForTest?.(1 / 60));
  }
  throw new Error('Journey browser authority frame did not settle fresh product input within 650ms');
}

function comparison(query, actual) {
  if ('equals' in query) return Object.is(actual, query.equals);
  if ('gt' in query) return actual > query.gt;
  if ('gte' in query) return actual >= query.gte;
  if ('lt' in query) return actual < query.lt;
  if ('lte' in query) return actual <= query.lte;
  return Boolean(actual);
}

function evaluateValues(query, values) {
  if (query.all) return query.all.every((child) => evaluateValues(child, values));
  if (query.any) return query.any.some((child) => evaluateValues(child, values));
  if (query.not) return !evaluateValues(query.not, values);
  return comparison(query, values[query.condition]);
}

function safeName(value) {
  return String(value || 'artifact').replace(/[^a-z0-9._-]+/gi, '-').toLowerCase();
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

let viewportAdapterPromise = null;

async function productAimClientPoint({ ship, rect, moveX, moveY, radius = 180 }) {
  const magnitude = Math.hypot(Number(moveX) || 0, Number(moveY) || 0);
  if (!ship || !rect || magnitude <= 1e-9 || !(rect.width > 0) || !(rect.height > 0)) return null;
  const nx = (Number(moveX) || 0) / magnitude;
  const ny = (Number(moveY) || 0) / magnitude;
  viewportAdapterPromise ||= import(pathToFileURL(path.join(__dirname, '../../src/render/viewport.js')).href);
  const { renderToWindowCoords } = await viewportAdapterPromise;
  const [x, y] = renderToWindowCoords(
    Number(ship.x) + nx * radius,
    Number(ship.y) + ny * radius,
    { getBoundingClientRect: () => rect },
  );
  return Object.freeze({
    x,
    y,
  });
}

function navigationInput(input) {
  if (!input) return null;
  return {
    seq: finiteOrNull(input.seq),
    moveX: finiteOrNull(input.moveX),
    moveY: finiteOrNull(input.moveY),
    thrust: finiteOrNull(input.thrust),
    brake: finiteOrNull(input.brake),
    approachTargetId: input.approachTargetId || null,
  };
}

function buildNavigationSnapshot({ snapshot, player, target, policy, arrivalRadius, arrivalSpeed }) {
  const worldScale = finiteOrNull(snapshot?.session?.worldScale);
  const dx = wrappedDelta(player.wx, target.wx, worldScale);
  const dy = wrappedDelta(player.wy, target.wy, worldScale);
  const affordance = player.movementAffordance ? { ...player.movementAffordance } : null;
  const clientLastSentInput = navigationInput(snapshot?.lastRemoteInput);
  return {
    source: 'browser-authenticated-authority',
    tick: finiteOrNull(snapshot?.tick),
    simTime: finiteOrNull(snapshot?.simTime),
    policy,
    player: {
      status: player.status || null,
      wx: finiteOrNull(player.wx),
      wy: finiteOrNull(player.wy),
      vx: finiteOrNull(player.vx),
      vy: finiteOrNull(player.vy),
      speed: Math.hypot(Number(player.vx) || 0, Number(player.vy) || 0),
    },
    target: {
      id: target.id || null,
      wx: finiteOrNull(target.wx),
      wy: finiteOrNull(target.wy),
      radius: finiteOrNull(target.radius),
    },
    canonicalDistance: wrappedDistance(player.wx, player.wy, target.wx, target.wy, worldScale),
    clientLastSentInput,
    authorityShapedIntent: {
      acceptedInputSeq: finiteOrNull(player.lastInputSeq),
      facing: finiteOrNull(player.facing),
      deliveredThrust: finiteOrNull(player.deliveredThrust),
      deliveredBrake: finiteOrNull(player.deliveredBrake),
      movementAffordance: affordance,
    },
    propulsionState: {
      deltaV: finiteOrNull(player.deltaV),
      deltaVMax: finiteOrNull(player.deltaVMax),
      heatRatio: finiteOrNull(player.heatRatio),
      overheatRemaining: finiteOrNull(player.overheatRemaining),
      pendingInputCount: finiteOrNull(snapshot?.networkMetrics?.pendingInputCount),
      lastAcceptedSeq: finiteOrNull(snapshot?.networkMetrics?.lastAcceptedSeq),
      lastInputAckRttMs: finiteOrNull(snapshot?.networkMetrics?.lastInputAckRttMs),
      lastInputToSnapshotMs: finiteOrNull(snapshot?.networkMetrics?.lastInputToSnapshotMs),
    },
    stoppingState: {
      assistActive: affordance?.stoppingAssist === true,
      acceptedBrake: finiteOrNull(player.lastInputBrake),
      deliveredBrake: finiteOrNull(player.deliveredBrake),
    },
    steeringWaypoint: {
      targetId: target.id || null,
      wx: finiteOrNull(target.wx),
      wy: finiteOrNull(target.wy),
      wrappedDeltaX: dx,
      wrappedDeltaY: dy,
      arrivalRadius,
      arrivalSpeed,
    },
    hazardClearance: {
      assistActive: affordance?.hazardAssist === true,
    },
  };
}

class BrowserJourneyConditionReader {
  constructor({ page, conditionNames, validateConditionQuery }) {
    this.page = page;
    this.conditionNames = conditionNames;
    this.validateConditionQuery = validateConditionQuery;
  }

  async snapshot() {
    await serviceAuthorityFrame(this.page);
    return this.page.evaluate((names) => {
      const api = window.__TEST_API;
      const network = api?.getNetworkState?.() || {};
      const state = api?.getJourneyState?.() || {};
      const values = { ...(state.player?.conditions || {}) };
      for (const name of names) {
        if (!name.startsWith('run.')) values[name] = api?.readCondition?.(name);
      }
      values['session.authority.active'] = Boolean(network.remoteAuthorityActive);
      return values;
    }, this.conditionNames);
  }

  async evaluate(query) {
    const validated = this.validateConditionQuery(query);
    return evaluateValues(validated, await this.snapshot());
  }

  async assert(query, _context, message = 'Journey condition assertion failed') {
    const validated = this.validateConditionQuery(query);
    const values = await this.snapshot();
    if (!evaluateValues(validated, values)) {
      throw new Error(`${message}: ${JSON.stringify(validated)}`);
    }
    return true;
  }
}

class BrowserJourneyDriver {
  constructor({ page, simUrl, artifactRoot }) {
    this.page = page;
    this.artifactRoot = artifactRoot;
    this.mapIndex = 0;
    this.policy = null;
    this.events = [];
    this.evidencePaths = [];
    this.activeTarget = null;
    this.eventCursor = 0;
    this.syntheticEventCursor = 0;
    this.syntheticEventSequence = 0;
    this.expectedRunRules = {};
    this.slingshotEdge = 0;
    this.lastNavigationSnapshot = null;
    this.heldProductKeys = new Set();
  }

  async configureSetup(setup) {
    this.mapIndex = MAP_INDEX[setup.map];
    if (!Number.isInteger(this.mapIndex)) throw new RangeError(`Unknown Journey map: ${setup.map}`);
    const unsupportedRules = Object.keys(setup.runRules).filter((name) => name !== 'signature');
    if (unsupportedRules.length > 0) throw new Error(`Unsupported Journey run rules: ${unsupportedRules.join(', ')}`);
    this.expectedRunRules = { ...setup.runRules };
    const configured = await this.page.evaluate(({ pilot, hull, seed, loadout, startingProfileFacts, mapIndex }) => {
      const api = window.__TEST_API;
      api?.createTestProfile?.(pilot);
      api?.setProfileShipType?.(hull);
      api?.setPreviewSeed?.(seed);
      api?.setMapSelectIndex?.(mapIndex);
      api?.applyJourneyProfileFacts?.(startingProfileFacts);
      api?.configureJourneyLoadout?.(loadout);
      return api?.getProfile?.() || null;
    }, { ...setup, mapIndex: this.mapIndex });
    if (!configured || configured.name !== setup.pilot || configured.hullType !== setup.hull) {
      throw new Error(`Journey profile setup mismatch: ${JSON.stringify(configured)}`);
    }
    const configuredIds = [...configured.loadout.equipped, ...configured.loadout.consumables]
      .filter(Boolean).map((item) => item.catalogId);
    if (JSON.stringify(configuredIds.sort()) !== JSON.stringify([...setup.loadout].sort())) {
      throw new Error(`Journey loadout setup mismatch: expected ${JSON.stringify(setup.loadout)}, got ${JSON.stringify(configuredIds)}`);
    }
  }

  async configureControllerPolicy(policy) {
    if (!['product-input', 'controlled-capture'].includes(policy.driver)) {
      throw new Error(`Unsupported Journey controller policy: ${policy.driver}`);
    }
    this.policy = policy;
  }

  async serviceAuthorityFrame() {
    await serviceAuthorityFrame(this.page);
  }

  async snapshot() {
    await this.serviceAuthorityFrame();
    const state = await this.page.evaluate(() => {
      const api = window.__TEST_API;
      return {
        ...(api?.getJourneyState?.() || {}),
        lastRemoteInput: api?.getNetworkState?.()?.lastRemoteInput || null,
        networkMetrics: api?.getNetworkState?.()?.networkMetrics || null,
      };
    });
    if (!state?.session || !state?.world) {
      throw new Error('Journey browser has no authenticated authority snapshot');
    }
    return {
      session: state.session,
      tick: state.tick,
      simTime: state.simTime,
      players: state.player ? [state.player] : [],
      world: state.world,
      recentEvents: state.recentEvents || [],
      lastRemoteInput: state.lastRemoteInput || null,
      networkMetrics: state.networkMetrics || null,
    };
  }

  async waitPage(read, expected, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    let last = null;
    while (Date.now() < deadline) {
      last = await read();
      if (expected(last)) return last;
      await sleep(80);
    }
    throw new Error(`Journey UI transition timed out; last=${JSON.stringify(last)}`);
  }

  async player(snapshot = null) {
    const body = snapshot || await this.snapshot();
    const clientId = await this.page.evaluate(() => window.__TEST_API?.getNetworkState?.()?.clientId || null);
    return body.players?.find((entry) => entry.clientId === clientId) || null;
  }

  async phase() {
    return this.page.evaluate(() => window.__TEST_API?.getGamePhase?.());
  }

  async tap(code, holdMs = 70) {
    await this.page.keyboard.down(code);
    await sleep(holdMs);
    await this.page.keyboard.up(code);
    await sleep(100);
  }

  async pressUntilTransition(code, read, expected, timeoutMs = 10_000) {
    await this.page.keyboard.down(code);
    try {
      const deadline = Date.now() + timeoutMs;
      let last = null;
      while (Date.now() < deadline) {
        last = await read();
        if (expected(last)) return last;
        await this.page.evaluate(() => window.__TEST_API?.stepFrameForTest?.(1 / 60));
        await sleep(80);
      }
      throw new Error(`Journey UI transition timed out; last=${JSON.stringify(last)}`);
    } finally {
      await this.page.keyboard.up(code);
      await this.page.evaluate(() => window.__TEST_API?.stepFrameForTest?.(1 / 60));
    }
  }

  emit(type) {
    const event = { type, at: Date.now(), journeySeq: ++this.syntheticEventSequence };
    this.events.push(event);
    return event;
  }

  async ensureHome() {
    let phase = await this.phase();
    if (phase === 'home') return;
    if (phase === 'mapSelect') {
      await this.tap('Escape');
      await this.waitPage(() => this.phase(), (value) => value === 'home');
      return;
    }
    if (phase === 'title') {
      await sleep(650);
      await this.tap('Space');
      phase = await this.waitPage(() => this.phase(), (value) => value === 'profileSelect');
    }
    if (phase === 'profileSelect') {
      await this.tap('Enter');
      await this.waitPage(() => this.phase(), (value) => value === 'home');
      return;
    }
    throw new Error(`Journey cannot enter Home from ${String(phase)}`);
  }

  async enterRunThroughMenus(seed = null) {
    await this.ensureHome();
    await this.dispatchAction('navigateHome', { section: 'map-select' });
    await this.page.evaluate(({ mapIndex, seedValue }) => {
      window.__TEST_API?.setMapSelectIndex?.(mapIndex);
      if (seedValue !== null) window.__TEST_API?.setPreviewSeed?.(seedValue);
    }, { mapIndex: this.mapIndex, seedValue: seed });
    await this.pressUntilTransition(
      'Enter',
      () => this.phase(),
      (value) => value === 'loading' || value === 'playing',
    );
  }

  async continueTerminalToHome(timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.phase() === 'home') return;
      await this.tap('Enter');
      await sleep(250);
    }
    throw new Error(`Journey terminal transition timed out; phase=${String(await this.phase())}`);
  }

  findTarget(snapshot, player, args) {
    const id = args.targetId || null;
    const policy = String(args.targetPolicy || '');
    const kind = args.targetKind || (policy.includes('exfil') || policy.includes('portal') ? 'portal'
      : policy.includes('well') ? 'well' : 'wreck');
    const collection = kind === 'portal' ? snapshot.world?.portals
      : kind === 'well' ? snapshot.world?.wells : snapshot.world?.wrecks;
    const candidates = (collection || []).filter((entry) => entry.alive !== false && (!id || entry.id === id));
    return candidates.sort((a, b) => wrappedDistance(player.wx, player.wy, a.wx, a.wy, snapshot.session.worldScale)
      - wrappedDistance(player.wx, player.wy, b.wx, b.wy, snapshot.session.worldScale))[0] || null;
  }

  async sendInput(input) {
    const response = await this.page.evaluate((body) => window.__TEST_API?.sendRemoteInput?.(body), input);
    if (!response?.ok) throw new Error(`Journey input was not accepted: ${JSON.stringify(response)}`);
    return response;
  }

  async setHeldProductKey(code, held) {
    if (held && !this.heldProductKeys.has(code)) {
      await this.page.keyboard.down(code);
      this.heldProductKeys.add(code);
    } else if (!held && this.heldProductKeys.has(code)) {
      await this.page.keyboard.up(code);
      this.heldProductKeys.delete(code);
    }
  }

  async applyProductApproachInput({ moveX, moveY, thrust = 0, brake = 0, approach = false }) {
    const geometry = await this.page.evaluate(() => {
      const canvas = document.getElementById('fluid-canvas');
      const rect = canvas?.getBoundingClientRect?.();
      const ship = window.__TEST_API?.getShipScreenPos?.();
      if (!canvas || !rect || !ship) return null;
      return {
        ship,
        rect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          renderWidth: canvas.width,
          renderHeight: canvas.height,
        },
      };
    });
    const aim = await productAimClientPoint({ ...geometry, moveX, moveY });
    if (!aim) throw new Error('Journey product input has no ship/canvas aim geometry');
    await this.page.mouse.move(aim.x, aim.y);
    await this.setHeldProductKey('Space', Number(thrust) > 0.01);
    await this.setHeldProductKey('ControlLeft', Number(brake) > 0.01);
    await this.setHeldProductKey('Enter', approach === true);
  }

  async releaseProductApproachInput() {
    for (const code of ['Space', 'ControlLeft', 'Enter']) await this.setHeldProductKey(code, false);
    await this.page.evaluate(() => window.__TEST_API?.clearInputForTest?.());
  }

  async cycleProductSalvageTarget() {
    await this.setHeldProductKey('KeyT', true);
    await this.serviceAuthorityFrame();
    await this.setHeldProductKey('KeyT', false);
    await this.serviceAuthorityFrame();
  }

  async readProductSalvageTargetId() {
    return this.page.evaluate(
      () => window.__TEST_API?.getNetworkState?.()?.selectedSalvageTargetId || null,
    );
  }

  async adoptProductSalvageTarget(snapshot, currentSelection = undefined) {
    const liveIds = new Set((snapshot.world?.wrecks || [])
      .filter((wreck) => wreck?.id && wreck.alive !== false && wreck.looted !== true)
      .map((wreck) => String(wreck.id)));
    let selected = currentSelection === undefined
      ? await this.readProductSalvageTargetId()
      : currentSelection;
    if (!liveIds.has(String(selected || ''))) {
      await this.cycleProductSalvageTarget();
      selected = await this.readProductSalvageTargetId();
    }
    if (!liveIds.has(String(selected || ''))) {
      throw new Error('Journey product salvage action did not select a live wreck');
    }
    return String(selected);
  }

  async refreshProductSalvageTarget(snapshot, retainedTargetId = null) {
    const selected = await this.readProductSalvageTargetId();
    const retained = (snapshot.world?.wrecks || []).find((wreck) => String(wreck?.id || '') === String(retainedTargetId || '')
      && wreck.alive !== false && wreck.looted !== true);
    if (retained && String(selected || '') === String(retainedTargetId)) return String(retainedTargetId);
    return this.adoptProductSalvageTarget(snapshot, selected);
  }

  async confirmExtractionThroughProductInput() {
    await this.releaseProductApproachInput();
    await this.serviceAuthorityFrame();
    const confirmable = await this.page.evaluate(
      () => window.__TEST_API?.getJourneyState?.()?.player?.portalInteraction?.ready === true,
    );
    if (!confirmable) throw new Error('Journey extraction confirmation requires a ready authority portal');
    await this.setHeldProductKey('Enter', true);
    try {
      await this.serviceAuthorityFrame();
    } finally {
      await this.setHeldProductKey('Enter', false);
      await this.serviceAuthorityFrame();
    }
  }

  async navigate(args = {}) {
    if (Number(args.durationMs) > 0 && !args.targetId && !args.targetPolicy) {
      const deadline = Date.now() + Math.max(100, Number(args.durationMs));
      while (Date.now() < deadline) {
        await this.sendInput({ moveX: 1, moveY: 0, thrust: 0.55 });
        await sleep(Math.max(50, Number(this.policy?.inputCadenceMs) || 120));
      }
      return this.sendInput({ brake: 1 });
    }
    const deadline = Date.now() + Math.max(1_000, Number(args.timeoutMs) || 45_000);
    const arrivalRadius = Math.max(0.01, Number(args.arrivalRadius) || (args.targetKind === 'portal' ? 0.05 : 0.07));
    const arrivalSpeed = Number(args.arrivalSpeed) || 0.08;
    this.lastNavigationSnapshot = null;
    const productExfil = String(args.targetPolicy || '').includes('exfil')
      || String(args.targetPolicy || '').includes('portal');
    const productSalvage = !productExfil && !String(args.targetPolicy || '').includes('well');
    const productApproach = productExfil || productSalvage;
    let retainedSalvageTargetId = null;
    try {
      while (Date.now() < deadline) {
        const snapshot = await this.snapshot();
        const player = await this.player(snapshot);
        if (!player || player.status !== 'alive') {
          if (args.allowTerminal && player && player.status !== 'alive') return { terminal: player.status };
          throw new Error('Journey navigation requires a live authoritative player');
        }
        if (productSalvage) {
          retainedSalvageTargetId = await this.refreshProductSalvageTarget(
            snapshot,
            retainedSalvageTargetId,
          );
        }
        const target = this.findTarget(snapshot, player, retainedSalvageTargetId
          ? { ...args, targetId: retainedSalvageTargetId }
          : args);
        if (!target) {
          if (String(args.targetPolicy || '') === 'next-available-exfil') {
            if (this.heldProductKeys.size > 0) await this.releaseProductApproachInput();
            await sleep(Math.max(50, Number(this.policy?.inputCadenceMs) || 120));
            continue;
          }
          throw new Error(`Journey target unavailable: ${args.targetId || args.targetKind || 'nearest'}`);
        }
        this.activeTarget = target.id;
        const worldScale = snapshot.session.worldScale;
        const dx = wrappedDelta(player.wx, target.wx, worldScale);
        const dy = wrappedDelta(player.wy, target.wy, worldScale);
        const distance = Math.hypot(dx, dy);
        const speed = Math.hypot(player.vx, player.vy);
        const navigationPolicy = String(args.policy || 'straight-line');
        this.lastNavigationSnapshot = buildNavigationSnapshot({
          snapshot,
          player,
          target,
          policy: navigationPolicy,
          arrivalRadius,
          arrivalSpeed,
        });
        if (navigationPolicy === 'slingshot' && distance <= (Number(args.arrivalRadius) || 0.12) && speed >= 0.08) {
          return { targetId: target.id, distance, speed, policy: navigationPolicy };
        }
        if (distance <= arrivalRadius && speed <= arrivalSpeed) {
          if (navigationPolicy === 'well-intercept') {
            await this.sendInput({ moveX: dx / Math.max(1e-9, distance), moveY: dy / Math.max(1e-9, distance), thrust: 0.9 });
            await sleep(Math.max(50, Number(this.policy?.inputCadenceMs) || 120));
            continue;
          }
          if (productApproach) {
            await this.setHeldProductKey('Enter', false);
            await this.applyProductApproachInput({ moveX: dx, moveY: dy, brake: 1, approach: false });
            await sleep(Math.max(50, Number(this.policy?.inputCadenceMs) || 120));
          } else {
            await this.sendInput({ brake: 1, approachTargetId: null });
          }
          return { targetId: target.id, distance, speed };
        }
        const magnitude = Math.max(1e-9, Math.hypot(dx, dy));
        const movement = {
          moveX: dx / magnitude,
          moveY: dy / magnitude,
          thrust: Math.max(0, Math.min(1, Number(args.thrust) || (navigationPolicy === 'slingshot' ? 0.88 : 0.72))),
          brake: 0,
        };
        if (productApproach) {
          await this.applyProductApproachInput({ ...movement, approach: productExfil });
        } else {
          await this.sendInput({
            ...movement,
            approachTargetId: null,
          });
        }
        await sleep(Math.max(50, Number(this.policy?.inputCadenceMs) || 120));
      }
      throw new Error(`Journey navigation timed out for ${this.activeTarget || args.targetKind || 'target'}`);
    } finally {
      if (productApproach) await this.releaseProductApproachInput();
    }
  }

  async dispatchAction(action, args = {}) {
    if (action === 'launch' || action === 'relaunch') {
      await this.enterRunThroughMenus(args.seed ?? null);
      const expectedSignature = args.signature || (action === 'launch' ? this.expectedRunRules.signature : null);
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        await this.serviceAuthorityFrame();
        const state = await this.page.evaluate(() => ({
          phase: window.__TEST_API?.getGamePhase?.(),
          authority: window.__TEST_API?.getNetworkState?.()?.remoteAuthorityActive,
          signatureId: window.__TEST_API?.getNetworkState?.()?.remoteSignature?.id || null,
          tick: window.__TEST_API?.getNetworkState?.()?.remoteTick ?? null,
          playerStatus: window.__TEST_API?.getJourneyState?.()?.player?.status || null,
        }));
        if (state.phase === 'playing' && state.authority && state.tick > 0 && state.playerStatus === 'alive') {
          if (expectedSignature && state.signatureId !== expectedSignature) {
            throw new Error(`Journey run rule signature mismatch: expected ${expectedSignature}, got ${state.signatureId}`);
          }
          this.emit('ui.playing');
          this.emit('run.started');
          return;
        }
        await sleep(100);
      }
      throw new Error('Journey launch timed out waiting for playable authority');
    }
    if (action === 'navigate' || action === 'selectApproachTarget' || action === 'salvage') return this.navigate(args);
    if (action === 'setMovementIntent') return this.sendInput(args);
    if (action === 'brake') return this.sendInput({ brake: args.intensity ?? 1, approachTargetId: args.targetId || null });
    if (action === 'grapple') {
      this.slingshotEdge += 1;
      return this.sendInput({ slingshot: true, slingshotEdges: [this.slingshotEdge] });
    }
    if (action === 'releaseGrapple') return this.sendInput({ slingshot: false });
    if (action === 'emitPulse') return this.sendInput({ pulse: true });
    if (action === 'confirmExtraction') return this.confirmExtractionThroughProductInput();
    if (action === 'pause' || action === 'resume') {
      await this.tap('Escape');
      const expectedPhase = action === 'pause' ? 'paused' : 'playing';
      await this.waitPage(
        () => this.page.evaluate(() => window.__TEST_API?.getGamePhase?.()),
        (phase) => phase === expectedPhase,
      );
      this.emit(action === 'pause' ? 'ui.pause.ready' : 'ui.playing');
      return;
    }
    if (action === 'exitRun') {
      const phase = await this.page.evaluate(() => window.__TEST_API?.getGamePhase?.());
      if (phase !== 'paused') await this.tap('Escape');
      await this.waitPage(() => this.page.evaluate(() => window.__TEST_API?.getGamePhase?.()), (value) => value === 'paused');
      await this.tap('ArrowDown');
      await this.tap('Enter');
      await this.tap('Enter');
      await this.waitPage(() => this.page.evaluate(() => window.__TEST_API?.getGamePhase?.()), (value) => value === 'title', 15_000);
      this.emit('ui.title.ready');
      return;
    }
    if (action === 'returnHome') {
      await this.continueTerminalToHome();
      this.emit('ui.home.ready');
      return;
    }
    if (action === 'recover') {
      await this.continueTerminalToHome();
      this.emit('ui.home.ready');
      return;
    }
    if (action === 'navigateHome') {
      const section = String(args.section || 'home');
      if (section === 'profile') {
        const phase = await this.phase();
        if (phase === 'title') {
          await sleep(650);
          await this.tap('Space');
        } else if (phase === 'home') {
          await this.tap('Escape');
        }
        await this.waitPage(() => this.phase(), (value) => value === 'profileSelect');
      } else if (section === 'results') {
        await this.waitPage(() => this.phase(),
          (value) => value === 'escaped' || value === 'dead', 15_000);
      } else {
        await this.ensureHome();
        const wanted = section === 'map-select' ? 'LAUNCH' : String(section).toUpperCase();
        const deadline = Date.now() + 10_000;
        let state = await this.page.evaluate(() => window.__TEST_API?.getHomeState?.());
        while (state?.phase === 'home' && state.tabName !== wanted && Date.now() < deadline) {
          const previousTab = state.tabIndex;
          state = await this.pressUntilTransition(
            'KeyE',
            () => this.page.evaluate(() => window.__TEST_API?.getHomeState?.()),
            (next) => next?.phase === 'home' && next.tabIndex !== previousTab,
            Math.max(1, deadline - Date.now()),
          );
        }
        if (state?.phase !== 'home' || state.tabName !== wanted) {
          throw new Error(`Journey UI transition timed out; last=${JSON.stringify(state)}`);
        }
        if (section === 'map-select') {
          await this.pressUntilTransition(
            'Enter',
            () => this.page.evaluate(() => window.__TEST_API?.getGamePhase?.()),
            (value) => value === 'mapSelect',
          );
        }
      }
      this.emit(`ui.${section === 'map-select' ? 'mapSelect' : section}.ready`);
      return;
    }
    if (action === 'selectRig') {
      await this.dispatchAction('navigateHome', { section: 'rig' });
      this.emit('ui.rig.ready');
      return;
    }
    if (action === 'openChronicle') {
      await this.dispatchAction('navigateHome', { section: 'chronicle' });
      this.emit('ui.chronicle.ready');
      return;
    }
    if (action === 'deletePilot') {
      const before = await this.page.evaluate(() => window.__TEST_API?.getProfileSlots?.());
      await this.tap('KeyX');
      await this.tap('ArrowRight');
      await this.tap('Space');
      await this.waitPage(() => this.page.evaluate(() => window.__TEST_API?.getProfileSlots?.()),
        (slots) => JSON.stringify(slots) !== JSON.stringify(before));
      this.emit('profile.pilotDeleted');
      this.emit('ui.profile.ready');
      return;
    }
    if (action === 'capture') {
      if (args.overlays === false) {
        await this.page.evaluate(() => window.__TEST_API?.setOverlayVisible?.(false));
      } else if (Array.isArray(args.overlays)) {
        await this.page.evaluate(() => window.__TEST_API?.setOverlayVisible?.(true));
      }
      fs.mkdirSync(this.artifactRoot, { recursive: true });
      const file = path.join(this.artifactRoot, `${safeName(args.name)}.png`);
      await this.page.screenshot({ path: file });
      this.evidencePaths.push(file);
      return file;
    }
    throw new RangeError(`Browser Journey driver does not implement action ${action}`);
  }

  async waitForEvent(type, { timeoutMs }) {
    const existing = this.events.find((event) => event.type === type && Number(event.journeySeq || 0) > this.syntheticEventCursor);
    if (existing) {
      this.syntheticEventCursor = existing.journeySeq;
      return existing;
    }
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await this.serviceAuthorityFrame();
      const events = await this.page.evaluate(() => window.__TEST_API?.getJourneyState?.()?.authorityEvents || []);
      const match = events.find((event) => Number(event.seq || 0) > this.eventCursor && event.type === type);
      if (match) {
        this.eventCursor = Number(match.seq || this.eventCursor);
        this.events.push(match);
        return match;
      }
      await sleep(100);
    }
    return null;
  }

  getAuthorityEvents() { return this.events; }
  getEvidencePaths() { return this.evidencePaths; }
  getActiveTarget() { return this.activeTarget; }
  getNavigationSnapshot() { return this.lastNavigationSnapshot; }
  getArtifactManifest() { return []; }
}

module.exports = {
  BrowserJourneyConditionReader,
  BrowserJourneyDriver,
  buildNavigationSnapshot,
  evaluateValues,
  productAimClientPoint,
  serviceAuthorityFrame,
};
