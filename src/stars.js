/**
 * stars.js — Radiant bodies that push fluid outward.
 *
 * Four types with distinct color, size, and behavior:
 *   yellowDwarf  — baseline, warm yellow, 4 rays, moderate push
 *   redGiant     — large, deep red-orange, 6 slow rays, gentle push, corona
 *   whiteDwarf   — compact, blue-white, 4 fast rays, strong push, lens flare
 *   neutronStar  — tiny, pale cyan, 2 very fast rays (pulsar beam), intense push
 */

import { CONFIG } from './config.js';
import { WORLD_SCALE, worldToFluidUV, worldToScreen, worldDirectionTo, worldDistance, uvScale, wrapWorld } from './coords.js';
import { inversePowerForce, applyForceToShip } from './physics.js';

// ---- Star type definitions ----

// Star type visual and physics tuning.
// Each type creates a distinct gameplay feel:
//   - sizeMult: halo + ray length multiplier (1.0 = base 60+20×mass px halo)
//   - pushMult: radiation push force multiplier (higher = harder to approach)
//   - rayCount: number of rotating light rays (more = softer/fuller look)
//   - raySpinMult: ray rotation speed multiplier (1.0 = CONFIG.stars.raySpinRate)
//   - coreDensity: [R,G,B] multipliers for visual density splat (fluid glow color)
const STAR_TYPES = {
  yellowDwarf: {
    color: [255, 240, 180],      // warm yellow — baseline, most common
    haloColor: [255, 230, 160],
    sizeMult: 1.0,               // standard size
    pushMult: 1.0,               // standard push — easy to navigate around
    rayCount: 4,
    raySpinMult: 1.0,
    coreColor: [255, 255, 240],
    coreDensity: [1.0, 0.95, 0.6],  // warm white glow
  },
  redGiant: {
    color: [255, 120, 60],       // deep red-orange — large but gentle
    haloColor: [255, 100, 40],
    sizeMult: 1.8,               // 1.8× bigger halo — dominates the screen
    pushMult: 0.6,               // weaker push — size isn't danger, proximity is
    rayCount: 6,                 // more rays = softer, more diffuse appearance
    raySpinMult: 0.4,            // slow rotation — stately, ancient feel
    coreColor: [255, 180, 100],
    coreDensity: [1.0, 0.5, 0.2],  // orange-red glow
  },
  whiteDwarf: {
    color: [220, 230, 255],      // blue-white — compact and intense
    haloColor: [200, 210, 255],
    sizeMult: 0.5,               // tiny — half the normal size
    pushMult: 2.0,               // 2× push — hard to get close, sharp edges
    rayCount: 4,
    raySpinMult: 2.0,            // fast spin — energetic, dangerous feel
    coreColor: [240, 245, 255],
    coreDensity: [0.8, 0.9, 1.0],  // blue-white glow
  },
  neutronStar: {
    color: [180, 255, 255],      // pale cyan — exotic, rare
    haloColor: [160, 240, 255],
    sizeMult: 0.3,               // very tiny — collapsed remnant
    pushMult: 3.0,               // 3× push — approaching is dangerous
    rayCount: 2,                 // only 2 beams — pulsar effect
    raySpinMult: 4.0,            // 4× spin — rapid pulsar rotation
    coreColor: [200, 255, 255],
    coreDensity: [0.6, 1.0, 1.0],  // cyan glow
  },
};

// ---- Name generation ----

const STAR_CATALOGS = ['HD', 'HIP', 'GJ', 'LHS'];
const TYPE_PREFIXES = {
  yellowDwarf: 'Sol',
  redGiant: 'Betelgeuse',
  whiteDwarf: 'Sirius',
  neutronStar: 'Vela',
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateStarName(type) {
  const prefix = TYPE_PREFIXES[type] || 'Star';
  const catalog = pick(STAR_CATALOGS);
  const number = Math.floor(Math.random() * 9000) + 1000;
  return `${prefix} ${catalog}-${number}`;
}

// ---- Star entity ----

class Star {
  constructor(wx, wy, opts = {}) {
    this.wx = wx;
    this.wy = wy;
    this.mass = opts.mass ?? 1.0;
    this.orbitalDir = opts.orbitalDir ?? 1;
    this.type = opts.type ?? 'yellowDwarf';
    this.typeDef = STAR_TYPES[this.type] || STAR_TYPES.yellowDwarf;
    this.name = generateStarName(this.type);
    this.alive = true;

    // Stars drift very slowly in a random direction (0.001-0.003 world-units/s).
    // At this speed, a star takes ~500s to drift 1 world-unit — long enough that
    // consumption by a well is rare (~1 per long match) and feels like a major event.
    const driftSpeed = 0.001 + Math.random() * 0.002;
    const driftAngle = Math.random() * Math.PI * 2;
    this.driftVX = Math.cos(driftAngle) * driftSpeed;
    this.driftVY = Math.sin(driftAngle) * driftSpeed;

    // Orbiting asteroids — 2-4 tiny bodies
    this.asteroids = [];
    const asteroidCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < asteroidCount; i++) {
      this.asteroids.push({
        orbitRadius: 0.06 + Math.random() * 0.1,
        angle: Math.random() * Math.PI * 2,
        speed: (0.5 + Math.random() * 0.8) * this.orbitalDir,
        size: 2 + Math.random() * 2,
      });
    }
  }
}

