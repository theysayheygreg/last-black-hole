// Canonical UI token bridge.
//
// DESIGN-SYSTEM.md is the human-readable source of truth.
// This file is the implementation-side token bundle that keeps HUD/overlay
// code from re-inventing colors, shadows, and spacing ad hoc.

export { DISPLAY_FONT_STACK, UI_FONT_STACK, GLYPH_FONT_STACK } from './typography.js';

export const UI_COLORS = {
  void: '#000021',
  panelBackground: 'rgba(0, 4, 18, 0.72)',
  panelBorder: 'rgba(0, 226, 255, 0.32)',
  panelText: 'rgba(234, 247, 255, 0.94)',
  mutedText: 'rgba(154, 180, 206, 0.72)',
  timerNormal: 'rgba(234, 247, 255, 0.9)',
  timerWarning: 'rgba(255, 185, 56, 0.95)',
  timerCritical: 'rgba(255, 51, 54, 0.95)',
  danger: 'rgba(255, 51, 54, 0.95)',
  portal: 'rgba(0, 226, 255, 0.9)',
  portalDim: 'rgba(0, 226, 255, 0.58)',
  salvage: 'rgba(255, 185, 56, 0.92)',
  signal: 'rgba(0, 226, 255, 0.9)',
  signalLabel: 'rgba(0, 226, 255, 0.62)',
  warningText: 'rgba(234, 247, 255, 0.95)',
  selectionBorder: 'rgba(0, 226, 255, 0.95)',
  selectionBackground: 'rgba(0, 226, 255, 0.14)',
  terminalRowBackground: 'rgba(0, 14, 30, 0.36)',
  terminalRowBorder: 'rgba(0, 226, 255, 0.18)',
  terminalRowMuted: 'rgba(154, 180, 206, 0.62)',
  terminalPillBackground: 'rgba(0, 226, 255, 0.14)',
  terminalPillBorder: 'rgba(0, 226, 255, 0.34)',
  terminalPillText: 'rgba(234, 247, 255, 0.88)',
  inhibitor: 'rgba(255, 62, 181, 0.95)',
  inhibitorVessel: 'rgba(255, 70, 150, 1)',
  anomaly: 'rgba(184, 76, 255, 0.94)',
  ecology: 'rgba(56, 245, 138, 0.9)',
};

export const UI_SHADOWS = {
  panelText: '0 0 6px rgba(0, 226, 255, 0.28)',
  portalGlow: '0 0 6px rgba(0, 226, 255, 0.5)',
  warningGlow: '0 0 6px rgba(0, 0, 0, 0.8)',
  inhibitorGlow: '0 0 8px rgba(255, 62, 181, 0.55)',
};

export const UI_SPACING = {
  edge: 16,
  panelPaddingX: 12,
  panelPaddingY: 8,
  panelRadius: 2,
  terminalRowGap: 6,
  terminalRowPaddingY: 3,
  terminalRowPaddingX: 6,
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

export const UI_TIERS = {
  common: 'rgba(234, 247, 255, 0.82)',
  uncommon: 'rgba(56, 245, 138, 0.9)',
  rare: 'rgba(0, 226, 255, 0.92)',
  unique: 'rgba(255, 185, 56, 0.95)',
};

export const UI_CATEGORIES = {
  salvage: 'rgba(255, 185, 56, 0.92)',
  component: 'rgba(0, 226, 255, 0.9)',
  dataCore: 'rgba(184, 76, 255, 0.94)',
  artifact: 'rgba(255, 244, 218, 0.95)',
};
