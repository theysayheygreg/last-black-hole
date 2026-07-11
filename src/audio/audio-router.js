import { cueForAuthoritativeEvent } from '../audio-events.js';
import { cueSpec } from './cue-spec.js';

const LOCAL_EVENT_CUES = Object.freeze({
  'player.pulse': 'pulse',
  'player.effectUsed:shieldBurst': 'shieldActivate',
  'player.effectUsed:timeSlowLocal': 'timeSlow',
  'player.effectUsed:breachFlare': 'breachFlare',
  'player.effectExpired:timeSlowLocal': 'timeSlowEnd',
  'player.shieldAbsorbed': 'shieldAbsorb',
  'player.died': 'death',
  'inhibitor.drainCargo': 'inhibitorDrain',
  'inhibitor.finalPortal': 'inhibitorFinalPortal',
  'star.consumed': 'starConsumed',
  'scavenger.consumed': 'scavDeath',
});

function eventKey(event) {
  const payload = event?.payload || {};
  if (event?.seq != null) return `${event.runId || payload.runId || 'run'}:${event.seq}`;
  return event?.id ? `${event.runId || payload.runId || 'run'}:${event.id}` : null;
}

/**
 * Sole presentation-audio endpoint. It dedupes transport events and never
 * turns snapshot state into an authoritative outcome.
 */
export class AudioRouter {
  constructor(audioEngine, { clientId = null, now = () => performance.now() } = {}) {
    this.audio = audioEngine;
    this.clientId = clientId;
    this.now = now;
    this.runId = null;
    this.seen = new Set();
    this.portalActive = false;
  }

  reset(runId = null) {
    this.runId = runId;
    this.seen.clear();
    this.portalActive = false;
    this.audio?.reset?.();
  }

  setClientId(clientId) { this.clientId = clientId || null; }

  authoritative(event, context = {}) {
    if (!event || typeof event.type !== 'string') return false;
    const key = eventKey(event);
    if (key && this.seen.has(key)) return false;
    if (key) this.seen.add(key);
    const translated = cueForAuthoritativeEvent(event, { clientId: this.clientId });
    const directCue = this._localEventCue(event);
    const mapped = translated?.cue || directCue;
    if (!mapped) return false;
    return this.play(mapped, translated?.payload || event.payload || {}, context);
  }

  local(id, payload = {}, context = {}) {
    const cue = typeof id === 'string' ? id : null;
    if (!cue || !cueSpec(cue)) return false;
    const presentationId = payload.presentationId || `${this.runId || 'local'}:${id}:${payload.seq ?? this.now()}`;
    if (this.seen.has(presentationId)) return false;
    this.seen.add(presentationId);
    return this.play(cue, payload, context);
  }

  portalProximity(active, payload = {}, context = {}) {
    const next = Boolean(active);
    if (next === this.portalActive) return false;
    this.portalActive = next;
    return next ? this.local('portalProximity', { ...payload, presentationId: payload.presentationId || `portal:${payload.portalId || 'unknown'}:enter` }, context) : false;
  }

  setPhase(phase) { this.audio?.setContext?.(phase); }

  play(cue, payload = {}, context = {}) {
    const spec = cueSpec(cue);
    if (!spec) return false;
    return Boolean(this.audio?.playEvent?.(cue, payload.wx, payload.wy, context.camX, context.camY, context.canvasW, context.canvasH));
  }

  _localEventCue(event) {
    const payload = event.payload || {};
    const local = !payload.clientId || payload.clientId === this.clientId;
    if (!local && event.type.startsWith('player.')) return null;
    if (event.type === 'player.effectUsed') return LOCAL_EVENT_CUES[`${event.type}:${payload.effectId}`] || null;
    if (event.type === 'player.effectExpired') return LOCAL_EVENT_CUES[`${event.type}:${payload.effectId}`] || null;
    return LOCAL_EVENT_CUES[event.type] || null;
  }
}
