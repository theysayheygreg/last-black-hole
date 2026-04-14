/**
 * Audio toolkit smoke test.
 * Generates a tiny synthetic chirp, runs the Python workbench, and verifies outputs exist.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TMP = path.join(ROOT, 'tmp', 'audio-toolkit-test');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

const fixture = path.join(TMP, 'fixture.wav');
const outputDir = path.join(TMP, 'fixture-audio-workbench');

execFileSync('ffmpeg', [
  '-y',
  '-f', 'lavfi',
  '-i', 'sine=frequency=880:duration=0.35',
  '-af', 'afade=t=in:st=0:d=0.01,afade=t=out:st=0.25:d=0.1',
  fixture,
], { stdio: 'pipe' });

const pythonBin = fs.existsSync(path.join(ROOT, '.venv', 'bin', 'python'))
  ? path.join(ROOT, '.venv', 'bin', 'python')
  : 'python3';

execFileSync(pythonBin, [
  path.join(ROOT, 'tools', 'audio_workbench.py'),
  fixture,
  '--output-dir', outputDir,
  '--palette', 'chip',
  '--audio-js-event', 'menuMoveRef',
], { stdio: 'pipe', cwd: ROOT });

const expectedFiles = [
  'analysis.json',
  'web_audio_recipe.json',
  'brief.md',
  'prompt-sfx.txt',
  'prompt-music.txt',
  'preview.wav',
  'manifest.json',
  'audio_js_stub.js',
];

for (const file of expectedFiles) {
  const full = path.join(outputDir, file);
  assert(fs.existsSync(full), `Missing output: ${file}`);
  assert(fs.statSync(full).size > 0, `Output is empty: ${file}`);
}

const analysis = JSON.parse(fs.readFileSync(path.join(outputDir, 'analysis.json'), 'utf8'));
assert(analysis.classification && analysis.classification.primary, 'analysis.json missing classification.primary');
assert(Array.isArray(analysis.recommended_targets), 'analysis.json missing recommended_targets');
assert(analysis.suggested_web_audio && analysis.suggested_web_audio.engine === 'web-audio', 'analysis.json missing web audio recipe');
const audioStub = fs.readFileSync(path.join(outputDir, 'audio_js_stub.js'), 'utf8');
assert(audioStub.includes("case 'menuMoveRef'"), 'audio_js_stub.js missing switch case');
assert(audioStub.includes('_playMenuMoveRef'), 'audio_js_stub.js missing generated method');

console.log('PASS: Audio toolkit smoke');

fs.rmSync(TMP, { recursive: true, force: true });
