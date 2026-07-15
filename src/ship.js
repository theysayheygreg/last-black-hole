/**
 * ship.js — Ship controls, thrust, fluid sampling.
 *
 * V3: World-space coordinates. Ship position (wx, wy) in world-units (0-3).
 * Ship velocity in world-units/sec. Camera-aware rendering.
 */

import { CONFIG } from './config.js';
import { worldPixelScale, worldToFluidUV, worldToScreen,
         worldDirectionTo, uvScale, WORLD_SCALE } from './coords.js';
import { inversePowerForce, applyForceToShip } from './physics.js';
import {
  MOVEMENT_INPUT,
  applyPlayerBrakeAndIntegrate,
  applyPlayerDriveAndFlow,
} from './content/movement-step.js';

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
    this.moveX = 1;
    this.moveY = 0;

    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;

    // Input state (set by InputManager, not mouse)
    this.thrusting = false;
    this.thrustIntensity = 0;
    this.brakeIntensity = 0;
    this.lastDeliveredThrustIntensity = 0;
    this.lastDeliveredBrakeIntensity = 0;

    // Fluid readback for HUD
    this.lastFluidVel = { x: 0, y: 0 };
    this.lastFluidSpeed = 0;

    // --- Delta-v / thrust fuel ---
    // deltaV gates thrust. Hull-defaults from hulls.data.json override
    // these via setHullStats(); applyDeltaVItemBonus folds in equipped-
    // item coefficients. Pillar 2 enforcement: fluid currents become an
    // economic decision when thrust is no longer free.
    this.deltaV = CONFIG.ship.deltaVMax;
    this.deltaVMax = CONFIG.ship.deltaVMax;
    this.deltaVRegen = CONFIG.ship.deltaVRegen;
    this.deltaVRegenBoost = CONFIG.ship.deltaVRegenBoost;
    this.deltaVRegenDelay = CONFIG.ship.deltaVRegenDelay;
    this.deltaVBurnRate = CONFIG.ship.deltaVBurnRate;
    // Hull-supplied efficiency multiplier on burn cost. <1 = cheaper
    // burn (e.g. Drifter), >1 = expensive (e.g. Breacher).
    this.deltaVBurnEff = 1.0;
    this.timeSinceThrust = 999;

    // --- Hull-supplied movement modifiers ---
    // Were defined in hulls.data.json but the legacy ship.update read
    // CONFIG.ship.* directly without consulting them — every hull flew
    // identically locally. setHullStats() now layers these on so each
    // hull actually feels different. Multiplicative against the CONFIG
    // baseline; 1.0 = no change.
    this.thrustScale = 1.0;
    this.dragScale = 1.0;
    this.currentCoupling = 1.0;
    this.wellResistScale = 1.0;

    // --- Slingshot engagement state ---
    // Owned by SlingshotSystem; read by Ship.update for orbital lock
    // physics. See src/slingshot.js for the design.
    this.slingshotEngaged = false;
    this.slingshotAnchor = null;
    this.slingshotEnergy = 0;
    this.slingshotChainCount = 0;
    this.slingshotEngageRadius = 0;
    this.slingshotOrbitDir = 0;
  }

  /**
   * Apply hull stats to the ship. Called on hull selection / scene load.
   * Resets deltaV to the new max so a fresh hull starts fueled. Items
   * on top get folded in by applyDeltaVItemBonus().
   */
  setHullStats({
    deltaVMax = CONFIG.ship.deltaVMax,
    deltaVRegen = CONFIG.ship.deltaVRegen,
    deltaVRegenBoost = CONFIG.ship.deltaVRegenBoost,
    deltaVBurnEff = 1.0,
    thrustScale = 1.0,
    dragScale = 1.0,
    currentCoupling = 1.0,
    wellResistScale = 1.0,
    refill = true,
  } = {}) {
    const prevRatio = this.deltaV / Math.max(this.deltaVMax, 1e-6);
    this.deltaVMax = deltaVMax;
    this.deltaVRegen = deltaVRegen;
    this.deltaVRegenBoost = deltaVRegenBoost;
    this.deltaVBurnEff = deltaVBurnEff;
    this.deltaV = refill ? deltaVMax : prevRatio * deltaVMax;
    this.thrustScale = thrustScale;
    this.dragScale = dragScale;
    this.currentCoupling = currentCoupling;
    this.wellResistScale = wellResistScale;
  }

  /**
   * Layer equipped-item coefficients on top of the hull baseline. Multipliers
   * compose: capacity 1.2 + capacity 1.1 → 1.32. Caller passes the aggregate.
   * (See InventorySystem.getDeltaVStats.)
   */
  applyDeltaVItemBonus({
    deltaVCapacityMult = 1,
    deltaVRegenMult = 1,
    deltaVBurnMult = 1,
  } = {}) {
    const prevRatio = this.deltaV / Math.max(this.deltaVMax, 1e-6);
    this.deltaVMax *= deltaVCapacityMult;
    this.deltaVRegen *= deltaVRegenMult;
    this.deltaVRegenBoost *= deltaVRegenMult;
    this.deltaVBurnEff *= deltaVBurnMult;
    // Keep the same %-fueled feel through equipment swaps mid-run.
    this.deltaV = prevRatio * this.deltaVMax;
  }

  /** Layer equipped movement coefficients onto the hull baseline. */
  applyMovementItemBonus({
    thrustScale = 1,
    dragScale = 1,
    currentCoupling = 1,
    wellResistScale = 1,
  } = {}) {
    this.thrustScale *= thrustScale;
    this.dragScale *= dragScale;
    this.currentCoupling *= currentCoupling;
    this.wellResistScale *= wellResistScale;
  }

  /** Refill fuel by an absolute amount (used by fuelCell consumable). */
  refillDeltaV(amount) {
    this.deltaV = Math.min(this.deltaVMax, this.deltaV + amount);
  }

  /** Fraction 0..1 for HUD gauge consumers. */
  getDeltaVRatio() {
    return this.deltaVMax > 0 ? Math.max(0, Math.min(1, this.deltaV / this.deltaVMax)) : 0;
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
    this.setMoveIntent(Math.cos(angle), Math.sin(angle));
  }

  setMoveIntent(moveX, moveY) {
    const magnitude = Math.hypot(Number(moveX) || 0, Number(moveY) || 0);
    if (magnitude <= 0.0001) return;
    this.moveX = moveX / magnitude;
    this.moveY = moveY / magnitude;
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

    // 1. InputManager supplies facing for presentation and a normalized move
    //    vector for the movement step.

    const movementInput = {
      moveX: this.moveX,
      moveY: this.moveY,
      thrust: this.thrustIntensity,
      brake: this.brakeIntensity,
    };

    // Sample fluid velocity at ship position
    let fluidVelWorld = { x: 0, y: 0 };
    if (flowField) {
      fluidVelWorld = flowField.sample(this.wx, this.wy);
    }

    this.lastFluidVel = fluidVelWorld;
    this.lastFluidSpeed = Math.sqrt(fluidVelWorld.x ** 2 + fluidVelWorld.y ** 2);

    // The local fallback and authority share this drive/brake step. External
    // forces stay in their existing owners and ordering for this slice.
    const driveStep = applyPlayerDriveAndFlow(this, movementInput, dt, {
      brain: this,
      inputConfig: MOVEMENT_INPUT,
      flowSample: { current: fluidVelWorld },
    });
    const effectiveIntensity = driveStep.thrustIntensity;

    // 5. Direct gravitational pull from wells (world-space)
    //    Hull wellResistScale dampens pull — Breacher 1.2× resist, Hauler
    //    0.8× resist (so wells yank haulers harder).
    if (wellSystem) {
      const maxRange = wellCfg.maxRange ?? 0.8;
      const pullScale = 1 / Math.max(0.1, this.wellResistScale);
      for (const well of wellSystem.wells) {
        const { dist, nx, ny } = worldDirectionTo(this.wx, this.wy, well.wx, well.wy);
        const accel = inversePowerForce(dist, wellCfg.shipPullStrength * pullScale, well.mass, wellCfg.shipPullFalloff, maxRange);
        if (accel > 0) {
          applyForceToShip(this, nx, ny, accel, dt);
        }
      }
    }

    const brakeStep = applyPlayerBrakeAndIntegrate(this, movementInput, dt, {
      brain: this,
      inputConfig: MOVEMENT_INPUT,
      thrustIntensity: effectiveIntensity,
      worldScale: WORLD_SCALE,
    });
    this.lastDeliveredThrustIntensity = effectiveIntensity;
    this.lastDeliveredBrakeIntensity = brakeStep.brakeIntensity;

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
      const pixelScale = worldPixelScale(this.canvasWidth, this.canvasHeight);
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + this.vx * pixelScale.x * 0.1, sy + this.vy * pixelScale.y * 0.1);
      ctx.stroke();
      ctx.restore();
    }
  }
}
