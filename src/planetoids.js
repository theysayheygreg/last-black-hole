/**
 * planetoids.js — Moving terrain that creates surfable wakes.
 *
 * Three path types:
 * 1. Orbit — elliptical orbit around a single well
 * 2. Figure-8 — Lissajous curve between two wells
 * 3. Transit — straight line across map, wrapping at edges
 *
 * Fluid injection: bow shock (pressure wave ahead), wake vortex (twin eddies behind),
 * density trail (visible comet tail).
 *
 * Ship interaction: push away if close. Well consumption: eaten by wells.
 */

import { CONFIG } from './config.js';
import { WORLD_SCALE, worldToFluidUV, worldToScreen, worldDistance, worldDisplacement, worldDirectionTo } from './coords.js';
import { proximityForce, applyForceToShip } from './physics.js';

class Planetoid {
  /**
   * @param {'orbit'|'figure8'|'transit'} pathType
   * @param {Object} pathData - path-specific parameters
   */
  constructor(pathType, pathData) {
    this.pathType = pathType;
    this.pathData = pathData;
    this.wx = 0;
    this.wy = 0;
    this.vx = 0;    // velocity for trail direction
    this.vy = 0;
    this.t = Math.random() * Math.PI * 2; // phase
    this.alive = true;
    this.age = 0;
  }
}

export class PlanetoidSystem {
  constructor() {
    this.planetoids = [];
    this.spawnTimer = 10; // start first transit after 10 seconds
  }

  /**
   * Spawn an orbiting planetoid around a well.
   */
  spawnOrbit(well) {
    // Randomized ellipse: semi-axes 0.2–0.5 and 0.15–0.4 world-units.
    // Keeps orbits varied but always within ~0.5 world-units of the well.
    const semiA = 0.2 + Math.random() * 0.3;
    const semiB = 0.15 + Math.random() * 0.25;
    const tilt = Math.random() * Math.PI * 2;
    const speed = CONFIG.planetoids.orbitSpeed * (0.7 + Math.random() * 0.6);
    const p = new Planetoid('orbit', {
      centerWX: well.wx,
      centerWY: well.wy,
      semiA, semiB, tilt, speed,
    });
    this.planetoids.push(p);
    return p;
  }

  /**
   * Spawn a figure-8 planetoid between two wells.
   */
  spawnFigure8(wellA, wellB) {
    const [dx, dy] = worldDisplacement(wellA.wx, wellA.wy, wellB.wx, wellB.wy);
    const midWX = (wellA.wx + dx / 2 + WORLD_SCALE) % WORLD_SCALE;
    const midWY = (wellA.wy + dy / 2 + WORLD_SCALE) % WORLD_SCALE;
    const halfDist = Math.sqrt(dx * dx + dy * dy) / 2;
    const speed = CONFIG.planetoids.orbitSpeed * 0.8;
    const p = new Planetoid('figure8', {
      midWX, midWY,
      dx: dx / 2, dy: dy / 2,
      speed,
    });
    this.planetoids.push(p);
    return p;
  }

  /**
   * Spawn a transit planetoid from a random edge.
   */
  spawnTransit() {
    const edge = Math.floor(Math.random() * 4); // 0=top, 1=right, 2=bottom, 3=left
    let startWX, startWY, heading;
    const speed = CONFIG.planetoids.transitSpeed;

    switch (edge) {
      case 0: // top
        startWX = Math.random() * WORLD_SCALE;
        startWY = 0;
        heading = Math.PI / 2 + (Math.random() - 0.5) * 1.0; // ±0.5 rad spread from perpendicular
        break;
      case 1: // right
        startWX = WORLD_SCALE;
        startWY = Math.random() * WORLD_SCALE;
        heading = Math.PI + (Math.random() - 0.5) * 1.0;
        break;
      case 2: // bottom
        startWX = Math.random() * WORLD_SCALE;
        startWY = WORLD_SCALE;
        heading = -Math.PI / 2 + (Math.random() - 0.5) * 1.0;
        break;
      case 3: // left
      default:
        startWX = 0;
        startWY = Math.random() * WORLD_SCALE;
        heading = (Math.random() - 0.5) * 1.0;
        break;
    }

    const p = new Planetoid('transit', {
      heading, speed,
      maxAge: WORLD_SCALE / speed + 5, // time to cross the map + 5s buffer before despawn
    });
    p.wx = startWX;
    p.wy = startWY;
    p.vx = Math.cos(heading) * speed;
    p.vy = Math.sin(heading) * speed;
    this.planetoids.push(p);
    return p;
  }

  /**
   * Update all planetoid positions, inject fluid, check well consumption.
   */
  update(dt, fluid, totalTime, wellSystem, waveRings) {
    const cfg = CONFIG.planetoids;

    // Spawn transit planetoids on timer
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.planetoids.length < cfg.maxAlive) {
      this.spawnTransit();
      const [lo, hi] = cfg.spawnInterval;
      this.spawnTimer = lo + Math.random() * (hi - lo);
    }

