import { UI_DECK_GEOMETRY } from './design-tokens.js';

export function normalizeActionPrompt(entry) {
  const descriptor = entry?.descriptor || entry;
  const verb = String(entry?.verb || '').trim();
  if (!descriptor || !String(descriptor.fallbackLabel || '').trim() || !verb) return null;
  return { descriptor, verb };
}

function promptWidth(entry, gap) {
  const copyWidth = UI_DECK_GEOMETRY.actionGlyph.gap + entry.verb.length * 8;
  return Math.max(UI_DECK_GEOMETRY.actionGlyph.minWidth,
    UI_DECK_GEOMETRY.actionGlyph.minWidth + copyWidth) + gap;
}

/**
 * Measure the same wrapping used by the canvas footer renderer. Keeping this
 * pure lets screen layouts reserve the real prompt footprint before placing
 * rows or modal content.
 */
export function measureActionFooter(actions, {
  gap = UI_DECK_GEOMETRY.panel.gap,
  maxWidth = Infinity,
  lineHeight = UI_DECK_GEOMETRY.actionGlyph.minHeight + UI_DECK_GEOMETRY.panel.gap,
} = {}) {
  const placed = [];
  let cursor = 0;
  let top = 0;
  let rowCount = 0;
  for (const entry of Array.isArray(actions) ? actions : []) {
    const prompt = normalizeActionPrompt(entry);
    if (!prompt) continue;
    const width = promptWidth(prompt, gap);
    if (cursor > 0 && cursor + width > maxWidth) {
      cursor = 0;
      top += lineHeight;
    }
    if (cursor === 0) rowCount += 1;
    placed.push({ ...prompt, x: cursor, y: top, w: width });
    cursor += width;
  }
  const contentHeight = placed.length > 0 ? top + UI_DECK_GEOMETRY.actionGlyph.minHeight : 0;
  return {
    placed,
    rowCount,
    contentHeight,
    // drawActionFooter's backing extends six pixels above and below prompts.
    height: placed.length > 0 ? contentHeight + 12 : 0,
    lineHeight,
  };
}
