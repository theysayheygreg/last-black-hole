/**
 * planetoids.js — Comets: moving terrain that creates surfable wakes.
 *
 * Three path types:
 * 1. Orbit — elliptical orbit around a single well
 * 2. Figure-8 — Lissajous curve between two wells
 * 3. Transit — straight line across map, wrapping at edges
 *
 * Visual: teardrop body with canvas-rendered tail (no fluid injection for tail).
 * Fluid injection: bow shock (pressure wave ahead), wake vortex (twin eddies behind).
 *
 * Ship interaction: push away if close. Well consumption: eaten by wells.
 */

import { CONFIG } from './config.js';
import { WORLD_SCALE, worldToFluidUV, worldToScreen, worldDistance, worldDisplacement, worldDirectionTo, wrapWorld, uvScale } from './coords.js';
import { proximityForce, applyForceToShip } from './physics.js';

// ---- Comet name generation ----

const COMET_PREFIXES = ['Comet', 'Wanderer', 'Drifter'];
const GREEK = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateCometName() {
  return `${pick(COMET_PREFIXES)} ${pick(GREEK)}-${Math.floor(Math.random() * 99) + 1}`;
}

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
    this.name = generateCometName();
  }
}

export class PlanetoidSystem {
  constructor() {
    this.planetoids = [];
    this.spawnTimer = 10;
    this._spawnIntervalScale = 1.0; // set by main.js universe clock
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
    const midWX = wrapWorld(wellA.wx + dx / 2);
    const midWY = wrapWorld(wellA.wy + dy / 2);
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

    // Spawn transit planetoids on timer (interval scales down over run)
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.planetoids.length < cfg.maxAlive) {
      this.spawnTransit();
      const [lo, hi] = cfg.spawnInterval;
      const scale = this._spawnIntervalScale;
      this.spawnTimer = (lo + Math.random() * (hi - lo)) * scale;
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
        p.wx = wrapWorld(d.centerWX + Math.cos(p.t + d.tilt) * d.semiA);
        p.wy = wrapWorld(d.centerWY + Math.sin(p.t) * d.semiB);
      } else if (p.pathType === 'figure8') {
        const d = p.pathData;
        p.t += d.speed * dt;
        p.wx = wrapWorld(d.midWX + d.dx * Math.sin(p.t));
        p.wy = wrapWorld(d.midWY + d.dy * Math.sin(p.t * 2));
      } else if (p.pathType === 'transit') {
        p.wx = wrapWorld(p.wx + p.vx * dt);
        p.wy = wrapWorld(p.wy + p.vy * dt);
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

      // --- Fluid injection: comet creates a surfable wake in the fluid ---
      // Three effects simulate a body moving through the medium:
      // 1. Bow shock: pressure wave AHEAD of the comet (pushes fluid aside)
      // 2. Wake vortex: twin counter-rotating eddies BEHIND (creates turbulence)
      // 3. Density trail: visible glow behind the comet (cosmetic only)
      // Together these create currents the player can surf — the design intent
      // is that comets are moving "wave machines" that make the fluid interesting.
      const [fu, fv] = worldToFluidUV(p.wx, p.wy);
      const s = uvScale();
      const s2 = s * s;

      // Bow shock: velocity splat offset ahead of the comet along its motion
      const bowDist = 0.008 * s;
      const bowFU = fu + dirX * bowDist;
      const bowFV = fv - dirY * bowDist;
      fluid.splat(
        bowFU, bowFV,
        dirX * cfg.bowShockForce * s, -dirY * cfg.bowShockForce * s,
        cfg.bowShockRadius * s2,
        cfg.density * 0.5,
        cfg.density * 0.7,
        cfg.density * 1.0
      );

      // Wake vortex: two opposing splats perpendicular to motion, behind the comet.
      // Creates counter-rotating eddies that pull fluid inward — surfable current.
      const behindFU = fu - dirX * 0.005 * s;
      const behindFV = fv + dirY * 0.005 * s;
      const perpX = -dirY;
      const perpY = dirX;
      const eddyOff = 0.004 * s;
      fluid.splat(
        behindFU + perpX * eddyOff, behindFV - perpY * eddyOff,
        perpX * cfg.wakeForce * s, -perpY * cfg.wakeForce * s,
        cfg.wakeRadius * s2,
        cfg.density * 0.3, cfg.density * 0.4, cfg.density * 0.6
      );
      fluid.splat(
        behindFU - perpX * eddyOff, behindFV + perpY * eddyOff,
        -perpX * cfg.wakeForce * s, perpY * cfg.wakeForce * s,
        cfg.wakeRadius * s2,
        cfg.density * 0.3, cfg.density * 0.4, cfg.density * 0.6
      );

      // Density trail
      // Density trail — visual buffer (cosmetic, not advected)
      for (let i = 1; i <= cfg.trailLength; i++) {
        const trailFU = fu - dirX * cfg.trailSpacing * s * i;
        const trailFV = fv + dirY * cfg.trailSpacing * s * i;
        const fade = 1 - (i / cfg.trailLength) * 0.6;
        fluid.visualSplat(
          trailFU, trailFV,
          0.002 * s2,
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
   * Render comets — teardrop body with trailing tail segments.
   */
  render(ctx, camX, camY, canvasW, canvasH) {
    const cfg = CONFIG.planetoids;

    for (const p of this.planetoids) {
      if (!p.alive) continue;
      const [sx, sy] = worldToScreen(p.wx, p.wy, camX, camY, canvasW, canvasH);
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      const bodyR = cfg.size * 1.2;

      ctx.save();

      if (speed > 0.01) {
        const dirX = p.vx / speed;
        const dirY = p.vy / speed;

        // Canvas tail — 5 trailing segments, progressively dimmer and wider
        const tailSegments = 5;
        const segSpacing = 8;
        for (let i = tailSegments; i >= 1; i--) {
          const t = i / tailSegments;
          const tx = sx - dirX * segSpacing * i;
          const ty = sy - dirY * segSpacing * i;
          const segR = 1.5 + t * 3;  // wider toward end
          const alpha = 0.5 * (1 - t);
          ctx.beginPath();
          ctx.arc(tx, ty, segR, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(180, 210, 240, ${alpha})`;
          ctx.fill();
        }

        // Coma — faint radial glow around body
        const comaGrad = ctx.createRadialGradient(sx, sy, bodyR * 0.5, sx, sy, bodyR * 3);
        comaGrad.addColorStop(0, 'rgba(200, 230, 255, 0.15)');
        comaGrad.addColorStop(1, 'rgba(200, 230, 255, 0)');
        ctx.beginPath();
        ctx.arc(sx, sy, bodyR * 3, 0, Math.PI * 2);
        ctx.fillStyle = comaGrad;
        ctx.fill();

        // Teardrop body — elongated toward velocity direction
        const angle = Math.atan2(dirY, dirX);
        ctx.translate(sx, sy);
        ctx.rotate(angle);

        // Teardrop: circle at front, pointed tail behind
        ctx.beginPath();
        ctx.arc(0, 0, bodyR, -Math.PI * 0.5, Math.PI * 0.5);
        ctx.lineTo(-bodyR * 2, 0);
        ctx.closePath();
        ctx.fillStyle = 'rgba(200, 230, 255, 0.85)';
        ctx.fill();

        // Bright leading edge
        ctx.beginPath();
        ctx.arc(bodyR * 0.3, 0, bodyR * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(240, 250, 255, 0.9)';
        ctx.fill();
      } else {
        // Stationary — simple circle
        ctx.beginPath();
        ctx.arc(sx, sy, bodyR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(200, 220, 255, 0.8)';
        ctx.fill();
      }

      ctx.restore();
    }
  }

  getUVPositions() {
    return this.planetoids.filter(p => p.alive).map(p => worldToFluidUV(p.wx, p.wy));
  }
}
