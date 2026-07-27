// Browser adapter for the single canonical Noise Radius v1 data contract.
import data from './noise.data.json' with { type: 'json' };

export const NOISE_CONFIG = data;
export const NOISE_IDENTIFICATION_FRACTION = data.identificationFraction;
export const NOISE_LAST_HEARD_FADE_SECONDS = data.lastHeardFadeSeconds;
export const NOISE_PUBLIC_SOURCE_CLASSES = Object.freeze([...data.publicSourceClasses]);