export class StarSystem {
  constructor() {
    this.stars = [];
  }

  addStar(wx, wy, opts = {}) {
    const star = new Star(wx, wy, opts);
    this.stars.push(star);
    return star;
  }

  /** Pending consumption events — main.js reads + clears for dramatic effects. */
  get consumptionEvents() { return this._consumptionEvents || []; }
  clearConsumptionEvents() { this._consumptionEvents = []; }

  update(fluid, dt, totalTime, wellSystem = null, waveRings = null) {
    const cfg = CONFIG.stars;
    const s = uvScale();
    const s2 = s * s;
    if (!this._consumptionEvents) this._consumptionEvents = [];

    for (const star of this.stars) {
      if (!star.alive) continue;
      const td = star.typeDef;

      // Drift
      star.wx = wrapWorld(star.wx + star.driftVX * dt);
      star.wy = wrapWorld(star.wy + star.driftVY * dt);

      // Update asteroid orbits
      for (const ast of star.asteroids) {
        ast.angle += ast.speed * dt;
      }

      // Well consumption check — dramatic event
      if (wellSystem) {
        for (const well of wellSystem.wells) {
          const dist = worldDistance(star.wx, star.wy, well.wx, well.wy);
          if (dist < well.killRadius) {
            star.alive = false;
            // Significant mass transfer — a star falling in is a major event.
            // 50% of star mass converts to well growth (the rest is "radiated away").
            well.mass += star.mass * 0.5;
            well.updateKillRadius();
            if (waveRings) {
              // 3× star mass = very large wave. This is the biggest wave event
              // in the game — a dramatic shockwave visible across the map.
              waveRings.spawn(well.wx, well.wy, star.mass * 3);
            }
            this._consumptionEvents.push({
              wx: well.wx, wy: well.wy,
              starType: star.type,
              starColor: td.color,
              starName: star.name,
            });
            break;
          }
        }
        if (!star.alive) continue;
      }
      const [fu, fv] = worldToFluidUV(star.wx, star.wy);

      // Outward push: NEGATIVE gravity, scaled by type
      fluid.applyWellForce(
        [fu, fv],
        -cfg.radiationStrength * star.mass * td.pushMult * Math.pow(s, cfg.falloff),
        cfg.falloff,
        cfg.fluidClampRadius,
        cfg.orbitalStrength * star.orbitalDir,
        dt,
        cfg.fluidTerminalSpeed * s
      );

      // Bright core — type-colored visual density
      const coreRadius = cfg.coreBrightness * 0.025 * s2 * td.sizeMult;
      fluid.visualSplat(fu, fv, coreRadius,
        cfg.coreBrightness * td.coreDensity[0],
        cfg.coreBrightness * td.coreDensity[1],
        cfg.coreBrightness * td.coreDensity[2]
      );
    }
  }

  applyToShip(ship) {
    const cfg = CONFIG.stars;
    const maxRange = cfg.maxRange ?? 0.6;

    for (const star of this.stars) {
      if (!star.alive) continue;
      const td = star.typeDef;
      const { dist, nx, ny } = worldDirectionTo(star.wx, star.wy, ship.wx, ship.wy);
      const accel = inversePowerForce(dist, cfg.shipPushStrength * td.pushMult, star.mass, cfg.shipPushFalloff, maxRange);
      if (accel > 0) {
        applyForceToShip(ship, nx, ny, accel);
      }
    }
  }

  getUVPositions() {
    return this.stars.filter(s => s.alive).map(s => worldToFluidUV(s.wx, s.wy));
  }

