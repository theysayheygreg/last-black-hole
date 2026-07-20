const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.resolve(__dirname, '..');

class AudioParam {
  constructor(value = 0) { this.value = value; this.events = []; }
  cancelScheduledValues(at) { this.events.push(['cancel', at]); }
  setValueAtTime(value, at) { this.value = value; this.events.push(['set', value, at]); }
  linearRampToValueAtTime(value, at) { this.value = value; this.events.push(['linear', value, at]); }
  exponentialRampToValueAtTime(value, at) { this.value = value; this.events.push(['exponential', value, at]); }
}

class Node {
  constructor(kind) { this.kind = kind; this.connections = []; }
  connect(destination) { this.connections.push(destination); return destination; }
  disconnect() { this.disconnected = true; this.connections.length = 0; }
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.sampleRate = 48000;
    this.destination = new Node('destination');
    this.nodes = [];
  }
  _node(kind) { const node = new Node(kind); this.nodes.push(node); return node; }
  createGain() { const node = this._node('gain'); node.gain = new AudioParam(); return node; }
  createDynamicsCompressor() { const node = this._node('compressor'); for (const key of ['threshold', 'knee', 'ratio', 'attack', 'release']) node[key] = new AudioParam(); return node; }
  createBiquadFilter() { const node = this._node('filter'); node.frequency = new AudioParam(); node.Q = new AudioParam(); return node; }
  createWaveShaper() { return this._node('waveshaper'); }
  createDelay() { const node = this._node('delay'); node.delayTime = new AudioParam(); return node; }
  createStereoPanner() { const node = this._node('panner'); node.pan = new AudioParam(); return node; }
  createOscillator() { const node = this._node('oscillator'); node.frequency = new AudioParam(); node.detune = new AudioParam(); node.setPeriodicWave = () => {}; node.start = () => { node.started = true; }; node.stop = (at = this.currentTime) => { node.stopped = true; node.stopAt = at; if (at <= this.currentTime && node.onended) { node.ended = true; node.onended(); } }; return node; }
  createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  createBufferSource() { const node = this._node('buffer'); node.start = () => { node.started = true; }; node.stop = () => { node.stopped = true; if (node.onended) node.onended(); }; return node; }
  createPeriodicWave() { return {}; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  advanceTo(at) {
    this.currentTime = at;
    for (const node of this.nodes) {
      if (node.kind === 'oscillator' && node.stopped && !node.ended && node.stopAt <= at && node.onended) {
        node.ended = true;
        node.onended();
      }
    }
  }
}

function pannersSince(ctx, start) { return ctx.nodes.slice(start).filter((node) => node.kind === 'panner'); }

