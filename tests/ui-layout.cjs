const assert = require('assert');

(async () => {
  const tokens = await import('../src/ui/design-tokens.js');
  const prompts = await import('../src/ui/input-prompts.js');
  const layout = await import('../src/ui/layout-contract.js');

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
  assert(!prompts.actionCaptionMarkup('confirm', 'confirm', { deck: true }).includes('ui-action-copy'), 'duplicate action/subprompt verb emitted');
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

  const home = layout.deckPanelLayout(960, 720, 'home', 960);
  assertSurface('home panels', [home.left, home.center, home.right]);
  assert(layout.rectContains(home.center, { ...home.center, x: home.center.x + geometry.panel.paddingX, y: home.center.y + geometry.panel.paddingY, w: home.center.w - geometry.panel.paddingX * 2, h: home.center.h - geometry.panel.paddingY * 2 }), 'home content escaped panel');
  const profile = layout.profileSurfaceLayout(960, 720);
  assert(profile.rows.every((row) => layout.rectContains(profile.panel, row, geometry.panel.paddingX)), 'profile row escaped panel padding');
  const title = layout.titleSurfaceLayout(1280, 720, 'left');
  assert(layout.rectContains({ x: title.panelX, y: title.panelY, w: title.panelW, h: title.panelH }, title.commandRect), 'title command escaped panel');
  assert(layout.rectContains({ x: title.panelX, y: title.panelY, w: title.panelW, h: title.panelH }, title.footerRect), 'title prompt rail escaped panel');
  const results = layout.resultsSurfaceLayout(960, 720);
  assert(layout.rectContains(results.panel, results.button, geometry.panel.paddingX), 'results CTA escaped panel');
  const hud = layout.hudSurfaceLayout(960, 720);
  assertSurface('HUD surfaces', [hud.vitals, hud.portals, hud.actions, hud.interaction]);

  console.log(`UILayout: ${prompts.PLAYER_ACTION_IDS.length} action ids, focused prompt/compound-row assertions passed.`);
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
