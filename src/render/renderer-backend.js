// src/render/renderer-backend.js
//
// Renderer backend bridge. The legacy path keeps the existing raw WebGL
// Composer as-is. The Three path runs the same gameplay/render source frame
// through a visible Three.js canvas so the new renderer can be developed in
// parallel without letting Three own sim truth.

import { ThreeRendererBackend } from '../render-three/three-renderer.js';

function currentSearch() {
  return typeof window !== 'undefined' ? window.location.search : '';
}

export function requestedRendererBackend(search = currentSearch()) {
  const params = new URLSearchParams(search);
  const backend = (params.get('renderer') || 'legacy').toLowerCase();
  return backend === 'three' ? 'three' : 'legacy';
}

export function requestedRenderQuality(search = currentSearch()) {
  const params = new URLSearchParams(search);
  if (params.has('minimalrender')) return 'minimal';
  const quality = (params.get('renderQuality') || 'rich').toLowerCase();
  return ['minimal', 'default', 'rich'].includes(quality) ? quality : 'rich';
}

function setCanvasVisible(canvas, visible) {
  if (!canvas) return;
  canvas.style.display = visible ? 'block' : 'none';
  canvas.style.opacity = visible ? '1' : '0';
}

export class LegacyRendererBackend {
  constructor({ composer, asciiPass, sourceCanvas, targetCanvas = null, renderQuality = 'rich' }) {
    this.name = 'legacy';
    this.renderQuality = renderQuality;
    this.composer = composer;
    this.asciiPass = asciiPass;
    this.sourceCanvas = sourceCanvas;
    this.targetCanvas = targetCanvas;
    setCanvasVisible(this.sourceCanvas, true);
    setCanvasVisible(this.targetCanvas, false);
  }

  resize(width, height) {
    this.composer.resize(width, height);
  }

  render(frameContext) {
    return this.composer.render(frameContext);
  }

  setViewMode(mode) {
    this.asciiPass.setViewMode(mode);
  }

  getViewMode() {
    return this.asciiPass.getViewMode();
  }

  getPerfStats() {
    return {
      backend: this.name,
      renderQuality: this.renderQuality,
      passCount: this.composer?.passes?.length || 0,
      composerPasses: this.composer?.passes?.map((p) => p.name) || [],
      three: null,
    };
  }
}

export function createRendererBackend({
  backend,
  composer,
  asciiPass,
  sourceCanvas,
  targetCanvas,
  renderQuality,
}) {
  if (backend === 'three' && targetCanvas) {
    try {
      return new ThreeRendererBackend({
        composer,
        asciiPass,
        sourceCanvas,
        targetCanvas,
        renderQuality,
      });
    } catch (err) {
      console.warn('[render] Three backend failed to initialize; falling back to legacy:', err);
    }
  }
  return new LegacyRendererBackend({
    composer,
    asciiPass,
    sourceCanvas,
    targetCanvas,
    renderQuality,
  });
}
