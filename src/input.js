/**
 * input.js — InputManager: gamepad + mouse abstraction layer.
 *
 * Polls Gamepad API each frame, normalizes to:
 *   { facing, thrustIntensity, brakeIntensity, usingGamepad }
 *
 * Left stick = analog facing direction.
 * R2 = analog thrust (0-1). Feathering R2 at 30% = 30% thrust.
 * L2 = analog brake (extra drag).
 * Auto-detects gamepad with mouse fallback.
 */

import { CONFIG } from './config.js';

export class InputManager {
  constructor() {
    this.usingGamepad = false;
    this.gamepadIndex = -1;

    // Normalized output state
    this.facing = null;           // radians, or null if no stick input
    this.thrustIntensity = 0;     // 0-1
    this.brakeIntensity = 0;      // 0-1

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
   * Returns the normalized input state.
   */
  poll() {
    const cfg = CONFIG.input;

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

    // Left stick — axes 0 (X) and 1 (Y)
    const lx = gp.axes[0] || 0;
    const ly = gp.axes[1] || 0;
    const stickMag = Math.sqrt(lx * lx + ly * ly);

    if (stickMag > cfg.gamepadDeadzone) {
      // Normalize stick to facing angle (Y-down screen coords: atan2(ly, lx))
      this.facing = Math.atan2(ly, lx);
    } else {
      this.facing = null;  // no stick input — don't override mouse
    }

    // R2 trigger — analog thrust
    // Standard mapping: R2 = buttons[7], L2 = buttons[6]
    // Triggers report value 0-1 on .value, or axes[5]/axes[4] on some gamepads
    let r2 = 0;
    let l2 = 0;

    if (gp.buttons.length > 7) {
      r2 = gp.buttons[7].value;
      l2 = gp.buttons[6].value;
    }

    // Some gamepads report triggers as axes
    if (r2 === 0 && gp.axes.length > 5) {
      // Axes 4/5 range from -1 (released) to 1 (fully pressed)
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

    // Analog facing from stick
    if (this.facing !== null) {
      ship.setFacingDirect(this.facing);
    }

    // Analog thrust from R2
    ship.setThrustIntensity(this.thrustIntensity);

    // Analog brake from L2
    ship.setBrakeIntensity(this.brakeIntensity);
  }
}
