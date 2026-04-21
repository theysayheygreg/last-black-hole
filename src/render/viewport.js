// src/render/viewport.js
//
// Fixed internal render resolution + aspect-preserving letterbox.
//
// The game renders at a CONSTANT backing-store size (RENDER_W × RENDER_H)
// regardless of window dimensions. CSS width/height on the canvas are set
// to the largest rect that preserves the render aspect ratio inside the
// window. Extra space is black letterbox.
//
// This guarantees the black hole (and every other framed visual) has an
// authored shape that never reshapes when the user resizes, fullscreens,
// or moves between monitors. Window size only scales the whole frame.
//
// Exports:
//   RENDER_W, RENDER_H      — canonical internal resolution (1280x720)
//   MIN_WINDOW_W/H          — below this, we refuse to render and show
//                             a "resize to play" overlay.
//   fitViewport(canvases)   — applies backing store + CSS sizing. Returns
//                             { ok, cssW, cssH } so callers can gate the
//                             render loop when the window is too small.
//   windowToRenderCoords(...) — converts mouse clientX/Y → render-space
//                               pixel coords via the canvas bounding rect.

export const RENDER_W = 1280;
export const RENDER_H = 720;
export const MIN_WINDOW_W = 800;
export const MIN_WINDOW_H = 450;  // 16:9 of MIN_WINDOW_W

const RENDER_ASPECT = RENDER_W / RENDER_H;

/**
 * Size the given canvases for a fixed internal render.
 * - Each canvas's backing store is forced to RENDER_W × RENDER_H.
 * - CSS width/height are set to the largest aspect-preserving rect that
 *   fits inside the current window, centered with letterbox margins.
 * Returns { ok, cssW, cssH }. ok=false if the window is below MIN_*.
 */
export function fitViewport(...canvases) {
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  const ok = winW >= MIN_WINDOW_W && winH >= MIN_WINDOW_H;

  // Largest letterbox rect that preserves RENDER_ASPECT.
  const winAspect = winW / winH;
  let cssW, cssH;
  if (winAspect > RENDER_ASPECT) {
    cssH = winH;
    cssW = Math.round(cssH * RENDER_ASPECT);
  } else {
    cssW = winW;
    cssH = Math.round(cssW / RENDER_ASPECT);
  }
  const cssLeft = Math.round((winW - cssW) / 2);
  const cssTop = Math.round((winH - cssH) / 2);

  for (const c of canvases) {
    if (!c) continue;
    if (c.width !== RENDER_W) c.width = RENDER_W;
    if (c.height !== RENDER_H) c.height = RENDER_H;
    c.style.width = `${cssW}px`;
    c.style.height = `${cssH}px`;
    c.style.left = `${cssLeft}px`;
    c.style.top = `${cssTop}px`;
  }

  return { ok, cssW, cssH, cssLeft, cssTop };
}

/**
 * Convert a mouse/pointer event's window-space coords to render-space
 * pixel coords via the canvas bounding rect. Clamps to the render box.
 */
export function windowToRenderCoords(clientX, clientY, canvas) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return [0, 0];
  const nx = (clientX - rect.left) / rect.width;
  const ny = (clientY - rect.top) / rect.height;
  return [
    Math.max(0, Math.min(RENDER_W, nx * RENDER_W)),
    Math.max(0, Math.min(RENDER_H, ny * RENDER_H)),
  ];
}
