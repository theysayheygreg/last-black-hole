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
  createOscillator() { const node = this._node('oscillator'); node.frequency = new AudioParam(); node.detune = new AudioParam(); node.setPeriodicWave = () => {}; node.start = () => { node.started = true; }; node.stop = () => { node.stopped = true; if (node.onended) node.onended(); }; return node; }
  createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  createBufferSource() { const node = this._node('buffer'); node.start = () => { node.started = true; }; node.stop = () => { node.stopped = true; if (node.onended) node.onended(); }; return node; }
  createPeriodicWave() { return {}; }
  resume() { this.state = 'running'; return Promise.resolve(); }
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

  console.log('AudioRCRecovery: 1 passed, 0 failed');
})().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
