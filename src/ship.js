/**
 * ship.js — Ship controls, thrust, fluid sampling.
 *
 * V2 SIMPLIFICATION: Collapsed redundant knobs per config.js rewrite.
 * Control model: mouse = aim, click = binary thrust (instant on/off).
 * Ship velocity = thrust accel + fluid coupling lerp + well gravity.
 * Wave magnetism removed — affordance system deferred to V2.
 */

import { CONFIG } from './config.js';

export class Ship {
  constructor(canvasWidth, canvasHeight) {
    // Position in pixel space
    this.x = canvasWidth * 0.7;
    this.y = canvasHeight * 0.5;
    // Velocity in pixels/sec
    this.vx = 0;
    this.vy = 0;
    // Facing angle in radians (0 = right)
    this.facing = 0;
    // Target facing (toward mouse)
    this.targetFacing = 0;

    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;

    // Input state
    this.mouseX = canvasWidth / 2;
    this.mouseY = canvasHeight / 2;
    this.thrusting = false;

    // Fluid readback for HUD
    this.lastFluidVel = { x: 0, y: 0 };
    this.lastFluidSpeed = 0;
  }

  /**
   * Set mouse position (called from event handler).
   */
  setMouse(x, y) {
    this.mouseX = x;
    this.mouseY = y;
  }

  /**
   * Set thrust state (called from event handler).
   */
  setThrust(active) {
    this.thrusting = active;
  }

  /**
   * Teleport ship to pixel coordinates (for test API / sandbox).
   */
  teleport(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
  }

  /**
   * Main update. Reads fluid, applies thrust, updates position.
   * @param {number} dt - frame delta in seconds
   * @param {FluidSim} fluid - fluid sim for velocity sampling
   * @param {WellSystem} [wellSystem] - for direct gravitational pull on ship
   */
  update(dt, fluid, wellSystem) {
    const cfg = CONFIG.ship;
    const wellCfg = CONFIG.wells;

    // 1. Update facing — rotate toward mouse (no dead zone, no curve)
    this._updateFacing(dt, cfg);

    // 2. Thrust — instant on/off, single accel value
    if (this.thrusting) {
      const accelMag = cfg.thrustAccel;
      this.vx += Math.cos(this.facing) * accelMag * dt;
      this.vy += Math.sin(this.facing) * accelMag * dt;
    }

    // 3. Sample fluid velocity at ship position
    const uvX = this.x / this.canvasWidth;
    const uvY = this.y / this.canvasHeight;
    let fluidVel = { x: 0, y: 0 };
    if (fluid && uvX >= 0 && uvX <= 1 && uvY >= 0 && uvY <= 1) {
      const [fvx, fvy] = fluid.readVelocityAt(
        Math.max(0, Math.min(1, uvX)),
        Math.max(0, Math.min(1, uvY))
      );
      // Scale from sim-space to pixel-space (canvas width as reference)
      const scale = this.canvasWidth;
      fluidVel.x = fvx * scale;
      fluidVel.y = fvy * scale;
    }

    this.lastFluidVel = fluidVel;
    this.lastFluidSpeed = Math.sqrt(fluidVel.x * fluidVel.x + fluidVel.y * fluidVel.y);

    // 4. Fluid coupling — lerp ship velocity toward fluid velocity
    const coupling = Math.min(cfg.fluidCoupling * dt, 0.5); // clamp to prevent overshoot
    this.vx = this.vx * (1 - coupling) + fluidVel.x * coupling;
    this.vy = this.vy * (1 - coupling) + fluidVel.y * coupling;

    // 5. Direct gravitational pull from wells (acts on ship, not through fluid)
    if (wellSystem) {
      for (const well of wellSystem.wells) {
        const dwx = well.x * this.canvasWidth - this.x;
        const dwy = well.y * this.canvasHeight - this.y;
        const dist = Math.sqrt(dwx * dwx + dwy * dwy);
        if (dist < 1) continue;
        const safeDist = Math.max(dist, wellCfg.gravityClampDist);
        const normDist = safeDist / 100;
        const gravAccel = wellCfg.shipPullStrength * well.mass / Math.pow(normDist, wellCfg.shipPullFalloff);
        const nx = dwx / dist;
        const ny = dwy / dist;
        this.vx += nx * gravAccel * dt;
        this.vy += ny * gravAccel * dt;
      }
    }

    // 6. Drag — single uniform value
    const dragMult = 1 - cfg.drag;
    this.vx *= dragMult;
    this.vy *= dragMult;

    // 7. Integrate position
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // 8. Boundary wrapping (keep in canvas)
    if (this.x < 0) this.x += this.canvasWidth;
    if (this.x > this.canvasWidth) this.x -= this.canvasWidth;
    if (this.y < 0) this.y += this.canvasHeight;
    if (this.y > this.canvasHeight) this.y -= this.canvasHeight;

    // 9. Inject thrust wake into fluid — MUCH stronger than before
    //    Player should see their thrust disturbing the ASCII field
    if (this.thrusting && fluid) {
      const wakeUVx = this.x / this.canvasWidth;
      const wakeUVy = this.y / this.canvasHeight;
      const wakeForceMag = 0.002;
      const wakeRadius = 0.01;
      fluid.splat(
        wakeUVx, wakeUVy,
        Math.cos(this.facing) * wakeForceMag,
        Math.sin(this.facing) * wakeForceMag,
        wakeRadius,
        0.1, 0.3, 0.4  // teal wake color
      );
    }
  }

  _updateFacing(dt, cfg) {
    // Compute target angle toward mouse
    const dx = this.mouseX - this.x;
    const dy = this.mouseY - this.y;
    this.targetFacing = Math.atan2(dy, dx);

    // Angular difference
    let angleDiff = this.targetFacing - this.facing;
    // Normalize to [-PI, PI]
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    const absDiff = Math.abs(angleDiff);

    // Simple linear turn — no dead zone, no curve power
    const turnRateRad = cfg.turnRate * Math.PI / 180;
    const turnAmount = turnRateRad * dt;

    if (absDiff < turnAmount) {
      this.facing = this.targetFacing;
    } else {
      this.facing += Math.sign(angleDiff) * turnAmount;
    }

    // Normalize facing
    while (this.facing > Math.PI) this.facing -= Math.PI * 2;
    while (this.facing < -Math.PI) this.facing += Math.PI * 2;
  }

  /**
   * Render the ship on a 2D canvas overlay (separate layer above fluid).
   */
  render(ctx) {
    const cfg = CONFIG.ship;
    const size = cfg.size;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.facing);

    // Ship body — clean triangle
    ctx.beginPath();
    ctx.moveTo(size, 0);          // nose
    ctx.lineTo(-size * 0.6, -size * 0.5);  // left wing
    ctx.lineTo(-size * 0.3, 0);           // inner left
    ctx.lineTo(-size * 0.6, size * 0.5);   // right wing
    ctx.closePath();

    // Fill — always white (no wave magnetism glow)
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Thrust trail
    if (this.thrusting) {
      const trailLen = size * 1.5;
      ctx.beginPath();
      ctx.moveTo(-size * 0.3, -size * 0.15);
      ctx.lineTo(-size * 0.3 - trailLen, 0);
      ctx.lineTo(-size * 0.3, size * 0.15);
      ctx.closePath();
      ctx.fillStyle = 'rgba(100, 200, 255, 0.7)';
      ctx.fill();
    }

    ctx.restore();

    // Debug: velocity vector
    if (CONFIG.debug.showVelocityField) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + this.vx * 0.1, this.y + this.vy * 0.1);
      ctx.stroke();
      ctx.restore();
    }
  }
}
