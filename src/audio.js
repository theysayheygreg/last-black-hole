/**
 * audio.js — spatial audio engine for Last Black Hole.
 *
 * Two layers:
 *   Canvas — spatial mixing. Sources positioned in world-space, mixed by
 *            distance/angle to the player. Stereo pan from screen-space X
 *            (LittleJS pattern): pan = screenX * 2 / canvasWidth - 1.
 *   Palette — synthesis. All sounds are Web Audio oscillator/noise patches,
 *            no sample files.
 *
 * Voice architecture:
 *   - Drone: always-on sine → waveshaper → gain → duckGain → master.
 *     Pitch drops and distortion grows as the universe ages.
 *   - Well harmonics: up to 4 pre-allocated sine voices, re-assigned each
 *     frame to the nearest wells. Frequency from mass, gain from distance,
 *     stereo pan from screen position.
 *   - Events: one-shot oscillator/noise patches fired into duckGain.
 *     Voice limiting is implicit — each event creates short-lived nodes
 *     that auto-disconnect on stop.
 *
 * Ducking rules:
 *   - Pulse ducks everything (via duckGain).
 *   - Thrust ducks ambient (not implemented yet — easy to add via
 *     a second gain node between drone/wells and duckGain).
 *
 * Distance attenuation:
 *   - Well harmonics: linear fade to zero at wellMaxDist.
 *   - Events: no distance attenuation (player-centric or short-range).
 */

