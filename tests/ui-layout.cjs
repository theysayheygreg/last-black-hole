const assert = require('assert');

(async () => {
  const tokens = await import('../src/ui/design-tokens.js');
  const prompts = await import('../src/ui/input-prompts.js');
  const footerLayout = await import('../src/ui/action-footer-layout.js');
  const layout = await import('../src/ui/layout-contract.js');
  const primitives = await import('../src/ui/canvas-primitives.js');
  const hudModule = await import('../src/hud.js');
  const pausePresentation = await import('../src/ui/pause-presentation.js');
  const loadout = await import('../src/ui/loadout-presentation.js');
  const runResults = await import('../src/run-results.js');

  const geometry = tokens.UI_DECK_GEOMETRY;
  const separated = (a, b, gap = geometry.separation) => (
    a.x + a.w + gap <= b.x
    || b.x + b.w + gap <= a.x
    || a.y + a.h + gap <= b.y
    || b.y + b.h + gap <= a.y
  );
  const assertSurface = (name, rects) => {
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        assert(separated(rects[i], rects[j]), `${name} rectangles ${i}/${j} overlap`);
      }
    }
  };

  assert(geometry.heading.minHeight >= 32, 'heading must reserve Deck height');
  assert(geometry.button.minWidth >= 220 && geometry.button.minHeight >= 52, 'button minimum geometry missing');
  assert(geometry.listRow.minHeight >= 48, 'list row minimum geometry missing');
  assert(geometry.iconCell.minWidth >= 40 && geometry.iconCell.minHeight >= 40, 'icon minimum geometry missing');
  assert(geometry.artCell.minWidth >= 112 && geometry.artCell.minHeight >= 96, 'art minimum geometry missing');
  assert(geometry.valueBlock.minWidth >= 116 && geometry.valueBlock.minHeight >= 46, 'value block minimum geometry missing');
  assert(geometry.panel.paddingX >= 18 && geometry.panel.gap >= 14, 'panel spacing contract missing');
  assert(geometry.viewport.minWidth === 1280 && geometry.viewport.minHeight === 800, 'Deck viewport contract must be explicit');

  const deck = prompts.actionDescriptor('confirm', { deck: true });
  const keyboard = prompts.actionDescriptor('confirm', { mode: 'keyboard' });
  const controller = prompts.actionDescriptor('tabs', { mode: 'controller' });
  const dpad = prompts.actionDescriptor('navigate', { deck: true });
  assert.strictEqual(deck.inputFamily, 'deck');
  assert.strictEqual(deck.glyphKind, 'face');
  assert.strictEqual(keyboard.glyphKind, 'keycap');
  assert.strictEqual(controller.glyphKind, 'shoulder');
  assert.strictEqual(dpad.glyphKind, 'dpad');
  for (const actionId of prompts.PLAYER_ACTION_IDS) {
    const descriptor = prompts.actionDescriptor(actionId, { deck: true });
    assert(descriptor.bindingId && descriptor.fallbackLabel && descriptor.glyphKind, `${actionId} did not resolve`);
    assert.notStrictEqual(descriptor.glyphKind, 'keycap', `${actionId} emitted a keyboard glyph in Deck mode`);
  }
  assert(prompts.actionCaptionMarkup('confirm', 'confirm', { deck: true }).includes('ui-action-copy'), 'explicit action caption was suppressed');
  assert.strictEqual(prompts.actionCaptionMarkup('confirm', '', { deck: true }), '', 'captionless DOM prompt emitted an orphan chip');
  assert(prompts.actionCaptionMarkup('confirm', 'launch', { deck: true }).includes('ui-action-copy'), 'distinct supporting verb was lost');
  assert(!prompts.actionCaptionMarkup('confirm', 'confirm', { deck: true }).includes('data-input-family="keyboard"'), 'Deck caption selected keyboard family');
  assert(prompts.affordanceCaption('slingshot', 'engage', { mode: 'controller' }).includes('ui-action-glyph'), 'Slingshot caption must generate a glyph element');
  assert.strictEqual(prompts.resolveSteamInputOrigin(deck), null, 'Browser descriptor must not claim native SDK integration');
  assert.strictEqual(prompts.resolveSteamInputOrigin(deck, ({ actionId }) => `origin:${actionId}`), 'origin:confirm', 'Origin adapter boundary must remain callable');

  const compound = layout.sizeCompound({ textWidth: 100, artWidth: geometry.artCell.minWidth, valueWidth: geometry.valueBlock.minWidth, textHeight: 18, artHeight: geometry.artCell.minHeight, valueHeight: geometry.valueBlock.minHeight });
  assert(compound.w >= 100 + geometry.artCell.minWidth + geometry.valueBlock.minWidth, 'compound row width ignored content');
  assert(compound.h >= geometry.artCell.minHeight + geometry.listRow.paddingY * 2, 'compound row height ignored art footprint');
  const itemRow = layout.itemCompoundLayout({ x: 10, y: 20, textWidth: 306, textHeight: 18 });
  assert.strictEqual(itemRow.icon.w, geometry.iconCell.minWidth, 'item row icon width must honor the shared minimum');
  assert(itemRow.text.x >= itemRow.icon.x + itemRow.icon.w + geometry.listRow.gap, 'item row text must clear the icon footprint');
  assert(itemRow.advance >= itemRow.row.h + geometry.separation, 'item row advance must clear the full compound row');
  const buttonPrompt = layout.glyphBounds({ x: 40, y: 120, w: geometry.button.minWidth, h: geometry.actionGlyph.minHeight });
  assert(buttonPrompt.w >= geometry.actionGlyph.minWidth && buttonPrompt.h >= geometry.actionGlyph.minHeight, 'glyph bounds fell below minimum geometry');
  assert(layout.rectContains({ x: 40, y: 120, w: geometry.button.minWidth, h: geometry.actionGlyph.minHeight }, buttonPrompt), 'glyph escaped prompt bounds');

  const deckOptions = { deck: true };
  const homeActions = [
    { descriptor: prompts.actionDescriptor('tabs', deckOptions), verb: 'switch tabs' },
    { descriptor: prompts.actionDescriptor('select', deckOptions), verb: 'move' },
    { descriptor: prompts.actionDescriptor('confirm', deckOptions), verb: 'use' },
    { descriptor: prompts.actionDescriptor('back', deckOptions), verb: 'back out' },
  ];
  const profileActions = [
    { descriptor: prompts.actionDescriptor('select', deckOptions), verb: 'move' },
    { descriptor: prompts.actionDescriptor('confirm', deckOptions), verb: 'load / create' },
    { descriptor: prompts.actionDescriptor('delete', deckOptions), verb: 'delete' },
    { descriptor: prompts.actionDescriptor('back', deckOptions), verb: 'back out' },
  ];
  assert.strictEqual(footerLayout.normalizeActionPrompt({ descriptor: deck, verb: '' }), null, 'captionless canvas prompt survived normalization');
  assert.strictEqual(footerLayout.measureActionFooter([{ descriptor: deck, verb: '' }]).placed.length, 0, 'captionless footer reserved phantom space');
  assert.strictEqual(footerLayout.measureActionFooter([
    { descriptor: deck, verb: '' },
    { descriptor: prompts.actionDescriptor('back', deckOptions), verb: 'back' },
  ]).placed.length, 1, 'mixed footer did not filter only its invalid prompt');
  const deleteProfileActions = [
    { descriptor: prompts.actionDescriptor('navigate', deckOptions), verb: 'choose cancel / delete' },
    { descriptor: prompts.actionDescriptor('confirm', deckOptions), verb: 'cancel' },
    { descriptor: prompts.actionDescriptor('back', deckOptions), verb: 'cancel' },
  ];
  const mapActions = [
    { descriptor: prompts.actionDescriptor('select', deckOptions), verb: 'move' },
    { descriptor: prompts.actionDescriptor('reroll', deckOptions), verb: 'new seed' },
    { descriptor: prompts.actionDescriptor('back', deckOptions), verb: 'back out' },
  ];
  const home = layout.deckPanelLayout(960, 720, 'home', 960, { rightFooterActions: homeActions, footerGap: 10 });
  assertSurface('home panels', [home.left, home.center, home.right]);
  assert(layout.rectContains(home.right, home.rightFooter, geometry.panel.paddingX), 'home right footer escaped its panel');
  assert.strictEqual(home.rightFooter.rowCount, 3, '960px Home action rail must reserve all three wrapped rows');
  assert.strictEqual(home.rightFooter.rowCount, footerLayout.measureActionFooter(homeActions, { gap: 10, maxWidth: home.rightFooter.contentWidth }).rowCount,
    'Home layout and renderer wrapping diverged');
  assert(layout.rectContains(home.center, { ...home.center, x: home.center.x + geometry.panel.paddingX, y: home.center.y + geometry.panel.paddingY, w: home.center.w - geometry.panel.paddingX * 2, h: home.center.h - geometry.panel.paddingY * 2 }), 'home content escaped panel');
  const homeDeck = layout.deckPanelLayout(1280, 800, 'home', 1280, { rightFooterActions: homeActions, footerGap: 10 });
  assert.strictEqual(homeDeck.rightFooter.rowCount, 2, '1280px Home action rail should reserve two wrapped rows');
  for (const [width, height] of [[960, 720], [1280, 800]]) {
    const profile = layout.profileSurfaceLayout(width, height, profileActions);
    assert(profile.rows.every((row) => layout.rectContains(profile.panel, row, geometry.panel.paddingX)), `${width}px profile row escaped panel padding`);
    assert(layout.rectContains(profile.panel, profile.footer, geometry.panel.paddingX), `${width}px profile footer escaped panel padding`);
    assert(profile.rows.every((row) => !layout.rectsOverlap(row, profile.footer, geometry.separation)), `${width}px profile rows overlap footer`);
    assert(layout.rectContains(profile.panel, profile.nameOverlay, geometry.panel.paddingX), `${width}px profile name overlay escaped panel`);
    assert(layout.rectContains(profile.panel, profile.deleteOverlay, geometry.panel.paddingX), `${width}px profile delete overlay escaped panel`);
    assert(!layout.rectsOverlap(profile.nameOverlay, profile.footer, 0), `${width}px profile name overlay overlaps footer`);
    assert(!layout.rectsOverlap(profile.deleteOverlay, profile.footer, 0), `${width}px profile delete overlay overlaps footer`);
    const deleteProfile = layout.profileSurfaceLayout(width, height, deleteProfileActions);
    assert(deleteProfile.rows.every((row) => row.h >= geometry.listRow.minHeight), `${width}px delete-confirmation shrank a pilot row`);
    assert(deleteProfile.rows.every((row) => !layout.rectsOverlap(row, deleteProfile.footer, geometry.separation)), `${width}px delete-confirmation rows overlap footer`);
    assert(layout.rectContains(deleteProfile.panel, deleteProfile.footer, geometry.panel.paddingX), `${width}px delete-confirmation footer escaped panel`);
    assert(!layout.rectsOverlap(deleteProfile.deleteOverlay, deleteProfile.footer, 0), `${width}px delete-confirmation overlay overlaps footer`);
  }
  const title = layout.titleSurfaceLayout(1280, 720, 'left');
  assert(layout.rectContains({ x: title.panelX, y: title.panelY, w: title.panelW, h: title.panelH }, title.commandRect), 'title command escaped panel');
  assert(layout.rectContains({ x: title.panelX, y: title.panelY, w: title.panelW, h: title.panelH }, title.footerRect), 'title prompt rail escaped panel');
  const results = layout.resultsSurfaceLayout(960, 720);
  assert(layout.rectContains(results.panel, results.button, geometry.panel.paddingX), 'results CTA escaped panel');
  assert(layout.rectContains(results.panel, results.buttonPrompt, geometry.panel.paddingX), 'results CTA prompt escaped panel');
  assert(results.buttonPrompt.y + results.buttonPrompt.h + geometry.panel.paddingY <= results.panel.y + results.panel.h, 'results CTA support glyph lost its bottom gutter');
  assert(results.contentBottom + geometry.panel.gap <= results.button.y, 'results content overlaps CTA rail');
  assert(results.cargoRowH >= 40, 'results cargo rows became too small for Deck readability');
  const pauseActions = [
    { descriptor: prompts.actionDescriptor('select', deckOptions), verb: 'select' },
    { descriptor: prompts.actionDescriptor('confirm', deckOptions), verb: 'confirm' },
    { descriptor: prompts.actionDescriptor('back', deckOptions), verb: 'resume' },
  ];
  for (const [width, height] of [[960, 720], [1280, 800]]) {
    const pause = layout.interruptSurfaceLayout(width, height, 'pause', pauseActions);
    assert(pause.panel.w <= 880 && pause.panel.h <= height * 0.75, `${width}x${height} pause escaped the single-window contract`);
    assert(pause.rows.every((row) => row.h >= 58 && layout.rectContains(pause.panel, row, geometry.panel.paddingX)), `${width}x${height} pause row failed Deck geometry`);
    assert(pause.rows.every((row) => !layout.rectsOverlap(row, pause.footer, geometry.separation)), `${width}x${height} pause rows overlap measured footer`);
    assert(layout.rectContains(pause.panel, pause.footer, geometry.panel.paddingX), `${width}x${height} pause footer escaped its panel`);
    const recovery = layout.interruptSurfaceLayout(width, height, 'recovery', [
      { descriptor: prompts.actionDescriptor('back', deckOptions), verb: 'return to the deck' },
    ]);
    assert(layout.rectContains(recovery.panel, recovery.footer, geometry.panel.paddingX), `${width}x${height} recovery footer escaped its panel`);
    assert(!layout.rectsOverlap(recovery.status, recovery.footer, geometry.separation), `${width}x${height} recovery status overlaps footer`);
  }
  assert.strictEqual(hudModule.projectHUDPhase('playing'), 'shown');
  assert.strictEqual(hudModule.projectHUDPhase('paused'), 'hidden');
  assert.strictEqual(hudModule.projectHUDPhase('recovery'), 'hidden');
  assert.strictEqual(hudModule.projectHUDPhase('mapSelect'), 'hidden');
  assert.strictEqual(hudModule.projectHUDPhase('dead'), 'terminal');
  assert.strictEqual(hudModule.projectHUDPhase('escaped'), 'terminal');
  assert.strictEqual(pausePresentation.pauseAbandonIntent({ remoteActive: false }), 'return-title');
  assert.strictEqual(pausePresentation.pauseAbandonIntent({ remoteActive: true }), 'leave-remote');
  for (const [width, height] of [[1048, 576], [960, 720], [1280, 800]]) {
    const map = layout.mapSelectSurfaceLayout(width, height, width, 6, mapActions);
    const scaleBounds = primitives.statusPillBounds(map.briefStatus.scale, { minWidth: map.briefStatus.scale.w });
    const riskBounds = primitives.statusPillBounds(map.briefStatus.risk, { minWidth: map.briefStatus.risk.w });
    assert(layout.rectContains(map.right, scaleBounds, geometry.panel.paddingX), `${width}x${height} scale pill escaped briefing panel`);
    assert(layout.rectContains(map.right, riskBounds, geometry.panel.paddingX), `${width}x${height} risk pill escaped briefing panel`);
    assert(!layout.rectsOverlap(scaleBounds, riskBounds, 0), `${width}x${height} scale/risk pills overlap`);
    assert(!layout.rectsOverlap(map.briefing.titleBounds, scaleBounds, geometry.separation), `${width}x${height} scale pill overlaps title`);
    assert(!layout.rectsOverlap(map.briefing.titleBounds, riskBounds, geometry.separation), `${width}x${height} risk pill overlaps title`);
    assert(map.briefing.signatureY > scaleBounds.y + scaleBounds.h, `${width}x${height} signature row must clear scale card`);
    const contactRows = Math.ceil(4 / map.briefing.contactColumns);
    assert(map.briefing.contactY + map.briefing.contactRowStep * (contactRows - 1) + tokens.UI_DECK.minGaugeHeight + 7 < map.briefing.authorityY,
      `${width}x${height} possible contents collide with authority band`);
    assert(layout.rectContains(map.right, map.briefing.commandPrompt, geometry.panel.paddingX), `${width}x${height} map CTA prompt escaped briefing panel`);
  }
  const itemEffects = loadout.formatItemEffects({ coefficients: { thrustScale: 1.08, cargoSlots: 1 } });
  assert(itemEffects.includes('thrust response +8%'), 'item effect should use a readable percentage tag');
  assert(itemEffects.includes('cargo slots +1'), 'item effect should retain additive slot identity');
  assert.strictEqual(loadout.formatSlotIdentity({ subcategory: 'equippable' }), 'artifact slot');
  assert.strictEqual(loadout.formatSlotIdentity({ subcategory: 'consumable' }), 'hotbar slot');
  const hullStatStrip = loadout.formatHullStatStrip(loadout.formatHullStats(
    { thrustScale: 0.7, dragScale: 0.85, currentCoupling: 1.6, deltaVMax: 60 },
    { thrustScale: 0.7, dragScale: 0.85, currentCoupling: 1.6, deltaVMax: 60 },
  ));
  assert.deepStrictEqual(hullStatStrip, [
    'THRUST 70%/70%  //  DRAG 85%/85%',
    'COUPLING 160%/160%  //  TANK 60/60',
  ], 'ship stat strip must retain all fitted values in its portrait-safe rail');
  assert.deepStrictEqual(loadout.formatHullStatStrip(loadout.formatHullStats(
    { thrustScale: 0.7, dragScale: 0.85, currentCoupling: 1.6, deltaVMax: 60 },
    { thrustScale: 0.7, dragScale: 0.85, currentCoupling: 1.6, deltaVMax: 60 },
  ), { compact: true }), [
    'THR 70%/70%  //  DRG 85%/85%',
    'FLOW 160%/160%  //  TANK 60/60',
  ], 'compact ship stat strip must retain values instead of clipping under portrait art');
  const resultRows = runResults.buildRunSummaryRows({
    survival: '1:04',
    noiseSummary: '640m · IMPACT',
    noiseTimeSummary: '30s heard · 8s tracked',
    ecologyLabel: 'PHASE 3 · GLITCH 2',
    deathCause: 'well: Charybdis',
  });
  const ledgerRows = runResults.buildRunLedgerRows({ tone: 'death', emEarned: 16 });
  assert(resultRows.every((row) => row.label && row.value), 'result summary cannot render an empty labeled row');
  assert(ledgerRows.every((row) => row.label && row.value), 'result ledger cannot render an empty labeled row');
  const hud = layout.hudSurfaceLayout(960, 720);
  assertSurface('HUD surfaces', [hud.vitals, hud.portals, hud.actions, hud.interaction]);
  for (const [width, height] of [[960, 720], [1280, 800]]) {
    const surface = layout.hudSurfaceLayout(width, height);
    assert(!layout.rectsOverlap(surface.signatureNotice, surface.vitals, geometry.viewport.gap),
      `${width}x${height} signature notice crosses HULL/vitals`);
    assert(!layout.rectsOverlap(surface.signatureNotice, surface.portals, geometry.viewport.gap),
      `${width}x${height} signature notice crosses route rail`);
  }

  console.log(`UILayout: ${prompts.PLAYER_ACTION_IDS.length} action ids, focused prompt/compound-row assertions passed.`);
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
