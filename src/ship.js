/**
 * ship.js — Ship controls, thrust, fluid sampling.
 *
 * V3: World-space coordinates. Ship position (wx, wy) in world-units (0-3).
 * Ship velocity in world-units/sec. Camera-aware rendering.
 */

import { CONFIG } from './config.js';
import { WORLD_SCALE, worldToFluidUV, worldToScreen, screenToWorld,
         worldDisplacement, fluidVelToScreen } from './coords.js';

export class Ship {
  constructor(canvasWidth, canvasHeight) {
    // Position in world-space (0 to WORLD_SCALE)
    this.wx = 1.5;   // start in safe open space
    this.wy = 0.45;
    // Velocity in world-units/sec
    this.vx = 0;
    this.vy = 0;
    // Facing angle in radians (0 = right)
    this.facing = 0;
    this.targetFacing = 0;

    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;

    // Input state
    this.mouseX = canvasWidth / 2;
    this.mouseY = canvasHeight / 2;
    this.thrusting = false;
    this.thrustIntensity = 0;
    this.brakeIntensity = 0;

    // Fluid readback for HUD
    this.lastFluidVel = { x: 0, y: 0 };
    this.lastFluidSpeed = 0;
  }

  setMouse(x, y) {
    this.mouseX = x;
    this.mouseY = y;
  }

  setThrust(active) {
    this.thrusting = active;
    this.thrustIntensity = active ? 1.0 : 0;
  }

  setThrustIntensity(intensity) {
    this.thrustIntensity = intensity;
    this.thrusting = intensity > 0;
  }

  setBrakeIntensity(intensity) {
    this.brakeIntensity = intensity;
  }

  setFacingDirect(angle) {
    this.facing = angle;
    this.targetFacing = angle;
  }

  /** Teleport ship to world coordinates. */
  teleport(wx, wy) {
    this.wx = wx;
    this.wy = wy;
    this.vx = 0;
    this.vy = 0;
  }

