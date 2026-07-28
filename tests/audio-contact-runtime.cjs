#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

class AudioParam {
  constructor(value = 0) { this.value = value; this.events = []; }
  cancelScheduledValues(time) { this.events.push(['cancel', time]); }
  setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); }
  linearRampToValueAtTime(value, time) { this.value = value; this.events.push(['linear', value, time]); }
  exponentialRampToValueAtTime(value, time) { this.value = value; this.events.push(['exponential', value, time]); }
}

class FakeNode {
  constructor(kind) {
    this.kind = kind;
    this.connections = [];
    this.gain = new AudioParam();
    this.frequency = new AudioParam();
    this.detune = new AudioParam();
    this.pan = new AudioParam();
    this.Q = new AudioParam();
    this.threshold = new AudioParam();
    this.knee = new AudioParam();
    this.ratio = new AudioParam();
    this.attack = new AudioParam();
    this.release = new AudioParam();
    this.delayTime = new AudioParam();
    this.started = 0;
    this.stopped = 0;
  }
  connect(node) { this.connections.push(node); return node; }
  start() { this.started += 1; }
  stop() { this.stopped += 1; }
  setPeriodicWave(wave) { this.periodicWave = wave; }
}

class FakeAudioContext {
  constructor() { this.currentTime = 10; this.state = 'running'; this.destination = new FakeNode('destination'); this.nodes = []; }
  node(kind) { const node = new FakeNode(kind); this.nodes.push(node); return node; }
  createGain() { return this.node('gain'); }
  createOscillator() { return this.node('oscillator'); }
  createStereoPanner() { return this.node('panner'); }
  createDynamicsCompressor() { return this.node('compressor'); }
  createBiquadFilter() { return this.node('filter'); }
  createWaveShaper() { return this.node('waveshaper'); }
  createDelay() { return this.node('delay'); }
  createPeriodicWave() { return {}; }
  createBuffer(_channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  createBufferSource() { return this.node('buffer-source'); }
  resume() { this.state = 'running'; }
}

async function run() {
  global.window = { AudioContext: FakeAudioContext };
  const { AudioEngine } = await import(pathToFileURL(path.join(ROOT, 'src/audio.js')).href);
  const engine = new AudioEngine();

  assert.strictEqual(engine.getDiagnostics().contacts.activeVoices, 0,
    'browser audio remains silent and uninitialized until the existing gesture-gated init');
  engine.init();
  engine.setContext('gameplay');

  const contacts = [
    { id: 'glitch-private-id', live: true, category: 'GLITCH', rangeMeters: 800, emittedRadiusMeters: 1600, bearingRadians: -Math.PI / 2 },
    { id: 'swarm-private-id', live: true, category: 'SWARM', rangeMeters: 2300, emittedRadiusMeters: 4600, bearingRadians: 0.25 },
    { id: 'vessel-private-id', live: true, category: 'VESSEL', rangeMeters: 900, emittedRadiusMeters: 4600, bearingRadians: -0.4 },
    { id: 'exfil-private-id', live: true, category: 'EXFIL TONE', rangeMeters: 700, emittedRadiusMeters: 4200, bearingRadians: 0 },
  ];
  assert.strictEqual(engine.updateAudibleContacts(contacts, { nowSeconds: 10 }), true);

  let diagnostics = engine.getDiagnostics();
  assert.strictEqual(diagnostics.contacts.activeVoices, 3, 'contact synthesis is bounded to three held voices');
  assert.deepStrictEqual(diagnostics.contacts.categories, ['EXFIL TONE', 'VESSEL', 'SWARM'],
    'contact hierarchy is EXFIL, then nearest Vessel/Swarm, then Glitch');
  assert.strictEqual(diagnostics.contacts.trace[0].event, 'enter');
  assert(!JSON.stringify(diagnostics.contacts.trace).includes('private-id'),
    'debug lifecycle trace does not record contact ids or private source data');

  const contactOscillators = engine.ctx.nodes.filter((node) => node.kind === 'oscillator' && node.contactVoice);
  const contactPanners = engine.ctx.nodes.filter((node) => node.kind === 'panner' && node.contactVoice);
  const contactGains = engine.ctx.nodes.filter((node) => node.kind === 'gain' && node.contactVoice);
  assert.strictEqual(contactOscillators.length, 3, 'each admitted contact owns an actual held oscillator');
  assert.strictEqual(contactPanners.length, 3, 'each admitted contact owns an actual stereo panner');
  assert.strictEqual(contactGains.length, 3, 'each admitted contact owns an actual gain node');
  assert(contactPanners.every((node) => node.connections.includes(engine.busGains.world)),
    'contact voices reuse the physical world bus');
  assert(contactPanners.some((node) => node.pan.value === 1), 'canonical right bearing updates pan');
  assert(contactGains.every((node) => node.gain.value > 0), 'canonical range/radius updates restrained gain');

  engine.setMixSettings({ masterVolume: 0.63, muted: false });
  const contactGainBeforeMute = contactGains[0].gain.value;
  assert.strictEqual(engine.toggleMute(), true, 'M toggles the one master owner into mute');
  assert.strictEqual(engine.master.gain.value, 0, 'master gain silences contact voices at the shared output owner');
  assert.strictEqual(engine.getDiagnostics().contacts.activeVoices, 3, 'mute does not tear down held contact voices');
  assert.strictEqual(contactGains[0].gain.value, contactGainBeforeMute, 'mute leaves the contact mix intact upstream');
  assert.strictEqual(engine.toggleMute(), false, 'M toggles the shared master owner back on');
  assert.strictEqual(engine.master.gain.value, 0.63, 'unmute restores the prior master mix');

  const oscillatorCount = contactOscillators.length;
  engine.ctx.currentTime = 10.1;
  contacts[3] = { ...contacts[3], bearingRadians: -Math.PI / 2, rangeMeters: 1400 };
  assert.strictEqual(engine.updateAudibleContacts(contacts, { nowSeconds: 10.1 }), true);
  assert.strictEqual(engine.ctx.nodes.filter((node) => node.kind === 'oscillator' && node.contactVoice).length, oscillatorCount,
    'per-frame contact updates do not restart one-shot oscillators');
  assert(engine.getDiagnostics().contacts.trace.some((entry) => entry.event === 'update' && entry.category === 'EXFIL TONE'),
    'trace proves EXFIL update lifecycle');

  engine.ctx.currentTime = 11;
  engine.updateAudibleContacts([], { nowSeconds: 11 });
  diagnostics = engine.getDiagnostics();
  assert.strictEqual(diagnostics.contacts.activeVoices, 0, 'contact expiry clears held voices');
  assert(contactOscillators.every((node) => node.stopped === 1), 'expiry deterministically stops every held oscillator');
  assert(diagnostics.contacts.trace.some((entry) => entry.event === 'exit' && entry.category === 'SWARM'),
    'trace proves ecology exit lifecycle');

  for (const terminal of ['dead', 'escaped', 'results']) {
    engine.setContext('gameplay');
    engine.updateAudibleContacts([contacts[1]], { nowSeconds: 12 });
    engine.setContext(terminal);
    assert.strictEqual(engine.getDiagnostics().contacts.activeVoices, 0, `${terminal} clears held contact voices`);
    assert.strictEqual(engine.updateAudibleContacts([contacts[1]], { nowSeconds: 12 }), false,
      `${terminal} rejects contact updates from the render loop`);
    assert.strictEqual(engine.getDiagnostics().contacts.activeVoices, 0,
      `${terminal} update cannot restart contact voices`);
  }

  for (const terminal of ['portalConfirm', 'extract', 'death']) {
    engine.setContext('gameplay');
    engine.updateAudibleContacts([contacts[3]], { nowSeconds: engine.ctx.currentTime });
    assert.strictEqual(engine.getDiagnostics().contacts.activeVoices, 1);
    engine.playEvent(terminal);
    assert.strictEqual(engine.getDiagnostics().contacts.activeVoices, 0, `${terminal} clears held contact voices`);
  }
  engine.updateAudibleContacts([contacts[1]], { nowSeconds: engine.ctx.currentTime });
  engine.setContext('results');
  assert.strictEqual(engine.getDiagnostics().contacts.activeVoices, 0, 'results phase clears held contact voices');
  engine.updateAudibleContacts([contacts[1]], { nowSeconds: engine.ctx.currentTime });
  engine.reset();
  assert.strictEqual(engine.getDiagnostics().contacts.activeVoices, 0, 'run reset clears held contact voices');

  const mainSource = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
  const memoryUpdate = mainSource.indexOf('updateAudibleContactMemory(simState.runElapsedTime);');
  const audioProjection = mainSource.indexOf('audioEngine.updateAudibleContacts([...audibleContactMemory.values()]');
  const hudUpdate = mainSource.indexOf('updateHUD(simState.runElapsedTime');
  assert(memoryUpdate >= 0 && audioProjection > memoryUpdate && audioProjection < hudUpdate,
    'the same authoritative live contact memory feeding HUD is projected into audio immediately after refresh');
  assert(/if \(gamePhase === 'playing'\) \{\s*\/\/ Refresh contact memory/.test(mainSource),
    'terminal render frames do not refresh or project audible contacts');
  assert(/if \(portal && extractNow && !_prevExtract\)/.test(mainSource),
    'local extraction requires the existing extract rising edge while overlap remains abortable');
  assert(/gamePhase === 'escaped'[\s\S]{0,120}authoritativePlayer\?\.status === 'escaped'/.test(mainSource),
    'escaped authority/game phase enters the existing HUD terminal path');

  console.log('AudioContactRuntime: authority seam, held nodes, hierarchy, lifecycle, and trace checks passed');
}

run().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
