/**
 * scavengers.js — AI ship opponents that compete for wrecks and portals.
 *
 * Scavengers use the same physics model as the player ship: thrust + fluid
 * coupling + drag + well gravity. Two archetypes (drifter, vulture) with a
 * shared state machine that drives their decisions every decisionInterval.
 *
 * Movement looks natural because they're riding the same fluid sim you are.
 * They reduce thrust when the current is carrying them toward their target.
 */

import { CONFIG } from './config.js';
import { WORLD_SCALE, worldToFluidUV, worldToScreen, worldDistance,
         worldDirectionTo, wrapWorld, uvScale, shouldCull } from './coords.js';
import { inversePowerForce } from './physics.js';

// ---- CONFIG block to add to config.js ----
// scavengers: {
//   count: 3,
//   vultureRatio: 0.3,
//   size: 8,
//   thrustAccel: 0.5,
//   drag: 0.06,
//   fluidCoupling: 1.2,
//   decisionInterval: 0.8,
//   sensorRange: 1.5,
//   fleeWellDist: 0.15,
//   safeWellDist: 0.25,
//   lootPause: 0.8,
//   vulturePlayerTrackInterval: 2.5,
//   vultureSpeedBoost: 1.3,
//   spawnStagger: 60,
//   drifterLootTarget: 1,
//   vultureLootTarget: 2,
//   bumpRadius: 0.04,
//   bumpForce: 0.3,
//   deathSpiralDuration: 1.5,
//   pulseCooldown: 12.0,
//   pulseChance: 0.3,
// }

// ---- Archetype colors ----
const DRIFTER_COLOR = '#8AAEC4';
const VULTURE_COLOR = '#D4A060';
const DRIFTER_TRAIL = 'rgba(138, 174, 196, 0.6)';
const VULTURE_TRAIL = 'rgba(212, 160, 96, 0.6)';

// ---- Helper: thrust toward a world-space target ----

/**
 * Point scavenger toward target and set thrust intensity.
 * Reduces thrust when the fluid current is already carrying us there.
 */
function thrustToward(scav, targetWX, targetWY, flowField, intensity = 1.0) {
  const { dist, nx, ny } = worldDirectionTo(scav.wx, scav.wy, targetWX, targetWY);

  // Check fluid alignment — reduce thrust if current is helping
  const { x: wvx, y: wvy } = flowField ? flowField.sample(scav.wx, scav.wy) : { x: 0, y: 0 };
  const fluidSpeed = Math.sqrt(wvx * wvx + wvy * wvy);

  if (fluidSpeed > 0.01) {
    const dot = (wvx * nx + wvy * ny) / fluidSpeed;
    if (dot > 0.3) intensity *= 0.4; // current is carrying us — coast
  }

  scav.facing = Math.atan2(ny, nx);
  scav.thrustIntensity = intensity;
}

/**
 * Vulture alternate routing: sample fluid at offset positions around the
 * target and pick the approach vector where the current helps most.
 */
function vultureAlternateApproach(scav, targetWX, targetWY, flowField) {
  const { dist, nx, ny } = worldDirectionTo(scav.wx, scav.wy, targetWX, targetWY);
  if (dist < 0.01) return;

  // Sample 4 offset directions around the target
  let bestDot = -Infinity;
  let bestNx = nx;
  let bestNy = ny;
  const offsets = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];

  for (const angle of offsets) {
    const ox = targetWX + Math.cos(angle) * 0.15;
    const oy = targetWY + Math.sin(angle) * 0.15;
    const approach = worldDirectionTo(scav.wx, scav.wy, ox, oy);

    // Check fluid at our current position for this approach direction
    const { x: wvx, y: wvy } = flowField ? flowField.sample(scav.wx, scav.wy) : { x: 0, y: 0 };
    const fluidSpeed = Math.sqrt(wvx * wvx + wvy * wvy);

    if (fluidSpeed > 0.005) {
      const dot = (wvx * approach.nx + wvy * approach.ny) / fluidSpeed;
      if (dot > bestDot) {
        bestDot = dot;
        bestNx = approach.nx;
        bestNy = approach.ny;
      }
    }
  }

  scav.facing = Math.atan2(bestNy, bestNx);
  scav.thrustIntensity = CONFIG.scavengers.vultureSpeedBoost;
}