  /**
   * Main update. Reads fluid, applies thrust, updates position.
   * @param {number} dt - frame delta in seconds
   * @param {FluidSim} fluid - fluid sim for velocity sampling
   * @param {WellSystem} [wellSystem] - for direct gravitational pull on ship
   * @param {number} camX - camera world X
   * @param {number} camY - camera world Y
   */
  update(dt, fluid, wellSystem, camX, camY) {
    const cfg = CONFIG.ship;
    const wellCfg = CONFIG.wells;

    // Pixels per world-unit (for converting pixel-based CONFIG values)
    const pxPerWorld = this.canvasWidth / WORLD_SCALE;

    // 1. Update facing — rotate toward mouse (uses camera to convert mouse to world)
    this._updateFacing(dt, cfg, camX, camY);

    // 2. Thrust — convert px/s² to world-units/s²
    if (this.thrustIntensity > 0) {
      const accelWorld = cfg.thrustAccel / pxPerWorld * this.thrustIntensity;
      this.vx += Math.cos(this.facing) * accelWorld * dt;
      this.vy += Math.sin(this.facing) * accelWorld * dt;
    }

    // 3. Sample fluid velocity at ship position
    const [fuv_x, fuv_y] = worldToFluidUV(this.wx, this.wy);
    let fluidVelWorld = { x: 0, y: 0 };
    if (fluid && fuv_x >= 0 && fuv_x <= 1 && fuv_y >= 0 && fuv_y <= 1) {
      const [fvx, fvy] = fluid.readVelocityAt(
        Math.max(0, Math.min(1, fuv_x)),
        Math.max(0, Math.min(1, fuv_y))
      );
      // Fluid velocity is in UV-units/step. Convert to world-units/sec:
      // UV spans 0-1 for the full world (0-3), so multiply by WORLD_SCALE
      const [svx, svy] = fluidVelToScreen(fvx, fvy);
      fluidVelWorld.x = svx * WORLD_SCALE;
      fluidVelWorld.y = svy * WORLD_SCALE;
    }

    this.lastFluidVel = fluidVelWorld;
    this.lastFluidSpeed = Math.sqrt(fluidVelWorld.x ** 2 + fluidVelWorld.y ** 2);

    // 4. Fluid coupling — lerp ship velocity toward fluid velocity
    const coupling = Math.min(cfg.fluidCoupling * dt, 0.5);
    this.vx = this.vx * (1 - coupling) + fluidVelWorld.x * coupling;
    this.vy = this.vy * (1 - coupling) + fluidVelWorld.y * coupling;

    // 5. Direct gravitational pull from wells (world-space)
    if (wellSystem) {
      for (const well of wellSystem.wells) {
        const [dwx, dwy] = worldDisplacement(this.wx, this.wy, well.wx, well.wy);
        const dist = Math.sqrt(dwx * dwx + dwy * dwy);
        if (dist < 0.001) continue;
        const safeDist = Math.max(dist, 0.15); // stability guard in world-units
        // Normalize distance to reference of 0.25 world-units (≈100px at 1200px screen)
        const normDist = safeDist / 0.25;
        const gravAccel = wellCfg.shipPullStrength * well.mass / Math.pow(normDist, wellCfg.shipPullFalloff);
        const nx = dwx / dist;
        const ny = dwy / dist;
        this.vx += nx * gravAccel * dt;
        this.vy += ny * gravAccel * dt;
      }
    }

    // 6. Drag
    const totalDrag = cfg.drag + this.brakeIntensity * CONFIG.input.brakeStrength;
    const dragMult = 1 - totalDrag;
    this.vx *= dragMult;
    this.vy *= dragMult;

    // 7. Integrate position
    this.wx += this.vx * dt;
    this.wy += this.vy * dt;

    // 8. Boundary wrapping (toroidal)
    this.wx = ((this.wx % WORLD_SCALE) + WORLD_SCALE) % WORLD_SCALE;
    this.wy = ((this.wy % WORLD_SCALE) + WORLD_SCALE) % WORLD_SCALE;

    // 9. Bullet wake — inject into fluid
    if (fluid) {
      const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      const terminalVelWorld = (cfg.thrustAccel / pxPerWorld) / (cfg.drag > 0 ? cfg.drag : 0.03);
      const speedFraction = speed / terminalVelWorld;
      const wake = cfg.wake;

      const wakeScale = Math.max(0, Math.min(1,
        (speedFraction - wake.speedThreshold) / Math.max(wake.speedThreshold, 0.01)
      ));

      if (wakeScale > 0) {
        const [baseUVx, baseUVy] = worldToFluidUV(this.wx, this.wy);
        const behindX = -Math.cos(this.facing);
        const behindY = Math.sin(this.facing); // fluid UV is Y-up

        for (let i = 0; i < wake.splatCount; i++) {
          const offset = (i + 1) * wake.splatSpacing;
          const sx = baseUVx + behindX * offset;
          const sy = baseUVy + behindY * offset;
          const falloff = 1 - (i / wake.splatCount) * 0.5;
          const forceMag = wake.force * wakeScale * falloff;
          const b = wake.brightness * wakeScale * falloff;
          fluid.splat(
            sx, sy,
            Math.cos(this.facing) * forceMag,
            -Math.sin(this.facing) * forceMag,
            wake.radius,
            b * 0.3,
            b * 0.8,
            b * 1.0
          );
        }
      }
    }
  }

  _updateFacing(dt, cfg, camX, camY) {
    // Convert mouse screen position to world, then compute angle
    const [mouseWX, mouseWY] = screenToWorld(
      this.mouseX, this.mouseY, camX, camY, this.canvasWidth, this.canvasHeight
    );
    // Use toroidal displacement for correct direction
    const [dx, dy] = worldDisplacement(this.wx, this.wy, mouseWX, mouseWY);
    this.targetFacing = Math.atan2(dy, dx);

    let angleDiff = this.targetFacing - this.facing;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    const turnRateRad = cfg.turnRate * Math.PI / 180;
    const turnAmount = turnRateRad * dt;

    if (Math.abs(angleDiff) < turnAmount) {
      this.facing = this.targetFacing;
    } else {
      this.facing += Math.sign(angleDiff) * turnAmount;
    }

    while (this.facing > Math.PI) this.facing -= Math.PI * 2;
    while (this.facing < -Math.PI) this.facing += Math.PI * 2;
  }

  /**
   * Render the ship on a 2D canvas overlay.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} camX - camera world X
   * @param {number} camY - camera world Y
   */
  render(ctx, camX, camY) {
    const cfg = CONFIG.ship;
    const size = cfg.size;
    const [sx, sy] = worldToScreen(this.wx, this.wy, camX, camY, this.canvasWidth, this.canvasHeight);

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.facing);

    // Ship body — clean triangle
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.6, -size * 0.5);
    ctx.lineTo(-size * 0.3, 0);
    ctx.lineTo(-size * 0.6, size * 0.5);
    ctx.closePath();

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
      const pxPerWorld = this.canvasWidth / WORLD_SCALE;
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + this.vx * pxPerWorld * 0.1, sy + this.vy * pxPerWorld * 0.1);
      ctx.stroke();
      ctx.restore();
    }
  }
}
