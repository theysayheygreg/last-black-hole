import { CONFIG } from '../config.js';
import { seededUnit } from './deterministic.js';

const CUE_HANDLERS = Object.freeze({
  loot: (synth, now, vol, pan, bus) => synth._playLootChime(now, vol, pan, bus),
  slingshotEngage: (synth, now, vol, pan, bus) => synth._playSlingshotEngage(now, vol, pan, bus),
  slingshotRelease: (synth, now, vol, pan, bus) => synth._playSlingshotRelease(now, vol, pan, bus),
  portalProximity: (synth, now, vol, pan, bus) => synth._playPortalProximity(now, vol, pan, bus),
  portalReady: (synth, now, vol, pan, bus) => synth._setPortalReady(true, now, vol, pan, bus),
  portalAbort: (synth, now, vol, pan, bus) => synth._setPortalReady(false, now, vol, pan, bus),
  portalFinal: (synth, now, vol, pan, bus) => synth._playPortalDeath(now, vol, pan, bus),
  portalConfirm: (synth, now, vol, pan, bus) => synth._playPortalConfirm(now, vol, pan, bus),
  scavengerBump: (synth, now, vol, pan, bus) => synth._playScavengerBump(now, vol, pan, bus),
  inhibitorGlitch: (synth, now, vol, pan, bus) => synth._playInhibitorGlitch(now, vol, bus),
  pulse: (synth, now, vol, pan, bus) => synth._playPulse(now, vol, pan, bus),
  extract: (synth, now, vol, pan, bus) => synth._playExtract(now, vol, bus),
  death: (synth, now, vol, pan, bus) => synth._playWarning(now, CONFIG.audio.eventVolume, 92, bus),
  shieldActivate: (synth, now, vol, pan, bus) => synth._playShieldActivate(now, vol, bus),
  shieldAbsorb: (synth, now, vol, pan, bus) => synth._playShieldAbsorb(now, vol, bus),
  breachFlare: (synth, now, vol, pan, bus) => synth._playBreachFlare(now, vol, bus),
  hullWarning: (synth, now, vol, pan, bus) => synth._playWarning(now, vol, 146, bus),
  fuelWarning: (synth, now, vol, pan, bus) => synth._playWarning(now, vol, 118, bus),
  signalWarning: (synth, now, vol, pan, bus) => synth._playWarning(now, vol, 164, bus),
  pause: (synth, now, vol, pan, bus) => synth._playPause(now, vol, false, bus),
  resume: (synth, now, vol, pan, bus) => synth._playPause(now, vol, true, bus),
  results: (synth, now, vol, pan, bus) => synth._playResults(now, vol, bus),
  starConsumed: (synth, now, vol, pan, bus) => synth._playStarConsumed(now, vol, pan, bus),
  scavDeath: (synth, now, vol, pan, bus) => synth._playDebrisClatter(now, vol, pan, bus),
  inhibitorWake: (synth, now, vol, pan, bus) => synth._playInhibitorWake(now, vol, bus),
  inhibitorVessel: (synth, now, vol, pan, bus) => synth._playInhibitorVessel(now, vol, bus),
  inhibitorFinalPortal: (synth, now, vol, pan, bus) => synth._playExtract(now, vol * 0.6, bus),
  menuMove: (synth, now, vol, pan, bus) => synth._playMenuBlip(now, vol * 0.3, bus),
  menuConfirm: (synth, now, vol, pan, bus) => synth._playMenuConfirm(now, vol * 0.4, bus),
  menuBack: (synth, now, vol, pan, bus) => synth._playMenuBack(now, vol * 0.3, bus),
  tabSwitch: (synth, now, vol, pan, bus) => synth._playTabClick(now, vol * 0.3, bus),
  sellItem: (synth, now, vol, pan, bus) => synth._playCoinDrop(now, vol * 0.4, bus),
  equipItem: (synth, now, vol, pan, bus) => synth._playEquipLock(now, vol * 0.4, bus),
  upgrade: (synth, now, vol, pan, bus) => synth._playUpgrade(now, vol * 0.5, bus),
  cantAfford: (synth, now, vol, pan, bus) => synth._playErrorBuzz(now, vol * 0.3, bus),
  launch: (synth, now, vol, pan, bus) => synth._playLaunchSpool(now, vol * 0.5, bus),
});

export const SYNTHESIZED_CUES = Object.freeze(Object.keys(CUE_HANDLERS));

