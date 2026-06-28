// src/render-three/vfx/vfx-events.js
//
// Renderer-neutral VFX event helpers. Event names describe presentation beats,
// not Three implementation details, so future renderers can consume the same
// stream without inheriting this scene graph.

const TITLE_GLYPH_EVENT = 'titleGlyphFault';

function finiteOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function titleGlyphFaultEvent(input = {}) {
  const screenX = finiteOr(input.screenX, NaN);
  const screenY = finiteOr(input.screenY, NaN);
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return null;
  const intensity = Math.max(0, Math.min(1, finiteOr(input.intensity, 0)));
  if (intensity <= 0.001) return null;
  return {
    type: TITLE_GLYPH_EVENT,
    eventId: String(input.eventId || `${TITLE_GLYPH_EVENT}:${input.seed || 0}:${Math.round(screenX)}:${Math.round(screenY)}`),
    glyph: String(input.glyph || '*').slice(0, 2),
    cleanGlyph: String(input.cleanGlyph || '').slice(0, 2),
    screenX,
    screenY,
    glyphWidth: Math.max(4, finiteOr(input.glyphWidth, 18)),
    glyphHeight: Math.max(8, finiteOr(input.glyphHeight, 54)),
    intensity,
    seed: String(input.seed || 'title'),
    heavy: input.heavy === true,
    role: input.role || 'inhibitor',
  };
}

export function isTitleGlyphFaultEvent(event) {
  return event?.type === TITLE_GLYPH_EVENT
    && Number.isFinite(event.screenX)
    && Number.isFinite(event.screenY)
    && Number.isFinite(event.intensity);
}
