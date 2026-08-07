// src/render/renderer-backend.js
//
// Renderer backend bridge. Three is now the primary runtime path: it owns the
// visible world scene while the Composer remains the fabric/ASCII source pass.

import { ThreeRendererBackend } from '../render-three/three-renderer.js';

function currentSearch() {
  return typeof window !== 'undefined' ? window.location.search : '';
}

export function requestedRendererBackend(search = currentSearch()) {
  const params = new URLSearchParams(search);
  const backend = (params.get('renderer') || 'three').toLowerCase();
  if (backend !== 'three') throw new Error(`Unsupported renderer backend: ${backend}`);
  return 'three';
}

export function requestedRenderQuality(search = currentSearch()) {
  const params = new URLSearchParams(search);
  if (params.has('minimalrender')) return 'minimal';
  const quality = (params.get('renderQuality') || 'rich').toLowerCase();
  return ['minimal', 'default', 'rich'].includes(quality) ? quality : 'rich';
}

export function createRendererBackend({
  backend,
  composer,
  asciiPass,
  gl,
  sourceCanvas,
  targetCanvas,
  renderQuality,
}) {
  if (backend !== 'three' || !targetCanvas) throw new Error('Three renderer target is required');
  return new ThreeRendererBackend({
    composer,
    asciiPass,
    gl,
    sourceCanvas,
    targetCanvas,
    renderQuality,
  });
}
