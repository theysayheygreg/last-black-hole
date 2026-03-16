/**
 * ship.js — Ship controls, thrust, fluid sampling, wave magnetism.
 *
 * Control model: Model 2 from CONTROLS.md (mouse = aim, click = binary thrust).
 * Ship facing rotates toward cursor. Click to thrust at full power.
 * Ship velocity = thrust + fluid velocity at position (coupling 0.8).
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
    this.thrustRamp = 0; // 0-1 ramp for thrust buildup

    // Wave magnetism state
    this.waveMagnetismActive = false;
    this.waveMagnetismForce = { x: 0, y: 0 };

    // Input buffer for wave catch timing
    this.thrustBuffer = [];
    this.lastFluidVel = { x: 0, y: 0 };
    this.lastFluidSpeed = 0;
    this.lastFluidDir = 0;
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
    if (active) {
      this.thrustBuffer.push(performance.now());
    }
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
    const affCfg = CONFIG.affordances;

    // 1. Update facing — rotate toward mouse
    this._updateFacing(dt, cfg);

    // 2. Thrust ramp
    if (this.thrusting) {
      this.thrustRamp = Math.min(1, this.thrustRamp + dt / cfg.thrustRampTime);
    } else {
      this.thrustRamp = Math.max(0, this.thrustRamp - dt / cfg.thrustRampTime);
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
      // Scale from sim-space to pixel-space
      // Fluid velocity is in grid cells/step, convert to pixels/sec
      const scale = this.canvasWidth * 2.0;
      fluidVel.x = fvx * scale;
      fluidVel.y = fvy * scale;
    }

    this.lastFluidVel = fluidVel;
    this.lastFluidSpeed = Math.sqrt(fluidVel.x * fluidVel.x + fluidVel.y * fluidVel.y);
    if (this.lastFluidSpeed > 0.01) {
      this.lastFluidDir = Math.atan2(fluidVel.y, fluidVel.x);
    }

    // 4. Compute thrust force
    const thrustMag = cfg.thrustForce * this.thrustRamp * 200; // scale to pixels/sec^2
    const thrustFx = Math.cos(this.facing) * thrustMag;
    const thrustFy = Math.sin(this.facing) * thrustMag;

    // 5. Wave magnetism check
    this._updateWaveMagnetism(fluidVel, affCfg);

    // 6. Apply forces
    const accelX = thrustFx / cfg.mass + this.waveMagnetismForce.x;
    const accelY = thrustFy / cfg.mass + this.waveMagnetismForce.y;

    // Ship velocity = own momentum + fluid coupling
    // Fluid coupling blends fluid vel into ship vel each frame
    const coupling = cfg.fluidCoupling;
    this.vx += accelX * dt;
    this.vy += accelY * dt;

    // Blend toward fluid velocity (coupling)
    // Rate scales with coupling strength — at 0.8, ship strongly follows fluid
    const blendRate = coupling * dt * 4.0;
    const clamped = Math.min(blendRate, 0.5); // don't overshoot
    this.vx = this.vx * (1 - clamped) + fluidVel.x * clamped;
    this.vy = this.vy * (1 - clamped) + fluidVel.y * clamped;

    // 6b. Direct gravitational pull from wells (acts on ship mass, not through fluid)
    if (wellSystem) {
      const wellCfg = CONFIG.wells;
      for (const well of wellSystem.wells) {
        const dwx = well.x * this.canvasWidth - this.x;
        const dwy = well.y * this.canvasHeight - this.y;
        const dist = Math.sqrt(dwx * dwx + dwy * dwy);
        if (dist < 1) continue;
        const minDist = 40; // pixel-space clamp radius
        const safeDist = Math.max(dist, minDist);
        // Direct gravitational acceleration: G * mass / r^falloff
        // Scale factor converts UV-space gravity to pixel-space acceleration
        const gravScale = 50000; // tuning factor
        const gravAccel = wellCfg.gravity * well.mass * gravScale / Math.pow(safeDist, wellCfg.falloff);
        const nx = dwx / dist;
        const ny = dwy / dist;
        this.vx += nx * gravAccel * dt;
        this.vy += ny * gravAccel * dt;
      }
    }

    // 7. Drag
    const shipSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (shipSpeed > 0.01) {
      // Check if moving with or against the fluid
      const dotProduct = (this.vx * fluidVel.x + this.vy * fluidVel.y) /
        (shipSpeed * Math.max(0.01, this.lastFluidSpeed));
      const drag = dotProduct > 0 ? cfg.dragInCurrent : cfg.dragAgainstCurrent;
      const dragMult = 1 - drag;
      this.vx *= dragMult;
      this.vy *= dragMult;
    }

    // 8. Integrate position
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // 9. Boundary wrapping (keep in canvas)
    if (this.x < 0) this.x += this.canvasWidth;
    if (this.x > this.canvasWidth) this.x -= this.canvasWidth;
    if (this.y < 0) this.y += this.canvasHeight;
    if (this.y > this.canvasHeight) this.y -= this.canvasHeight;

    // 10. Inject thrust wake into fluid
    if (this.thrustRamp > 0.1 && fluid) {
      const wakeUVx = this.x / this.canvasWidth;
      const wakeUVy = this.y / this.canvasHeight;
      const wakeForceMag = this.thrustRamp * 0.0003;
      fluid.splat(
        wakeUVx, wakeUVy,
        Math.cos(this.facing) * wakeForceMag,
        Math.sin(this.facing) * wakeForceMag,
        0.0003,
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
    const deadZoneRad = cfg.turnDeadZone * Math.PI / 180;

    if (absDiff < deadZoneRad) return; // dead zone

    // Turn speed curve: faster rotation for larger offsets
    const maxOffset = Math.PI;
    const normalizedOffset = Math.min(absDiff / maxOffset, 1);
    const curvedSpeed = Math.pow(normalizedOffset, cfg.turnCurvePower);
    const turnRateRad = cfg.turnRate * Math.PI / 180;
    const turnAmount = curvedSpeed * turnRateRad * dt;

    if (absDiff < turnAmount) {
      this.facing = this.targetFacing;
    } else {
      this.facing += Math.sign(angleDiff) * turnAmount;
    }

    // Normalize facing
    while (this.facing > Math.PI) this.facing -= Math.PI * 2;
    while (this.facing < -Math.PI) this.facing += Math.PI * 2;
  }

  _updateWaveMagnetism(fluidVel, affCfg) {
    this.waveMagnetismActive = false;
    this.waveMagnetismForce = { x: 0, y: 0 };

    if (this.lastFluidSpeed < 5) return; // no significant flow

    // Check angle alignment: is ship roughly aligned with fluid direction?
    const shipDir = Math.atan2(this.vy, this.vx);
    let angleDiff = this.lastFluidDir - shipDir;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    const catchWindowRad = affCfg.catchWindowDeg * Math.PI / 180;
    if (Math.abs(angleDiff) > catchWindowRad) return;

    // Check velocity match
    const shipSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (shipSpeed < 0.01) return;
    const speedRatio = Math.abs(shipSpeed - this.lastFluidSpeed) / this.lastFluidSpeed;
    if (speedRatio > affCfg.catchWindowVelPct) return;

    // Wave magnetism engaged! Apply corrective force along wave direction
    this.waveMagnetismActive = true;

    // Input buffer check — was there recent thrust input?
    const now = performance.now();
    const bufferWindow = affCfg.inputBufferBefore * 1000 + affCfg.inputBufferAfter * 1000;
    this.thrustBuffer = this.thrustBuffer.filter(t => now - t < bufferWindow);

    // Corrective force: steer ship velocity toward fluid direction
    const lockStr = affCfg.lockStrength;
    const correctionX = (fluidVel.x - this.vx * (this.lastFluidSpeed / Math.max(1, shipSpeed))) * lockStr;
    const correctionY = (fluidVel.y - this.vy * (this.lastFluidSpeed / Math.max(1, shipSpeed))) * lockStr;

    this.waveMagnetismForce = { x: correctionX, y: correctionY };
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

    // Fill
    ctx.fillStyle = this.waveMagnetismActive ? '#66ffff' : '#ffffff';
    ctx.fill();

    // Glow when wave magnetism is active
    if (this.waveMagnetismActive) {
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 15;
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Thrust trail
    if (this.thrustRamp > 0.1) {
      const trailLen = size * 1.5 * this.thrustRamp;
      ctx.beginPath();
      ctx.moveTo(-size * 0.3, -size * 0.15);
      ctx.lineTo(-size * 0.3 - trailLen, 0);
      ctx.lineTo(-size * 0.3, size * 0.15);
      ctx.closePath();
      ctx.fillStyle = `rgba(100, 200, 255, ${this.thrustRamp * 0.7})`;
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
