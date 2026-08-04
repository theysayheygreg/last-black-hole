// Canonical UI token bridge.
//
// docs/v0.3/UI-STYLE-GUIDE-v1.md is the human-readable source of truth.
// This file is the implementation-side token bundle that keeps HUD/overlay
// code from re-inventing colors, shadows, and spacing ad hoc.

import { DISPLAY_FONT_STACK, UI_FONT_STACK, GLYPH_FONT_STACK } from './typography.js';
export { DISPLAY_FONT_STACK, UI_FONT_STACK, GLYPH_FONT_STACK } from './typography.js';
import { UI_PALETTE, UI_ROLE_ALPHA, colorWithAlpha } from './palette-tokens.js';
export { UI_PALETTE, UI_ROLE_ALPHA } from './palette-tokens.js';

export const UI_COLORS = {
  void: UI_PALETTE.void,
  field: UI_PALETTE.field,
  panelBackground: UI_PALETTE.panelFill,
  panelBacking: UI_PALETTE.panelBacking,
  iconBacking: UI_PALETTE.iconBacking,
  panelBorder: UI_PALETTE.structure,
  panelText: UI_PALETTE.textPrimary,
  mutedText: UI_PALETTE.textMuted,
  timerNormal: colorWithAlpha(UI_PALETTE.textPrimaryBase, 0.9),
  timerWarning: colorWithAlpha(UI_PALETTE.value, 0.95),
  timerCritical: colorWithAlpha(UI_PALETTE.danger, UI_ROLE_ALPHA.danger),
  danger: colorWithAlpha(UI_PALETTE.danger, UI_ROLE_ALPHA.danger),
  portal: colorWithAlpha(UI_PALETTE.route, UI_ROLE_ALPHA.routeActive),
  portalDim: colorWithAlpha(UI_PALETTE.route, UI_ROLE_ALPHA.routeDim),
  salvage: colorWithAlpha(UI_PALETTE.value, UI_ROLE_ALPHA.value),
  signal: colorWithAlpha(UI_PALETTE.route, UI_ROLE_ALPHA.routeActive),
  signalLabel: colorWithAlpha(UI_PALETTE.route, 0.62),
  warningText: colorWithAlpha(UI_PALETTE.textPrimaryBase, 0.95),
  selectionBorder: colorWithAlpha(UI_PALETTE.route, UI_ROLE_ALPHA.selectionBorder),
  selectionBackground: colorWithAlpha(UI_PALETTE.route, UI_ROLE_ALPHA.selectionFill),
  terminalRowBackground: colorWithAlpha(UI_PALETTE.field, 0.36),
  terminalRowBorder: colorWithAlpha(UI_PALETTE.route, 0.18),
  terminalRowMuted: colorWithAlpha(UI_PALETTE.textMutedBase, 0.62),
  terminalPillBackground: colorWithAlpha(UI_PALETTE.route, 0.14),
  terminalPillBorder: colorWithAlpha(UI_PALETTE.route, 0.34),
  terminalPillText: colorWithAlpha(UI_PALETTE.textPrimaryBase, 0.88),
  inhibitor: colorWithAlpha(UI_PALETTE.inhibitor, UI_ROLE_ALPHA.inhibitor),
  inhibitorVessel: colorWithAlpha(UI_PALETTE.inhibitor, 1),
  anomaly: colorWithAlpha(UI_PALETTE.anomaly, UI_ROLE_ALPHA.anomaly),
  ecology: colorWithAlpha(UI_PALETTE.ecology, UI_ROLE_ALPHA.ecology),
};

export const UI_SHADOWS = {
  panelText: `2px 3px 5px ${colorWithAlpha(UI_PALETTE.void, 0.9)}`,
  panel: `4px 6px 12px ${colorWithAlpha(UI_PALETTE.void, 0.72)}`,
  canvasTextColor: colorWithAlpha(UI_PALETTE.void, 0.92),
  canvasTextBlur: 4,
  canvasTextOffsetX: 2,
  canvasTextOffsetY: 3,
  portalGlow: `0 0 6px ${colorWithAlpha(UI_PALETTE.route, 0.5)}`,
  warningGlow: `0 0 6px ${colorWithAlpha(UI_PALETTE.void, 0.8)}`,
  inhibitorGlow: `0 0 8px ${colorWithAlpha(UI_PALETTE.inhibitor, 0.55)}`,
};

export const UI_SPACING = {
  edge: 24,
  panelPaddingX: 22,
  panelPaddingY: 16,
  panelRadius: 2,
  terminalRowGap: 10,
  terminalRowPaddingY: 8,
  terminalRowPaddingX: 12,
  terminalPillPaddingY: 1,
  terminalPillPaddingX: 5,
};

export const UI_TYPOGRAPHY = {
  micro: 9,
  small: 10,
  body: 12,
  couchMicro: 12,
  couchSmall: 13,
  couchBody: 15,
  couchButton: 18,
  labelTransform: 'uppercase',
  labelLetterSpacing: '0',
};

