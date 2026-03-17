/**
 * input.js — InputManager: gamepad + mouse abstraction layer.
 *
 * Input pipeline (every frame, in order):
 *   1. Read raw axes from Gamepad API
 *   2. Scaled radial deadzone — eliminates drift, remaps to full 0–1 range
 *   3. Aim state machine — hysteresis detects "aiming" vs "stick released"
 *   4. atan2 only when aiming and magnitude is sufficient
 *   5. Soft tiered angular smoothing — kills jitter on small changes
 *   6. Hold last known angle when not aiming
 *
 * References:
 *   - "Doing Thumbstick Dead Zones Right" (Josh Sutphin, Warhawk/Starhawk)
 *   - JoyShockMapper soft tiered smoothing (Jibb Smart)
 *   - thumbstick-deadzones interactive demos (Minimuino)
 */

import { CONFIG } from './config.js';

// ---- Stick processing helpers ----

/**
 * Scaled radial deadzone. Treats the stick as a 2D vector (not per-axis).
 * Returns { x, y, mag } with magnitude remapped from [deadzone..1] to [0..1].
 * Inside the deadzone, returns exactly zero — no drift.
 *
 * Per-axis deadzones cause "cardinal snapping" (stick catches on N/S/E/W).
 * Radial avoids that by operating on magnitude only.
 */
function applyRadialDeadzone(rawX, rawY, deadzone, outerDeadzone) {
  const mag = Math.sqrt(rawX * rawX + rawY * rawY);
  if (mag < deadzone) return { x: 0, y: 0, mag: 0 };

  // Clamp to inner edge of outer deadzone so full-tilt is reliably reachable
  const maxMag = 1.0 - outerDeadzone;
  const clampedMag = Math.min(mag, maxMag);

  // Remap: deadzone→maxMag becomes 0→1 (no jump at deadzone edge)
  const scaledMag = (clampedMag - deadzone) / (maxMag - deadzone);

  const nx = rawX / mag;
  const ny = rawY / mag;
  return { x: nx * scaledMag, y: ny * scaledMag, mag: scaledMag };
}

/**
 * Shortest angular difference in radians, wrapped to [-PI, PI].
 * Handles the -PI/+PI seam correctly (179° to -179° = 2° change, not 358°).
 */
function shortestAngleDelta(from, to) {
  let delta = to - from;
  delta -= Math.PI * 2 * Math.round(delta / (Math.PI * 2));
  return delta;
}

/**
 * Soft tiered angular smoothing.
 * Heavy smoothing on tiny angular changes (kills sensor jitter).
 * Zero smoothing on large angular changes (instant response to flicks).
 * Smooth blend in between.
 *
 * This way the player never perceives lag — smoothing only applies
 * below their perceptual threshold.
 */
function smoothAngle(current, target, dt, smoothTime, smallDeg, bigDeg) {
  const delta = shortestAngleDelta(current, target);
  const absDelta = Math.abs(delta) * (180 / Math.PI); // convert to degrees for thresholds

  // smoothFactor: 1.0 = full smoothing, 0.0 = instant snap
  let smoothFactor;
  if (absDelta <= smallDeg) {
    smoothFactor = 1.0;
  } else if (absDelta >= bigDeg) {
    smoothFactor = 0.0;
  } else {
    smoothFactor = 1.0 - (absDelta - smallDeg) / (bigDeg - smallDeg);
  }

  // Exponential decay, scaled by tier
  const t = 1.0 - Math.exp(-dt / Math.max(smoothTime, 0.001));
  const effectiveT = smoothFactor * t + (1.0 - smoothFactor) * 1.0;

  return current + delta * effectiveT;
}


// ---- InputManager ----

export class InputManager {
  constructor() {
    this.usingGamepad = false;
    this.gamepadIndex = -1;

    // Normalized output state
    this.facing = null;           // radians, or null if no stick input
    this.thrustIntensity = 0;     // 0-1
    this.brakeIntensity = 0;      // 0-1

    // Stick processing state
    this._isAiming = false;       // hysteresis state: is the player actively aiming?
    this._belowExitSince = null;  // timestamp when stick dropped below exit threshold
    this._lastAngle = 0;          // last known good facing angle (held when stick released)
    this._lastPollTime = performance.now();

    // Listen for gamepad connections
    window.addEventListener('gamepadconnected', (e) => {
      console.log(`Gamepad connected: ${e.gamepad.id}`);
      this.gamepadIndex = e.gamepad.index;
      this.usingGamepad = true;
    });

    window.addEventListener('gamepaddisconnected', (e) => {
      console.log(`Gamepad disconnected: ${e.gamepad.id}`);
      if (e.gamepad.index === this.gamepadIndex) {
        this.gamepadIndex = -1;
        this.usingGamepad = false;
      }
    });
  }