    for (const p of this.planetoids) {
      if (!p.alive) continue;
      p.age += dt;

      const prevWX = p.wx;
      const prevWY = p.wy;

      // Update position based on path type
      if (p.pathType === 'orbit') {
        const d = p.pathData;
        p.t += d.speed * dt;
        p.wx = ((d.centerWX + Math.cos(p.t + d.tilt) * d.semiA) % WORLD_SCALE + WORLD_SCALE) % WORLD_SCALE;
        p.wy = ((d.centerWY + Math.sin(p.t) * d.semiB) % WORLD_SCALE + WORLD_SCALE) % WORLD_SCALE;
      } else if (p.pathType === 'figure8') {
        const d = p.pathData;
        p.t += d.speed * dt;
        p.wx = ((d.midWX + d.dx * Math.sin(p.t)) % WORLD_SCALE + WORLD_SCALE) % WORLD_SCALE;
        p.wy = ((d.midWY + d.dy * Math.sin(p.t * 2)) % WORLD_SCALE + WORLD_SCALE) % WORLD_SCALE;
      } else if (p.pathType === 'transit') {
        p.wx = ((p.wx + p.vx * dt) % WORLD_SCALE + WORLD_SCALE) % WORLD_SCALE;
        p.wy = ((p.wy + p.vy * dt) % WORLD_SCALE + WORLD_SCALE) % WORLD_SCALE;
        if (p.age > p.pathData.maxAge) {
          p.alive = false;
          continue;
        }
      }

      // Compute velocity from position delta (for non-transit types)
      if (p.pathType !== 'transit') {
        const [dvx, dvy] = worldDisplacement(prevWX, prevWY, p.wx, p.wy);
        p.vx = dt > 0 ? dvx / dt : 0;
        p.vy = dt > 0 ? dvy / dt : 0;
      }

      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed < 0.001) continue;

      const dirX = p.vx / speed;
      const dirY = p.vy / speed;

      // --- Fluid injection ---
      const [fu, fv] = worldToFluidUV(p.wx, p.wy);

      // Bow shock: 1 splat ahead of the planetoid in its velocity direction.
      // Creates a pressure wave that the player can see and surf.
      const bowDist = 0.008; // how far ahead in UV (~0.024 world-units)
      // dirY is negated for UV because world is Y-down but fluid UV is Y-up
      const bowFU = fu + dirX * bowDist;
      const bowFV = fv - dirY * bowDist;
      fluid.splat(
        bowFU, bowFV,
        dirX * cfg.bowShockForce, -dirY * cfg.bowShockForce,
        cfg.bowShockRadius,
        cfg.density * 0.5,
        cfg.density * 0.7,
        cfg.density * 1.0
      );

      // Wake vortex: twin counter-rotating eddies behind the planetoid.
      // These are surfable — the player can ride the wake like a slipstream.
      const behindFU = fu - dirX * 0.005; // 0.005 UV behind center
      const behindFV = fv + dirY * 0.005; // Y negated for UV
      const perpX = -dirY; // perpendicular to velocity (in world-space)
      const perpY = dirX;
      // Left eddy
      fluid.splat(
        behindFU + perpX * 0.004, behindFV - perpY * 0.004,
        perpX * cfg.wakeForce, -perpY * cfg.wakeForce,
        cfg.wakeRadius,
        cfg.density * 0.3, cfg.density * 0.4, cfg.density * 0.6
      );
      // Right eddy (opposite direction)
      fluid.splat(
        behindFU - perpX * 0.004, behindFV + perpY * 0.004,
        -perpX * cfg.wakeForce, perpY * cfg.wakeForce,
        cfg.wakeRadius,
        cfg.density * 0.3, cfg.density * 0.4, cfg.density * 0.6
      );

      // Density trail: several splats along recent path
      for (let i = 1; i <= cfg.trailLength; i++) {
        const trailFU = fu - dirX * cfg.trailSpacing * i;
        const trailFV = fv + dirY * cfg.trailSpacing * i;
        // Trail fades to 40% brightness at the oldest splat
        const fade = 1 - (i / cfg.trailLength) * 0.6;
        fluid.splat(
          trailFU, trailFV,
          0, 0,
          0.002,
          cfg.density * fade * 0.6,
          cfg.density * fade * 0.8,
          cfg.density * fade * 1.0
        );
      }

      // --- Well consumption check ---
      if (wellSystem) {
        for (const well of wellSystem.wells) {
          const dist = worldDistance(p.wx, p.wy, well.wx, well.wy);
          if (dist < well.killRadius) {
            // Consumed by well — add mass, spawn wave, remove planetoid
            well.mass += cfg.mass;
            if (waveRings) {
              // Wave amplitude = 5× planetoid mass. Makes consumption visually dramatic.
              waveRings.spawn(well.wx, well.wy, cfg.mass * 5);
            }
            p.alive = false;
            break;
          }
        }
      }
    }

    // Remove dead planetoids
    this.planetoids = this.planetoids.filter(p => p.alive);
  }

  /**
   * Apply push force to ship if within range.
   */
  applyToShip(ship) {
    const cfg = CONFIG.planetoids;

    for (const p of this.planetoids) {
      if (!p.alive) continue;
      const { dist, nx, ny } = worldDirectionTo(p.wx, p.wy, ship.wx, ship.wy);
      const accel = proximityForce(dist, cfg.shipPushStrength, cfg.shipPushRadius);
      if (accel > 0) {
        applyForceToShip(ship, nx, ny, accel);
      }
    }
  }

  /**
   * Render planetoid overlay markers (small bright dots with velocity indicator).
   */
  render(ctx, camX, camY, canvasW, canvasH) {
    const cfg = CONFIG.planetoids;

    for (const p of this.planetoids) {
      if (!p.alive) continue;
      const [sx, sy] = worldToScreen(p.wx, p.wy, camX, camY, canvasW, canvasH);
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);

      ctx.save();

      // Body — blue-white dot
      ctx.beginPath();
      ctx.arc(sx, sy, cfg.size, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(200, 220, 255, 0.8)';
      ctx.fill();

      // Velocity direction indicator (short line)
      if (speed > 0.01) {
        const dirLen = 12;
        const dirX = p.vx / speed;
        const dirY = p.vy / speed;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + dirX * dirLen, sy + dirY * dirLen);
        ctx.strokeStyle = 'rgba(150, 200, 255, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  getUVPositions() {
    return this.planetoids.filter(p => p.alive).map(p => worldToFluidUV(p.wx, p.wy));
  }
}
