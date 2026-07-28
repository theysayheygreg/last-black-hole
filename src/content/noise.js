// Browser adapter for the single canonical Noise Radius v1 data contract.
import data from './noise.data.json' with { type: 'json' };
import { METERS_PER_SIM_UNIT } from '../units.js';
import { CAMERA_VIEW } from '../coords.js';

export const NOISE_CONFIG = data;
export const NOISE_IDENTIFICATION_FRACTION = data.identificationFraction;
export const NOISE_LAST_HEARD_FADE_SECONDS = data.lastHeardFadeSeconds;
export const NOISE_PUBLIC_SOURCE_CLASSES = Object.freeze([...data.publicSourceClasses]);
export const NOISE_WARNING_BUDGETS = data.world.warningBudgets;

// Keep the reference camera ruler with Noise data so authored emitters can be
// checked against the actual off-screen contact geometry.
export function minimumOffscreenHearingMeters(
  widthPx = data.world.offscreenScale.referenceViewport.widthPx,
  heightPx = data.world.offscreenScale.referenceViewport.heightPx,
  cameraViewWorldUnits = CAMERA_VIEW,
) {
  const scale = data.world.offscreenScale;
  const width = Math.max(1, Number(widthPx) || 1);
  const height = Math.max(1, Number(heightPx) || 1);
  const view = Math.max(0.001, Number(cameraViewWorldUnits) || 0.001);
  const margin = Math.max(0, Number(scale.edgeMarginPixels) || 0);
  const horizontal = ((width / 2 - margin) / (width / view)) * METERS_PER_SIM_UNIT;
  const vertical = ((height / 2 - margin) / (height / view)) * METERS_PER_SIM_UNIT;
  return Math.max(0, Math.min(horizontal, vertical));
}

export function referenceOffscreenCornerMeters(
  widthPx = data.world.offscreenScale.referenceViewport.widthPx,
  heightPx = data.world.offscreenScale.referenceViewport.heightPx,
  cameraViewWorldUnits = CAMERA_VIEW,
) {
  const scale = data.world.offscreenScale;
  const width = Math.max(1, Number(widthPx) || 1);
  const height = Math.max(1, Number(heightPx) || 1);
  const view = Math.max(0.001, Number(cameraViewWorldUnits) || 0.001);
  const margin = Math.max(0, Number(scale.edgeMarginPixels) || 0);
  const horizontal = ((width / 2 - margin) / (width / view)) * METERS_PER_SIM_UNIT;
  const vertical = ((height / 2 - margin) / (height / view)) * METERS_PER_SIM_UNIT;
  return Math.max(0, Math.hypot(horizontal, vertical));
}
