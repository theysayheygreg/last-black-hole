import { UI_COLORS, UI_DECK_GEOMETRY, UI_FONT_STACK, UI_TIERS, UI_CATEGORIES, UI_SHADOWS, UI_SPACING, UI_TYPOGRAPHY } from './design-tokens.js';

export function inventorySelectionStyle(selected) {
  if (!selected) return '';
  return `border-left: 2px solid ${UI_COLORS.selectionBorder}; padding-left: ${UI_SPACING.terminalRowPaddingX}px; background: ${UI_COLORS.selectionBackground};`;
}

export function inventoryItemColor(item) {
  return UI_TIERS[item?.tier] || UI_CATEGORIES[item?.category] || '#ccc';
}

export function terminalRowStyle({ selected = false, tone = 'default' } = {}) {
  const background = selected
    ? UI_COLORS.selectionBackground
    : (tone === 'quiet' ? 'transparent' : UI_COLORS.terminalRowBackground);
  const border = selected ? UI_COLORS.selectionBorder : UI_COLORS.terminalRowBorder;
  return [
    'display: flex',
    'align-items: center',
    `gap: ${UI_DECK_GEOMETRY.listRow.gap}px`,
    `min-height: ${UI_DECK_GEOMETRY.listRow.minHeight}px`,
    `padding: ${UI_DECK_GEOMETRY.listRow.paddingY}px ${UI_DECK_GEOMETRY.listRow.paddingX}px`,
    `background: ${background}`,
    `border-left: 2px solid ${border}`,
    `font: ${UI_TYPOGRAPHY.couchSmall}px ${UI_FONT_STACK}`,
  ].join('; ') + ';';
}

export function terminalPillMarkup(label, { color = UI_COLORS.terminalPillText } = {}) {
  return `<span class="hud-terminal-pill" style="
    display: inline-flex;
    align-items: center;
    min-height: ${UI_DECK_GEOMETRY.valueBlock.minHeight / 2}px;
    padding: 4px ${UI_DECK_GEOMETRY.valueBlock.paddingX}px;
    border: 1px solid ${UI_COLORS.terminalPillBorder};
    background: ${UI_COLORS.terminalPillBackground};
    color: ${color};
    font: ${UI_TYPOGRAPHY.micro}px ${UI_FONT_STACK};
    letter-spacing: ${UI_TYPOGRAPHY.labelLetterSpacing};
    text-transform: ${UI_TYPOGRAPHY.labelTransform};
    white-space: nowrap;
  ">${label}</span>`;
}

export function terminalMutedStyle() {
  return `color: ${UI_COLORS.terminalRowMuted};`;
}

export function portalArrowMarkup({ degrees, distanceText }) {
  return `<div class="hud-portal-arrow-glyph" style="
    transform: rotate(${degrees}deg);
    width: 0; height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-bottom: 12px solid ${UI_COLORS.portal};
    filter: drop-shadow(${UI_SHADOWS.portalGlow});
  "></div>
  <div class="hud-portal-arrow-distance" style="
    font: ${UI_TYPOGRAPHY.small}px ${UI_FONT_STACK};
    color: ${UI_COLORS.portalDim};
    text-align: center;
    margin-top: 2px;
  ">${distanceText}</div>`;
}

export function setWarningColor(element, color) {
  element.style.color = color || UI_COLORS.warningText;
}
