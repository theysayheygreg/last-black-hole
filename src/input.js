/**
 * input.js — InputManager: keyboard + gamepad abstraction layer.
 *
 * Two input methods, auto-detected:
 *   Keyboard: Arrow keys = facing, Space = thrust, Ctrl = brake
 *   Gamepad:  Left stick = facing, R2 = thrust, L2 = brake
 *
 * Mouse is UI-only (menu clicks). Ship never reads mouse position.
 *
 * Gamepad stick pipeline:
 *   1. Scaled radial deadzone (no cardinal snapping)
 *   2. Aim state hysteresis (spring bounce absorption)
 *   3. Soft tiered angular smoothing (jitter kill)
 *   4. Last-known-angle hold on release
 */

import { CONFIG } from './config.js';

// ---- Stick processing helpers ----

/** Scaled radial deadzone. Magnitude-based, remaps [deadzone..1-outer] to [0..1]. */
function applyRadialDeadzone(rawX, rawY, deadzone, outerDeadzone) {
  const mag = Math.sqrt(rawX * rawX + rawY * rawY);
  if (mag < deadzone) return { x: 0, y: 0, mag: 0 };
  const maxMag = 1.0 - outerDeadzone;
  const clampedMag = Math.min(mag, maxMag);
  const scaledMag = (clampedMag - deadzone) / (maxMag - deadzone);
  const nx = rawX / mag;
  const ny = rawY / mag;
  return { x: nx * scaledMag, y: ny * scaledMag, mag: scaledMag };
}

/** Shortest angular difference in radians, wrapped to [-PI, PI]. */
function shortestAngleDelta(from, to) {
  let delta = to - from;
  delta -= Math.PI * 2 * Math.round(delta / (Math.PI * 2));
  return delta;
}

/** Soft tiered smoothing: heavy on small changes (jitter), instant on large (flicks). */
function smoothAngle(current, target, dt, smoothTime, smallDeg, bigDeg) {
  const delta = shortestAngleDelta(current, target);
  const absDelta = Math.abs(delta) * (180 / Math.PI);
  let smoothFactor;
  if (absDelta <= smallDeg) smoothFactor = 1.0;
  else if (absDelta >= bigDeg) smoothFactor = 0.0;
  else smoothFactor = 1.0 - (absDelta - smallDeg) / (bigDeg - smallDeg);
  const t = 1.0 - Math.exp(-dt / Math.max(smoothTime, 0.001));
  const effectiveT = smoothFactor * t + (1.0 - smoothFactor) * 1.0;
  return current + delta * effectiveT;
}


// ---- InputManager ----

export class InputManager {
  constructor() {
    this.usingGamepad = false;
    this.gamepadIndex = -1;

    // Output state (consumed by ship)
    this.facing = null;           // radians, or null if no directional input
    this.thrustIntensity = 0;     // 0-1
    this.brakeIntensity = 0;      // 0-1

    // Keyboard state
    this._keys = {};              // currently held keys
    this._keyFacing = null;       // computed facing from arrow keys

    // Gamepad stick state
    this._isAiming = false;
    this._belowExitSince = null;
    this._lastAngle = 0;
    this._lastPollTime = performance.now();

    // --- Gamepad listeners ---
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

    // --- Keyboard listeners ---
    window.addEventListener('keydown', (e) => {
      this._keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => {
      this._keys[e.code] = false;
    });
    // Clear keys on window blur (prevents stuck keys when tabbing away)
    window.addEventListener('blur', () => {
      this._keys = {};
    });
  }

  /** Is a confirm action pressed this frame? (Space, Enter, or gamepad A) */
  get confirmPressed() {
    if (this._keys['Space'] || this._keys['Enter']) return true;
    // Gamepad A button (standard mapping: button 0)
    const gp = this._getGamepad();
    if (gp && gp.buttons.length > 0 && gp.buttons[0].pressed) return true;
    return false;
  }

  /** Is pause pressed? (Escape or gamepad Start/Options — button 9) */
  get pausePressed() {
    // Keyboard escape handled separately in main.js keydown listener
    const gp = this._getGamepad();
    if (gp && gp.buttons.length > 9 && gp.buttons[9].pressed) return true;
    return false;
  }

  _getGamepad() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (this.gamepadIndex >= 0) return gamepads[this.gamepadIndex] || null;
    for (const pad of gamepads) {
      if (pad && pad.connected) {
        this.gamepadIndex = pad.index;
        return pad;
      }
    }
    return null;
  }

