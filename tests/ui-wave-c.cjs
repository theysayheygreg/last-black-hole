const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

(async () => {
  const hulls = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/content/hulls.data.json'), 'utf8'));
  const survey = await import(pathToFileURL(path.join(ROOT, 'src/ui/map-select-survey.js')).href);
  const results = await import(pathToFileURL(path.join(ROOT, 'src/run-results.js')).href);
  const mainSource = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
  const resultSource = fs.readFileSync(path.join(ROOT, 'src/run-results.js'), 'utf8');

  const caps = Object.fromEntries(Object.entries(hulls.RIG_TRACKS).map(([hull, tracks]) => [
    hull,
    Object.values(tracks).map((track) => track.levels.length),
  ]));
  assert.deepStrictEqual(caps.drifter, [1, 3, 1]);
  assert.deepStrictEqual(caps.breacher, [2, 1, 2]);
  assert(mainSource.includes('track.maxLevel'), 'Ship/Rig surfaces do not consume per-track authority caps');
  assert(mainSource.includes('for (let ti = 0; ti < tracks.length; ti++)')
    && mainSource.includes('const maxLevel = Math.max(0, Number(track.maxLevel) || 0)')
    && mainSource.includes('${Math.min(rank, maxLevel)}/${maxLevel}'),
  'Ship tab does not allocate each track denominator independently');
  assert(!mainSource.includes('/${MAX_RIG_LEVEL}'), 'Fabricated global rig denominator survived');
  assert(!mainSource.includes("const filledBars = '#'.repeat"), 'ASCII rig gauge survived');

  const preview = survey.sanitizeSurveyPreview({
    mapClass: { id: 'expanse', label: 'THE EXPANSE' },
    scale: { cells: 15, label: '15x15', band: 'REGIONAL', grid: 7 },
    signature: { id: 'dark_run', name: 'dark run', mechanical: 'shorter sensor reach' },
    density: { band: 'MIXED', value: 0.5 },
    confidence: 64,
  });
  assert.deepStrictEqual(preview.signature, {
    id: 'dark_run', name: 'dark run', mechanical: 'shorter sensor reach',
  }, 'Signature teaching must preserve canonical mechanical copy');
  const terminal = survey.projectSurveyTerminal(preview, { seed: 42, mapClass: 'expanse' });
  assert(!Object.hasOwn(terminal, 'uncertainty'), 'Confidence is not the single map summary');
  assert(mainSource.includes('preview.signature.mechanical'), 'Map briefing does not teach the selected signature effect');
  assert(mainSource.includes('resolveTopologySignature(entry.id)'), 'Destination thumbnails still ignore authored topology signatures');

  const malformed = results.buildRunResultsViewModel({
    runResult: {
      outcome: 'death',
      emEarned: 12,
      aiOutcomes: [{ personality: 'rival' }, { personality: 'ghost', hullType: 'drifter', outcome: 'extracted' }],
    },
  });
  assert.deepStrictEqual(malformed.aiLines, ['ghost (drifter) extracted']);
  assert.deepStrictEqual(results.buildRunLedgerRows({ tone: 'death', emEarned: 12 }), [
    { label: 'residue (survival credit)', value: '12 EM', valueRole: 'salvage' },
  ]);

  for (const retired of [
    'surf the currents. escape the void.',
    'v0.3 // visual systems online',
    'DROP WINDOW READY',
    'risk gate',
    'you made it through the aperture',
    'this is what the universe kept',
  ]) {
    assert(!`${mainSource}\n${resultSource}`.includes(retired), `Retired copy survived: ${retired}`);
  }

  console.log('UIWaveC: per-track rig truth, signature teaching, single-instance copy, and map restoration agree.');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
