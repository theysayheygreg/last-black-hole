/**
 * input.js — InputManager: keyboard + gamepad, both active simultaneously.
 *
 * No auto-detection or switching. Both input sources are polled every frame
 * and merged — the strongest signal wins. You can steer with the stick and
 * thrust with spacebar in the same frame.
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
    this.gamepadIndex = -1;

    // Output state (consumed by ship and menus)
    this.facing = null;           // radians, or null if no directional input
    this.thrustIntensity = 0;     // 0-1
    this.brakeIntensity = 0;      // 0-1

    // For HUD display — which input contributed this frame
    this.lastInputSource = 'keyboard'; // 'keyboard' or 'gamepad'

    // Keyboard state
    this._keys = {};

    // Gamepad stick state
    this._isAiming = false;
    this._belowExitSince = null;
    this._lastAngle = 0;
    this._lastPollTime = performance.now();

    // --- Gamepad listeners ---
    window.addEventListener('gamepadconnected', (e) => {
      console.log(`Gamepad connected: ${e.gamepad.id}`);
      this.gamepadIndex = e.gamepad.index;
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      console.log(`Gamepad disconnected: ${e.gamepad.id}`);
      if (e.gamepad.index === this.gamepadIndex) {
        this.gamepadIndex = -1;
      }
    });

    // --- Keyboard listeners ---
    window.addEventListener('keydown', (e) => {
      this._keys[e.code] = true;
      // Prevent Tab from switching focus (must happen here, before browser default)
      if (e.code === 'Tab') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this._keys[e.code] = false;
    });
    window.addEventListener('blur', () => {
      this._keys = {};
    });
  }

  /** Is confirm pressed? (Space, Enter, or gamepad Cross/X — button 0) */
  get confirmPressed() {
    if (this._keys['Space'] || this._keys['Enter']) return true;
    const gp = this._getGamepad();
    if (gp && gp.buttons.length > 0 && gp.buttons[0].pressed) return true;
    return false;
  }

  /** Is back/cancel pressed? (gamepad Circle — button 1) */
  get backPressed() {
    const gp = this._getGamepad();
    if (gp && gp.buttons.length > 1 && gp.buttons[1].pressed) return true;
    return false;
  }

  /** Is pulse pressed? (E key, or gamepad Square — button 2 on DualSense) */
  get pulsePressed() {
    if (this._keys['KeyE']) return true;
    const gp = this._getGamepad();
    if (gp && gp.buttons.length > 2 && gp.buttons[2].pressed) return true;
    return false;
  }

  /** Inventory toggle. (Tab or I key, or gamepad Touchpad — button 17 on DualSense) */
  get inventoryPressed() {
    if (this._keys['Tab'] || this._keys['KeyI']) return true;
    const gp = this._getGamepad();
    // Button 17 = touchpad click on DualSense. Fallback: button 8 = Share/Create.
    if (gp && gp.buttons.length > 17 && gp.buttons[17].pressed) return true;
    if (gp && gp.buttons.length > 8 && gp.buttons[8].pressed) return true;
    return false;
  }

  /** Consumable slot 1. (D-pad left — button 14, or keyboard 1) */
  get consumable1Pressed() {
    if (this._keys['Digit1']) return true;
    const gp = this._getGamepad();
    if (gp && gp.buttons.length > 14 && gp.buttons[14].pressed) return true;
    return false;
  }

  /** Consumable slot 2. (D-pad right — button 15, or keyboard 2) */
  get consumable2Pressed() {
    if (this._keys['Digit2']) return true;
    const gp = this._getGamepad();
    if (gp && gp.buttons.length > 15 && gp.buttons[15].pressed) return true;
    return false;
  }

  /** Is pause pressed? (gamepad Options/Menu — button 9. Keyboard Escape in main.js) */
  get pausePressed() {
    const gp = this._getGamepad();
    // Button 9 = Options on DualSense, Menu on Xbox
    if (gp && gp.buttons.length > 9 && gp.buttons[9].pressed) return true;
    return false;
  }

  /** Menu navigation — up. Arrow up, W, or gamepad d-pad up (button 12). */
  get upPressed() {
    if (this._keys['ArrowUp'] || this._keys['KeyW']) return true;
    const gp = this._getGamepad();
    if (gp && gp.buttons.length > 12 && gp.buttons[12].pressed) return true;
    // Also check left stick up (below -0.5 threshold for menus)
    if (gp && gp.axes.length > 1 && gp.axes[1] < -0.5) return true;
    return false;
  }

  /** Menu navigation — down. Arrow down, S, or gamepad d-pad down (button 13). */
  get downPressed() {
    if (this._keys['ArrowDown'] || this._keys['KeyS']) return true;
    const gp = this._getGamepad();
    if (gp && gp.buttons.length > 13 && gp.buttons[13].pressed) return true;
    if (gp && gp.axes.length > 1 && gp.axes[1] > 0.5) return true;
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
   * Poll all input sources simultaneously. Both keyboard and gamepad are
   * always read — the strongest signal wins for each axis.
   */
  poll() {
    const cfg = CONFIG.input;
    const now = performance.now();
    const dt = Math.min((now - this._lastPollTime) / 1000, 1 / 30);
    this._lastPollTime = now;

    // --- Read keyboard ---
    let kbFacing = null;
    let kbThrust = 0;
    let kbBrake = 0;

    let dx = 0, dy = 0;
    if (this._keys['ArrowLeft'] || this._keys['KeyA']) dx -= 1;
    if (this._keys['ArrowRight'] || this._keys['KeyD']) dx += 1;
    if (this._keys['ArrowUp'] || this._keys['KeyW']) dy -= 1;
    if (this._keys['ArrowDown'] || this._keys['KeyS']) dy += 1;
    if (dx !== 0 || dy !== 0) kbFacing = Math.atan2(dy, dx);
    if (this._keys['Space']) kbThrust = 1.0;
    if (this._keys['ControlLeft'] || this._keys['ControlRight']) kbBrake = 1.0;

    // --- Read gamepad ---
    let gpFacing = null;
    let gpThrust = 0;
    let gpBrake = 0;

    const gp = this._getGamepad();
    if (gp) {
      // Stick
      const rawX = gp.axes[0] || 0;
      const rawY = gp.axes[1] || 0;
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
          if (now - this._belowExitSince > cfg.gamepadAimHoldMs) this._isAiming = false;
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
        gpFacing = this._lastAngle;
      } else if (this._isAiming) {
        gpFacing = this._lastAngle; // hold last angle while still in aim state
      }

      // Triggers
      let r2 = 0, l2 = 0;
      if (gp.buttons.length > 7) {
        r2 = gp.buttons[7].value;
        l2 = gp.buttons[6].value;
      }
      if (r2 === 0 && gp.axes.length > 5) {
        r2 = Math.max(0, (gp.axes[5] + 1) / 2);
        l2 = Math.max(0, (gp.axes[4] + 1) / 2);
      }
      gpThrust = r2 > cfg.triggerThreshold ? r2 : 0;
      gpBrake = l2 > cfg.triggerThreshold ? l2 : 0;
    }

    // --- Merge: strongest signal wins ---
    // Facing: gamepad stick takes priority if actively aiming, else keyboard
    if (gpFacing !== null) {
      this.facing = gpFacing;
      this.lastInputSource = 'gamepad';
    } else if (kbFacing !== null) {
      this.facing = kbFacing;
      this.lastInputSource = 'keyboard';
    } else {
      this.facing = null; // no directional input — hold current facing
    }

    // Thrust/brake: take the higher value from either source
    this.thrustIntensity = Math.max(kbThrust, gpThrust);
    this.brakeIntensity = Math.max(kbBrake, gpBrake);

    return this;
  }

  /**
   * Apply input state to ship.
   */
  applyToShip(ship) {
    if (this.facing !== null) {
      ship.setFacingDirect(this.facing);
    }
    ship.setThrustIntensity(this.thrustIntensity);
    ship.setBrakeIntensity(this.brakeIntensity);
  }
}
