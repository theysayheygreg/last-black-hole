// Canonical UI token bridge.
//
// DESIGN-SYSTEM.md is the human-readable source of truth.
// This file is the implementation-side token bundle that keeps HUD/overlay
// code from re-inventing colors, shadows, and spacing ad hoc.

export const UI_FONT_STACK = `'JetBrains Mono', 'SF Mono', 'Fira Code', monospace`;

export const UI_COLORS = {
  void: '#000021',
  panelBackground: 'rgba(0, 2, 12, 0.6)',
  panelBorder: 'rgba(80, 100, 140, 0.2)',
  panelText: 'rgba(150, 170, 200, 0.8)',
  timerNormal: 'rgba(150, 170, 200, 0.8)',
  timerWarning: 'rgba(240, 144, 58, 0.9)',
  timerCritical: 'rgba(232, 25, 0, 0.9)',
  portal: 'rgba(180, 120, 255, 0.85)',
  portalDim: 'rgba(180, 120, 255, 0.6)',
  salvage: 'rgba(212, 168, 67, 0.85)',
  signal: 'rgba(80, 200, 180, 0.85)',
  signalLabel: 'rgba(80, 180, 160, 0.65)',
  warningText: 'rgba(200, 200, 220, 0.9)',
  selectionBorder: 'rgba(100, 150, 255, 0.8)',
  selectionBackground: 'rgba(80, 120, 255, 0.12)',
  inhibitor: 'rgba(204, 26, 128, 0.9)',
  inhibitorVessel: 'rgba(255, 60, 140, 1)',
};

export const UI_SHADOWS = {
  panelText: '0 0 6px rgba(150, 170, 200, 0.3)',
  portalGlow: '0 0 6px rgba(180, 120, 255, 0.5)',
  warningGlow: '0 0 6px rgba(0, 0, 0, 0.8)',
  inhibitorGlow: '0 0 8px rgba(204, 26, 128, 0.5)',
};

export const UI_SPACING = {
  edge: 16,
  panelPaddingX: 12,
  panelPaddingY: 8,
  panelRadius: 2,
};

export const UI_TIERS = {
  common: 'rgba(180, 180, 190, 0.8)',
  uncommon: 'rgba(100, 255, 150, 0.9)',
  rare: 'rgba(100, 180, 255, 0.9)',
  unique: 'rgba(255, 215, 0, 0.95)',
};

export const UI_CATEGORIES = {
  salvage: 'rgba(180, 180, 190, 0.9)',
  component: 'rgba(100, 200, 255, 0.9)',
  dataCore: 'rgba(200, 160, 255, 0.9)',
  artifact: 'rgba(255, 200, 60, 0.9)',
};