  /**
   * Poll gamepad state. Call once per frame before ship.update().
   */
  poll() {
    const cfg = CONFIG.input;
    const now = performance.now();
    const dt = Math.min((now - this._lastPollTime) / 1000, 1 / 30);
    this._lastPollTime = now;

    // Auto mode: use gamepad if connected, else mouse
    if (cfg.method === 'mouse') {
      this.usingGamepad = false;
      this.facing = null;
      this.thrustIntensity = 0;
      this.brakeIntensity = 0;
      return this;
    }

    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;

    if (this.gamepadIndex >= 0) {
      gp = gamepads[this.gamepadIndex];
    }

    // Try to find any connected gamepad
    if (!gp) {
      for (const pad of gamepads) {
        if (pad && pad.connected) {
          gp = pad;
          this.gamepadIndex = pad.index;
          break;
        }
      }
    }

    if (!gp) {
      this.usingGamepad = false;
      this.facing = null;
      this.thrustIntensity = 0;
      this.brakeIntensity = 0;
      return this;
    }

    this.usingGamepad = true;

    // ---- LEFT STICK: facing direction ----

    const rawX = gp.axes[0] || 0;
    const rawY = gp.axes[1] || 0;

    // Step 1: Scaled radial deadzone (no cardinal snapping, remapped range)
    const stick = applyRadialDeadzone(rawX, rawY, cfg.gamepadDeadzone, cfg.gamepadOuterDeadzone);

    // Step 2: Aim state machine (hysteresis — prevents flickering at deadzone edge)
    // Enter threshold is higher than deadzone so the player must push deliberately.
    // Exit threshold + hold timer absorbs spring oscillation when releasing.
    if (!this._isAiming) {
      if (stick.mag >= cfg.gamepadAimEnter) {
        this._isAiming = true;
        this._belowExitSince = null;
      }
    } else {
      if (stick.mag < cfg.gamepadAimExit) {
        if (this._belowExitSince === null) this._belowExitSince = now;
        // Require sustained low magnitude to confirm release
        if (now - this._belowExitSince > cfg.gamepadAimHoldMs) {
          this._isAiming = false;
        }
      } else {
        this._belowExitSince = null; // stick moved again, reset timer
      }
    }

    // Step 3: Compute angle only when aiming (avoids noise from tiny vectors)
    if (this._isAiming && stick.mag > 0.01) {
      const rawAngle = Math.atan2(stick.y, stick.x);

      // Step 4: Soft tiered angular smoothing (heavy on jitter, instant on flicks)
      this._lastAngle = smoothAngle(
        this._lastAngle, rawAngle, dt,
        cfg.gamepadSmoothTime,
        cfg.gamepadSmallAngle,
        cfg.gamepadBigAngle
      );
      this.facing = this._lastAngle;
    } else {
      // Stick released or below threshold — hold last known angle
      this.facing = this._isAiming ? this._lastAngle : null;
    }

    // ---- TRIGGERS: thrust (R2) and brake (L2) ----

    let r2 = 0;
    let l2 = 0;

    // Standard mapping: R2 = buttons[7], L2 = buttons[6]
    if (gp.buttons.length > 7) {
      r2 = gp.buttons[7].value;
      l2 = gp.buttons[6].value;
    }

    // Fallback: some gamepads report triggers as axes (range -1 to 1)
    if (r2 === 0 && gp.axes.length > 5) {
      r2 = Math.max(0, (gp.axes[5] + 1) / 2);
      l2 = Math.max(0, (gp.axes[4] + 1) / 2);
    }

    this.thrustIntensity = r2 > cfg.triggerThreshold ? r2 : 0;
    this.brakeIntensity = l2 > cfg.triggerThreshold ? l2 : 0;

    return this;
  }

  /**
   * Apply gamepad state to ship. Call after poll().
   * Only overrides ship state if gamepad is active.
   */
  applyToShip(ship) {
    if (!this.usingGamepad) return;

    // Analog facing from stick (null = stick at rest, don't override mouse)
    if (this.facing !== null) {
      ship.setFacingDirect(this.facing);
    }

    // Analog thrust from R2
    ship.setThrustIntensity(this.thrustIntensity);

    // Analog brake from L2
    ship.setBrakeIntensity(this.brakeIntensity);
  }
}