export const UI_DECK = {
  edge: 18,
  panelPaddingX: 14,
  panelPaddingY: 10,
  minBodyPx: 12,
  targetBodyPx: 15,
  minGaugeHeight: 12,
  targetGaugeHeight: 14,
  commandHeight: 44,
};

// Minimum geometry is a product contract at 1280x720/800 Deck scale. Text can
// fit inside these shapes; it cannot define their footprint by itself.
export const UI_DECK_GEOMETRY = {
  viewport: {
    minWidth: 1280,
    minHeight: 800,
    edgeX: 64,
    edgeY: 42,
    gap: 20,
  },
  panel: {
    paddingX: 22,
    paddingY: 18,
    gap: 16,
  },
  heading: {
    minHeight: 40,
    paddingX: 16,
    paddingY: 10,
    gap: 10,
  },
  button: {
    minWidth: 240,
    minHeight: 56,
    paddingX: 24,
    paddingY: 12,
    gap: 12,
  },
  listRow: {
    minHeight: 58,
    paddingX: 16,
    paddingY: 9,
    gap: 12,
  },
  iconCell: {
    minWidth: 44,
    minHeight: 44,
  },
  artCell: {
    minWidth: 128,
    minHeight: 104,
  },
  valueBlock: {
    minWidth: 132,
    minHeight: 52,
    paddingX: 14,
    paddingY: 10,
    gap: 10,
  },
  actionGlyph: {
    minWidth: 32,
    minHeight: 32,
    paddingX: 8,
    gap: 10,
  },
  separation: 10,
};

export const UI_TIERS = {
  common: colorWithAlpha(UI_PALETTE.textPrimaryBase, 0.82),
  uncommon: colorWithAlpha(UI_PALETTE.ecology, 0.9),
  rare: colorWithAlpha(UI_PALETTE.route, 0.92),
  unique: colorWithAlpha(UI_PALETTE.value, 0.95),
};

export const UI_CATEGORIES = {
  salvage: colorWithAlpha(UI_PALETTE.value, 0.92),
  component: colorWithAlpha(UI_PALETTE.route, 0.9),
  dataCore: colorWithAlpha(UI_PALETTE.anomaly, 0.94),
  artifact: colorWithAlpha(UI_PALETTE.bone, 0.95),
};

// Compatibility adapter for the current DOM surface. CSS is generated from
// these named tokens; the generator owns serialization, not design values.
export const UI_CSS_VARIABLES = Object.freeze({
  'font-display': DISPLAY_FONT_STACK,
  'font-ui': UI_FONT_STACK,
  'font-glyph': GLYPH_FONT_STACK,
  'font-mono': 'var(--lbh-font-ui)',
  void: UI_COLORS.void,
  'panel-bg': UI_COLORS.panelBackground,
  'panel-backing': UI_COLORS.panelBacking,
  'panel-shadow': UI_SHADOWS.panel,
  'text-shadow': UI_SHADOWS.panelText,
  'panel-border': UI_COLORS.panelBorder,
  'text-primary': UI_COLORS.panelText,
  'text-muted': UI_COLORS.mutedText,
  'timer-normal': UI_COLORS.timerNormal,
  'timer-glow': colorWithAlpha(UI_PALETTE.route, 0.28),
  noise: UI_COLORS.signal,
  'noise-label': UI_COLORS.signalLabel,
  danger: UI_COLORS.danger,
  ecology: UI_COLORS.ecology,
  inhibitor: UI_COLORS.inhibitor,
  'inhibitor-glow': colorWithAlpha(UI_PALETTE.inhibitor, 0.55),
  portal: UI_COLORS.portal,
  salvage: UI_COLORS.salvage,
  'track-bg': colorWithAlpha(UI_PALETTE.field, 0.7),
  'warning-shadow': colorWithAlpha(UI_PALETTE.void, 0.8),
  'panel-radius': `${UI_SPACING.panelRadius}px`,
  'edge-margin': `${UI_SPACING.edge}px`,
  'couch-micro': '13px',
  'couch-small': '14px',
  'couch-body': `${UI_TYPOGRAPHY.couchBody}px`,
  'couch-button': `${UI_TYPOGRAPHY.couchButton}px`,
  'gauge-height': '16px',
  'hud-gap': '8px',
  'deck-panel-pad-y': `${UI_DECK_GEOMETRY.panel.paddingY}px`,
  'deck-panel-pad-x': `${UI_DECK_GEOMETRY.panel.paddingX}px`,
  'deck-panel-gap': '10px',
  'deck-row-min': `${UI_DECK_GEOMETRY.listRow.minHeight}px`,
  'deck-icon-min': `${UI_DECK_GEOMETRY.iconCell.minWidth}px`,
  'deck-value-min': `${UI_DECK_GEOMETRY.valueBlock.minHeight}px`,
});