/** Owns bounded transient recipes and the one held portal-ready voice. */
export class CueSynthesis {
  constructor({ context, busGains, busDuckGains, variationSeed = 'local' }) {
    this.ctx = context;
    this.busGains = busGains;
    this.busDuckGains = busDuckGains;
    this._variationSeed = String(variationSeed);
    this._variationIndex = 0;
    this._duckRequests = new Map();
    this._portalReadyVoice = null;
  }

  play(type, now, vol, pan, bus) {
    const handler = CUE_HANDLERS[type];
    if (!handler) return false;
    handler(this, now, vol, pan, bus);
    return true;
  }

  setVariationSeed(seed = 'local') {
    this._variationSeed = String(seed);
    this._variationIndex = 0;
  }

  reset(now = this.ctx.currentTime) {
    this._duckRequests.clear();
    this.clearPortalReady(now);
    for (const gain of Object.values(this.busDuckGains || {})) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.value = 1;
    }
  }

  clearPortalReady(now = this.ctx.currentTime) {
    const held = this._portalReadyVoice;
    if (!held) return;
    const { osc, gain, voice } = held;
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.exponentialRampToValueAtTime(.001, now + .04);
      osc.onended = () => {
        try { osc.disconnect(); gain.disconnect(); voice.panner.disconnect(); } catch (e) {}
      };
      osc.stop(now + .05);
    } catch (e) {
      try { osc.disconnect(); gain.disconnect(); voice.panner.disconnect(); } catch (disconnectError) {}
    }
    this._portalReadyVoice = null;
  }

  createNoise(duration) {
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = seededUnit(this._variationSeed, this._variationIndex++ + i) * 2 - 1;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    return source;
  }

  /** SNES-style square with variable duty cycle. */
  createSquare(dutyCycle = 0.5) {
    const osc = this.ctx.createOscillator();
    const real = new Float32Array(32);
    const imag = new Float32Array(32);
    for (let n = 1; n < 32; n++) {
      imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * dutyCycle);
    }
    osc.setPeriodicWave(this.ctx.createPeriodicWave(real, imag, { disableNormalization: false }));
    return osc;
  }

  _createVoice(pan = 0, bus = 'world', { persistent = false } = {}) {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;
    gain.connect(panner);
    panner.connect(this.busGains[bus] || this.busGains.world);
    // Held voices own their lifecycle; one-shots retain defensive cleanup.
    const cleanup = persistent ? null : setTimeout(() => {
      try { gain.disconnect(); panner.disconnect(); } catch (e) {}
    }, 5000);
    return { gain, panner, _cleanup: cleanup, bus, persistent };
  }

  _duck(now, amount, duration, buses = ['ambient', 'world', 'player']) {
    const id = `${now}:${this._variationIndex++}`;
    this._duckRequests.set(id, { amount, until: now + duration, buses });
    for (const bus of buses) {
      // A separate stage prevents duck release from overwriting the adaptive bed.
      const gain = this.busDuckGains?.[bus]?.gain;
      if (!gain) continue;
      const active = [...this._duckRequests.values()].filter((request) => (
        request.buses.includes(bus) && request.until > now
      ));
      const floor = Math.min(...active.map((request) => request.amount), 1);
      const latest = Math.max(...active.map((request) => request.until), now);
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(floor, now + .015);
      gain.linearRampToValueAtTime(1, latest);
    }
    setTimeout(() => this._duckRequests.delete(id), Math.ceil(duration * 1000) + 20);
  }

  _setPortalReady(active, now, vol, pan, bus = 'world') {
    if (!active) {
      this.clearPortalReady(now);
      this._playPortalAbort(now, vol, 'ui');
      return;
    }
    if (this._portalReadyVoice) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 392;
    const voice = this._createVoice(pan, bus, { persistent: true });
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(.001, now);
    voice.gain.gain.linearRampToValueAtTime(vol * .09, now + .12);
    osc.start(now);
    this._portalReadyVoice = { osc, gain: voice.gain, voice };
  }

  _playPortalAbort(now, vol, bus = 'ui') {
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(392, now);
    osc.frequency.linearRampToValueAtTime(294, now + .18);
    const voice = this._createVoice(0, bus);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * .18, now);
    voice.gain.gain.exponentialRampToValueAtTime(.001, now + .22);
    osc.start(now);
    osc.stop(now + .24);
  }

  _playWarning(now, vol, base = 146, bus = 'critical') {
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.linearRampToValueAtTime(base * 15 / 16, now + .13);
    const voice = this._createVoice(0, bus);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * .28, now);
    voice.gain.gain.exponentialRampToValueAtTime(.001, now + .18);
    osc.start(now);
    osc.stop(now + .2);
  }

  _playPause(now, vol, resume, bus = 'ui') {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(resume ? 250 : 330, now);
    osc.frequency.linearRampToValueAtTime(resume ? 330 : 250, now + .16);
    const voice = this._createVoice(0, bus);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * .16, now);
    voice.gain.gain.exponentialRampToValueAtTime(.001, now + .23);
    osc.start(now);
    osc.stop(now + .25);
  }

  _playResults(now, vol, bus = 'ambient') {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(73, now);
    const voice = this._createVoice(0, bus);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * .2, now);
    voice.gain.gain.exponentialRampToValueAtTime(.001, now + .8);
    osc.start(now);
    osc.stop(now + .85);
  }

  _playLootChime(now, vol, pan, bus = 'world') {
    const freqs = [330, 485]; // Amber, deliberately narrow of a perfect fifth.
    for (let i = 0; i < freqs.length; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freqs[i];
      const voice = this._createVoice(pan, bus);
      osc.connect(voice.gain);
      voice.gain.gain.setValueAtTime(0, now + i * 0.08);
      voice.gain.gain.linearRampToValueAtTime(vol * 0.4, now + i * 0.08 + 0.02);
      voice.gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.25);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.3);
    }
  }

  _playSlingshotEngage(now, vol, pan, bus = 'world') {
    for (const [index, frequency] of [180, 270].entries()) {
      const osc = this.ctx.createOscillator();
      osc.type = index === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(frequency, now);
      osc.frequency.exponentialRampToValueAtTime(frequency * 1.7, now + 0.28);
      const voice = this._createVoice(pan, bus);
      osc.connect(voice.gain);
      voice.gain.gain.setValueAtTime(vol * (index === 0 ? 0.28 : 0.18), now);
      voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
      osc.start(now);
      osc.stop(now + 0.46);
    }
  }

  _playSlingshotRelease(now, vol, pan, bus = 'world') {
    const snap = this.createNoise(0.08);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1600;
    const noiseVoice = this._createVoice(pan, bus);
    snap.connect(filter);
    filter.connect(noiseVoice.gain);
    noiseVoice.gain.gain.setValueAtTime(vol * 0.35, now);
    noiseVoice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    snap.start(now);
    snap.stop(now + 0.09);

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.5);
    const voice = this._createVoice(pan, bus);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * 0.32, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc.start(now);
    osc.stop(now + 0.6);
  }

  _playPortalProximity(now, vol, pan, bus = 'world') {
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(330, now);
    osc.frequency.linearRampToValueAtTime(392, now + 0.18);
    const voice = this._createVoice(pan, bus);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * 0.12, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.start(now);
    osc.stop(now + 0.44);
  }

  _playPortalConfirm(now, vol, pan, bus = 'world') {
    for (const [index, frequency] of [392, 587].entries()) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = frequency;
      const voice = this._createVoice(pan, bus);
      osc.connect(voice.gain);
      const start = now + index * 0.09;
      voice.gain.gain.setValueAtTime(0, start);
      voice.gain.gain.linearRampToValueAtTime(vol * 0.22, start + 0.015);
      voice.gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.start(start);
      osc.stop(start + 0.4);
    }
  }

  _playScavengerBump(now, vol, pan, bus = 'world') {
    const impact = this.ctx.createOscillator();
    impact.type = 'sine';
    impact.frequency.setValueAtTime(95, now);
    impact.frequency.exponentialRampToValueAtTime(42, now + 0.22);
    const impactVoice = this._createVoice(pan, bus);
    impact.connect(impactVoice.gain);
    impactVoice.gain.gain.setValueAtTime(vol * 0.4, now);
    impactVoice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    impact.start(now);
    impact.stop(now + 0.3);

    const scrape = this.createNoise(0.12);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 720;
    filter.Q.value = 2.5;
    const scrapeVoice = this._createVoice(pan, bus);
    scrape.connect(filter);
    filter.connect(scrapeVoice.gain);
    scrapeVoice.gain.gain.setValueAtTime(vol * 0.22, now);
    scrapeVoice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    scrape.start(now);
    scrape.stop(now + 0.14);
  }

  _playInhibitorGlitch(now, vol, bus = 'world') {
    const noise = this.createNoise(0.12);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2400, now);
    filter.frequency.exponentialRampToValueAtTime(680, now + 0.1);
    filter.Q.value = 10;
    const voice = this._createVoice(0, bus);
    noise.connect(filter);
    filter.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * 0.28, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    noise.start(now);
    noise.stop(now + 0.15);

    const osc = this.createSquare(0.2);
    osc.frequency.setValueAtTime(910, now);
    osc.frequency.exponentialRampToValueAtTime(137, now + 0.25);
    const toneVoice = this._createVoice(0, bus);
    osc.connect(toneVoice.gain);
    toneVoice.gain.gain.setValueAtTime(vol * 0.12, now);
    toneVoice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.34);
  }

  _playPulse(now, vol, pan, bus = 'world') {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.3);
    const voice = this._createVoice(pan, bus);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * 0.8, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.start(now);
    osc.stop(now + 0.55);

    const noise = this.createNoise(0.15);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 1;
    const noiseVoice = this._createVoice(pan, bus);
    noise.connect(filter);
    filter.connect(noiseVoice.gain);
    noiseVoice.gain.gain.setValueAtTime(vol * 0.5, now);
    noiseVoice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    noise.start(now);
    noise.stop(now + 0.15);
    this._duck(now, CONFIG.audio.pulseDuckAmount, CONFIG.audio.pulseDuckDuration);
  }

  _playPortalDeath(now, vol, pan, bus = 'world') {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.8);
    const voice = this._createVoice(pan, bus);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * 0.4, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    osc.start(now);
    osc.stop(now + 1.0);
  }

  _playExtract(now, vol, bus = 'world') {
    const base = 220;
    for (let i = 0; i < 5; i++) {
      const osc = this.createSquare(0.25);
      osc.frequency.value = base * (i + 1);
      const voice = this._createVoice(0, bus);
      osc.connect(voice.gain);
      const start = now + i * 0.15;
      voice.gain.gain.setValueAtTime(0, start);
      voice.gain.gain.linearRampToValueAtTime(vol * 0.3 / (i + 1), start + 0.1);
      voice.gain.gain.exponentialRampToValueAtTime(0.001, start + 2.0);
      osc.start(start);
      osc.stop(start + 2.1);
    }
  }

  _playShieldActivate(now, vol, bus = 'world') {
    for (const detune of [-5, 5]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.linearRampToValueAtTime(800, now + 0.3);
      osc.detune.value = detune;
      const voice = this._createVoice(0, bus);
      osc.connect(voice.gain);
      voice.gain.gain.setValueAtTime(vol * 0.3, now);
      voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.55);
    }
  }

  _playShieldAbsorb(now, vol, bus = 'world') {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);
    const voice = this._createVoice(0, bus);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * 0.6, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.35);

    const noise = this.createNoise(0.08);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000;
    const noiseVoice = this._createVoice(0, bus);
    noise.connect(filter);
    filter.connect(noiseVoice.gain);
    noiseVoice.gain.gain.setValueAtTime(vol * 0.4, now);
    noiseVoice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    noise.start(now);
    noise.stop(now + 0.1);
  }

  _playBreachFlare(now, vol, bus = 'world') {
    const noise = this.createNoise(0.4);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400;
    filter.frequency.linearRampToValueAtTime(2000, now + 0.3);
    filter.Q.value = 3;
    const voice = this._createVoice(0, bus);
    noise.connect(filter);
    filter.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * 0.3, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    noise.start(now);
    noise.stop(now + 0.45);
  }

  _playStarConsumed(now, vol, pan, bus = 'world') {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 1.0);
    const voice = this._createVoice(pan, bus);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * 0.7, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    osc.start(now);
    osc.stop(now + 1.3);

    const noise = this.createNoise(0.3);
    const noiseVoice = this._createVoice(pan, bus);
    noise.connect(noiseVoice.gain);
    noiseVoice.gain.gain.setValueAtTime(vol * 0.5, now);
    noiseVoice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    noise.start(now);
    noise.stop(now + 0.3);
    this._duck(now, 0.2, 0.8);
  }

  _playDebrisClatter(now, vol, pan, bus = 'world') {
    for (let i = 0; i < 4; i++) {
      const noise = this.createNoise(0.05);
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 500 + seededUnit(this._variationSeed, this._variationIndex++) * 2000;
      filter.Q.value = 2;
      const offset = (seededUnit(this._variationSeed, this._variationIndex++) - 0.5) * 0.3;
      const voice = this._createVoice(Math.max(-1, Math.min(1, pan + offset)), bus);
      noise.connect(filter);
      filter.connect(voice.gain);
      const start = now + i * 0.04;
      voice.gain.gain.setValueAtTime(vol * 0.2, start);
      voice.gain.gain.exponentialRampToValueAtTime(0.001, start + 0.04);
      noise.start(start);
      noise.stop(start + 0.06);
    }
  }

  _playInhibitorWake(now, vol, bus = 'world') {
    const noise = this.createNoise(0.5);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(220, now + 0.45);
    filter.Q.value = 8;
    const voice = this._createVoice(0, bus);
    noise.connect(filter);
    filter.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * 0.45, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    noise.start(now);
    noise.stop(now + 0.6);
    this._duck(now, 0.45, 0.35);
  }

  _playInhibitorVessel(now, vol, bus = 'world') {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(56, now);
    osc.frequency.exponentialRampToValueAtTime(24, now + 1.1);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 480;
    filter.Q.value = 3;
    const voice = this._createVoice(0, bus);
    osc.connect(filter);
    filter.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * 0.7, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    osc.start(now);
    osc.stop(now + 1.25);
    this._duck(now, 0.28, 0.8);
  }

  _playMenuBlip(now, vol, bus = 'world') {
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 720;
    const voice = this._createVoice(0, bus);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  _playMenuConfirm(now, vol, bus = 'world') {
    const freqs = [294, 392]; // Cyan perfect-fourth route cell.
    for (let i = 0; i < freqs.length; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freqs[i];
      const voice = this._createVoice(0, bus);
      osc.connect(voice.gain);
      voice.gain.gain.setValueAtTime(0, now + i * 0.06);
      voice.gain.gain.linearRampToValueAtTime(vol, now + i * 0.06 + 0.01);
      voice.gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.15);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.18);
    }
  }

  _playMenuBack(now, vol, bus = 'world') {
    const osc = this.createSquare(0.25);
    osc.frequency.setValueAtTime(1047, now);
    osc.frequency.exponentialRampToValueAtTime(784, now + 0.08);
    const voice = this._createVoice(0, bus);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  _playTabClick(now, vol, bus = 'world') {
    const osc = this.createSquare(0.5);
    osc.frequency.value = 2000;
    const voice = this._createVoice(0, bus);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol, now);
    voice.gain.gain.setValueAtTime(0, now + 0.015);
    osc.start(now);
    osc.stop(now + 0.02);
  }

  _playCoinDrop(now, vol, bus = 'world') {
    const osc = this.createSquare(0.125);
    osc.frequency.setValueAtTime(3000, now);
    osc.frequency.exponentialRampToValueAtTime(1500, now + 0.15);
    const voice = this._createVoice(0, bus);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  _playEquipLock(now, vol, bus = 'world') {
    const osc = this.createSquare(0.5);
    osc.frequency.value = 800;
    const voice = this._createVoice(0, bus);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol, now);
    voice.gain.gain.setValueAtTime(vol * 0.3, now + 0.02);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  _playUpgrade(now, vol, bus = 'world') {
    const freqs = [330, 495]; // Amber material interval.
    for (let i = 0; i < freqs.length; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freqs[i];
      const voice = this._createVoice(0, bus);
      osc.connect(voice.gain);
      const start = now + i * 0.07;
      voice.gain.gain.setValueAtTime(0, start);
      voice.gain.gain.linearRampToValueAtTime(vol, start + 0.015);
      voice.gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
      osc.start(start);
      osc.stop(start + 0.25);
    }
  }

  _playErrorBuzz(now, vol, bus = 'world') {
    const osc = this.createSquare(0.5);
    osc.frequency.value = 150;
    const voice = this._createVoice(0, bus);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol, now);
    voice.gain.gain.setValueAtTime(0, now + 0.06);
    voice.gain.gain.setValueAtTime(vol, now + 0.1);
    voice.gain.gain.setValueAtTime(0, now + 0.16);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  _playLaunchSpool(now, vol, bus = 'world') {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.6);
    const voice = this._createVoice(0, bus);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * 0.3, now);
    voice.gain.gain.linearRampToValueAtTime(vol * 0.5, now + 0.4);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    osc.start(now);
    osc.stop(now + 0.75);
  }
}
