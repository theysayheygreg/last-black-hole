// Typography roles for LBH's DOM, canvas overlays, and ASCII glyph atlas.
//
// Monaspace is the project voice: code-like, boxy, and glyph-rich. Oxanium is
// reserved for big title/heading moments so it feels like a display instrument,
// not a paragraph font. Noto stays in the glyph stack as coverage insurance.

export const DISPLAY_FONT_STACK = `'Oxanium', 'Monaspace Neon', 'Monaspace Argon', sans-serif`;
export const UI_FONT_STACK = `'Monaspace Neon', 'Monaspace Argon', 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace`;
export const GLYPH_FONT_STACK = `'Monaspace Neon', 'Monaspace Argon', 'Noto Sans Mono', 'Noto Sans Symbols', 'Apple Symbols', 'Segoe UI Symbol', monospace`;

export const TYPOGRAPHY_FONT_PROBES = [
  '16px "Oxanium"',
  '16px "Monaspace Neon"',
  '16px "Monaspace Argon"',
  '16px "Noto Sans Mono"',
  '16px "Noto Sans Symbols"',
];

// Keep every non-plain glyph family the ASCII atlas currently depends on in one
// probe string so future font swaps can validate the visual alphabet directly.
export const GLYPH_PROBE_TEXT = '═║╱╲╳ΨΩ∞⌁∑∫√∂∆≈≠±×÷∴╔╗╬░▓█╚╝╠╣╦╩Z̷A̶L̸G̵O̴';

export function fontStackForRole(role = 'ui') {
  if (role === 'display') return DISPLAY_FONT_STACK;
  if (role === 'glyph') return GLYPH_FONT_STACK;
  return UI_FONT_STACK;
}

export function canvasFont(sizePx, { role = 'ui', weight = '', style = '' } = {}) {
  const prefix = [style, weight].filter(Boolean).join(' ');
  return `${prefix ? `${prefix} ` : ''}${Math.round(sizePx)}px ${fontStackForRole(role)}`;
}

export async function waitForTypographyFonts({ timeoutMs = 1800 } = {}) {
  if (typeof document === 'undefined' || !document.fonts?.load) return false;

  const timeout = new Promise((resolve) => {
    setTimeout(() => resolve(false), timeoutMs);
  });
  const load = Promise.all(TYPOGRAPHY_FONT_PROBES.map((probe) => document.fonts.load(probe)))
    .then(() => document.fonts.ready)
    .then(() => true)
    .catch(() => false);

  return Promise.race([load, timeout]);
}
