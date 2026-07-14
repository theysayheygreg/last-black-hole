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
import { cueForAuthoritativeEvent, EventVoiceBudget } from './audio-events.js';
import { AudioMixer } from './audio/mixer.js';

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
    this._portalProximityActive = false;
  }

  getDiagnostics() {
    return { phase: this._audioState, mixer: this._mixer.snapshot(this.ctx?.currentTime ?? 0) };
  }

  // ---- Lifecycle ----

  init() {
    if (this.initiated) return;
    if (!CONFIG.audio) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.initiated = true;

    // Master output
    this.master = this.ctx.createGain();
    this.master.gain.value = CONFIG.audio.masterVolume;
    this.master.connect(this.ctx.destination);

    // SNES signal chain: duckGain → snesFilter → crusher → echo → master
    this.duckGain = this.ctx.createGain();

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

    this._initDrone();
    this._initInhibitorVoice();
    this._initWellVoices(4);
  }

  reset() {
    this._eventBudget.reset();
    this._mixer.reset();
    this._portalProximityActive = false;
    if (!this.initiated) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.value = CONFIG.audio.masterVolume;
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
  }

  /** Set audio context: 'title', 'menu', 'gameplay', 'meta' */
  setContext(state) {
    if (!this.initiated) return;
    this._audioState = state;
    const now = this.ctx.currentTime;
    const ramp = 0.3;

    if (state === 'title') {
      // Deep ominous drone — lower than gameplay, all three layers
      if (this.drone) {
        this.drone.osc.frequency.linearRampToValueAtTime(40, now + ramp);
        this.drone.subOsc.frequency.linearRampToValueAtTime(20, now + ramp);
        this.drone.fifthOsc.frequency.linearRampToValueAtTime(60, now + ramp);
        this.drone.gain.gain.linearRampToValueAtTime(CONFIG.audio.droneVolume * 1.3, now + ramp);
      }
      for (const v of this.wellVoices) v.gain.gain.linearRampToValueAtTime(0, now + ramp);
    } else if (state === 'menu' || state === 'meta') {
      // Quiet ambient, no drone, no wells
      if (this.drone) this.drone.gain.gain.linearRampToValueAtTime(CONFIG.audio.droneVolume * 0.3, now + ramp);
      for (const v of this.wellVoices) v.gain.gain.linearRampToValueAtTime(0, now + ramp);
    } else if (state === 'gameplay') {
      // Full audio — all layers active
      if (this.drone) {
        this.drone.osc.frequency.linearRampToValueAtTime(CONFIG.audio.droneBaseFreq, now + ramp);
        this.drone.subOsc.frequency.linearRampToValueAtTime(CONFIG.audio.droneBaseFreq * 0.5, now + ramp);
        this.drone.fifthOsc.frequency.linearRampToValueAtTime(CONFIG.audio.droneBaseFreq * 1.5, now + ramp);
        this.drone.gain.gain.linearRampToValueAtTime(CONFIG.audio.droneVolume, now + ramp);
      }
    }
  }

  // ---- Per-frame update ----

  update(dt, wells, ship, camX, camY, canvasW, canvasH, runElapsed, runDuration, inhibitorState = null) {
    if (!this.initiated || !CONFIG.audio.enabled) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const now = this.ctx.currentTime;
    const ramp = 0.05;

    this.master.gain.linearRampToValueAtTime(CONFIG.audio.masterVolume, now + ramp);

    // Drone: pitch drops and distortion grows as universe ages
    if (this.drone && this._audioState === 'gameplay') {
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
    if (this._audioState === 'gameplay') {
      this._updateWellVoices(wells, ship, camX, camY, canvasW, canvasH, now, ramp);
      this._updateInhibitorVoice(inhibitorState, ship, now, ramp);
    }
  }

  // ---- Event sounds ----

  playEvent(type, wx, wy, camX, camY, canvasW, canvasH) {
    if (!this.initiated || !CONFIG.audio.enabled) return false;

    const now = this.ctx.currentTime;
    const vol = CONFIG.audio.eventVolume;
    if (type !== 'death' && !this._eventBudget.admit(type, now)) return false;
    if (!this._mixer.admit(type, now)) return false;

    let pan = 0;
    if (wx !== undefined && canvasW) {
      const [sx] = worldToScreen(wx, wy, camX, camY, canvasW, canvasH);
      pan = Math.max(-1, Math.min(1, sx * 2 / canvasW - 1));
    }

    switch (type) {
      // Gameplay events
      case 'loot':              this._playLootChime(now, vol, pan); break;
      case 'slingshotEngage':   this._playSlingshotEngage(now, vol, pan); break;
      case 'slingshotRelease':  this._playSlingshotRelease(now, vol, pan); break;
      case 'portalProximity':   this._playPortalProximity(now, vol, pan); break;
      case 'portalConfirm':     this._playPortalConfirm(now, vol, pan); break;
      case 'scavengerBump':     this._playScavengerBump(now, vol, pan); break;
      case 'inhibitorGlitch':   this._playInhibitorGlitch(now, vol); break;
      case 'pulse':             this._playPulse(now, vol, pan); break;
      case 'portalDeath':       this._playPortalDeath(now, vol, pan); break;
      case 'thrustOn':          this._playThrustOn(now, vol); break;
      case 'extract':           this._playExtract(now, vol); break;
      case 'death':             this._playDeath(now); break;
      case 'scavengerExtract':  this._playScavengerExtract(now, vol * 0.4, pan); break;
      case 'shieldActivate':    this._playShieldActivate(now, vol); break;
      case 'shieldAbsorb':      this._playShieldAbsorb(now, vol); break;
      case 'timeSlow':          this._playTimeSlow(now, vol); break;
      case 'timeSlowEnd':       this._playTimeSlowEnd(now, vol); break;
      case 'breachFlare':       this._playBreachFlare(now, vol); break;
      case 'wellProximity':     this._playWellRumble(now, vol); break;
      case 'hullWarning':       this._playHullWarning(now, vol); break;
      case 'starConsumed':      this._playStarConsumed(now, vol, pan); break;
      case 'scavDeath':         this._playDebrisClatter(now, vol, pan); break;
      case 'wreckConsumed':     this._playCrunch(now, vol, pan); break;
      case 'inhibitorWake':     this._playInhibitorWake(now, vol); break;
      case 'inhibitorVessel':   this._playInhibitorVessel(now, vol); break;
      case 'inhibitorDrain':    this._playErrorBuzz(now, vol * 0.6); break;
      case 'inhibitorFinalPortal': this._playExtract(now, vol * 0.6); break;

      // Menu/UI events
      case 'menuMove':          this._playMenuBlip(now, vol * 0.3); break;
      case 'menuConfirm':       this._playMenuConfirm(now, vol * 0.4); break;
      case 'menuBack':          this._playMenuBack(now, vol * 0.3); break;
      case 'tabSwitch':         this._playTabClick(now, vol * 0.3); break;
      case 'sellItem':          this._playCoinDrop(now, vol * 0.4); break;
      case 'equipItem':         this._playEquipLock(now, vol * 0.4); break;
      case 'upgrade':           this._playUpgrade(now, vol * 0.5); break;
      case 'cantAfford':        this._playErrorBuzz(now, vol * 0.3); break;
      case 'launch':            this._playLaunchSpool(now, vol * 0.5); break;
      case 'itemReveal':        this._playItemPlink(now, vol * 0.25); break;
      default:                  return false;
    }
    return true;
  }

  /** Translate one sim event into one local cue. Returns false when filtered. */
  playAuthoritativeEvent(event, context = {}) {
    const mapped = cueForAuthoritativeEvent(event, context);
    if (!mapped) return false;
    const payload = mapped.payload || {};
    return this.playEvent(
      mapped.cue,
      payload.wx,
      payload.wy,
      context.camX,
      context.camY,
      context.canvasW,
      context.canvasH
    );
  }

  /** Edge-triggered local proximity cue until the sim publishes proximity. */
  setPortalProximity(active, context = {}) {
    const next = Boolean(active);
    if (next === this._portalProximityActive) return false;
    this._portalProximityActive = next;
    if (!next) return false;
    return this.playEvent(
      'portalProximity',
      context.wx,
      context.wy,
      context.camX,
      context.camY,
      context.canvasW,
      context.canvasH
    );
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
    gain.connect(this.duckGain);
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
      panner.connect(this.duckGain);
      osc.start();
      subOsc.start();
      this.wellVoices.push({ osc, subOsc, subGain, gain, panner, active: false, wellIndex: -1 });
    }
  }

  _initInhibitorVoice() {
    const osc = this._createSquare(0.5);
    osc.frequency.value = 74;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 740;
    filter.Q.value = 5;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.duckGain);
    osc.start();
    this.inhibitorVoice = { osc, filter, gain };
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
        const distGain = Number.isFinite(wd.dist) && wd.dist < maxDist
          ? Math.max(0, 1 - wd.dist / maxDist)
          : 0;
        const mass = Number.isFinite(wd.well.mass) && wd.well.mass > 0 ? wd.well.mass : 1;
        const freq = CONFIG.audio.wellBaseFreq / (mass * CONFIG.audio.wellFreqScale);
        const [sx] = worldToScreen(wd.well.wx, wd.well.wy, camX, camY, canvasW, canvasH);
        const rawPan = sx * 2 / canvasW - 1;
        const pan = Number.isFinite(rawPan) ? Math.max(-1, Math.min(1, rawPan)) : 0;
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
    const requestedGain = CONFIG.audio.droneVolume * formWeight * (0.25 + proximity * 0.75) * intensity;
    // Remote authority state can arrive component-by-component. A newly visible
    // Inhibitor must fail silent until its spatial fields are finite rather than
    // throwing from Web Audio and stopping the entire presentation loop.
    const gain = Number.isFinite(requestedGain) ? requestedGain : 0;
    const base = form === 1 ? 740 : form === 2 ? 62 * Math.SQRT2 : 41;
    const wobble = Math.sin((inhibitorState.localTime || 0) * (form === 3 ? 1.2 : 4.1)) * (form === 1 ? 18 : 5);
    this.inhibitorVoice.osc.frequency.linearRampToValueAtTime(Math.max(20, base + wobble), now + ramp);
    this.inhibitorVoice.filter.frequency.linearRampToValueAtTime(form === 1 ? 1900 : form === 2 ? 720 : 360, now + ramp);
    this.inhibitorVoice.gain.gain.linearRampToValueAtTime(gain, now + ramp);
  }

  // ---- Synthesis helpers ----

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

  _createVoice(pan = 0) {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;
    gain.connect(panner);
    panner.connect(this.duckGain);
    // Auto-cleanup: schedule disconnect after a generous timeout.
    // This catches any source that doesn't have its own onended handler.
    const cleanup = setTimeout(() => {
      try { gain.disconnect(); panner.disconnect(); } catch (e) {}
    }, 5000); // 5 seconds — no event sound is longer than 3s
    return { gain, panner, _cleanup: cleanup };
  }

  /**
   * Wire a source (oscillator or buffer) through optional filters to a voice,
   * with automatic disconnect on end. Prevents audio graph memory leaks.
   */
  _wireAndPlay(source, voice, startTime, stopTime, filters = []) {
    let node = source;
    for (const f of filters) { node.connect(f); node = f; }
    node.connect(voice.gain);
    source.start(startTime);
    source.stop(stopTime);
    source.onended = () => {
      try {
        source.disconnect();
        for (const f of filters) f.disconnect();
        voice.gain.disconnect();
        voice.panner.disconnect();
      } catch (e) {} // ignore if already disconnected
    };
  }

  _createNoise(duration) {
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    return source;
  }

  /** SNES-style square with variable duty cycle */
  _createSquare(dutyCycle = 0.5) {
    const osc = this.ctx.createOscillator();
    const real = new Float32Array(32);
    const imag = new Float32Array(32);
    for (let n = 1; n < 32; n++) {
      imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * dutyCycle);
    }
    osc.setPeriodicWave(this.ctx.createPeriodicWave(real, imag, { disableNormalization: false }));
    return osc;
  }

  _duck(now, amount, duration) {
    if (this.duckGain) {
      this.duckGain.gain.setValueAtTime(amount, now);
      this.duckGain.gain.linearRampToValueAtTime(1, now + duration);
    }
  }

  // ==== GAMEPLAY EVENT SOUNDS ====

  _playLootChime(now, vol, pan) {
    const freqs = [523, 659, 784]; // C5 E5 G5
    for (let i = 0; i < 3; i++) {
      const osc = this._createSquare(0.25);
      osc.frequency.value = freqs[i];
      const voice = this._createVoice(pan);
      osc.connect(voice.gain);
      voice.gain.gain.setValueAtTime(0, now + i * 0.08);
      voice.gain.gain.linearRampToValueAtTime(vol * 0.4, now + i * 0.08 + 0.02);
      voice.gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.25);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.3);
    }
  }

  _playSlingshotEngage(now, vol, pan) {
    for (const [index, frequency] of [180, 270].entries()) {
      const osc = this.ctx.createOscillator();
      osc.type = index === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(frequency, now);
      osc.frequency.exponentialRampToValueAtTime(frequency * 1.7, now + 0.28);
      const voice = this._createVoice(pan);
      osc.connect(voice.gain);
      voice.gain.gain.setValueAtTime(vol * (index === 0 ? 0.28 : 0.18), now);
      voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
      osc.start(now);
      osc.stop(now + 0.46);
    }
  }

  _playSlingshotRelease(now, vol, pan) {
    const snap = this._createNoise(0.08);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1600;
    const noiseVoice = this._createVoice(pan);
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
    const voice = this._createVoice(pan);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * 0.32, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc.start(now);
    osc.stop(now + 0.6);
  }

  _playPortalProximity(now, vol, pan) {
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(330, now);
    osc.frequency.linearRampToValueAtTime(392, now + 0.18);
    const voice = this._createVoice(pan);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * 0.12, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.start(now);
    osc.stop(now + 0.44);
  }

  _playPortalConfirm(now, vol, pan) {
    for (const [index, frequency] of [392, 587].entries()) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = frequency;
      const voice = this._createVoice(pan);
      osc.connect(voice.gain);
      const start = now + index * 0.09;
      voice.gain.gain.setValueAtTime(0, start);
      voice.gain.gain.linearRampToValueAtTime(vol * 0.22, start + 0.015);
      voice.gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.start(start);
      osc.stop(start + 0.4);
    }
  }

  _playScavengerBump(now, vol, pan) {
    const impact = this.ctx.createOscillator();
    impact.type = 'sine';
    impact.frequency.setValueAtTime(95, now);
    impact.frequency.exponentialRampToValueAtTime(42, now + 0.22);
    const impactVoice = this._createVoice(pan);
    impact.connect(impactVoice.gain);
    impactVoice.gain.gain.setValueAtTime(vol * 0.4, now);
    impactVoice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    impact.start(now);
    impact.stop(now + 0.3);

    const scrape = this._createNoise(0.12);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 720;
    filter.Q.value = 2.5;
    const scrapeVoice = this._createVoice(pan);
    scrape.connect(filter);
    filter.connect(scrapeVoice.gain);
    scrapeVoice.gain.gain.setValueAtTime(vol * 0.22, now);
    scrapeVoice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    scrape.start(now);
    scrape.stop(now + 0.14);
  }

  _playInhibitorGlitch(now, vol) {
    const noise = this._createNoise(0.12);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2400, now);
    filter.frequency.exponentialRampToValueAtTime(680, now + 0.1);
    filter.Q.value = 10;
    const voice = this._createVoice(0);
    noise.connect(filter);
    filter.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * 0.28, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    noise.start(now);
    noise.stop(now + 0.15);

    const osc = this._createSquare(0.2);
    osc.frequency.setValueAtTime(910, now);
    osc.frequency.exponentialRampToValueAtTime(137, now + 0.25);
    const toneVoice = this._createVoice(0);
    osc.connect(toneVoice.gain);
    toneVoice.gain.gain.setValueAtTime(vol * 0.12, now);
    toneVoice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.34);
  }

  _playPulse(now, vol, pan) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.3);
    const voice = this._createVoice(pan);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * 0.8, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.start(now);
    osc.stop(now + 0.55);
    const noise = this._createNoise(0.15);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 800; filter.Q.value = 1;
    const nv = this._createVoice(pan);
    noise.connect(filter); filter.connect(nv.gain);
    nv.gain.gain.setValueAtTime(vol * 0.5, now);
    nv.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    noise.start(now); noise.stop(now + 0.15);
    this._duck(now, CONFIG.audio.pulseDuckAmount, CONFIG.audio.pulseDuckDuration);
  }

  _playPortalDeath(now, vol, pan) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.8);
    const voice = this._createVoice(pan);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * 0.4, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    osc.start(now); osc.stop(now + 1.0);
  }

  _playThrustOn(now, vol) {
    const noise = this._createNoise(0.15);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 600; filter.Q.value = 2;
    const voice = this._createVoice(0);
    noise.connect(filter); filter.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * 0.2, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    noise.start(now); noise.stop(now + 0.15);
  }

  _playExtract(now, vol) {
    const base = 220;
    for (let i = 0; i < 5; i++) {
      const osc = this._createSquare(0.25);
      osc.frequency.value = base * (i + 1);
      const voice = this._createVoice(0);
      osc.connect(voice.gain);
      const start = now + i * 0.15;
      voice.gain.gain.setValueAtTime(0, start);
      voice.gain.gain.linearRampToValueAtTime(vol * 0.3 / (i + 1), start + 0.1);
      voice.gain.gain.exponentialRampToValueAtTime(0.001, start + 2.0);
      osc.start(start); osc.stop(start + 2.1);
    }
  }

  _playDeath(now) {
    if (this.drone) {
      this.drone.osc.frequency.linearRampToValueAtTime(15, now + 1.5);
      this.drone.subOsc.frequency.linearRampToValueAtTime(8, now + 1.5);
      this.drone.fifthOsc.frequency.linearRampToValueAtTime(10, now + 1.5);
      this.drone.gain.gain.linearRampToValueAtTime(0, now + 1.5);
    }
    for (const v of this.wellVoices) {
      v.osc.frequency.linearRampToValueAtTime(15, now + 1.5);
      v.subOsc.frequency.linearRampToValueAtTime(8, now + 1.5);
      v.gain.gain.linearRampToValueAtTime(0, now + 1.5);
    }
    this.master.gain.linearRampToValueAtTime(0, now + 1.5);
  }

  _playScavengerExtract(now, vol, pan) {
    const noise = this._createNoise(0.1);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass'; filter.frequency.value = 1000;
    const voice = this._createVoice(pan);
    noise.connect(filter); filter.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    noise.start(now); noise.stop(now + 0.12);
  }

  // ==== NEW GAMEPLAY SOUNDS ====

  _playShieldActivate(now, vol) {
    // Rising shimmer — two detuned sines
    for (const detune of [-5, 5]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.linearRampToValueAtTime(800, now + 0.3);
      osc.detune.value = detune;
      const voice = this._createVoice(0);
      osc.connect(voice.gain);
      voice.gain.gain.setValueAtTime(vol * 0.3, now);
      voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.start(now); osc.stop(now + 0.55);
    }
  }

  _playShieldAbsorb(now, vol) {
    // Impact + shatter — bass hit + high noise burst
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);
    const v = this._createVoice(0);
    osc.connect(v.gain);
    v.gain.gain.setValueAtTime(vol * 0.6, now);
    v.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.start(now); osc.stop(now + 0.35);
    const noise = this._createNoise(0.08);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass'; filter.frequency.value = 2000;
    const nv = this._createVoice(0);
    noise.connect(filter); filter.connect(nv.gain);
    nv.gain.gain.setValueAtTime(vol * 0.4, now);
    nv.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    noise.start(now); noise.stop(now + 0.1);
  }

  _playTimeSlow(now, vol) {
    // Descending wobbly tone — time stretching
    const osc = this._createSquare(0.3);
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.6);
    const voice = this._createVoice(0);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * 0.3, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    osc.start(now); osc.stop(now + 0.75);
  }

  _playTimeSlowEnd(now, vol) {
    // Quick ascending snap
    const osc = this._createSquare(0.3);
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.15);
    const voice = this._createVoice(0);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * 0.25, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.start(now); osc.stop(now + 0.25);
  }

  _playBreachFlare(now, vol) {
    // Portal tear — noise sweep + rising tone
    const noise = this._createNoise(0.4);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 400;
    filter.frequency.linearRampToValueAtTime(2000, now + 0.3);
    filter.Q.value = 3;
    const nv = this._createVoice(0);
    noise.connect(filter); filter.connect(nv.gain);
    nv.gain.gain.setValueAtTime(vol * 0.3, now);
    nv.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    noise.start(now); noise.stop(now + 0.45);
  }

  _playWellRumble(now, vol) {
    // Very low sine throb
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 25;
    const voice = this._createVoice(0);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * 0.15, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.start(now); osc.stop(now + 0.45);
  }

  _playHullWarning(now, vol) {
    // Alarm: two rapid square beeps
    for (let i = 0; i < 2; i++) {
      const osc = this._createSquare(0.5);
      osc.frequency.value = 880;
      const voice = this._createVoice(0);
      osc.connect(voice.gain);
      const t = now + i * 0.12;
      voice.gain.gain.setValueAtTime(vol * 0.3, t);
      voice.gain.gain.setValueAtTime(0, t + 0.06);
      osc.start(t); osc.stop(t + 0.08);
    }
  }

  _playStarConsumed(now, vol, pan) {
    // Massive boom — low sine + noise burst + duck
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 1.0);
    const voice = this._createVoice(pan);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * 0.7, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    osc.start(now); osc.stop(now + 1.3);
    const noise = this._createNoise(0.3);
    const nv = this._createVoice(pan);
    noise.connect(nv.gain);
    nv.gain.gain.setValueAtTime(vol * 0.5, now);
    nv.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    noise.start(now); noise.stop(now + 0.3);
    this._duck(now, 0.2, 0.8);
  }

  _playDebrisClatter(now, vol, pan) {
    // Quick succession of short noise bursts at different pitches
    for (let i = 0; i < 4; i++) {
      const noise = this._createNoise(0.05);
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 500 + Math.random() * 2000;
      filter.Q.value = 2;
      const voice = this._createVoice(Math.max(-1, Math.min(1, pan + (Math.random() - 0.5) * 0.3)));
      noise.connect(filter); filter.connect(voice.gain);
      const t = now + i * 0.04;
      voice.gain.gain.setValueAtTime(vol * 0.2, t);
      voice.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      noise.start(t); noise.stop(t + 0.06);
    }
  }

  _playCrunch(now, vol, pan) {
    // Low noise crunch
    const noise = this._createNoise(0.15);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 400; filter.Q.value = 1;
    const voice = this._createVoice(pan);
    noise.connect(filter); filter.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * 0.3, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    noise.start(now); noise.stop(now + 0.15);
  }

  _playInhibitorWake(now, vol) {
    const noise = this._createNoise(0.5);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(220, now + 0.45);
    filter.Q.value = 8;
    const voice = this._createVoice(0);
    noise.connect(filter);
    filter.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * 0.45, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    noise.start(now);
    noise.stop(now + 0.6);
    this._duck(now, 0.45, 0.35);
  }

  _playInhibitorVessel(now, vol) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(56, now);
    osc.frequency.exponentialRampToValueAtTime(24, now + 1.1);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 480;
    filter.Q.value = 3;
    const voice = this._createVoice(0);
    osc.connect(filter);
    filter.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * 0.7, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    osc.start(now);
    osc.stop(now + 1.25);
    this._duck(now, 0.28, 0.8);
  }

  // ==== MENU / UI SOUNDS ====

  _playMenuBlip(now, vol) {
    const osc = this._createSquare(0.25);
    osc.frequency.value = 1200;
    const voice = this._createVoice(0);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.start(now); osc.stop(now + 0.06);
  }

  _playMenuConfirm(now, vol) {
    // Two-note ascending: G5 → C6
    const freqs = [784, 1047];
    for (let i = 0; i < 2; i++) {
      const osc = this._createSquare(0.25);
      osc.frequency.value = freqs[i];
      const voice = this._createVoice(0);
      osc.connect(voice.gain);
      voice.gain.gain.setValueAtTime(0, now + i * 0.06);
      voice.gain.gain.linearRampToValueAtTime(vol, now + i * 0.06 + 0.01);
      voice.gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.15);
      osc.start(now + i * 0.06); osc.stop(now + i * 0.06 + 0.18);
    }
  }

  _playMenuBack(now, vol) {
    // Descending: C6 → G5
    const osc = this._createSquare(0.25);
    osc.frequency.setValueAtTime(1047, now);
    osc.frequency.exponentialRampToValueAtTime(784, now + 0.08);
    const voice = this._createVoice(0);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.start(now); osc.stop(now + 0.15);
  }

  _playTabClick(now, vol) {
    const osc = this._createSquare(0.5);
    osc.frequency.value = 2000;
    const voice = this._createVoice(0);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol, now);
    voice.gain.gain.setValueAtTime(0, now + 0.015);
    osc.start(now); osc.stop(now + 0.02);
  }

  _playCoinDrop(now, vol) {
    // Metallic ping descending
    const osc = this._createSquare(0.125);
    osc.frequency.setValueAtTime(3000, now);
    osc.frequency.exponentialRampToValueAtTime(1500, now + 0.15);
    const voice = this._createVoice(0);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.start(now); osc.stop(now + 0.25);
  }

  _playEquipLock(now, vol) {
    // Metallic click + brief sine
    const osc = this._createSquare(0.5);
    osc.frequency.value = 800;
    const voice = this._createVoice(0);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol, now);
    voice.gain.gain.setValueAtTime(vol * 0.3, now + 0.02);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.start(now); osc.stop(now + 0.18);
  }

  _playUpgrade(now, vol) {
    // Ascending 4-note arpeggio: C5 → E5 → G5 → C6
    const freqs = [523, 659, 784, 1047];
    for (let i = 0; i < 4; i++) {
      const osc = this._createSquare(0.25);
      osc.frequency.value = freqs[i];
      const voice = this._createVoice(0);
      osc.connect(voice.gain);
      const t = now + i * 0.07;
      voice.gain.gain.setValueAtTime(0, t);
      voice.gain.gain.linearRampToValueAtTime(vol, t + 0.015);
      voice.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.start(t); osc.stop(t + 0.25);
    }
  }

  _playErrorBuzz(now, vol) {
    // Low square buzz — two quick notes
    const osc = this._createSquare(0.5);
    osc.frequency.value = 150;
    const voice = this._createVoice(0);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol, now);
    voice.gain.gain.setValueAtTime(0, now + 0.06);
    voice.gain.gain.setValueAtTime(vol, now + 0.1);
    voice.gain.gain.setValueAtTime(0, now + 0.16);
    osc.start(now); osc.stop(now + 0.2);
  }

  _playLaunchSpool(now, vol) {
    // Rising noise + sine — engine spool
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.6);
    const voice = this._createVoice(0);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * 0.3, now);
    voice.gain.gain.linearRampToValueAtTime(vol * 0.5, now + 0.4);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    osc.start(now); osc.stop(now + 0.75);
  }

  _playItemPlink(now, vol) {
    // Tiny high ping
    const osc = this._createSquare(0.125);
    osc.frequency.value = 2400 + Math.random() * 400;
    const voice = this._createVoice(0);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.start(now); osc.stop(now + 0.1);
  }
}
