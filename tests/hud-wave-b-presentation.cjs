const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

(async () => {
  const hud = await import(pathToFileURL(path.join(ROOT, 'src/ui/hud-presentation.js')).href);
  const layout = await import(pathToFileURL(path.join(ROOT, 'src/ui/layout-contract.js')).href);

  const schedule = { windows: [
    { openTime: 570, closeTime: 630, metadata: { finalExfil: true, effectiveCountRange: [1, 1] } },
  ] };
  const inboundState = hud.resolveHudTimerState({
    runElapsedTime: 550, runDurationSeconds: 600, portalSchedule: schedule,
  });
  assert.deepStrictEqual(hud.getCollapseTimerPresentation(inboundState), {
    label: 'final aperture', value: '0:20', tone: 'critical',
  }, 'final countdown must compose from the accepted aperture schedule');
  const openState = hud.resolveHudTimerState({
    runElapsedTime: 575, runDurationSeconds: 600, portalSchedule: schedule,
  });
  assert.deepStrictEqual(hud.getCollapseTimerPresentation(openState), {
    label: 'aperture open', value: '0:55', tone: 'active',
  }, 'open window must use authority close time');
  assert.deepStrictEqual(hud.getCollapseTimerPresentation({ matchRemainingSeconds: 180 }), {
    label: 'universal collapse', value: '3:00', tone: 'normal',
  });

  const burn = hud.getAbilityPresentationState({ hullType: 'breacher', burnFuel: 21 }).slots[0];
  assert.strictEqual(burn.status, 'heat headroom 70%');
  assert.strictEqual(burn.resourceLabel, 'heat');
  assert.strictEqual(burn.resource, 30);
  assert(Math.abs(burn.meter - 0.3) < 1e-9, 'Burn meter must encode Heat, not inverse fuel');
  assert(!JSON.stringify(burn).toLowerCase().includes('fuel'), 'Player Burn card leaked retired fuel vocabulary');

  for (const [width, height] of [[1048, 576], [960, 720], [1280, 800]]) {
    const surface = layout.hudSurfaceLayout(width, height);
    const persistent = ['collapse', 'vitals', 'ecology', 'warnings', 'salvage', 'portals', 'actions', 'interaction'];
    for (let i = 0; i < persistent.length; i += 1) {
      for (let j = i + 1; j < persistent.length; j += 1) {
        assert(!layout.rectsOverlap(surface[persistent[i]], surface[persistent[j]], 0),
          `${width}x${height} HUD ${persistent[i]} overlaps ${persistent[j]}`);
      }
    }
    for (const retained of ['collapse', 'vitals', 'warnings', 'salvage', 'portals', 'signature']) {
      assert(!layout.rectsOverlap(surface.inventory, surface[retained], 0),
        `${width}x${height} open inventory overlaps retained ${retained} instrument`);
    }
    assert(surface.edge === 24, 'HUD must use the canonical 24px edge margin');
  }

  const hudSource = fs.readFileSync(path.join(ROOT, 'src/hud.js'), 'utf8');
  const mainSource = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
  const htmlSource = fs.readFileSync(path.join(ROOT, 'index-a.html'), 'utf8');
  assert(hudSource.includes('applyHudContractLayout(opts)'), 'Runtime HUD does not consume contract geometry');
  assert(!hudSource.includes('next: well growth'), 'Meaningless growth countdown survived the HUD diet');
  assert(!htmlSource.includes('hud-scavengers'), 'Dead scavenger HUD node survived migration');
  assert(mainSource.includes("canvasFont(18, { weight: '700' })"), 'Ship Heat fell below the 18px action floor');
  assert(mainSource.includes("canvasFont(12, { weight: '700' })"), 'Contact labels fell below the 12px rubric floor');
  assert(!hudSource.includes('lifetimeMs: durationMs'), 'Legacy callers still override canonical toast lifetimes');
  assert(hudSource.includes('data-toast-id'), 'Toast DOM lacks stable identities for accessible reconciliation');
  assert(hudSource.includes('retained?.dataset.toastMessage === entry.message'),
    'Retained toast nodes cannot reconcile a changed loot aggregate in place');
  assert(!hudSource.slice(hudSource.indexOf('function renderToastQueue'), hudSource.indexOf('export function showWarning')).includes('_warningsEl.replaceChildren'),
    'Toast rendering still rebuilds the live log and re-announces retained messages');
  assert(htmlSource.includes('[data-tone="inhibitor"]'), 'Inhibitor contact lost its distinct threat tone');
  assert(htmlSource.includes('var(--lbh-danger)'), 'Ordinary threat treatment does not use the danger role');
  for (const leakedCopy of ['host reset', 'checking live authority', 'local authority ready', 'used: ${effectId}', 'remote exit failed',
    'authority recovery', 'LOCAL SANDBOX // SIM FROZEN', 'client debug freeze']) {
    assert(!mainSource.includes(leakedCopy), `Player-facing implementation vocabulary survived: ${leakedCopy}`);
  }

  console.log('HUDWaveBPresentation: portal-composed timer, Heat vocabulary, and complete HUD geometry agree.');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
