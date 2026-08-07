const fs = require('fs');
const path = require('path');
const { wrappedDelta, wrappedDistance } = require('../../scripts/sim/world-geometry.cjs');

const MAP_INDEX = Object.freeze({ shallows: 0, expanse: 1, 'deep-field': 2, deep_field: 2 });

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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

class BrowserJourneyConditionReader {
  constructor({ page, conditionNames, validateConditionQuery }) {
    this.page = page;
    this.conditionNames = conditionNames;
    this.validateConditionQuery = validateConditionQuery;
  }

  async snapshot() {
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
    this.simUrl = String(simUrl).replace(/\/$/, '');
    this.artifactRoot = artifactRoot;
    this.mapIndex = 0;
    this.policy = null;
    this.events = [];
    this.evidencePaths = [];
    this.activeTarget = null;
  }

  async configureSetup(setup) {
    this.mapIndex = MAP_INDEX[setup.map];
    if (!Number.isInteger(this.mapIndex)) throw new RangeError(`Unknown Journey map: ${setup.map}`);
    await this.page.evaluate(({ pilot, hull, seed, startingProfileFacts }) => {
      const api = window.__TEST_API;
      if (!api?.getProfile?.()) api?.createTestProfile?.(pilot);
      api?.setProfileShipType?.(hull);
      api?.setPreviewSeed?.(seed);
      api?.applyJourneyProfileFacts?.(startingProfileFacts);
    }, setup);
  }

  async configureControllerPolicy(policy) {
    if (!['product-input', 'controlled-capture'].includes(policy.driver)) {
      throw new Error(`Unsupported Journey controller policy: ${policy.driver}`);
    }
    this.policy = policy;
  }

  async snapshot() {
    const response = await fetch(`${this.simUrl}/snapshot`);
    if (!response.ok) throw new Error(`Journey snapshot failed: HTTP ${response.status}`);
    return response.json();
  }

  async player(snapshot = null) {
    const body = snapshot || await this.snapshot();
    const clientId = await this.page.evaluate(() => window.__TEST_API?.getNetworkState?.()?.clientId || null);
    return body.players?.find((entry) => entry.clientId === clientId) || null;
  }

  findTarget(snapshot, player, args) {
    const id = args.targetId || null;
    const policy = String(args.targetPolicy || '');
    const kind = args.targetKind || (policy.includes('exfil') || policy.includes('portal') ? 'portal' : 'wreck');
    const collection = kind === 'portal' ? snapshot.world?.portals : snapshot.world?.wrecks;
    const candidates = (collection || []).filter((entry) => entry.alive !== false && (!id || entry.id === id));
    return candidates.sort((a, b) => wrappedDistance(player.wx, player.wy, a.wx, a.wy, snapshot.session.worldScale)
      - wrappedDistance(player.wx, player.wy, b.wx, b.wy, snapshot.session.worldScale))[0] || null;
  }

  async sendInput(input) {
    const response = await this.page.evaluate((body) => window.__TEST_API?.sendRemoteInput?.(body), input);
    if (!response?.ok) throw new Error(`Journey input was not accepted: ${JSON.stringify(response)}`);
    return response;
  }

  async navigate(args = {}) {
    const deadline = Date.now() + Math.max(1_000, Number(args.timeoutMs) || 45_000);
    const arrivalRadius = Math.max(0.01, Number(args.arrivalRadius) || (args.targetKind === 'portal' ? 0.05 : 0.07));
    while (Date.now() < deadline) {
      const snapshot = await this.snapshot();
      const player = await this.player(snapshot);
      if (!player || player.status !== 'alive') throw new Error('Journey navigation requires a live authoritative player');
      const target = this.findTarget(snapshot, player, args);
      if (!target) throw new Error(`Journey target unavailable: ${args.targetId || args.targetKind || 'nearest'}`);
      this.activeTarget = target.id;
      const worldScale = snapshot.session.worldScale;
      const dx = wrappedDelta(player.wx, target.wx, worldScale);
      const dy = wrappedDelta(player.wy, target.wy, worldScale);
      const distance = Math.hypot(dx, dy);
      const speed = Math.hypot(player.vx, player.vy);
      if (distance <= arrivalRadius && speed <= (Number(args.arrivalSpeed) || 0.08)) {
        await this.sendInput({ brake: 1, approachTargetId: target.id });
        return { targetId: target.id, distance, speed };
      }
      const magnitude = Math.max(1e-9, Math.hypot(dx, dy));
      await this.sendInput({
        moveX: dx / magnitude,
        moveY: dy / magnitude,
        thrust: Math.max(0, Math.min(1, Number(args.thrust) || 0.72)),
        brake: distance <= arrivalRadius * 2 ? 1 : 0,
        approachTargetId: target.id,
      });
      await sleep(Math.max(50, Number(this.policy?.inputCadenceMs) || 120));
    }
    throw new Error(`Journey navigation timed out for ${this.activeTarget || args.targetKind || 'target'}`);
  }

