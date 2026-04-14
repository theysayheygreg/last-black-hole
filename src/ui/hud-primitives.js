import { UI_COLORS, UI_FONT_STACK, UI_TIERS, UI_CATEGORIES, UI_SHADOWS } from './design-tokens.js';

export function inventorySelectionStyle(selected) {
  if (!selected) return '';
  return `border-left: 2px solid ${UI_COLORS.selectionBorder}; padding-left: 6px; background: ${UI_COLORS.selectionBackground};`;
}

export function inventoryItemColor(item) {
  return UI_TIERS[item?.tier] || UI_CATEGORIES[item?.category] || '#ccc';
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
    font: 10px ${UI_FONT_STACK};
    color: ${UI_COLORS.portalDim};
    text-align: center;
    margin-top: 2px;
  ">${distanceText}</div>`;
}

export function setWarningColor(element, color) {
  element.style.color = color || UI_COLORS.warningText;
}
