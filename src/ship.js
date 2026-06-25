/**
 * ship.js — Ship controls, thrust, fluid sampling.
 *
 * V3: World-space coordinates. Ship position (wx, wy) in world-units (0-3).
 * Ship velocity in world-units/sec. Camera-aware rendering.
 */

import { CONFIG } from './config.js';
import { worldPixelScale, worldToFluidUV, worldToScreen,
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
    this._timeSinceThrust = 999;

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
    //    Thrust is now gated on deltaV: empty tank ⇒ no thrust, intensity
    //    is clamped by available fuel (so a half-pull on an empty tank
    //    can't drain into negative). Burn cost is linear in intensity so
    //    analog-trigger pull translates 1:1 to fuel rate. Hull thrustScale
    //    multiplies acceleration (Drifter 0.7×, Breacher 1.4× etc.).
    let effectiveIntensity = 0;
    if (this.thrustIntensity > 0 && this.deltaV > 0) {
      const burnCost = this.deltaVBurnRate * this.deltaVBurnEff * this.thrustIntensity * dt;
      const allowedRatio = burnCost > 0 ? Math.min(1, this.deltaV / burnCost) : 1;
      effectiveIntensity = this.thrustIntensity * allowedRatio;
      this.deltaV = Math.max(0, this.deltaV - burnCost * allowedRatio);
      const accelWorld = cfg.thrustAccel * this.thrustScale * effectiveIntensity;
      this.vx += Math.cos(this.facing) * accelWorld * dt;
      this.vy += Math.sin(this.facing) * accelWorld * dt;
    }
    // 2b. Brake = reverse thrust. Same fuel/intensity model as forward
    //     thrust but pushed in -facing direction at brakeThrustScale of
    //     the forward strength. Costs fuel at brakeFuelScale. Means
    //     "stop / back up" is now an actual maneuver verb that lives
    //     in the same delta-v economy as forward thrust.
    let effectiveBrakeIntensity = 0;
    if (this.brakeIntensity > 0 && this.deltaV > 0) {
      const burnRate = this.deltaVBurnRate * this.deltaVBurnEff * (CONFIG.input.brakeFuelScale ?? 0.6);
      const burnCost = burnRate * this.brakeIntensity * dt;
      const allowedRatio = burnCost > 0 ? Math.min(1, this.deltaV / burnCost) : 1;
      effectiveBrakeIntensity = this.brakeIntensity * allowedRatio;
      this.deltaV = Math.max(0, this.deltaV - burnCost * allowedRatio);
      const reverseAccel = cfg.thrustAccel * this.thrustScale * (CONFIG.input.brakeThrustScale ?? 0.4) * effectiveBrakeIntensity;
      this.vx -= Math.cos(this.facing) * reverseAccel * dt;
      this.vy -= Math.sin(this.facing) * reverseAccel * dt;
    }
    // Track time since last meaningful burn (forward OR reverse) for
    // regen-delay logic.
    if (effectiveIntensity > 0.01 || effectiveBrakeIntensity > 0.01) {
      this._timeSinceThrust = 0;
    } else {
      this._timeSinceThrust += dt;
    }
    // 2b. Regen — small ambient rate always (so a stranded player isn't
    //     fully bricked), plus a regenBoost rate after a brief delay
    //     since releasing thrust. Caps at deltaVMax.
    const regenBoostActive = this._timeSinceThrust >= this.deltaVRegenDelay;
    const regenRate = this.deltaVRegen + (regenBoostActive ? this.deltaVRegenBoost : 0);
    if (this.deltaV < this.deltaVMax) {
      this.deltaV = Math.min(this.deltaVMax, this.deltaV + regenRate * dt);
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
    //    Hull currentCoupling multiplies the rate — Drifter 1.6× (currents
    //    carry you), Breacher 0.7× (ignore the field).
    const coupling = Math.min(cfg.fluidCoupling * this.currentCoupling * dt, 0.5);
    this.vx = this.vx * (1 - coupling) + fluidVelWorld.x * coupling;
    this.vy = this.vy * (1 - coupling) + fluidVelWorld.y * coupling;

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

    // 6. Drag — time-based damping calibrated to the old 60fps feel.
    //    CONFIG values remain "fraction removed per 60 Hz frame"; exponentiating
    //    by dt keeps stopping distance stable when render/sim cadence changes.
    //    Hull dragScale multiplies drag (Drifter 0.85× = preserves momentum,
    //    Hauler 1.1× = bleeds faster). Brake no longer adds to drag — it's
    //    handled above as reverse thrust with a fuel cost.
    const totalDrag = cfg.drag * this.dragScale;
    const dragBase = Math.max(0.001, 1 - Math.min(totalDrag, 0.999));
    const dragMult = Math.pow(dragBase, dt * 60);
    this.vx *= dragMult;
    this.vy *= dragMult;

    // 6b. Speed cap. Defensive — slingshot chains + favorable currents
    //     could otherwise stack into camera-breaking velocities. Set
    //     obscenely high in CONFIG; intentional creative tuning lever
    //     for later. Cap at constant maxSpeedWorld.
    const speedSq = this.vx * this.vx + this.vy * this.vy;
    const maxSp = cfg.maxSpeedWorld ?? Infinity;
    if (speedSq > maxSp * maxSp) {
      const speed = Math.sqrt(speedSq);
      const scale = maxSp / speed;
      this.vx *= scale;
      this.vy *= scale;
    }

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
