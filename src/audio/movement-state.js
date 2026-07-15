/**
 * Low-rate, hysteretic movement state for the player audio layer.
 *
 * This is presentation state only. The caller supplies delivered movement
 * intensity; the audio layer never decides whether a burn is legal.
 */
export const MOVEMENT_AUDIO_STATES = Object.freeze([
  'idle',
  'coasting',
  'thrusting',
  'braking',
]);

const ENTER_THRESHOLD = 0.12;
const EXIT_THRESHOLD = 0.06;
const COAST_SPEED_ENTER = 0.01;
const COAST_SPEED_EXIT = 0.006;

function clamp(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function delivered(input, key) {
  return clamp(input[key]);
}

function held(previous, state, value, threshold) {
  return previous === state && value >= threshold;
}

/**
 * Resolve one stable movement mode from delivered state.
 * Braking wins over thrust when both controls are reported together.
 */
export function resolveMovementAudioState(input = {}, previous = 'idle') {
  const active = input.active !== false;
  if (!active) return 'idle';

  const thrust = delivered(input, 'deliveredThrust');
  const brake = delivered(input, 'deliveredBrake');
  const speed = Math.max(0, Number(input.speed) || 0);

  if (brake >= ENTER_THRESHOLD || held(previous, 'braking', brake, EXIT_THRESHOLD)) {
    return 'braking';
  }
  if (thrust >= ENTER_THRESHOLD || held(previous, 'thrusting', thrust, EXIT_THRESHOLD)) {
    return 'thrusting';
  }
  if (speed >= COAST_SPEED_ENTER || held(previous, 'coasting', speed, COAST_SPEED_EXIT)) {
    return 'coasting';
  }
  return 'idle';
}

export function movementAudioLevels(input = {}, state = 'idle') {
  const thrust = delivered(input, 'deliveredThrust');
  const brake = delivered(input, 'deliveredBrake');
  const speed = Math.max(0, Number(input.speed) || 0);
  const speedLevel = Math.min(1, speed / 0.45);

  switch (state) {
    case 'thrusting':
      return { gain: 0.12 + thrust * 0.24, tone: 0.045 + thrust * 0.08, texture: 0.035 + thrust * 0.08, frequency: 150 + thrust * 90, filter: 850 + thrust * 500 };
    case 'braking':
      return { gain: 0.09 + brake * 0.18, tone: 0.05 + brake * 0.06, texture: 0.018 + brake * 0.04, frequency: 82 + brake * 42, filter: 420 + brake * 300 };
    case 'coasting':
      return { gain: 0.018 + speedLevel * 0.03, tone: 0.012 + speedLevel * 0.018, texture: 0.006 + speedLevel * 0.012, frequency: 62 + speedLevel * 20, filter: 260 + speedLevel * 180 };
    default:
      return { gain: 0, tone: 0, texture: 0, frequency: 60, filter: 240 };
  }
}