  /**
   * Poll all input sources. Call once per frame.
   */
  poll() {
    const cfg = CONFIG.input;
    const now = performance.now();
    const dt = Math.min((now - this._lastPollTime) / 1000, 1 / 30);
    this._lastPollTime = now;

    // --- Try gamepad first ---
    const gp = this._getGamepad();

    if (gp) {
      this.usingGamepad = true;
      this._pollGamepadStick(gp, cfg, dt, now);
      this._pollGamepadTriggers(gp, cfg);
      return this;
    }

    // --- Fall back to keyboard ---
    this.usingGamepad = false;
    this._pollKeyboard(cfg);
    return this;
  }

  _pollKeyboard(cfg) {
    // Arrow keys → facing direction
    let dx = 0, dy = 0;
    if (this._keys['ArrowLeft'] || this._keys['KeyA']) dx -= 1;
    if (this._keys['ArrowRight'] || this._keys['KeyD']) dx += 1;
    if (this._keys['ArrowUp'] || this._keys['KeyW']) dy -= 1;
    if (this._keys['ArrowDown'] || this._keys['KeyS']) dy += 1;

    if (dx !== 0 || dy !== 0) {
      this.facing = Math.atan2(dy, dx);
    } else {
      this.facing = null; // no directional input — hold current facing
    }

    // Space = thrust, Ctrl = brake
    this.thrustIntensity = (this._keys['Space']) ? 1.0 : 0;
    this.brakeIntensity = (this._keys['ControlLeft'] || this._keys['ControlRight']) ? 1.0 : 0;
  }

  _pollGamepadStick(gp, cfg, dt, now) {
    const rawX = gp.axes[0] || 0;
    const rawY = gp.axes[1] || 0;

    // Scaled radial deadzone
    const stick = applyRadialDeadzone(rawX, rawY, cfg.gamepadDeadzone, cfg.gamepadOuterDeadzone);

    // Aim state hysteresis
    if (!this._isAiming) {
      if (stick.mag >= cfg.gamepadAimEnter) {
        this._isAiming = true;
        this._belowExitSince = null;
      }
    } else {
      if (stick.mag < cfg.gamepadAimExit) {
        if (this._belowExitSince === null) this._belowExitSince = now;
        if (now - this._belowExitSince > cfg.gamepadAimHoldMs) {
          this._isAiming = false;
        }
      } else {
        this._belowExitSince = null;
      }
    }

    // Angle with smoothing
    if (this._isAiming && stick.mag > 0.01) {
      const rawAngle = Math.atan2(stick.y, stick.x);
      this._lastAngle = smoothAngle(
        this._lastAngle, rawAngle, dt,
        cfg.gamepadSmoothTime, cfg.gamepadSmallAngle, cfg.gamepadBigAngle
      );
      this.facing = this._lastAngle;
    } else {
      this.facing = this._isAiming ? this._lastAngle : null;
    }
  }

  _pollGamepadTriggers(gp, cfg) {
    let r2 = 0, l2 = 0;
    if (gp.buttons.length > 7) {
      r2 = gp.buttons[7].value;
      l2 = gp.buttons[6].value;
    }
    if (r2 === 0 && gp.axes.length > 5) {
      r2 = Math.max(0, (gp.axes[5] + 1) / 2);
      l2 = Math.max(0, (gp.axes[4] + 1) / 2);
    }
    this.thrustIntensity = r2 > cfg.triggerThreshold ? r2 : 0;
    this.brakeIntensity = l2 > cfg.triggerThreshold ? l2 : 0;
  }

  /**
   * Apply input state to ship. Call after poll().
   */
  applyToShip(ship) {
    // Facing — from keyboard or gamepad (null = hold current facing)
    if (this.facing !== null) {
      ship.setFacingDirect(this.facing);
    }
    ship.setThrustIntensity(this.thrustIntensity);
    ship.setBrakeIntensity(this.brakeIntensity);
  }
}