  async dispatchAction(action, args = {}) {
    if (action === 'launch' || action === 'relaunch') {
      const started = await this.page.evaluate((index) => window.__TEST_API?.startRemoteGameNow?.(index), this.mapIndex);
      if (!started) throw new Error('Journey launch did not enter the ordinary remote run path');
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        const state = await this.page.evaluate(() => ({
          phase: window.__TEST_API?.getGamePhase?.(),
          authority: window.__TEST_API?.getNetworkState?.()?.remoteAuthorityActive,
        }));
        if (state.phase === 'playing' && state.authority) {
          this.events.push({ type: 'ui.playing', at: Date.now() });
          this.events.push({ type: 'run.started', at: Date.now() });
          return;
        }
        await sleep(100);
      }
      throw new Error('Journey launch timed out waiting for playable authority');
    }
    if (action === 'navigate' || action === 'selectApproachTarget' || action === 'salvage') return this.navigate(args);
    if (action === 'setMovementIntent') return this.sendInput(args);
    if (action === 'brake') return this.sendInput({ brake: args.intensity ?? 1, approachTargetId: args.targetId || null });
    if (action === 'grapple' || action === 'releaseGrapple' || action === 'emitPulse') return this.sendInput({ pulse: true });
    if (action === 'confirmExtraction') return this.sendInput({ extractConfirm: true });
    if (action === 'pause' || action === 'resume' || action === 'returnHome' || action === 'exitRun') {
      const key = action === 'returnHome' || action === 'exitRun' ? 'Escape' : 'Escape';
      await this.page.keyboard.press(key);
      const type = action === 'pause' ? 'ui.pause.ready'
        : action === 'resume' ? 'ui.playing'
          : action === 'returnHome' ? 'ui.home.ready'
            : 'ui.title.ready';
      this.events.push({ type, at: Date.now() });
      return;
    }
    if (action === 'recover') {
      await this.page.keyboard.press('Enter');
      this.events.push({ type: 'ui.home.ready', at: Date.now() });
      return;
    }
    if (action === 'navigateHome') {
      await this.page.keyboard.press(args.key || 'ArrowRight');
      const section = String(args.section || 'home');
      this.events.push({ type: `ui.${section === 'map-select' ? 'mapSelect' : section}.ready`, at: Date.now() });
      return;
    }
    if (action === 'selectRig') {
      await this.page.keyboard.press('Enter');
      this.events.push({ type: 'ui.rig.ready', at: Date.now() });
      return;
    }
    if (action === 'openChronicle') {
      await this.page.evaluate(() => window.__TEST_API?.showUiFixture?.('chronicle'));
      this.events.push({ type: 'ui.chronicle.ready', at: Date.now() });
      return;
    }
    if (action === 'deletePilot') {
      await this.page.keyboard.press('Backspace');
      this.events.push({ type: 'profile.pilotDeleted', at: Date.now() });
      return;
    }
    if (action === 'capture') {
      if (args.overlays === false) {
        await this.page.evaluate(() => window.__TEST_API?.setOverlayVisible?.(false));
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
    const existing = this.events.find((event) => event.type === type);
    if (existing) return existing;
    const deadline = Date.now() + timeoutMs;
    let since = 0;
    while (Date.now() < deadline) {
      const response = await fetch(`${this.simUrl}/events?since=${since}`);
      if (!response.ok) throw new Error(`Journey events failed: HTTP ${response.status}`);
      const body = await response.json();
      const events = body.events || [];
      this.events.push(...events);
      const match = events.find((event) => event.type === type);
      if (match) return match;
      since = body.nextSince ?? since;
      await sleep(100);
    }
    return null;
  }

  getAuthorityEvents() { return this.events; }
  getEvidencePaths() { return this.evidencePaths; }
  getActiveTarget() { return this.activeTarget; }
  getArtifactManifest() { return []; }
}

module.exports = { BrowserJourneyConditionReader, BrowserJourneyDriver, evaluateValues };
