// Canonical shipped color truth from docs/v0.3/UI-STYLE-GUIDE-v1.md.
// Consumers may change alpha for hierarchy, but must not invent role hues.

export const UI_PALETTE = Object.freeze({
  void: '#000021',
  field: '#000421',
  panelFill: 'rgba(0, 2, 10, 0.78)',
  panelBacking: 'rgba(0, 0, 8, 0.56)',
  iconBacking: 'rgba(0, 0, 8, 0.68)',
  structure: 'rgba(0, 226, 255, 0.32)',
  textPrimaryBase: '#EAF7FF',
  textPrimary: 'rgba(234, 247, 255, 0.94)',
  textMutedBase: '#9AB4CE',
  textMuted: 'rgba(154, 180, 206, 0.72)',
  bone: '#FFF4DA',
  route: '#00E2FF',
  value: '#FFB938',
  danger: '#FF3336',
  inhibitor: '#FF3EB5',
  anomaly: '#B84CFF',
  ecology: '#38F58A',
});

export const UI_ROLE_ALPHA = Object.freeze({
  routeActive: 0.9,
  routeDim: 0.58,
  value: 0.92,
  danger: 0.95,
  inhibitor: 0.95,
  anomaly: 0.94,
  ecology: 0.9,
  selectionBorder: 0.95,
  selectionFill: 0.14,
});

export function isUiRoleLegal(surface, role) {
  const purpose = String(surface || '').trim().toLowerCase();
  const value = String(role || '').trim().toLowerCase();
  if (purpose === 'selection' || purpose === 'command' || purpose === 'slab') return value !== 'salvage';
  if (purpose === 'value' || purpose === 'salvage') return value === 'salvage';
  return Boolean(value);
}

export function colorWithAlpha(hex, alpha) {
  const value = String(hex).replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(value)) throw new Error(`Expected six-digit hex color, got ${hex}`);
  const channels = value.match(/.{2}/g).map((channel) => parseInt(channel, 16));
  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${alpha})`;
}

export function colorAsNumber(hex) {
  return Number.parseInt(String(hex).replace('#', ''), 16);
}