  render(ctx, camX, camY, canvasW, canvasH, totalTime) {
    for (const star of this.stars) {
      if (!star.alive) continue;
      const [sx, sy] = worldToScreen(star.wx, star.wy, camX, camY, canvasW, canvasH);
      const td = star.typeDef;
      const [cr, cg, cb] = td.color;
      const [hr, hg, hb] = td.haloColor;
      const pulse = 0.7 + 0.3 * Math.sin(totalTime * 3);

      ctx.save();

      // Halo — type-colored, size scales with mass and type
      const haloR = (60 + 20 * star.mass) * td.sizeMult;
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, haloR);
      grad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${0.4 * pulse})`);
      grad.addColorStop(0.2, `rgba(${hr}, ${hg}, ${hb}, ${0.25 * pulse})`);
      grad.addColorStop(0.5, `rgba(${hr}, ${hg}, ${hb}, ${0.1 * pulse})`);
      grad.addColorStop(1, `rgba(${hr}, ${hg}, ${hb}, 0)`);
      ctx.beginPath();
      ctx.arc(sx, sy, haloR, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Red giant corona — extra outer glow ring
      if (star.type === 'redGiant') {
        const coronaR = haloR * 1.3;
        const coronaPulse = 0.5 + 0.5 * Math.sin(totalTime * 1.2 + star.wx * 3);
        ctx.beginPath();
        ctx.arc(sx, sy, coronaR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 80, 30, ${0.15 * coronaPulse})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // Rotating ray spikes — count and speed per type
      const rayCount = td.rayCount;
      const rayLen = (50 + 30 * star.mass) * td.sizeMult;
      const rayAngle = totalTime * CONFIG.stars.raySpinRate * 0.5 * td.raySpinMult;
      ctx.lineWidth = star.type === 'redGiant' ? 3 : 2;
      for (let i = 0; i < rayCount; i++) {
        const a = rayAngle + (i / rayCount) * Math.PI * 2;
        const rayGrad = ctx.createLinearGradient(
          sx + Math.cos(a) * 8, sy + Math.sin(a) * 8,
          sx + Math.cos(a) * rayLen, sy + Math.sin(a) * rayLen
        );
        rayGrad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${0.5 * pulse})`);
        rayGrad.addColorStop(1, `rgba(${hr}, ${hg}, ${hb}, 0)`);
        ctx.strokeStyle = rayGrad;
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(a) * 8, sy + Math.sin(a) * 8);
        ctx.lineTo(sx + Math.cos(a) * rayLen, sy + Math.sin(a) * rayLen);
        ctx.stroke();
      }

      // White dwarf lens flare — perpendicular bright lines
      if (star.type === 'whiteDwarf') {
        const flareLen = rayLen * 1.5;
        ctx.lineWidth = 1;
        for (let i = 0; i < 2; i++) {
          const a = (i / 2) * Math.PI;
          ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.3 * pulse})`;
          ctx.beginPath();
          ctx.moveTo(sx - Math.cos(a) * flareLen, sy - Math.sin(a) * flareLen);
          ctx.lineTo(sx + Math.cos(a) * flareLen, sy + Math.sin(a) * flareLen);
          ctx.stroke();
        }
      }

      // Neutron star pulsar flash — brightness pulses at spin rate
      if (star.type === 'neutronStar') {
        const pulsarPhase = Math.sin(totalTime * CONFIG.stars.raySpinRate * td.raySpinMult * 2);
        if (pulsarPhase > 0.7) {
          const flashAlpha = (pulsarPhase - 0.7) / 0.3;
          ctx.beginPath();
          ctx.arc(sx, sy, 20 * td.sizeMult, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.2 * flashAlpha})`;
          ctx.fill();
        }
      }

      // Core
      const coreR = 10 * td.sizeMult;
      const [ccr, ccg, ccb] = td.coreColor;
      ctx.beginPath();
      ctx.arc(sx, sy, coreR, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${ccr}, ${ccg}, ${ccb}, ${0.9 * pulse})`;
      ctx.fill();

      // Hot center
      ctx.beginPath();
      ctx.arc(sx, sy, coreR * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${pulse})`;
      ctx.fill();

      // Orbiting asteroids — rendered via worldToScreen for proper toroidal wrapping
      for (const ast of star.asteroids) {
        const astWX = star.wx + Math.cos(ast.angle) * ast.orbitRadius;
        const astWY = star.wy + Math.sin(ast.angle) * ast.orbitRadius;
        const [ax, ay] = worldToScreen(astWX, astWY, camX, camY, canvasW, canvasH);
        ctx.beginPath();
        ctx.arc(ax, ay, ast.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(160, 160, 170, ${0.5 + 0.2 * pulse})`;
        ctx.fill();
      }

      ctx.restore();
    }
  }
}