(async () => {
  global.window = { AudioContext: FakeAudioContext };
  const { AudioEngine } = await import(pathToFileURL(path.join(ROOT, 'src/audio.js')).href);
  const engine = new AudioEngine();
  engine.init();
  const ctx = engine.ctx;

  engine.setContext('menu');
  const menuStart = ctx.nodes.length;
  assert.strictEqual(engine.playEvent('menuConfirm'), true);
  assert(pannersSince(ctx, menuStart).every((panner) => panner.connections.includes(engine.busGains.ui)), 'menu confirmation routes to ui bus');

  const warningStart = ctx.nodes.length;
  assert.strictEqual(engine.playEvent('hullWarning'), true);
  assert(pannersSince(ctx, warningStart).every((panner) => panner.connections.includes(engine.busGains.critical)), 'hull warning routes to critical bus');

  engine.reset();
  engine.setContext('gameplay');
  assert.strictEqual(engine.busGains.ambient.gain.value, 0.42, 'gameplay bed owns ambient target');
  assert.strictEqual(engine.busGains.world.gain.value, 0.72, 'gameplay bed owns world target');
  assert.strictEqual(engine.playEvent('pulse'), true);
  assert.strictEqual(engine.busGains.ambient.gain.value, 0.42, 'duck release must not overwrite ambient bed target');
  assert.strictEqual(engine.busGains.world.gain.value, 0.72, 'duck release must not overwrite world bed target');
  assert(engine.busDuckGains.ambient.gain.events.some((event) => event[0] === 'linear' && event[1] < 1),
    'pulse should schedule attenuation on the separate ambient duck stage');

  engine.setMixSettings({ muted: true });
  engine.update(1, [], {}, 0, 0, 0, 0, 0, 1);
  assert.strictEqual(engine.master.gain.value, 0, 'mute survives update');
  engine.reset();
  assert.strictEqual(engine.master.gain.value, 0, 'mute survives reset');

  engine.setMixSettings({ muted: false });
  const heldStart = ctx.nodes.length;
  assert.strictEqual(engine.playEvent('portalReady'), true);
  const held = engine._portalReadyVoice;
  assert(held && held.voice.persistent, 'portal-ready voice is persistent');
  assert.strictEqual(held.voice._cleanup, null, 'persistent voice bypasses one-shot cleanup');
  assert(pannersSince(ctx, heldStart).every((panner) => panner.connections.includes(engine.busGains.world)), 'portal-ready routes to its world bus');
  engine.reset();
  assert.strictEqual(engine._portalReadyVoice, null, 'reset clears held portal-ready voice');
  assert.strictEqual(held.osc.stopped, true, 'reset stops held portal-ready oscillator');
  assert.strictEqual(held.osc.disconnected, undefined, 'held voice remains connected during its release fade');
  ctx.advanceTo(ctx.currentTime + 0.06);
  assert.strictEqual(held.osc.disconnected, true, 'held voice disconnects after its scheduled stop');

  for (const terminalCue of ['portalConfirm', 'portalBlocked', 'portalFinal', 'extract', 'death']) {
    engine.reset();
    ctx.currentTime += 1;
    assert.strictEqual(engine.playEvent('portalReady'), true, `${terminalCue}: portal-ready starts`);
    const activeHeld = engine._portalReadyVoice;
    ctx.currentTime += 0.1;
    assert.strictEqual(engine.playEvent(terminalCue), true, `${terminalCue}: terminal cue admitted`);
    assert.strictEqual(engine._portalReadyVoice, null, `${terminalCue}: terminal cue clears held portal-ready voice`);
    assert.strictEqual(activeHeld.osc.stopped, true, `${terminalCue}: terminal cue stops held oscillator`);
    ctx.advanceTo(ctx.currentTime + 0.06);
  }

  engine.reset();
  engine.setMixSettings({ muted: false, masterVolume: 0.7 });
  engine.setContext('gameplay');
  ctx.currentTime += 1;
  assert.strictEqual(engine.playEvent('death'), true, 'death cue enters terminal audio state');
  assert.strictEqual(engine.getDiagnostics().phase, 'terminal-linger', 'death owns terminal-linger state');
  const fadeEventCount = engine.master.gain.events.length;
  engine.update(1, [], {}, 0, 0, 0, 0, 0, 1);
  assert.strictEqual(engine.master.gain.value, 0, 'frame updates do not overwrite the terminal master fade');
  assert.strictEqual(engine.master.gain.events.length, fadeEventCount,
    'terminal frame update does not schedule a competing master ramp');
  engine.setContext('menu');
  assert.strictEqual(engine.master.gain.value, 0.7, 'leaving terminal state restores the configured master level');

  engine.reset();
  ctx.currentTime = 120;
  engine.setVariationSeed('relative-trace');
  ctx.currentTime = 122.5;
  assert.strictEqual(engine.playEvent('menuConfirm'), true, 'trace fixture admits first cue');
  const trace = engine.getCaptureManifest();
  assert.strictEqual(trace.timeBasis, 'run-relative', 'trace declares run-relative time');
  assert.strictEqual(trace.eventCount, 1, 'trace records admitted cues only');
  assert.strictEqual(trace.events[0].at, 2.5, 'trace subtracts its reset origin');
  assert.strictEqual(engine.playEvent('menuConfirm'), false, 'duplicate cue is rejected by the active voice budget');
  assert.strictEqual(engine.playEvent('unknownCue'), false, 'unknown cue is rejected');
  assert.strictEqual(engine.getCaptureManifest().eventCount, 1, 'rejected cues are absent from capture evidence');

  console.log('AudioRCRecovery: 1 passed, 0 failed');
})().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
