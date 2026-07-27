/**
 * audio.js — SNES-flavored spatial audio engine.
 *
 * Signal chain: voices → duckGain → snesFilter (LPF stack) → crusher → echo → master
 *
 * SNES character comes from three layers:
 *   1. Stacked low-pass filters (BRR compression + Gaussian interpolation roll-off)
 *   2. Bit-crush waveshaper (quantization artifacts)
 *   3. Feedback delay with darkening filter (SPC700 echo)
 *
 * Context-aware: title drone vs gameplay drone vs menu silence.
 * All sounds are Web Audio oscillator/noise synthesis — no sample files.
 */

import { CONFIG } from './config.js';
import { worldToScreen, worldDistance } from './coords.js';
import { EventVoiceBudget } from './audio-events.js';
import { AudioMixer } from './audio/mixer.js';
import { movementAudioLevels, resolveMovementAudioState } from './audio/movement-state.js';
import { cueSpec } from './audio/cue-spec.js';
import { AudioTraceCapture } from './audio/capture.js';
import { bedTarget, normalizeBedState } from './audio/adaptive-bed.js';
import { CueSynthesis } from './audio/cue-synthesis.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.initiated = false;
    this.drone = null;
    this.inhibitorVoice = null;
    this.wellVoices = [];
    this.duckGain = null;
    this._audioState = 'silent';
    this._lastDistortionAmount = -1; // cache to avoid per-frame allocation
    this._eventBudget = new EventVoiceBudget(CONFIG.audio?.maxEventVoices ?? 16);
    this._mixer = new AudioMixer({ caps: CONFIG.audio?.voiceCaps });
    this._controlAccumulator = 0;
    this._movementState = 'idle';
    this._movementLastUpdate = -Infinity;
    this._movementVoice = null;
    this.busGains = null;
    this.busDuckGains = null;
    this._variationSeed = 'local';
    this._trace = new AudioTraceCapture('local');
    this._cueSynthesis = null;
    this._mix = { masterVolume: CONFIG.audio.masterVolume, effectsVolume: CONFIG.audio.effectsVolume, uiVolume: CONFIG.audio.uiVolume, muted: false };
  }

  getDiagnostics() {
    return {
      phase: this._audioState,
      movement: { state: this._movementState, persistentVoices: this._movementVoice ? 2 : 0 },
      mixer: this._mixer.snapshot(this.ctx?.currentTime ?? 0),
      buses: Object.fromEntries(Object.entries(this.busGains || {}).map(([name, gain]) => [name, gain.gain.value])),
      ducking: Object.fromEntries(Object.entries(this.busDuckGains || {}).map(([name, gain]) => [name, gain.gain.value])),
      trace: this._trace.manifest(),
    };
  }

  // ---- Lifecycle ----

  init() {
    if (this.initiated) return;
    if (!CONFIG.audio) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.initiated = true;

    // Physical bus topology: each semantic bus owns a gain stage before shared character/safety.
    this.master = this.ctx.createGain();
    this.master.gain.value = this._effectiveMasterVolume();
    this._safety = this.ctx.createDynamicsCompressor();
    this._safety.threshold.value = -10; this._safety.knee.value = 18; this._safety.ratio.value = 8;
    this._safety.attack.value = 0.003; this._safety.release.value = 0.18;
    this.master.connect(this._safety); this._safety.connect(this.ctx.destination);
    this.busGains = Object.fromEntries(['ambient', 'world', 'player', 'ui', 'critical'].map((bus) => {
      const gain = this.ctx.createGain(); gain.gain.value = 1; return [bus, gain];
    }));
    this.busDuckGains = Object.fromEntries(['ambient', 'world', 'player', 'ui', 'critical'].map((bus) => {
      const gain = this.ctx.createGain(); gain.gain.value = 1; return [bus, gain];
    }));
    this.duckGain = this.ctx.createGain();
    for (const bus of Object.keys(this.busGains)) {
      this.busGains[bus].connect(this.busDuckGains[bus]);
      this.busDuckGains[bus].connect(this.duckGain);
    }

    // SNES SPC700 emulation — three stacked processing stages:
    //
    // Stage 1: BRR compression roll-off (11kHz)
    // The SNES stored all samples in BRR (4-bit ADPCM), which loses high-frequency
    // detail. This LPF simulates that lossy compression warmth.
    this._brrFilter = this.ctx.createBiquadFilter();
    this._brrFilter.type = 'lowpass';
    this._brrFilter.frequency.value = 11000;  // effective BRR bandwidth
    this._brrFilter.Q.value = 0.5;           // gentle slope, no resonance peak

    // Stage 2: Gaussian interpolation roll-off (9.5kHz)
    // The SPC700 DSP uses 4-point Gaussian interpolation when resampling,
    // which acts as an additional soft LPF. Stacking two LPFs gives the
    // characteristic "warm but muffled" SNES sound.
    this._gaussFilter = this.ctx.createBiquadFilter();
    this._gaussFilter.type = 'lowpass';
    this._gaussFilter.frequency.value = 9500;  // SNES effective bandwidth ~10kHz
    this._gaussFilter.Q.value = 0.707;        // Butterworth (maximally flat)

    // Stage 3: Bit crush (12-bit effective via WaveShaperNode staircase)
    // BRR compression reduces effective bit depth from 16 to ~12 bits.
    // This adds subtle quantization artifacts without AudioWorklet overhead.
    this._crusher = this.ctx.createWaveShaper();
    this._crusher.curve = this._makeBitCrushCurve(12);
    this._crusher.oversample = 'none';  // don't smooth the steps — we want the crunch

    // SPC700 echo — 8-tap FIR approximated as feedback delay with darkening filter.
    // Real SNES echo had max ~240ms delay with configurable FIR coefficients.
    // Most games used low-pass-heavy coefficients, making each echo repeat darker.
    this._echoDelay = this.ctx.createDelay(0.25);
    this._echoDelay.delayTime.value = 0.07;  // 70ms — common SNES echo timing
    this._echoFeedback = this.ctx.createGain();
    this._echoFeedback.gain.value = 0.3;     // echo decay per repeat (~-10dB)
    this._echoLPF = this.ctx.createBiquadFilter();
    this._echoLPF.type = 'lowpass';
    this._echoLPF.frequency.value = 5000;    // each echo repeat loses treble (darkening)
    this._echoLPF.Q.value = 0.5;
    this._echoWet = this.ctx.createGain();
    this._echoWet.gain.value = 0.2;          // 20% wet — SNES echo was usually subtle
    this._echoDry = this.ctx.createGain();
    this._echoDry.gain.value = 0.8;          // 80% dry signal

    // Wire the chain
    this.duckGain.connect(this._brrFilter);
    this._brrFilter.connect(this._gaussFilter);
    this._gaussFilter.connect(this._crusher);

    // Dry path
    this._crusher.connect(this._echoDry);
    this._echoDry.connect(this.master);

    // Wet path (echo with feedback)
    this._crusher.connect(this._echoDelay);
    this._echoDelay.connect(this._echoLPF);
    this._echoLPF.connect(this._echoFeedback);
    this._echoFeedback.connect(this._echoDelay);
    this._echoDelay.connect(this._echoWet);
    this._echoWet.connect(this.master);

    this._cueSynthesis = new CueSynthesis({
      context: this.ctx,
      busGains: this.busGains,
      busDuckGains: this.busDuckGains,
      variationSeed: this._variationSeed,
    });
    this._initDrone();
    this._initInhibitorVoice();
    this._initWellVoices(2);
    this._initMovementVoice();
  }

  reset() {
    this._eventBudget.reset();
    this._trace.reset(this._variationSeed, this.ctx?.currentTime ?? 0);
    this._mixer.reset();
    this._controlAccumulator = 0;
    this._movementState = 'idle';
    this._movementLastUpdate = -Infinity;
    if (!this.initiated) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.value = this._effectiveMasterVolume();
    this._cueSynthesis.reset(now);
    if (this.drone) {
      this.drone.osc.frequency.cancelScheduledValues(now);
      this.drone.osc.frequency.value = CONFIG.audio.droneBaseFreq;
      this.drone.subOsc.frequency.cancelScheduledValues(now);
      this.drone.subOsc.frequency.value = CONFIG.audio.droneBaseFreq * 0.5;
      this.drone.fifthOsc.frequency.cancelScheduledValues(now);
      this.drone.fifthOsc.frequency.value = CONFIG.audio.droneBaseFreq * 1.5;
      this.drone.gain.gain.cancelScheduledValues(now);
      this.drone.gain.gain.value = CONFIG.audio.droneVolume;
    }
    for (const v of this.wellVoices) {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.value = 0;
    }
    if (this.inhibitorVoice) {
      this.inhibitorVoice.gain.gain.cancelScheduledValues(now);
      this.inhibitorVoice.gain.gain.value = 0;
    }
    if (this.duckGain) {
      this.duckGain.gain.cancelScheduledValues(now);
      this.duckGain.gain.value = 1;
    }
    this._setMovementVoice({ active: false }, now, 0.06);
  }

  /** Crossfade five adaptive beds. Presentation only; authority still owns outcomes. */
  setContext(state) {
    if (!this.initiated) return;
    this._audioState = normalizeBedState(state);
    const now = this.ctx.currentTime;
    const target = bedTarget(this._audioState);
    // Death owns a deliberate master fade. Every other phase explicitly
    // restores the mix so returning Home cannot inherit terminal silence.
    if (this.master && this._audioState !== 'terminal-linger') {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(this._effectiveMasterVolume(), now + Math.min(target.ramp, 0.12));
    }
    for (const [bus, value] of Object.entries(target)) {
      if (bus === 'ramp' || !this.busGains?.[bus]) continue;
      const gain = this.busGains[bus].gain;
      gain.cancelScheduledValues(now); gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(value, now + target.ramp);
    }
    const gameplay = this._audioState === 'gameplay-pressure';
    if (this.drone) {
      const freq = gameplay ? CONFIG.audio.droneBaseFreq : this._audioState === 'title-terminal' ? 40 : 32;
      this.drone.osc.frequency.linearRampToValueAtTime(freq, now + target.ramp);
      this.drone.subOsc.frequency.linearRampToValueAtTime(freq * .5, now + target.ramp);
      this.drone.fifthOsc.frequency.linearRampToValueAtTime(freq * 1.5, now + target.ramp);
      this.drone.gain.gain.linearRampToValueAtTime(CONFIG.audio.droneVolume * (gameplay ? 1 : .7), now + target.ramp);
    }
    for (const voice of this.wellVoices) if (!gameplay) voice.gain.gain.linearRampToValueAtTime(0, now + target.ramp);
    this._setMovementVoice({ active: gameplay }, now, target.ramp);
  }

  setVariationSeed(seed = 'local') {
    this._variationSeed = String(seed);
    this._cueSynthesis?.setVariationSeed(this._variationSeed);
    this._trace.reset(this._variationSeed, this.ctx?.currentTime ?? 0);
  }
  getCaptureManifest() { return this._trace.manifest(); }
  _effectiveMasterVolume() { return this._mix.muted ? 0 : this._mix.masterVolume; }
  setMixSettings(settings = {}) {
    for (const key of ['masterVolume', 'effectsVolume', 'uiVolume', 'muted']) {
      if (Object.hasOwn(settings, key)) this._mix[key] = settings[key];
    }
    if (this.master && this._audioState !== 'terminal-linger') {
      this.master.gain.value = this._effectiveMasterVolume();
    }
  }

  /**
   * Update the bounded player movement layer from delivered movement state.
   * Callers may invoke this at render cadence; audio internally accepts at
   * most the configured control rate and ramps one persistent voice.
   */
  updateMovementState(state = {}) {
    if (!this.initiated || !CONFIG.audio.enabled) return false;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const now = this.ctx.currentTime;
    const interval = 1 / Math.max(1, CONFIG.audio.controlUpdateHz || 15);
    if (now - this._movementLastUpdate < interval) return false;
    this._movementLastUpdate = now;
    const next = resolveMovementAudioState(state, this._movementState);
    const changed = next !== this._movementState;
    this._movementState = next;
    this._setMovementVoice({ ...state, active: state.active !== false, state: next }, now, changed ? 0.08 : 0.12);
    return true;
  }

  // ---- Per-frame update ----

  update(dt, wells, ship, camX, camY, canvasW, canvasH, runElapsed, runDuration, inhibitorState = null) {
    if (!this.initiated || !CONFIG.audio.enabled) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const controlInterval = 1 / Math.max(1, CONFIG.audio.controlUpdateHz || 15);
    this._controlAccumulator = Math.min(controlInterval, this._controlAccumulator + Math.max(0, dt || 0));
    if (this._controlAccumulator < controlInterval) return;
    this._controlAccumulator = 0;

    const now = this.ctx.currentTime;
    const ramp = 0.05;

    if (this._audioState !== 'terminal-linger') {
      this.master.gain.linearRampToValueAtTime(this._effectiveMasterVolume(), now + ramp);
    }

    // Drone: pitch drops and distortion grows as universe ages
    if (this.drone && this._audioState === 'gameplay-pressure') {
      const progress = Math.min(runElapsed / Math.max(runDuration, 1), 1);
      const freq = CONFIG.audio.droneBaseFreq +
        (CONFIG.audio.droneEndFreq - CONFIG.audio.droneBaseFreq) * progress;
      this.drone.osc.frequency.linearRampToValueAtTime(freq, now + ramp);
      this.drone.subOsc.frequency.linearRampToValueAtTime(freq * 0.5, now + ramp);
      this.drone.fifthOsc.frequency.linearRampToValueAtTime(freq * 1.5, now + ramp);
      this.drone.gain.gain.linearRampToValueAtTime(CONFIG.audio.droneVolume, now + ramp);
      const distAmount = Math.round(progress * CONFIG.audio.droneDistortion * 100) / 100;
      if (distAmount !== this._lastDistortionAmount) {
        this._lastDistortionAmount = distAmount;
        this.drone.shaper.curve = this._makeDistortionCurve(distAmount);
      }
    }

    // Well harmonics (gameplay only)
    if (this._audioState === 'gameplay-pressure') {
      this._updateWellVoices(wells, ship, camX, camY, canvasW, canvasH, now, ramp);
      this._updateInhibitorVoice(inhibitorState, ship, now, ramp);
    }
  }

  // ---- Event sounds ----

  playEvent(type, wx, wy, camX, camY, canvasW, canvasH) {
    if (!this.initiated || !CONFIG.audio.enabled) return false;

    const now = this.ctx.currentTime;
    const spec = cueSpec(type);
    if (!spec) return false;
    const bus = spec.bus;
    const vol = CONFIG.audio.eventVolume * (bus === 'ui' ? this._mix.uiVolume : this._mix.effectsVolume);
    if (type !== 'death' && !this._eventBudget.admit(type, now)) return false;
    if (!this._mixer.admit(type, now)) {
      this._eventBudget.release(type, now);
      return false;
    }
    this._trace.mark(type, now, { bus });
    if (['portalConfirm', 'portalFinal', 'extract', 'death'].includes(type)) {
      this._cueSynthesis.clearPortalReady(now);
    }

    let pan = 0;
    if (wx !== undefined && canvasW) {
      const [sx] = worldToScreen(wx, wy, camX, camY, canvasW, canvasH);
      pan = Math.max(-1, Math.min(1, sx * 2 / canvasW - 1));
    }

    if (type === 'death') this.setContext('dead');
    if (!this._cueSynthesis.play(type, now, vol, pan, bus)) return false;
    if (type === 'death') this._finishDeath(now);
    return true;
  }

  // ---- Init helpers ----

  _initDrone() {
    // Primary drone — low sine
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = CONFIG.audio.droneBaseFreq;

    // Sub-octave layer — adds weight and presence (detuned slightly for beating)
    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.value = CONFIG.audio.droneBaseFreq * 0.5; // one octave below
    subOsc.detune.value = -3; // slight detune for organic beating

    // Third layer — very quiet fifth above for harmonic richness
    const fifthOsc = this.ctx.createOscillator();
    fifthOsc.type = 'sine';
    fifthOsc.frequency.value = CONFIG.audio.droneBaseFreq * 1.5;
    const fifthGain = this.ctx.createGain();
    fifthGain.gain.value = 0.15; // barely audible

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this._makeDistortionCurve(0);
    const gain = this.ctx.createGain();
    gain.gain.value = CONFIG.audio.droneVolume;

    // Mix all three into the shaper
    osc.connect(shaper);
    subOsc.connect(shaper);
    fifthOsc.connect(fifthGain);
    fifthGain.connect(shaper);
    shaper.connect(gain);
    gain.connect(this.busGains.ambient);
    osc.start();
    subOsc.start();
    fifthOsc.start();
    this.drone = { osc, subOsc, fifthOsc, fifthGain, gain, shaper };
  }

  _initWellVoices(count) {
    for (let i = 0; i < count; i++) {
      // Primary tone — sine at the well's frequency
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 0;

      // Sub-octave — adds the heavy, massive feel wells should have
      const subOsc = this.ctx.createOscillator();
      subOsc.type = 'sine';
      subOsc.frequency.value = 0;
      const subGain = this.ctx.createGain();
      subGain.gain.value = 0.6; // sub is prominent but not dominant

      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = 0;

      osc.connect(gain);
      subOsc.connect(subGain);
      subGain.connect(gain);
      gain.connect(panner);
      panner.connect(this.busGains.world);
      osc.start();
      subOsc.start();
      this.wellVoices.push({ osc, subOsc, subGain, gain, panner, active: false, wellIndex: -1 });
    }
  }

  _initInhibitorVoice() {
    const osc = this._cueSynthesis.createSquare(0.5);
    osc.frequency.value = 74;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 740;
    filter.Q.value = 5;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.busGains.critical);
    osc.start();
    this.inhibitorVoice = { osc, filter, gain };
  }

  _initMovementVoice() {
    const tone = this.ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.value = 60;
    const toneGain = this.ctx.createGain();
    toneGain.gain.value = 0;

    const noise = this._cueSynthesis.createNoise(0.25);
    noise.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    filter.Q.value = 0.7;
    const textureGain = this.ctx.createGain();
    textureGain.gain.value = 0;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    tone.connect(toneGain);
    toneGain.connect(gain);
    noise.connect(filter);
    filter.connect(textureGain);
    textureGain.connect(gain);
    gain.connect(this.busGains.player);
    tone.start();
    noise.start();
    this._movementVoice = { tone, toneGain, noise, filter, textureGain, gain };
  }

  _setMovementVoice(state = {}, now = this.ctx?.currentTime ?? 0, ramp = 0.08) {
    if (!this._movementVoice) return;
    const active = state.active !== false && this._audioState === 'gameplay-pressure';
    const mode = state.state || (active ? this._movementState : 'idle');
    const levels = active ? movementAudioLevels(state, mode) : movementAudioLevels({}, 'idle');
    const voice = this._movementVoice;
    voice.tone.frequency.cancelScheduledValues(now);
    voice.tone.frequency.linearRampToValueAtTime(levels.frequency, now + ramp);
    voice.filter.frequency.cancelScheduledValues(now);
    voice.filter.frequency.linearRampToValueAtTime(levels.filter, now + ramp);
    voice.toneGain.gain.cancelScheduledValues(now);
    voice.toneGain.gain.linearRampToValueAtTime(levels.tone * CONFIG.audio.eventVolume, now + ramp);
    voice.textureGain.gain.cancelScheduledValues(now);
    voice.textureGain.gain.linearRampToValueAtTime(levels.texture * CONFIG.audio.eventVolume, now + ramp);
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.linearRampToValueAtTime(levels.gain, now + ramp);
  }

  _updateWellVoices(wells, ship, camX, camY, canvasW, canvasH, now, ramp) {
    // Use toroidal worldDistance — wells near map edges should be audible from the other side
    const wellDists = wells.map((w, i) => ({
      index: i, dist: worldDistance(ship.wx, ship.wy, w.wx, w.wy), well: w,
    })).sort((a, b) => a.dist - b.dist);

    for (let v = 0; v < this.wellVoices.length; v++) {
      const voice = this.wellVoices[v];
      if (v < wellDists.length) {
        const wd = wellDists[v];
        const maxDist = CONFIG.audio.wellMaxDist;
        const distGain = wd.dist < maxDist ? Math.max(0, 1 - wd.dist / maxDist) : 0;
        const freq = CONFIG.audio.wellBaseFreq / (wd.well.mass * CONFIG.audio.wellFreqScale);
        const [sx] = worldToScreen(wd.well.wx, wd.well.wy, camX, camY, canvasW, canvasH);
        const pan = Math.max(-1, Math.min(1, sx * 2 / canvasW - 1));
        voice.osc.frequency.linearRampToValueAtTime(Math.max(20, freq), now + ramp);
        voice.subOsc.frequency.linearRampToValueAtTime(Math.max(15, freq * 0.5), now + ramp);
        voice.gain.gain.linearRampToValueAtTime(distGain * CONFIG.audio.wellHarmonicVolume, now + ramp);
        voice.panner.pan.linearRampToValueAtTime(pan, now + ramp);
      } else {
        voice.gain.gain.linearRampToValueAtTime(0, now + ramp);
      }
    }
  }

  _updateInhibitorVoice(inhibitorState, ship, now, ramp) {
    if (!this.inhibitorVoice) return;
    const form = inhibitorState?.form || 0;
    if (!ship || form <= 0) {
      this.inhibitorVoice.gain.gain.linearRampToValueAtTime(0, now + ramp);
      return;
    }

    const dist = worldDistance(ship.wx, ship.wy, inhibitorState.wx, inhibitorState.wy);
    const proximity = Math.max(0, Math.min(1, 1 - dist / 1.4));
    const intensity = Math.max(0, Math.min(1, inhibitorState.intensity ?? 1));
    const formWeight = form === 1 ? 0.25 : form === 2 ? 0.55 : 0.9;
    const gain = CONFIG.audio.droneVolume * formWeight * (0.25 + proximity * 0.75) * intensity;
    const base = form === 1 ? 740 : form === 2 ? 62 * Math.SQRT2 : 41;
    const wobble = Math.sin((inhibitorState.localTime || 0) * (form === 3 ? 1.2 : 4.1)) * (form === 1 ? 18 : 5);
    this.inhibitorVoice.osc.frequency.linearRampToValueAtTime(Math.max(20, base + wobble), now + ramp);
    this.inhibitorVoice.filter.frequency.linearRampToValueAtTime(form === 1 ? 1900 : form === 2 ? 720 : 360, now + ramp);
    this.inhibitorVoice.gain.gain.linearRampToValueAtTime(gain, now + ramp);
  }

  // ---- Continuous graph curves ----

  /**
   * Soft-clipping distortion curve (attempt to approximate tube-like saturation).
   * amount 0 = clean passthrough, 1 = harsh clipping.
   * Formula: modified arctangent soft-clip where k controls drive amount.
   * The (3+k) numerator and (PI + k*|x|) denominator create a curve that
   * asymptotically approaches ±1 as k increases — gentle at low drive,
   * harsh at high drive. The degree-to-radian conversion (×20×PI/180)
   * scales the input range for musical-sounding saturation.
   */
  _makeDistortionCurve(amount) {
    const samples = 256;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i / (samples - 1)) * 2 - 1;
      if (amount < 0.01) { curve[i] = x; }
      else { const k = amount * 50; curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x)); }
    }
    return curve;
  }

  _makeBitCrushCurve(bits) {
    const steps = Math.pow(2, bits);
    const samples = 65536;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i / (samples - 1)) * 2 - 1;
      curve[i] = Math.round(x * steps) / steps;
    }
    return curve;
  }

  _finishDeath(now) {
    if (this.drone) {
      this.drone.osc.frequency.linearRampToValueAtTime(15, now + 1.5);
      this.drone.subOsc.frequency.linearRampToValueAtTime(8, now + 1.5);
      this.drone.fifthOsc.frequency.linearRampToValueAtTime(10, now + 1.5);
      this.drone.gain.gain.linearRampToValueAtTime(0, now + 1.5);
    }
    for (const voice of this.wellVoices) {
      voice.osc.frequency.linearRampToValueAtTime(15, now + 1.5);
      voice.subOsc.frequency.linearRampToValueAtTime(8, now + 1.5);
      voice.gain.gain.linearRampToValueAtTime(0, now + 1.5);
    }
    this.master.gain.linearRampToValueAtTime(0, now + 1.5);
  }
}
