import { AUDIO_BUSES, cueSpec } from './cue-spec.js';

const DEFAULT_CAPS = Object.freeze({ ambient: 6, world: 6, player: 4, ui: 2, critical: 5, transient: 16 });

/** Bounded bus admission shared by Web Audio and deterministic tests. */
export class AudioMixer {
  constructor({ caps = {}, now = () => performance.now() / 1000 } = {}) {
    this.caps = { ...DEFAULT_CAPS, ...caps };
    this.now = now;
    this.leases = [];
    this.stats = { admitted: 0, dropped: 0, drops: {} };
  }

  reset() { this.leases.length = 0; this.stats = { admitted: 0, dropped: 0, drops: {} }; }
  active(now = this.now()) {
    this.leases = this.leases.filter((lease) => lease.until > now);
    return Object.fromEntries(AUDIO_BUSES.map((bus) => [bus, this.leases.filter((lease) => lease.bus === bus).reduce((sum, lease) => sum + lease.voices, 0)]));
  }
  admit(cue, now = this.now()) {
    const spec = cueSpec(cue) || { bus: 'world', maxVoices: 1, duration: 0.5, priority: 'world-detail' };
    const active = this.active(now);
    const used = active[spec.bus] || 0;
    if (used + spec.maxVoices > this.caps[spec.bus]) return this._drop(`bus:${spec.bus}`);
    const transient = this.leases.reduce((sum, lease) => sum + lease.voices, 0);
    if (transient + spec.maxVoices > this.caps.transient && spec.priority !== 'critical') return this._drop('transient');
    this.leases.push({ cue, bus: spec.bus, voices: spec.maxVoices, until: now + spec.duration });
    this.stats.admitted += 1;
    return true;
  }
  snapshot(now = this.now()) { return { active: this.active(now), admitted: this.stats.admitted, dropped: this.stats.dropped, drops: { ...this.stats.drops } }; }
  _drop(reason) { this.stats.dropped += 1; this.stats.drops[reason] = (this.stats.drops[reason] || 0) + 1; return false; }
}