import { CONFIG } from './config.js';
import { worldToScreen } from './coords.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;        // AudioContext — created on first user gesture
    this.master = null;     // master GainNode
    this.initiated = false;

    // Ambient layers
    this.drone = null;      // { osc, gain, shaper }
    this.wellVoices = [];   // [{ osc, gain, panner, active, wellIndex }]

    // Ducking bus — pulse ducks everything routed through here
    this.duckGain = null;
  }

  // ---- Lifecycle ----

  /**
   * Call on first user gesture (click / keypress).
   * Creates the AudioContext and starts persistent voices.
   */
  init() {
    if (this.initiated) return;
    if (!CONFIG.audio) { console.warn('CONFIG.audio missing — audio disabled'); return; }
    this.ctx = new AudioContext();
    this.initiated = true;

    // Master output
    this.master = this.ctx.createGain();
    this.master.gain.value = CONFIG.audio.masterVolume;
    this.master.connect(this.ctx.destination);

    // Duck bus sits between voices and master
    this.duckGain = this.ctx.createGain();
    this.duckGain.connect(this.master);

    this._initDrone();
    this._initWellVoices(4);  // pre-allocate 4 well voice slots
  }

  /**
   * Reset audio state for a new run.
   * Restores master volume, drone pitch, and well voices after death killed them.
   */
  reset() {
    if (!this.initiated) return;
    const now = this.ctx.currentTime;

    // Restore master
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.value = CONFIG.audio.masterVolume;

    // Restore drone (death sound pitch-shifts and fades it)
    if (this.drone) {
      this.drone.osc.frequency.cancelScheduledValues(now);
      this.drone.osc.frequency.value = CONFIG.audio.droneBaseFreq;
      this.drone.gain.gain.cancelScheduledValues(now);
      this.drone.gain.gain.value = CONFIG.audio.droneVolume;
    }

    // Silence all well voices — update() will reassign them
    for (const v of this.wellVoices) {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.value = 0;
    }

    // Reset duck bus
    if (this.duckGain) {
      this.duckGain.gain.cancelScheduledValues(now);
      this.duckGain.gain.value = 1;
    }
  }

  // ---- Per-frame update ----

  /**
   * Call every frame. Updates all spatial audio from game state.
   *
   * @param {number} dt           — frame delta in seconds
   * @param {Array}  wells        — well objects with { wx, wy, mass }
   * @param {Object} ship         — ship with { wx, wy }
   * @param {number} camX, camY   — camera world-space center
   * @param {number} canvasW, canvasH — canvas pixel dimensions
   * @param {number} runElapsed   — seconds since run start
   * @param {number} runDuration  — total run length in seconds
   */
  update(dt, wells, ship, camX, camY, canvasW, canvasH, runElapsed, runDuration) {
    if (!this.initiated || !CONFIG.audio.enabled) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const now = this.ctx.currentTime;
    const ramp = 0.05; // 50ms parameter smoothing — avoids zipper noise

    this.master.gain.linearRampToValueAtTime(CONFIG.audio.masterVolume, now + ramp);

    // --- Drone: pitch drops and distortion grows as universe ages ---
    if (this.drone) {
      const progress = Math.min(runElapsed / Math.max(runDuration, 1), 1);

      // Pitch glides from droneBaseFreq down to droneEndFreq
      const freq = CONFIG.audio.droneBaseFreq
        + (CONFIG.audio.droneEndFreq - CONFIG.audio.droneBaseFreq) * progress;
      this.drone.osc.frequency.linearRampToValueAtTime(freq, now + ramp);
      this.drone.gain.gain.linearRampToValueAtTime(CONFIG.audio.droneVolume, now + ramp);

      // Distortion increases with universe age
      const distortion = progress * CONFIG.audio.droneDistortion;
      this.drone.shaper.curve = this._makeDistortionCurve(distortion);
    }

    // --- Well harmonics: nearest N wells get voice slots ---
    this._updateWellVoices(wells, ship, camX, camY, canvasW, canvasH, now, ramp);
  }

  // ---- Event sounds ----

  /**
   * Fire a one-shot synthesized sound at a world position.
   * Pass wx/wy = undefined for player-centered events (no panning).
   *
   * @param {string} type — 'loot' | 'pulse' | 'portalDeath' | 'thrustOn' |
   *                        'extract' | 'death' | 'scavengerExtract'
   */
  playEvent(type, wx, wy, camX, camY, canvasW, canvasH) {
    if (!this.initiated || !CONFIG.audio.enabled) return;

    const now = this.ctx.currentTime;
    const vol = CONFIG.audio.eventVolume;

    // Spatial pan from screen-space X, or centered for self-events
    let pan = 0;
    if (wx !== undefined) {
      const [sx] = worldToScreen(wx, wy, camX, camY, canvasW, canvasH);
      pan = Math.max(-1, Math.min(1, sx * 2 / canvasW - 1));
    }

    switch (type) {
      case 'loot':             this._playLootChime(now, vol, pan);          break;
      case 'pulse':            this._playPulse(now, vol, pan);              break;
      case 'portalDeath':      this._playPortalDeath(now, vol, pan);        break;
      case 'thrustOn':         this._playThrustOn(now, vol);                break;
      case 'extract':          this._playExtract(now, vol);                 break;
      case 'death':            this._playDeath(now);                        break;
      case 'scavengerExtract': this._playScavengerExtract(now, vol * 0.4, pan); break;
    }
  }

  // ---- Initialization helpers ----

  /** Persistent drone oscillator → waveshaper → gain → duckGain */
  _initDrone() {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = CONFIG.audio.droneBaseFreq;

    // Waveshaper for distortion that increases over the run
    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this._makeDistortionCurve(0); // clean passthrough to start

    const gain = this.ctx.createGain();
    gain.gain.value = CONFIG.audio.droneVolume;

    osc.connect(shaper);
    shaper.connect(gain);
    gain.connect(this.duckGain);
    osc.start();

    this.drone = { osc, gain, shaper };
  }

  /** Pre-allocate well harmonic voices: osc → gain → panner → duckGain */
  _initWellVoices(count) {
    for (let i = 0; i < count; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 0;

      const gain = this.ctx.createGain();
      gain.gain.value = 0;

      const panner = this.ctx.createStereoPanner();
      panner.pan.value = 0;

      osc.connect(gain);
      gain.connect(panner);
      panner.connect(this.duckGain);
      osc.start();

      this.wellVoices.push({ osc, gain, panner, active: false, wellIndex: -1 });
    }
  }

  // ---- Per-frame spatial helpers ----

  /** Assign nearest wells to pre-allocated voice slots */
  _updateWellVoices(wells, ship, camX, camY, canvasW, canvasH, now, ramp) {
    // Sort wells by distance to ship (nearest first)
    const wellDists = wells.map((w, i) => ({
      index: i,
      dist: Math.sqrt((w.wx - ship.wx) ** 2 + (w.wy - ship.wy) ** 2),
      well: w,
    })).sort((a, b) => a.dist - b.dist);

    for (let v = 0; v < this.wellVoices.length; v++) {
      const voice = this.wellVoices[v];

      if (v < wellDists.length) {
        const wd = wellDists[v];
        const maxDist = CONFIG.audio.wellMaxDist;

        // Linear distance attenuation, clamped to [0, 1]
        const distGain = wd.dist < maxDist ? Math.max(0, 1 - wd.dist / maxDist) : 0;

        // Pitch inversely proportional to mass (heavier wells = lower pitch)
        const freq = CONFIG.audio.wellBaseFreq / (wd.well.mass * CONFIG.audio.wellFreqScale);

        // Stereo pan from screen-space X position
        const [sx] = worldToScreen(wd.well.wx, wd.well.wy, camX, camY, canvasW, canvasH);
        const pan = Math.max(-1, Math.min(1, sx * 2 / canvasW - 1));

        voice.osc.frequency.linearRampToValueAtTime(Math.max(20, freq), now + ramp);
        voice.gain.gain.linearRampToValueAtTime(distGain * CONFIG.audio.wellHarmonicVolume, now + ramp);
        voice.panner.pan.linearRampToValueAtTime(pan, now + ramp);
        voice.active = true;
        voice.wellIndex = wd.index;
      } else {
        // No well for this voice slot — silence it
        voice.gain.gain.linearRampToValueAtTime(0, now + ramp);
        voice.active = false;
      }
    }
  }

  // ---- Synthesis helpers ----

  /**
   * Build a waveshaper distortion curve.
   * amount 0–1: 0 = clean passthrough, 1 = harsh clipping.
   */
  _makeDistortionCurve(amount) {
    const samples = 256;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i / (samples - 1)) * 2 - 1;
      if (amount < 0.01) {
        curve[i] = x; // passthrough
      } else {
        const k = amount * 50;
        curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
      }
    }
    return curve;
  }

  /** Create a gain + stereo panner pair routed into duckGain. */
  _createVoice(pan = 0) {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;
    gain.connect(panner);
    panner.connect(this.duckGain);
    return { gain, panner };
  }

  /** Create a white noise buffer source of the given duration. */
  _createNoise(duration) {
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    return source;
  }

  // ---- Event sound patches ----

  /** Ascending 3-note chime: C5 → E5 → G5 */
  _playLootChime(now, vol, pan) {
    const freqs = [523, 659, 784];
    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freqs[i];
      const voice = this._createVoice(pan);
      osc.connect(voice.gain);
      voice.gain.gain.setValueAtTime(0, now + i * 0.08);
      voice.gain.gain.linearRampToValueAtTime(vol * 0.5, now + i * 0.08 + 0.02);
      voice.gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.3);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.35);
    }
  }

  /** Low bass impact + bandpassed noise crack. Ducks everything briefly. */
  _playPulse(now, vol, pan) {
    // Bass tone — 80 Hz dropping to 30 Hz
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

    // Noise crack — bandpass filtered burst
    const noise = this._createNoise(0.15);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 1;
    const nVoice = this._createVoice(pan);
    noise.connect(filter);
    filter.connect(nVoice.gain);
    nVoice.gain.gain.setValueAtTime(vol * 0.6, now);
    nVoice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    noise.start(now);
    noise.stop(now + 0.15);

    // Duck everything via the duck bus
    if (this.duckGain) {
      this.duckGain.gain.setValueAtTime(CONFIG.audio.pulseDuckAmount, now);
      this.duckGain.gain.linearRampToValueAtTime(1, now + CONFIG.audio.pulseDuckDuration);
    }
  }

  /** Descending sawtooth glissando — entity sucked into portal */
  _playPortalDeath(now, vol, pan) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.8);
    const voice = this._createVoice(pan);
    osc.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * 0.4, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    osc.start(now);
    osc.stop(now + 1.0);
  }

  /** Short filtered noise burst — engine ignition */
  _playThrustOn(now, vol) {
    const noise = this._createNoise(0.15);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 600;
    filter.Q.value = 2;
    const voice = this._createVoice(0);
    noise.connect(filter);
    filter.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol * 0.2, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    noise.start(now);
    noise.stop(now + 0.15);
  }

  /** Ascending harmonic series resolving to a major chord — successful extraction */
  _playExtract(now, vol) {
    const base = 220;
    const harmonics = [1, 2, 3, 4, 5];
    for (let i = 0; i < harmonics.length; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = base * harmonics[i];
      const voice = this._createVoice(0);
      osc.connect(voice.gain);
      const start = now + i * 0.15;
      voice.gain.gain.setValueAtTime(0, start);
      voice.gain.gain.linearRampToValueAtTime(vol * 0.3 / (i + 1), start + 0.1);
      voice.gain.gain.linearRampToValueAtTime(vol * 0.2 / (i + 1), start + 1.5);
      voice.gain.gain.exponentialRampToValueAtTime(0.001, start + 2.5);
      osc.start(start);
      osc.stop(start + 2.6);
    }
  }

  /** Everything pitch-shifts down, distorts, and cuts to silence — game over */
  _playDeath(now) {
    if (this.drone) {
      this.drone.osc.frequency.linearRampToValueAtTime(15, now + 1.5);
      this.drone.gain.gain.linearRampToValueAtTime(0.3, now + 0.5);
      this.drone.gain.gain.linearRampToValueAtTime(0, now + 1.5);
    }
    for (const voice of this.wellVoices) {
      voice.osc.frequency.linearRampToValueAtTime(15, now + 1.5);
      voice.gain.gain.linearRampToValueAtTime(0, now + 1.5);
    }
    // Master fade to silence
    this.master.gain.linearRampToValueAtTime(0, now + 1.5);
  }

  /** Distant pop — quick highpassed noise burst for scavenger extraction */
  _playScavengerExtract(now, vol, pan) {
    const noise = this._createNoise(0.1);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1000;
    const voice = this._createVoice(pan);
    noise.connect(filter);
    filter.connect(voice.gain);
    voice.gain.gain.setValueAtTime(vol, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    noise.start(now);
    noise.stop(now + 0.12);
  }
}
