const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

(async () => {
  const survey = await import(pathToFileURL(path.join(ROOT, 'src/ui/map-select-survey.js')).href);
  const mapScales = await import(pathToFileURL(path.join(ROOT, 'src/content/map-scales.js')).href);
  const preview = {
    mapClass: { id: 'expanse' },
    confidence: 63,
    density: { band: 'MIXED', value: 0.56 },
    possibleContactFamilies: [
      { id: 'gravity', label: 'GRAVITY WELLS', role: 'flow', range: { min: 2, max: 6 } },
      { id: 'derelict', label: 'DERELICT FIELDS', role: 'salvage', range: { min: 3, max: 8 } },
    ],
  };
  const terminal = survey.projectSurveyTerminal(preview, { seed: 42, mapClass: 'expanse' });
  assert.deepStrictEqual(Object.keys(terminal).sort(), ['chrome', 'confidence', 'contacts', 'density', 'topologySignature']);
  assert.match(terminal.chrome.seedSerial, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.strictEqual(terminal.chrome.seedSerial, survey.projectSurveyTerminal(preview, { seed: 42, mapClass: 'expanse' }).chrome.seedSerial);
  assert.notStrictEqual(terminal.chrome.seedSerial, survey.projectSurveyTerminal(preview, { seed: 43, mapClass: 'expanse' }).chrome.seedSerial);
  assert.strictEqual(terminal.confidence, preview.confidence);
  assert(!Object.hasOwn(terminal, 'uncertainty'), 'confidence must remain the single summary statistic');
  assert.deepStrictEqual(terminal.density.legend.map(({ label }) => label), ['DENSE MASS', 'SCATTERED', 'UNCERTAIN', 'ANOMALY', 'VOID']);
  assert.deepStrictEqual(terminal.density.gradient, { low: 'LOW', high: 'HIGH' });
  assert.strictEqual(terminal.density.unstableZones.mark, 'hatch');
  assert(terminal.contacts.every((contact) => contact.icon && contact.glyph && contact.magnitude.segments === 5 && /\d+–\d+/.test(contact.range.label)));
  assert.strictEqual(survey.projectSurveyContacts([{ id: 'scavenger', range: { min: 1, max: 3 } }])[0].icon, 'scavenger-skull');
  assert.strictEqual(survey.projectSurveyContacts([{ id: 'anomaly', range: { min: 0, max: 2 } }])[0].icon, 'anomaly-burst');
  const signatures = mapScales.PLAYABLE_MAP_IDS.map((id) => survey.resolveTopologySignature(id));
  assert(signatures.every((signature) => signature && signature.rows.length === signature.grid));
  assert.strictEqual(new Set(signatures.map((signature) => signature.rows.join('/'))).size, signatures.length);

  console.log('MapSelectConceptProjections: topology, chrome, legend, contacts, and single confidence agree.');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
