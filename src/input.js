/**
 * input.js — InputManager: keyboard + mouse + gamepad, all active simultaneously.
 *
 * No auto-detection or switching. Both input sources are polled every frame
 * and merged — the strongest signal wins. You can aim with the mouse, thrust
 * with W, and still let a connected gamepad take over without a mode switch.
 *
 * Gamepad stick pipeline:
 *   1. Scaled radial deadzone (no cardinal snapping)
 *   2. Aim state hysteresis (spring bounce absorption)
 *   3. Soft tiered angular smoothing (jitter kill)
 *   4. Last-known-angle hold on release
 */

import { CONFIG } from './config.js';
import { pxPerWorld, screenToWorld, worldDirectionTo } from './coords.js';

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
    this.lastInputSource = 'keyboard'; // 'keyboard', 'mouse', or 'gamepad'

    // Keyboard state
    this._keys = {};

    // Mouse state. Screen coordinates are converted to world-space by poll()
    // once main.js supplies the current camera + ship context.
    this._mouse = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      active: false,
      left: false,
      right: false,
      distancePx: 0,
      lastMoveAt: 0,
      lastButtonAt: 0,
    };

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
      this._mouse.left = false;
      this._mouse.right = false;
    });

    // --- Mouse listeners ---
    // Convert window clientX/Y to render-space coords via the canvas's
    // bounding rect. This is the canonical mouse position used by
    // screenToWorld below; it matches the letterboxed render box, not
    // the full browser window.
    const renderCanvas = document.getElementById('fluid-canvas');
    const updateMousePosition = (e) => {
      if (renderCanvas) {
        const rect = renderCanvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const nx = (e.clientX - rect.left) / rect.width;
          const ny = (e.clientY - rect.top) / rect.height;
          this._mouse.x = nx * renderCanvas.width;
          this._mouse.y = ny * renderCanvas.height;
        } else {
          this._mouse.x = e.clientX;
          this._mouse.y = e.clientY;
        }
      } else {
        this._mouse.x = e.clientX;
        this._mouse.y = e.clientY;
      }
      this._mouse.active = true;
      this._mouse.lastMoveAt = performance.now();
    };
    const updateMouseButton = (e, pressed) => {
      updateMousePosition(e);
      if (e.button === 0) this._mouse.left = pressed;
      if (e.button === 2) this._mouse.right = pressed;
      this._mouse.lastButtonAt = performance.now();
      if (e.button === 0 || e.button === 2) e.preventDefault();
    };

    window.addEventListener('mousemove', updateMousePosition);
    window.addEventListener('mousedown', (e) => updateMouseButton(e, true));
    window.addEventListener('mouseup', (e) => updateMouseButton(e, false));
    window.addEventListener('contextmenu', (e) => e.preventDefault());
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

  /** Hull ability 1. (Q key, or gamepad L1 — button 4) */
  get ability1() {
    if (this._keys['KeyQ']) return true;
    const gp = this._getGamepad();
    if (gp && gp.buttons.length > 4 && gp.buttons[4].pressed) return true;
    return false;
  }

  /** Hull ability 2. (R key, or gamepad R1 — button 5) */
  get ability2() {
    if (this._keys['KeyR']) return true;
    const gp = this._getGamepad();
    if (gp && gp.buttons.length > 5 && gp.buttons[5].pressed) return true;
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

  /** Menu navigation — left. Arrow left, A, or gamepad d-pad left (button 14). */
  get leftPressed() {
    if (this._keys['ArrowLeft'] || this._keys['KeyA']) return true;
    const gp = this._getGamepad();
    if (gp && gp.buttons.length > 14 && gp.buttons[14].pressed) return true;
    if (gp && gp.axes.length > 0 && gp.axes[0] < -0.5) return true;
    return false;
  }

  /** Menu navigation — right. Arrow right, D, or gamepad d-pad right (button 15). */
  get rightPressed() {
    if (this._keys['ArrowRight'] || this._keys['KeyD']) return true;
    const gp = this._getGamepad();
    if (gp && gp.buttons.length > 15 && gp.buttons[15].pressed) return true;
    if (gp && gp.axes.length > 0 && gp.axes[0] > 0.5) return true;
    return false;
  }

  /** Tab navigation — L1/R1 shoulder buttons (4/5) or Q/E on keyboard. */
  get tabLeftPressed() {
    if (this._keys['KeyQ']) return true;
    const gp = this._getGamepad();
    if (gp && gp.buttons.length > 4 && gp.buttons[4].pressed) return true;
    return false;
  }
  get tabRightPressed() {
    if (this._keys['KeyE']) return true;
    const gp = this._getGamepad();
    if (gp && gp.buttons.length > 5 && gp.buttons[5].pressed) return true;
    return false;
  }

  /** Delete action — X key or gamepad triangle/Y (button 3). */
  get deletePressed() {
    if (this._keys['KeyX']) return true;
    const gp = this._getGamepad();
    if (gp && gp.buttons.length > 3 && gp.buttons[3].pressed) return true;
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

  _mouseThrustFromDistance(distancePx) {
    const cfg = CONFIG.input;
    const deadzone = cfg.mouseDeadzonePx ?? 28;
    const ramp = Math.max(1, cfg.mouseRampPx ?? 180);
    const power = cfg.mouseThrustCurve ?? 0.7;
    const t = Math.max(0, Math.min(1, (distancePx - deadzone) / ramp));
    return Math.pow(t, power);
  }

  _readMouse(view) {
    if (!view?.active || !view.ship || !Number.isFinite(view.camX) || !Number.isFinite(view.camY)) {
      this._mouse.distancePx = 0;
      return { facing: null, thrust: 0, brake: 0 };
    }

    const canvasW = view.canvasW || window.innerWidth;
    const canvasH = view.canvasH || window.innerHeight;
    const [targetWX, targetWY] = screenToWorld(
      this._mouse.x,
      this._mouse.y,
      view.camX,
      view.camY,
      canvasW,
      canvasH
    );
    const direction = worldDirectionTo(view.ship.wx, view.ship.wy, targetWX, targetWY);
    const distancePx = direction.dist * pxPerWorld(canvasW);
    this._mouse.distancePx = distancePx;

    const facing = this._mouse.active ? Math.atan2(direction.ny, direction.nx) : null;
    return {
      facing,
      thrust: this._mouse.left ? this._mouseThrustFromDistance(distancePx) : 0,
      brake: this._mouse.right ? 1.0 : 0,
    };
  }

  /**
   * Poll all input sources simultaneously. Both keyboard and gamepad are
   * always read — the strongest signal wins for each axis.
   */
  poll(view = null) {
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
    if (this._keys['ArrowUp']) dy -= 1;
    if (this._keys['ArrowDown']) dy += 1;
    if (dx !== 0 || dy !== 0) kbFacing = Math.atan2(dy, dx);
    if (this._keys['Space'] || this._keys['KeyW']) kbThrust = 1.0;
    if (this._keys['ControlLeft'] || this._keys['ControlRight'] || this._keys['KeyS']) kbBrake = 1.0;

    // --- Read mouse ---
    const mouse = this._readMouse(view);
    const mouseFacing = mouse.facing;
    const mouseThrust = mouse.thrust;
    const mouseBrake = mouse.brake;

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
      if (gp.axes.length > 5) {
        r2 = Math.max(r2, Math.max(0, (gp.axes[5] + 1) / 2));
        l2 = Math.max(l2, Math.max(0, (gp.axes[4] + 1) / 2));
      }
      gpThrust = r2 > cfg.triggerThreshold ? r2 : 0;
      gpBrake = l2 > cfg.triggerThreshold ? l2 : 0;
    }

    // --- Merge: strongest signal wins ---
    // Facing: gamepad stick takes priority, keyboard arrows/A-D override mouse,
    // otherwise the mouse cursor is the default no-controller aim model.
    if (gpFacing !== null) {
      this.facing = gpFacing;
      this.lastInputSource = 'gamepad';
    } else if (kbFacing !== null) {
      this.facing = kbFacing;
      this.lastInputSource = 'keyboard';
    } else if (mouseFacing !== null) {
      this.facing = mouseFacing;
      this.lastInputSource = 'mouse';
    } else {
      this.facing = null; // no directional input — hold current facing
    }

    // Thrust/brake: take the higher value from either source
    this.thrustIntensity = Math.max(kbThrust, mouseThrust, gpThrust);
    this.brakeIntensity = Math.max(kbBrake, mouseBrake, gpBrake);

    if (gpThrust > 0 || gpBrake > 0) this.lastInputSource = 'gamepad';
    else if (kbThrust > 0 || kbBrake > 0) this.lastInputSource = 'keyboard';
    else if (mouseThrust > 0 || mouseBrake > 0) this.lastInputSource = 'mouse';

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