// ---- Scavenger identity ----

const FACTIONS = ['Collector', 'Reaper', 'Warden'];
const DRIFTER_NAMES = ['Quiet Tide', 'Still Wake', 'Ash Petal', 'Cold Harbor',
  'Pale Drift', 'Dim Lantern', 'Soft Echo', 'Low Ember'];
const VULTURE_NAMES = ['Keen Edge', 'Rust Claw', 'Burnt Lance', 'Bitter Claim',
  'Sharp Debt', 'Iron Reap', 'Hot Slag', 'Cold Cut'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateScavengerName(archetype) {
  const faction = pick(FACTIONS);
  const callsign = archetype === 'vulture' ? pick(VULTURE_NAMES) : pick(DRIFTER_NAMES);
  return { faction, callsign, full: `${faction} ${callsign}` };
}

// ---- Scavenger entity ----

export class Scavenger {
  constructor(wx, wy, archetype) {
    // Position and velocity (same space as player ship)
    this.wx = wx;
    this.wy = wy;
    this.vx = 0;
    this.vy = 0;

    // Facing and thrust (set by AI decision logic)
    this.facing = Math.random() * Math.PI * 2;
    this.thrustIntensity = 0;

    // Identity
    this.archetype = archetype; // 'drifter' or 'vulture'
    const identity = generateScavengerName(archetype);
    this.faction = identity.faction;
    this.callsign = identity.callsign;
    this.name = identity.full;

    // State machine
    this.state = 'drift';
    this.stateBeforeFlee = 'drift';
    this.lootCount = 0;
    this.targetWreck = null;
    this.targetPortal = null;

    // Timers
    this.decisionTimer = Math.random() * CONFIG.scavengers.decisionInterval;
    this.lootTimer = 0;

    // Loot target: drifters are cautious, vultures are greedy
    const cfg = CONFIG.scavengers;
    this.lootTarget = archetype === 'vulture'
      ? cfg.vultureLootTarget + Math.floor(Math.random() * 2)
      : cfg.drifterLootTarget + Math.floor(Math.random() * 2);

    // Life
    this.alive = true;
    this.deathTimer = 0;
    this.deathWell = null;    // well reference for spiral animation
    this.deathStartWX = 0;    // position when death spiral began
    this.deathStartWY = 0;
    this.deathAngle = 0;      // current spiral angle
  }
}


// ---- System ----

export class ScavengerSystem {
  constructor() {
    this.scavengers = [];
  }

  /** Spawn a scavenger at a world-space position. */
  spawn(wx, wy, archetype) {
    const scav = new Scavenger(wx, wy, archetype);
    this.scavengers.push(scav);
    return scav;
  }

  /**
   * Main update loop. Runs AI decisions, physics, fluid injection.
   * @param {number} dt - frame delta in seconds
   * @param {Object} flowField - local flow sampler with sample(wx, wy)
   * @param {FluidSim} fluid - visual fluid target for wake injection
   * @param {WellSystem} wellSystem
   * @param {Object} wreckSystem - must have .wrecks array with {wx, wy, looted}
   * @param {Object} portalSystem - must have .portals array with {wx, wy, active}
   * @param {Ship} ship - player ship for vulture tracking
   * @param {Array} waveRings - for future wave interaction
   */
  update(dt, flowField, fluid, wellSystem, wreckSystem, portalSystem, ship, waveRings) {
    const cfg = CONFIG.scavengers;

    for (const scav of this.scavengers) {
      if (!scav.alive) continue;

      // ---- Dying state: spiral animation ----
      if (scav.state === 'dying') {
        this._updateDeathSpiral(scav, dt);
        continue;
      }

      // ---- AI decision tick ----
      scav.decisionTimer -= dt;
      if (scav.decisionTimer <= 0) {
        scav.decisionTimer = cfg.decisionInterval;
        this._decide(scav, flowField, wellSystem, wreckSystem, portalSystem, ship);
      }

      // ---- Execute current state ----
      this._executeState(scav, dt, flowField, wellSystem, wreckSystem, portalSystem, ship);

      // ---- Physics update (same model as ship.js) ----
      this._updatePhysics(scav, dt, flowField, wellSystem);

      // ---- Well death check ----
      this._checkWellDeath(scav, wellSystem);

      // ---- Bullet wake injection ----
      if (fluid) {
        this._injectWake(scav, fluid);
      }
    }

    // Remove dead scavengers
    this.scavengers = this.scavengers.filter(s => s.alive);
  }

  // ---- Physics (mirrors ship.js exactly) ----

  _updatePhysics(scav, dt, flowField, wellSystem) {
    const cfg = CONFIG.scavengers;
    const wellCfg = CONFIG.wells;

    // 1. AI thrust
    if (scav.thrustIntensity > 0) {
      scav.vx += Math.cos(scav.facing) * cfg.thrustAccel * scav.thrustIntensity * dt;
      scav.vy += Math.sin(scav.facing) * cfg.thrustAccel * scav.thrustIntensity * dt;
    }

    // 2. Fluid coupling (same lerp as ship.js)
    if (flowField) {
      const { x: wvx, y: wvy } = flowField.sample(scav.wx, scav.wy);
      const coupling = Math.min(cfg.fluidCoupling * dt, 0.5);
      scav.vx = scav.vx * (1 - coupling) + wvx * coupling;
      scav.vy = scav.vy * (1 - coupling) + wvy * coupling;
    }

    // 3. Well gravity (same force model as ship.js)
    if (wellSystem) {
      const maxRange = wellCfg.maxRange ?? 0.8;
      for (const well of wellSystem.wells) {
        const { dist, nx, ny } = worldDirectionTo(scav.wx, scav.wy, well.wx, well.wy);
        const accel = inversePowerForce(dist, wellCfg.shipPullStrength, well.mass, wellCfg.shipPullFalloff, maxRange);
        if (accel > 0) {
          scav.vx += nx * accel * dt;
          scav.vy += ny * accel * dt;
        }
      }
    }

    // 4. Drag
    const dragMult = 1 - cfg.drag;
    scav.vx *= dragMult;
    scav.vy *= dragMult;

    // 5. Integrate + wrap
    scav.wx = wrapWorld(scav.wx + scav.vx * dt);
    scav.wy = wrapWorld(scav.wy + scav.vy * dt);
  }

  // ---- AI decision logic (runs every decisionInterval) ----

  _decide(scav, flowField, wellSystem, wreckSystem, portalSystem, ship) {
    const cfg = CONFIG.scavengers;

    // Priority 1: flee well if too close
    if (scav.state !== 'dying') {
      const nearestWell = this._nearestWell(scav, wellSystem);
      if (nearestWell && nearestWell.dist < cfg.fleeWellDist) {
        if (scav.state !== 'fleeWell') {
          scav.stateBeforeFlee = scav.state;
        }
        scav.state = 'fleeWell';
        return;
      }
      // Return from flee if safe
      if (scav.state === 'fleeWell' && (!nearestWell || nearestWell.dist > cfg.safeWellDist)) {
        scav.state = scav.stateBeforeFlee;
      }
    }

    // State-specific transitions
    switch (scav.state) {
      case 'drift':
        this._decideDrift(scav, wreckSystem, portalSystem, cfg);
        break;
      case 'seekWreck':
        this._decideSeekWreck(scav, wreckSystem, portalSystem, ship, cfg);
        break;
      case 'loot':
        // Loot state transitions handled in _executeState
        break;
      case 'seekPortal':
        this._decideSeekPortal(scav, portalSystem, ship, cfg);
        break;
      case 'fleeWell':
        // Handled above
        break;
    }
  }

  _decideDrift(scav, wreckSystem, portalSystem, cfg) {
    // Look for un-looted wrecks in sensor range
    const wreck = this._nearestUnlootedWreck(scav, wreckSystem);
    if (wreck && wreck.dist < cfg.sensorRange) {
      scav.targetWreck = wreck.wreck;
      scav.state = 'seekWreck';
      return;
    }

    // If no wrecks and we have loot, head for portal
    if (scav.lootCount > 0) {
      const portal = this._nearestActivePortal(scav, portalSystem);
      if (portal) {
        scav.targetPortal = portal.portal;
        scav.state = 'seekPortal';
        return;
      }
    }
  }

  _decideSeekWreck(scav, wreckSystem, portalSystem, ship, cfg) {
    // Validate target still exists and is unlootable
    if (!scav.targetWreck || scav.targetWreck.looted) {
      const wreck = this._nearestUnlootedWreck(scav, wreckSystem);
      if (wreck && wreck.dist < cfg.sensorRange) {
        scav.targetWreck = wreck.wreck;
      } else {
        // No wrecks — seek portal if we have loot, else drift
        if (scav.lootCount > 0 || this._activePortalCount(portalSystem) <= 1) {
          const portal = this._nearestActivePortal(scav, portalSystem);
          if (portal) {
            scav.targetPortal = portal.portal;
            scav.state = 'seekPortal';
          } else {
            scav.state = 'drift';
          }
        } else {
          scav.state = 'drift';
        }
      }
    }
  }

  _decideSeekPortal(scav, portalSystem, ship, cfg) {
    // Validate target still active
    if (!scav.targetPortal || !scav.targetPortal.alive) {
      const portal = this._nearestActivePortal(scav, portalSystem);
      if (portal) {
        scav.targetPortal = portal.portal;
      } else {
        scav.state = 'drift';
      }
    }
  }

  // ---- State execution (runs every frame) ----

  _executeState(scav, dt, flowField, wellSystem, wreckSystem, portalSystem, ship) {
    const cfg = CONFIG.scavengers;

    switch (scav.state) {
      case 'drift':
        this._executeDrift(scav, dt, flowField);
        break;

      case 'seekWreck':
        this._executeSeekWreck(scav, dt, flowField, ship, cfg);
        break;

      case 'loot':
        this._executeLoot(scav, dt, wreckSystem, portalSystem, cfg);
        break;

      case 'seekPortal':
        this._executeSeekPortal(scav, dt, flowField, ship, cfg);
        break;

      case 'extract':
        // Scavenger reached portal — consume the portal and disappear.
        if (scav.targetPortal && scav.targetPortal.alive) {
          scav.targetPortal.alive = false;
        }
        scav.alive = false;
        break;

      case 'fleeWell':
        this._executeFlee(scav, dt, flowField, wellSystem);
        break;
    }
  }

  _executeDrift(scav, dt, flowField) {
    // Gentle random thrust — just enough to avoid stagnation
    scav.thrustIntensity = 0.15;
    // Slowly rotate facing for natural wandering
    scav.facing += (Math.random() - 0.5) * 0.3 * dt;
  }

  _executeSeekWreck(scav, dt, flowField, ship, cfg) {
    if (!scav.targetWreck || scav.targetWreck.looted) {
      scav.thrustIntensity = 0;
      return;
    }

    const tw = scav.targetWreck;
    const dist = worldDistance(scav.wx, scav.wy, tw.wx, tw.wy);

    // Arrived at wreck — begin looting
    if (dist < (CONFIG.wrecks?.pickupRadius ?? 0.08)) {
      scav.state = 'loot';
      scav.lootTimer = cfg.lootPause;
      scav.thrustIntensity = 0;
      return;
    }

    // Vulture: if player is closer to the same wreck, try alternate approach
    if (scav.archetype === 'vulture' && ship) {
      const playerDist = worldDistance(ship.wx, ship.wy, tw.wx, tw.wy);
      if (playerDist < dist) {
        vultureAlternateApproach(scav, tw.wx, tw.wy, flowField);
        return;
      }
    }

    thrustToward(scav, tw.wx, tw.wy, flowField);
  }

  _executeLoot(scav, dt, wreckSystem, portalSystem, cfg) {
    scav.thrustIntensity = 0;
    scav.lootTimer -= dt;

    if (scav.lootTimer <= 0) {
      // Mark wreck as looted
      if (scav.targetWreck && !scav.targetWreck.looted) {
        scav.targetWreck.looted = true;
        scav.lootCount++;
      }
      scav.targetWreck = null;

      // Decide: more wrecks or extract?
      const portalsLeft = this._activePortalCount(portalSystem);
      if (scav.lootCount >= scav.lootTarget || portalsLeft <= 1) {
        const portal = this._nearestActivePortal(scav, portalSystem);
        if (portal) {
          scav.targetPortal = portal.portal;
          scav.state = 'seekPortal';
        } else {
          scav.state = 'drift';
        }
      } else {
        scav.state = 'drift'; // will pick up new wreck next decision tick
      }
    }
  }

  _executeSeekPortal(scav, dt, flowField, ship, cfg) {
    if (!scav.targetPortal || !scav.targetPortal.alive) {
      scav.thrustIntensity = 0;
      return;
    }

    const tp = scav.targetPortal;
    const dist = worldDistance(scav.wx, scav.wy, tp.wx, tp.wy);

    // Arrived at portal — extract
    if (dist < (CONFIG.portals?.captureRadius ?? 0.08)) {
      scav.state = 'extract';
      scav.thrustIntensity = 0;
      return;
    }

    // Vulture: if player is heading for same portal, try alternate approach
    if (scav.archetype === 'vulture' && ship) {
      const playerDist = worldDistance(ship.wx, ship.wy, tp.wx, tp.wy);
      if (playerDist < dist) {
        vultureAlternateApproach(scav, tp.wx, tp.wy, flowField);
        return;
      }
    }

    thrustToward(scav, tp.wx, tp.wy, flowField);
  }

  _executeFlee(scav, dt, flowField, wellSystem) {
    // Thrust directly away from nearest well
    const nearest = this._nearestWell(scav, wellSystem);
    if (!nearest) {
      scav.thrustIntensity = 0;
      return;
    }
    // Direction AWAY from well
    const { nx, ny } = worldDirectionTo(scav.wx, scav.wy, nearest.well.wx, nearest.well.wy);
    scav.facing = Math.atan2(-ny, -nx);
    scav.thrustIntensity = 1.0;
  }

  // ---- Death spiral ----

  _checkWellDeath(scav, wellSystem) {
    if (!wellSystem || scav.state === 'dying') return;

    for (const well of wellSystem.wells) {
      const dist = worldDistance(scav.wx, scav.wy, well.wx, well.wy);
      if (dist < (well.killRadius ?? CONFIG.wells.killRadius)) {
        scav.state = 'dying';
        scav.deathTimer = 0;
        scav.deathWell = well;
        scav.deathStartWX = scav.wx;
        scav.deathStartWY = scav.wy;
        scav.deathAngle = Math.atan2(scav.wy - well.wy, scav.wx - well.wx);
        scav.vx = 0;
        scav.vy = 0;
        return;
      }
    }
  }

  _updateDeathSpiral(scav, dt) {
    const duration = CONFIG.scavengers.deathSpiralDuration;
    scav.deathTimer += dt;

    if (scav.deathTimer >= duration) {
      scav.alive = false;
      return;
    }

    const t = scav.deathTimer / duration; // 0→1 over the spiral
    const well = scav.deathWell;

    // Spiral inward: radius shrinks, angle increases
    const startDist = worldDistance(scav.deathStartWX, scav.deathStartWY, well.wx, well.wy);
    const radius = startDist * (1 - t);
    scav.deathAngle += (4 + t * 12) * dt; // accelerating spin

    scav.wx = wrapWorld(well.wx + Math.cos(scav.deathAngle) * radius);
    scav.wy = wrapWorld(well.wy + Math.sin(scav.deathAngle) * radius);

    // Spin the ship body fast
    scav.facing += 15 * dt;
  }

  // ---- Bullet wake (mirrors ship.js wake code) ----

  _injectWake(scav, fluid) {
    const cfg = CONFIG.scavengers;
    const wake = CONFIG.ship.wake;
    const speed = Math.sqrt(scav.vx * scav.vx + scav.vy * scav.vy);
    const terminalVelWorld = cfg.thrustAccel / (cfg.drag > 0 ? cfg.drag : 0.03);
    const speedFraction = speed / terminalVelWorld;

    const wakeScale = Math.max(0, Math.min(1,
      (speedFraction - wake.speedThreshold) / Math.max(wake.speedThreshold, 0.01)
    ));

    if (wakeScale <= 0) return;

    const [baseUVx, baseUVy] = worldToFluidUV(scav.wx, scav.wy);
    const behindX = -Math.cos(scav.facing);
    const behindY = Math.sin(scav.facing); // fluid UV is Y-up
    const s = uvScale();
    const s2 = s * s;

    // Slightly smaller wake than player (70% scale)
    const wakeMult = 0.7;

    for (let i = 0; i < wake.splatCount; i++) {
      const offset = (i + 1) * wake.splatSpacing * s;
      const sx = baseUVx + behindX * offset;
      const sy = baseUVy + behindY * offset;
      const falloff = 1 - (i / wake.splatCount) * 0.5;
      const forceMag = wake.force * wakeScale * falloff * s * wakeMult;
      const b = wake.brightness * wakeScale * falloff * wakeMult;

      // Tint wake by archetype color
      const isDrifter = scav.archetype === 'drifter';
      fluid.splat(
        sx, sy,
        Math.cos(scav.facing) * forceMag,
        -Math.sin(scav.facing) * forceMag,
        wake.radius * s2,
        isDrifter ? b * 0.3 : b * 0.8,   // r: drifters blue, vultures warm
        isDrifter ? b * 0.6 : b * 0.5,   // g
        isDrifter ? b * 1.0 : b * 0.2    // b
      );
    }
  }

  // ---- Bump collision with player ship ----

  checkBumpCollision(ship) {
    const cfg = CONFIG.scavengers;

    for (const scav of this.scavengers) {
      if (!scav.alive || scav.state === 'dying') continue;

      const dist = worldDistance(scav.wx, scav.wy, ship.wx, ship.wy);
      if (dist < cfg.bumpRadius) {
        // Push both apart along collision normal
        const { nx, ny } = worldDirectionTo(scav.wx, scav.wy, ship.wx, ship.wy);
        const impulse = cfg.bumpForce;

        // Ship gets pushed away from scavenger
        ship.vx += nx * impulse;
        ship.vy += ny * impulse;

        // Scavenger gets pushed away from ship
        scav.vx -= nx * impulse;
        scav.vy -= ny * impulse;
      }
    }
  }

  // ---- Rendering ----

  /**
   * Draw scavengers on the 2D overlay canvas.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} camX - camera world X
   * @param {number} camY - camera world Y
   * @param {number} canvasW
   * @param {number} canvasH
   * @param {number} totalTime - for animations
   */
  render(ctx, camX, camY, canvasW, canvasH, totalTime) {
    const cfg = CONFIG.scavengers;

    for (const scav of this.scavengers) {
      if (!scav.alive) continue;
      if (shouldCull(scav.wx, scav.wy, camX, camY)) continue;

      const [sx, sy] = worldToScreen(scav.wx, scav.wy, camX, camY, canvasW, canvasH);
      const isDrifter = scav.archetype === 'drifter';
      const color = isDrifter ? DRIFTER_COLOR : VULTURE_COLOR;
      const trailColor = isDrifter ? DRIFTER_TRAIL : VULTURE_TRAIL;

      // Death spiral: shrink + fast spin
      let size = cfg.size;
      let alpha = 1.0;
      if (scav.state === 'dying') {
        const t = scav.deathTimer / CONFIG.scavengers.deathSpiralDuration;
        size *= (1 - t);
        alpha = 1 - t * t; // fade out with acceleration
      }

      if (size < 0.5) continue;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(sx, sy);
      ctx.rotate(scav.facing);

      // Ship body — same triangle shape as player, 70% size
      ctx.beginPath();
      ctx.moveTo(size, 0);
      ctx.lineTo(-size * 0.6, -size * 0.5);
      ctx.lineTo(-size * 0.3, 0);
      ctx.lineTo(-size * 0.6, size * 0.5);
      ctx.closePath();

      ctx.fillStyle = color;
      ctx.fill();

      // Thrust trail
      if (scav.thrustIntensity > 0.1 && scav.state !== 'dying') {
        const trailLen = size * 1.2 * scav.thrustIntensity;
        ctx.beginPath();
        ctx.moveTo(-size * 0.3, -size * 0.15);
        ctx.lineTo(-size * 0.3 - trailLen, 0);
        ctx.lineTo(-size * 0.3, size * 0.15);
        ctx.closePath();
        ctx.fillStyle = trailColor;
        ctx.fill();
      }

      ctx.restore();
    }
  }

  // ---- UV positions for dissipation shader ----

  /**
   * Returns array of [u, v] positions for all alive scavengers.
   * Used by the distance-based dissipation pass to keep density near AI ships.
   */
  getUVPositions() {
    const positions = [];
    for (const scav of this.scavengers) {
      if (!scav.alive) continue;
      const [u, v] = worldToFluidUV(scav.wx, scav.wy);
      positions.push([u, v]);
    }
    return positions;
  }

  // ---- Query helpers ----

  _nearestWell(scav, wellSystem) {
    if (!wellSystem || wellSystem.wells.length === 0) return null;
    let best = null;
    let bestDist = Infinity;
    for (const well of wellSystem.wells) {
      const dist = worldDistance(scav.wx, scav.wy, well.wx, well.wy);
      if (dist < bestDist) {
        bestDist = dist;
        best = { well, dist };
      }
    }
    return best;
  }

  _nearestUnlootedWreck(scav, wreckSystem) {
    if (!wreckSystem || !wreckSystem.wrecks) return null;
    let best = null;
    let bestDist = Infinity;
    for (const wreck of wreckSystem.wrecks) {
      if (wreck.looted) continue;
      const dist = worldDistance(scav.wx, scav.wy, wreck.wx, wreck.wy);
      if (dist < bestDist) {
        bestDist = dist;
        best = { wreck, dist };
      }
    }
    return best;
  }

  _nearestActivePortal(scav, portalSystem) {
    if (!portalSystem || !portalSystem.portals) return null;
    let best = null;
    let bestDist = Infinity;
    for (const portal of portalSystem.portals) {
      if (!portal.alive) continue;
      const dist = worldDistance(scav.wx, scav.wy, portal.wx, portal.wy);
      if (dist < bestDist) {
        bestDist = dist;
        best = { portal, dist };
      }
    }
    return best;
  }

  _activePortalCount(portalSystem) {
    if (!portalSystem || !portalSystem.portals) return 0;
    return portalSystem.portals.filter(p => p.alive).length;
  }
}
