const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const {
  startServer,
  stopServer,
  launchGame,
  waitFor,
  withQuery,
} = require('./helpers.cjs');

const ROOT = path.resolve(__dirname, '..');

function overlaps(a, b, gap = 0) {
  return a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top;
}

async function run() {
  const prompts = await import(pathToFileURL(path.join(ROOT, 'src', 'ui', 'input-prompts.js')).href);
  const bindings = await import(pathToFileURL(path.join(ROOT, 'src', 'ui', 'input-bindings.js')).href);
  const hud = await import(pathToFileURL(path.join(ROOT, 'src', 'hud.js')).href);

  assert(prompts.affordanceCaption('confirm', 'extract', { deck: true }).includes('ui-action-glyph-face'), 'Deck affordance must be a face-button glyph');
  assert(!prompts.affordanceCaption('confirm', 'confirm', { deck: true }).includes('ui-action-copy'), 'Duplicate action verb must be suppressed');
  assert(prompts.affordanceCaption('pulse', 'activate', { deck: true }).includes('X'), 'Deck affordance must retain fallback label data');
  assert.deepStrictEqual([...bindings.GAMEPAD_ACTION_BUTTONS.delete], [3]);
  assert.deepStrictEqual([...bindings.GAMEPAD_ACTION_BUTTONS.slingshot], [3]);
  assert.strictEqual(prompts.promptLabel('delete', { deck: true }), 'Y');
  assert.strictEqual(prompts.promptLabel('slingshot', { deck: true }), 'Y');

  const interaction = hud.getInteractionPresentationState({
    label: 'confirm extraction',
    detail: 'hold inside aperture',
    verb: 'extract',
  }, { deck: true });
  assert.strictEqual(interaction.action, 'confirm');
  assert(interaction.caption.includes('data-input-family="deck"'), 'Interaction must select Deck glyph family');
  assert(interaction.caption.includes('ui-action-copy'), 'Non-duplicate interaction verb should remain visible');

  const slingshot = hud.getSlingshotInteractionState({ aim: { type: 'well' }, engaged: false });
  const slingshotPrompt = hud.getInteractionPresentationState(slingshot, { deck: true });
  const keyboardSlingshotPrompt = hud.getInteractionPresentationState(slingshot, { lastInputSource: 'keyboard' });
  assert.strictEqual(slingshot.label, 'well in range');
  assert(slingshotPrompt.caption.includes('Y'), 'Deck slingshot affordance must show Y');
  assert(keyboardSlingshotPrompt.caption.includes('F'), 'Keyboard slingshot affordance must show F');
  assert.strictEqual(hud.getSlingshotInteractionState(null), null, 'No anchor must not expose a false affordance');

  const route = hud.getRouteObjectiveState(
    { wx: 0.5, wy: 0.5 },
    { activeCount: 1, portals: [{ alive: true, wx: 0.8, wy: 0.5 }] },
    null,
    false
  );
  assert.strictEqual(route.tone, 'active');
  assert(route.label.startsWith('aperture '));
  assert(route.detail.includes('enter cyan aperture'));

  await startServer();
  let browser;
  try {
    const target = withQuery('index-a.html?renderer=three', { deck: 1, capture: 1 });
    const launched = await launchGame(target);
    browser = launched.browser;
    const { page, errors } = launched;
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.evaluate(() => {
      localStorage.clear();
      window.__TEST_API.setConfig('debug.showFPS', false);
      window.__TEST_API.setConfig('ui.motion.reduced', false);
      window.__TEST_API.showUiFixture('playing-hud', { mapIndex: 0, seed: 424242 });
    });
    await waitFor(page, () => window.__TEST_API.getGamePhase() === 'playing', { timeout: 9000 });
    await new Promise((resolve) => setTimeout(resolve, 800));
    assert.strictEqual(errors.length, 0, `browser errors before HUD inspection: ${errors.join('; ')}`);

    const layout = await page.evaluate(() => {
      const ids = ['hud-collapse', 'hud-portals', 'hud-vitals', 'hud-salvage', 'hud-actions'];
      const rects = Object.fromEntries(ids.map((id) => {
        const el = document.getElementById(id);
        const rect = el.getBoundingClientRect();
        return [id, { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }];
      }));
      const px = (selector, property) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing HUD selector: ${selector}`);
        return parseFloat(getComputedStyle(element)[property]);
      };
      return {
        rects,
        labelSize: px('#hud-vitals .hud-label', 'fontSize'),
        bodySize: px('#hud-portals .hud-value', 'fontSize'),
        captionSize: px('#hud-pulse .hud-action-caption', 'fontSize'),
        fuelHeight: document.getElementById('hud-fuel-bar').getBoundingClientRect().height,
        hullHeight: document.getElementById('hud-hull-bar').getBoundingClientRect().height,
        signalHeight: document.getElementById('hud-signal-bar').getBoundingClientRect().height,
        actionPaddingX: px('#hud-actions', 'paddingLeft'),
        actionPaddingY: px('#hud-actions', 'paddingTop'),
        commandLabel: document.querySelector('#hud-pulse .hud-command-label')?.textContent || '',
        commandCaption: document.querySelector('#hud-pulse .hud-action-caption')?.textContent || '',
        routeLabel: document.getElementById('hud-portals-status').textContent,
        hullLabel: document.getElementById('hud-hull-readout').textContent,
        panelShadow: getComputedStyle(document.getElementById('hud-vitals')).boxShadow,
      };
    });
    console.log('  1280x800 HUD rects:', JSON.stringify(layout.rects));

    const pairs = [
      ['hud-collapse', 'hud-portals'],
      ['hud-collapse', 'hud-vitals'],
      ['hud-portals', 'hud-actions'],
      ['hud-vitals', 'hud-salvage'],
      ['hud-salvage', 'hud-actions'],
    ];
    for (const [a, b] of pairs) {
      assert.strictEqual(overlaps(layout.rects[a], layout.rects[b], 6), false, `${a} overlaps ${b}`);
    }
    assert(layout.labelSize >= 13, `HUD labels too small: ${layout.labelSize}px`);
    assert(layout.bodySize >= 15, `route objective too small: ${layout.bodySize}px`);
    assert(layout.captionSize >= 13, `controller caption too small: ${layout.captionSize}px`);
    assert(layout.fuelHeight >= 16 && layout.hullHeight >= 16 && layout.signalHeight >= 16,
      `gauges below 16px: ${layout.fuelHeight}/${layout.hullHeight}/${layout.signalHeight}`);
    assert(layout.actionPaddingX >= 12 && layout.actionPaddingY >= 10, 'action rail padding is below Deck minimum');
    assert.strictEqual(layout.commandLabel.toLowerCase(), 'force pulse');
    assert.strictEqual(layout.commandCaption, 'X activate');
    assert(!/^x\s/i.test(layout.commandLabel), 'button affordance leaked into command label');
    assert(layout.routeLabel.length > 0 && layout.hullLabel.length > 0);
    assert(layout.panelShadow.includes('rgba(0, 0, 8'), `HUD panel lacks near-black offset shadow: ${layout.panelShadow}`);

    await page.evaluate(() => {
      const api = window.__TEST_API;
      const ship = api.getShipPos();
      api.spawnTestWreck(ship.x, ship.y, {
        loot: [{
          id: 'runtime-instance-must-not-drive-icon',
          catalogId: 'event-horizon-keel',
          name: 'Event Horizon Keel',
          category: 'artifact',
          subcategory: 'equippable',
          tier: 4,
          value: 420,
          effectDesc: 'well resist x1.18',
        }],
      });
      api.pickupAtShip();
      api.setInventoryOpenForTest(true);
    });
    await waitFor(page, () => document.querySelector('#hud-inventory-panel.open .inv-icon img')?.complete, { timeout: 3000 });
    const inventoryVisuals = await page.evaluate(() => {
      const panel = document.getElementById('hud-inventory-panel');
      const panelRect = panel.getBoundingClientRect();
      const item = panel.querySelector('.inv-item:has(.inv-icon img)');
      const icon = item.querySelector('.inv-icon');
      const image = icon.querySelector('img');
      const itemRect = item.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      const iconStyle = getComputedStyle(icon);
      return {
        panelWidth: panelRect.width,
        panelRight: panelRect.right,
        itemHeight: itemRect.height,
        iconWidth: iconRect.width,
        iconHeight: iconRect.height,
        iconBorder: iconStyle.borderColor,
        catalogId: icon.dataset.catalogId,
        imagePath: new URL(image.src).pathname,
        imageWidth: image.naturalWidth,
        runtimeIdLeaked: panel.innerHTML.includes('runtime-instance-must-not-drive-icon'),
      };
    });
    assert(inventoryVisuals.panelWidth >= 360 && inventoryVisuals.panelRight <= 1280,
      `Inventory panel violates Deck width: ${JSON.stringify(inventoryVisuals)}`);
    assert(inventoryVisuals.itemHeight >= 38, `Inventory row below Deck minimum: ${inventoryVisuals.itemHeight}`);
    assert(inventoryVisuals.iconWidth >= 32 && inventoryVisuals.iconHeight >= 32,
      `Inventory icon below Deck minimum: ${inventoryVisuals.iconWidth}x${inventoryVisuals.iconHeight}`);
    assert(inventoryVisuals.iconBorder.includes('255, 185, 56'),
      `Unique tier lost amber semantic role: ${inventoryVisuals.iconBorder}`);
    assert.strictEqual(inventoryVisuals.catalogId, 'event-horizon-keel');
    assert(inventoryVisuals.imagePath.endsWith('/assets/visual/items/event-horizon-keel.png'));
    assert(inventoryVisuals.imageWidth > 0, 'Inventory icon image did not decode');
    assert.strictEqual(inventoryVisuals.runtimeIdLeaked, false, 'Transient runtime id leaked into inventory markup');
    await page.screenshot({ path: '/tmp/lbh-v03-ui-assets-inventory-1280x800.png' });
    await page.evaluate(() => window.__TEST_API.setInventoryOpenForTest(false));

    await page.evaluate(() => window.__TEST_API.setConfig('ui.motion.reduced', true));
    await waitFor(page, () => document.getElementById('hud')?.dataset.reducedMotion === 'true', { timeout: 3000 });
    const reduced = await page.evaluate(() => ({
      transition: getComputedStyle(document.getElementById('hud-fuel-fill')).transitionDuration,
      signal: document.getElementById('hud-signal-zone').textContent,
      route: document.getElementById('hud-portals-status').textContent,
    }));
    assert(['0s', '0.000001s', '1e-06s'].includes(reduced.transition), `motion not suppressed: ${reduced.transition}`);
    assert(reduced.signal.length > 0 && reduced.route.length > 0, 'reduced motion removed hazard or route communication');

    await page.screenshot({ path: '/tmp/lbh-v03-hud-deck-1280x800.png' });
    assert.strictEqual(errors.length, 0, `browser errors: ${errors.join('; ')}`);
  } finally {
    if (browser) await browser.close();
    stopServer();
  }

  console.log('HUDDeck: 2 passed, 0 failed');
}

run().catch((error) => {
  console.error(error.stack || error.message);
  stopServer();
  process.exit(1);
});
