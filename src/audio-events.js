/**
 * Renderer-neutral translation from authoritative events to audio cues.
 * The adapter owns locality filtering and cue names; AudioEngine owns synthesis.
 */

import { CUE_SPECS } from './audio/cue-spec.js';

// Compatibility export for existing callers/tests. New code consumes CUE_SPECS.
export const EVENT_AUDIO_SPECS = CUE_SPECS;

const LOCAL_PLAYER_EVENTS = new Set([
  'player.loot',
  'player.slingshotEngaged',
  'player.slingshotReleased',
  'player.portalProximity',
  'player.portalConfirmed',
  'player.escaped',
  'player.scavengerBumped',
]);

function isLocalEvent(payload, clientId) {
  if (!clientId) return true;
  return Boolean(payload?.clientId) && payload.clientId === clientId;
}

export function cueForAuthoritativeEvent(event, { clientId = null } = {}) {
  if (!event || typeof event.type !== 'string') return null;
  const payload = event.payload || {};
  if (LOCAL_PLAYER_EVENTS.has(event.type) && !isLocalEvent(payload, clientId)) return null;

  switch (event.type) {
    case 'player.loot': return { cue: 'loot', payload };
    case 'player.slingshotEngaged': return { cue: 'slingshotEngage', payload };
    case 'player.slingshotReleased': return { cue: 'slingshotRelease', payload };
    case 'player.portalProximity': return payload.entered === false ? null : { cue: 'portalProximity', payload };
    case 'player.portalConfirmed': return { cue: 'portalConfirm', payload };
    case 'player.escaped': return { cue: 'extract', payload };
    case 'player.scavengerBumped': return { cue: 'scavengerBump', payload };
    case 'inhibitor.wake': return { cue: 'inhibitorWake', payload };
    case 'inhibitor.form':
      if (Number(payload.form) >= 3) return { cue: 'inhibitorVessel', payload };
      // Form 2 publishes a dedicated inhibitor.wake event immediately after
      // the form edge; leave that event as the single audible source.
      if (Number(payload.form) === 2) return null;
      if (Number(payload.form) === 1) return { cue: 'inhibitorGlitch', payload };
      return null;
    default:
      return null;
  }
}

/**
 * Weighted one-shot admission budget. A multi-note cue reserves the number of
 * source voices it schedules, so event bursts cannot grow the audio graph
 * without bound even when authoritative events arrive together.
 */
export class EventVoiceBudget {
  constructor(maxVoices = 16, specs = EVENT_AUDIO_SPECS) {
    this.maxVoices = Math.max(1, Math.floor(Number(maxVoices) || 16));
    this.specs = specs;
    this.leases = [];
    this.lastStartByCue = new Map();
  }

  reset() {
    this.leases.length = 0;
    this.lastStartByCue.clear();
  }

  activeVoices(now) {
    this.leases = this.leases.filter((lease) => lease.until > now);
    return this.leases.reduce((sum, lease) => sum + lease.voices, 0);
  }

  admit(cue, now) {
    const spec = this.specs[cue] || { maxVoices: 1, duration: 0.5, cooldown: 0, priority: 'world-detail' };
    const lastStart = this.lastStartByCue.get(cue) ?? -Infinity;
    if (now - lastStart < Math.max(0, spec.cooldown || 0)) return false;

    const voices = Math.max(1, Math.floor(spec.maxVoices ?? spec.voices ?? 1));
    const criticalReserve = Math.max(0, ...Object.values(this.specs)
      .filter((entry) => entry.priority === 'critical' || entry.critical)
      .map((entry) => Math.max(1, Math.floor(entry.maxVoices ?? entry.voices ?? 1))));
    const critical = spec.priority === 'critical' || spec.critical;
    const ceiling = critical
      ? this.maxVoices
      : Math.max(1, this.maxVoices - criticalReserve);
    if (this.activeVoices(now) + voices > ceiling) return false;

    this.lastStartByCue.set(cue, now);
    this.leases.push({ cue, voices, startedAt: now, until: now + Math.max(0.01, spec.duration || 0.5) });
    return true;
  }

  release(cue, startedAt) {
    const index = this.leases.findLastIndex((lease) => lease.cue === cue && lease.startedAt === startedAt);
    if (index < 0) return false;
    this.leases.splice(index, 1);
    const prior = this.leases.filter((lease) => lease.cue === cue).at(-1);
    if (prior) this.lastStartByCue.set(cue, prior.startedAt);
    else this.lastStartByCue.delete(cue);
    return true;
  }
}
