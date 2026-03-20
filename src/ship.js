/**
 * ship.js — Ship controls, thrust, fluid sampling.
 *
 * V3: World-space coordinates. Ship position (wx, wy) in world-units (0-3).
 * Ship velocity in world-units/sec. Camera-aware rendering.
 */

import { CONFIG } from './config.js';
import { pxPerWorld, worldToFluidUV, worldToScreen,
         worldDirectionTo, wrapWorld, uvScale } from './coords.js';
import { inversePowerForce, applyForceToShip } from './physics.js';

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

    // Input state (set by InputManager, not mouse)
    this.thrusting = false;
    this.thrustIntensity = 0;
    this.brakeIntensity = 0;

    // Fluid readback for HUD
    this.lastFluidVel = { x: 0, y: 0 };
    this.lastFluidSpeed = 0;
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
   * @param {Object} flowField - local flow sampler with sample(wx, wy)
   * @param {WellSystem} [wellSystem] - for direct gravitational pull on ship
   * @param {FluidSim} [fluid] - visual fluid target for wake injection
   */
  update(dt, flowField, wellSystem, fluid = null) {
    const cfg = CONFIG.ship;
    const wellCfg = CONFIG.wells;

    // 1. Facing is set directly by InputManager (keyboard arrows or gamepad stick).

    // 2. Thrust — CONFIG value is in world-units/s² directly (no px conversion).
    if (this.thrustIntensity > 0) {
      const accelWorld = cfg.thrustAccel * this.thrustIntensity;
      this.vx += Math.cos(this.facing) * accelWorld * dt;
      this.vy += Math.sin(this.facing) * accelWorld * dt;
    }

    // 3. Sample fluid velocity at ship position
    let fluidVelWorld = { x: 0, y: 0 };
    if (flowField) {
      fluidVelWorld = flowField.sample(this.wx, this.wy);
    }

    this.lastFluidVel = fluidVelWorld;
    this.lastFluidSpeed = Math.sqrt(fluidVelWorld.x ** 2 + fluidVelWorld.y ** 2);

    // 4. Fluid coupling — lerp ship velocity toward fluid velocity.
    //    coupling = fluidCoupling × dt, clamped to 0.5 to prevent velocity teleport.
    //    At 60fps with coupling=1.2: 1.2 × 0.017 = 0.02 (2% per frame toward fluid vel).
    const coupling = Math.min(cfg.fluidCoupling * dt, 0.5);
    this.vx = this.vx * (1 - coupling) + fluidVelWorld.x * coupling;
    this.vy = this.vy * (1 - coupling) + fluidVelWorld.y * coupling;

    // 5. Direct gravitational pull from wells (world-space)
    if (wellSystem) {
      const maxRange = wellCfg.maxRange ?? 0.8;
      for (const well of wellSystem.wells) {
        const { dist, nx, ny } = worldDirectionTo(this.wx, this.wy, well.wx, well.wy);
        const accel = inversePowerForce(dist, wellCfg.shipPullStrength, well.mass, wellCfg.shipPullFalloff, maxRange);
        if (accel > 0) {
          applyForceToShip(this, nx, ny, accel, dt);
        }
      }
    }

    // 6. Drag — applied per-frame (not per-second). totalDrag is the fraction of
    //    velocity removed each frame. Base drag + optional L2 brake from gamepad.
    //    Terminal velocity = (thrust in world/s²) / drag. E.g. 0.67 / 0.06 = 11 world/s.
    const totalDrag = cfg.drag + this.brakeIntensity * CONFIG.input.brakeStrength;
    const dragMult = 1 - totalDrag;
    this.vx *= dragMult;
    this.vy *= dragMult;

    // 7. Integrate position
    this.wx += this.vx * dt;
    this.wy += this.vy * dt;

    // 8. Boundary wrapping (toroidal)
    this.wx = wrapWorld(this.wx);
    this.wy = wrapWorld(this.wy);

    // 9. Bullet wake — inject into fluid
    if (fluid) {
      const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      // Terminal velocity = thrust / drag. Fallback 0.03 prevents division by zero if drag is 0.
      const terminalVelWorld = cfg.thrustAccel / (cfg.drag > 0 ? cfg.drag : 0.03);
      const speedFraction = speed / terminalVelWorld;
      const wake = cfg.wake;

      const wakeScale = Math.max(0, Math.min(1,
        (speedFraction - wake.speedThreshold) / Math.max(wake.speedThreshold, 0.01)
      ));

      if (wakeScale > 0) {
        const [baseUVx, baseUVy] = worldToFluidUV(this.wx, this.wy);
        const behindX = -Math.cos(this.facing);
        const behindY = Math.sin(this.facing); // fluid UV is Y-up
        const s = uvScale();
        const s2 = s * s;

        for (let i = 0; i < wake.splatCount; i++) {
          const offset = (i + 1) * wake.splatSpacing * s;
          const sx = baseUVx + behindX * offset;
          const sy = baseUVy + behindY * offset;
          const falloff = 1 - (i / wake.splatCount) * 0.5;
          const forceMag = wake.force * wakeScale * falloff * s;
          const b = wake.brightness * wakeScale * falloff;
          fluid.splat(
            sx, sy,
            Math.cos(this.facing) * forceMag,
            -Math.sin(this.facing) * forceMag,
            wake.radius * s2,
            b * 0.3,
            b * 0.8,
            b * 1.0
          );
        }
      }
    }
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
      const ppw = pxPerWorld(this.canvasWidth);
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + this.vx * ppw * 0.1, sy + this.vy * ppw * 0.1);
      ctx.stroke();
      ctx.restore();
    }
  }
}
