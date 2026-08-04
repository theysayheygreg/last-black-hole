import { worldRadiusToSceneScale } from '../coords.js';

export function wrappedAxisDelta(next, previous, worldScale) {
  if (!Number.isFinite(next) || !Number.isFinite(previous)) return 0;
  let delta = next - previous;
  if (Number.isFinite(worldScale) && worldScale > 0) {
    const half = worldScale / 2;
    if (delta > half) delta -= worldScale;
    if (delta < -half) delta += worldScale;
  }
  return delta;
}

/**
 * Shortest world-space vector from one presentation point to another.
 *
 * Three receives a map scale with each frame, so this intentionally lives
 * beside the projection rather than using the mutable client-global scale in
 * coords.js. Decorative relations use it before adding local offsets.
 */
export function wrappedWorldVector(from = {}, to = {}, worldScale) {
  return {
    x: wrappedAxisDelta(Number(to?.x), Number(from?.x), worldScale),
    y: wrappedAxisDelta(Number(to?.y), Number(from?.y), worldScale),
  };
}
export function normalizedWorldPhase(value, worldScale) {
  if (!Number.isFinite(value) || !Number.isFinite(worldScale) || worldScale <= 0) return 0;
  const unit = ((value / worldScale) % 1 + 1) % 1;
  return unit - 0.5;
}

export function createWorldProjection(camera = {}, aspect = 1) {
  const worldScale = Math.max(0.001, Number(camera.worldScale) || 3);
  const cameraView = Math.max(0.001, Number(camera.view ?? camera.cameraView) || 3);
  const camX = Number(camera.x ?? camera.camX) || 0;
  const camY = Number(camera.y ?? camera.camY) || 0;
  const safeAspect = Math.max(0.001, Number(aspect) || 1);

  return Object.freeze({
    camera: Object.freeze({ x: camX, y: camY, worldScale, view: cameraView }),
    aspect: safeAspect,
    project(wx, wy) {
      const dx = wrappedAxisDelta(Number(wx), camX, worldScale);
      const dy = wrappedAxisDelta(Number(wy), camY, worldScale);
      return {
        x: (dx / cameraView) * 2 * safeAspect,
        y: (-dy / cameraView) * 2,
        scale: 2 / cameraView,
      };
    },
    radius(worldRadius, radiusMode = 'world') {
      return worldRadiusToSceneScale(Math.max(0.001, worldRadius), safeAspect, cameraView, radiusMode);
    },
    isVisible(point, radius = 0.04) {
      const xLimit = Math.max(1, safeAspect) + 0.25 + radius;
      return Math.abs(point.x) <= xLimit && Math.abs(point.y) <= 1.25 + radius;
    },
  });
}
