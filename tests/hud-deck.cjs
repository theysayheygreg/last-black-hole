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

  assert.strictEqual(prompts.affordanceCaption('confirm', 'extract', { deck: true }), 'A extract');
  assert.strictEqual(prompts.affordanceCaption('pulse', 'activate', { deck: true }), 'X activate');
  assert.deepStrictEqual([...bindings.GAMEPAD_ACTION_BUTTONS.delete], [3]);
  assert.deepStrictEqual([...bindings.GAMEPAD_ACTION_BUTTONS.slingshot], [3]);
  assert.strictEqual(prompts.promptLabel('delete', { deck: true }), 'Y');
  assert.strictEqual(prompts.promptLabel('slingshot', { deck: true }), 'Y');

  const interaction = hud.getInteractionPresentationState({
    label: 'confirm extraction',
    detail: 'hold inside aperture',
    verb: 'extract',
  }, { deck: true });
  assert.deepStrictEqual(interaction, {
    action: 'confirm',
    label: 'confirm extraction',
    detail: 'hold inside aperture',
    caption: 'A extract',
  });

  const route = hud.getRouteObjectiveState(
    { wx: 0.5, wy: 0.5 },
    { activeCount: 1, portals: [{ alive: true, wx: 0.8, wy: 0.5 }] },
    null,
    false
  );
  assert.strictEqual(route.tone, 'active');
  assert(route.label.startsWith('aperture '));
  assert(route.detail.includes('enter cyan aperture'));

  assert.deepStrictEqual(hud.getCrewPresentationState([
    { clientId: 'local', name: 'Alpha', seatNo: 0, connected: true, status: 'alive', hullType: 'drifter' },
    { clientId: 'lost', name: 'Bravo', seatNo: 1, connected: false, status: 'alive', hullType: 'hauler' },
    { clientId: 'dead', name: 'Comet', seatNo: 2, connected: true, status: 'dead', hullType: 'breacher' },
    { clientId: 'gone', name: 'Delta', seatNo: 3, connected: true, status: 'escaped', hullType: 'shroud' },
    { clientId: 'ai', name: 'Machine', seatNo: null, connected: true, status: 'alive', isAI: true },
  ], 'local').map(({ seatLabel, isLocal, state }) => ({ seatLabel, isLocal, state })), [
    { seatLabel: 'P1', isLocal: true, state: 'alive' },
    { seatLabel: 'P2', isLocal: false, state: 'link lost' },
    { seatLabel: 'P3', isLocal: false, state: 'dead' },
    { seatLabel: 'P4', isLocal: false, state: 'extracted' },
  ]);

  assert.strictEqual(hud.getCrewPresentationState([
    { clientId: 'local', name: 'Alpha', seatNo: 0, connected: true, status: 'alive' },
  ], 'local', 'reconnecting')[0].state, 'link lost');
  assert.strictEqual(hud.getCrewPresentationState([
    { clientId: 'remote', name: 'Bravo', seatNo: 1, connected: false, status: 'alive', reconnectSecondsRemaining: 43.2 },
  ], 'local')[0].stateLabel, 'link lost 44s');

  const consequenceCrew = [
    { clientId: 'local', name: 'Alpha', seatNo: 0, status: 'alive' },
    { clientId: 'remote', name: 'Bravo', seatNo: 1, status: 'dead' },
  ];
  assert.deepStrictEqual(
    hud.getCrewConsequencePresentation({ type: 'player.died', payload: { clientId: 'remote' } }, consequenceCrew, 'local'),
    { text: 'P2 Bravo LOST', tone: 'danger', state: 'dead' },
  );
  assert.deepStrictEqual(
    hud.getCrewConsequencePresentation({ type: 'player.escaped', payload: { clientId: 'remote' } }, consequenceCrew, 'local'),
    { text: 'P2 Bravo EXTRACTED', tone: 'success', state: 'extracted' },
  );
  assert.deepStrictEqual(
    hud.getCrewConsequencePresentation({ type: 'player.left', payload: { clientId: 'remote', name: 'Bravo', seatNo: 1 } }, [], 'local'),
    { text: 'P2 Bravo LEFT THE CREW', tone: 'warning', state: 'left' },
  );
  assert.strictEqual(
    hud.getCrewConsequencePresentation({ type: 'player.disconnected', payload: { clientId: 'local' } }, consequenceCrew, 'local'),
    null,
  );
  assert.deepStrictEqual(
    hud.getCrewConsequencePresentation({ type: 'session.hostAssigned', payload: { clientId: 'local' } }, consequenceCrew, 'local'),
    { text: 'YOU ARE CREW LEADER', tone: 'success', state: 'leader' },
  );
  assert.deepStrictEqual(hud.getWorldPressurePresentationState({ form: 0, pressureFrac: 0.64 }), {
    visible: true, form: 0, formLabel: 'dormant', pressureFrac: 0.64, percent: 64, label: 'building // 64%',
  });
  assert.strictEqual(hud.getWorldPressurePresentationState({ form: 0, pressureFrac: 0.01 }).visible, false);
  assert.strictEqual(hud.getRouteObjectiveState(
    { wx: 1, wy: 1 },
    { activeCount: 1, portals: [{ alive: true, wx: undefined, wy: 1 }] },
    null,
  ).label, 'route closed');

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
