/**
 * slingshot.js — Anchor-network movement system.
 *
 * Implements the design from docs/design/SLINGSHOT-NETWORK.md:
 *
 *   APPROACH → AFFORDANCE → ENGAGE → ENGAGED → RELEASE
 *
 * Any heavy enough world object (well, star, planetoid) is a potential
 * slingshot anchor. When the ship enters an anchor's snap-to range, the
 * UI shows a radial affordance ring. The player presses ENGAGE to
 * commit; while engaged the ship orbits the anchor at fixed radius
 * (gravity is partially cancelled, tangential velocity is preserved
 * and amplified). The system accumulates orbital energy proportional
 * to tangential alignment × anchor mass × proximity. The player
 * releases ENGAGE (or flies out of range) to release. Exit velocity =
 * pre-release ship velocity + accumulated energy as a boost in the ship's
 * facing direction.
 *
 * Chains: if the player engages a NEW anchor within `chainWindow`
 * seconds of releasing the previous one, release energy gets a
 * multiplicative chain bonus that scales with the chain count. Reading
 * the geometry of the map and stitching anchors
 * together is the core skill expression.
 *
 * Hull integration is layered via per-hull stats from hulls.data.json:
 *   slingshotEnergyMult (Drifter best, Hauler worst)
 *   slingshotChainWindow (Resonant most forgiving)
 *   slingshotSignalReduction (reserved for server-authoritative signal)
 */

import { CONFIG } from './config.js';
import { worldDistance, worldDisplacement } from './coords.js';
import { inversePowerForce } from './physics.js';

// Static config for the system. Numbers chosen as a sensible first pass
// — see docs/design/SLINGSHOT-NETWORK.md for the design rationale and the
// "deferred to numbers pass" list. Tuning happens after playtest.
const SLINGSHOT_CONFIG = {
  // Per-anchor-type snap-to range in world-units. Wells biggest because
  // their kill radius is biggest — you need a wider catch zone to make
  // the risk meaningful. Stars mid. Planetoids tight (they're small,
  // moving, and quick to catch in passing).
  range: {
    well: 0.45,
    star: 0.30,
    planetoid: 0.18,
  },
  // Effective mass for energy calculations. Wells use their own .mass
  // field directly; stars use their own .mass; planetoids have no mass
  // so a fixed value is used. These can be multiplied by anchor.mass
  // where appropriate.
  massWeight: {
    well: 1.0,    // multiplies anchor.mass
    star: 0.6,    // multiplies anchor.mass
    planetoid: 0.3,  // fixed
  },
  // Energy accumulation rate per second per unit of (mass × tangential
  // alignment × proximity). Tuning dial — bigger = each sling pays more.
  energyAccrualRate: 3.5,
  // Release multiplier on banked energy. Lets us tune the *feeling* of
  // a sling separately from the per-second accrual, so a 1-second hold
  // already pays off and a 3-second one pays off more.
  releaseMultiplier: 4.5,
  // While engaged, gravity pull from the anchor itself is cancelled by
  // this fraction (1.0 = full cancel, 0.0 = none). Less than 1 means
  // the ship still drifts toward the anchor — which gives stakes.
  gravityCancelFraction: 0.95,
  // Tangential force amplifier while engaged: pushes ship around the
  // anchor in the orbital direction it was moving on entry. Tuned for
  // the post-drag-reduction baseline (drag = 0.015) where bleed is
  // small and we don't need to muscle through it. Lower here means
  // entry speed matters more — you can't compensate for a slow,
  // mistimed approach by just holding the engage button.
  tangentialForce: 1.5,
  // Time after release within which engaging a new anchor counts as a
  // chain. Drifter / Resonant get longer windows via hull stats.
  chainWindowSeconds: 1.2,
  // Per-step chain multiplier on energy accrual for the next sling.
  // Two-chain = 1.4×, three-chain = 1.96×, four-chain = 2.74× …
  chainMultiplier: 1.4,
  // Minimum tangential velocity component (world-units/sec) at engage
  // time to actually start banking energy. A pure-infall trajectory
  // (heading straight at the anchor) gets nothing. The threshold is
  // small so it doesn't punish low-speed players, just zero-tangent.
  minTangentialSpeed: 0.05,
  // Maximum number of chained anchors counted toward the multiplier.
  // Keeps chain bonuses from going exponential on long star-lines.
  maxChainCount: 6,
};

export class SlingshotSystem {
  constructor() {
    // Last-released anchor + timestamp — used to detect chain windows.
    this._lastReleaseTime = -Infinity;
    this._lastReleasedAnchorRef = null;
    // Current chain count: 1 for first sling, 2 after a clean chain etc.
    this._chainCount = 0;
  }

  /**
   * Build the unified anchor list from world systems. Each anchor entry
   * has the shape consumers downstream rely on:
   *   { ref, type, wx, wy, massWeight, range, killRadius? }
   */
  collectAnchors(wellSystem, starSystem, planetoidSystem) {
    const anchors = [];
    if (wellSystem) {
      for (const w of wellSystem.wells) {
        anchors.push({
          ref: w,
          type: 'well',
          wx: w.wx, wy: w.wy,
          massWeight: SLINGSHOT_CONFIG.massWeight.well * (w.mass || 1.0),
          range: SLINGSHOT_CONFIG.range.well,
          killRadius: w.killRadius ?? 0.04,
        });
      }
    }
    if (starSystem) {
      for (const s of starSystem.stars || []) {
        if (!s.alive && s.alive !== undefined) continue;
        anchors.push({
          ref: s,
          type: 'star',
          wx: s.wx, wy: s.wy,
          massWeight: SLINGSHOT_CONFIG.massWeight.star * (s.mass || 1.0),
          range: SLINGSHOT_CONFIG.range.star,
        });
      }
    }
    if (planetoidSystem) {
      for (const p of planetoidSystem.planetoids || []) {
        if (!p.alive) continue;
        anchors.push({
          ref: p,
          type: 'planetoid',
          wx: p.wx, wy: p.wy,
          massWeight: SLINGSHOT_CONFIG.massWeight.planetoid,
          range: SLINGSHOT_CONFIG.range.planetoid,
        });
      }
    }
    return anchors;
  }

  /**
   * Find the nearest anchor within snap-to range of the ship. Returns
   * null if no eligible anchor — the affordance UI renders nothing.
   */
  findAffordance(ship, anchors) {
    let best = null;
    let bestDist = Infinity;
    for (const a of anchors) {
      const d = worldDistance(ship.wx, ship.wy, a.wx, a.wy);
      if (d <= a.range && d < bestDist) {
        best = { anchor: a, distance: d };
        bestDist = d;
      }
    }
    return best;
  }

  /**
   * Try to engage the ship with the given anchor. Caller computes which
   * anchor (typically findAffordance result). Returns true on engage.
   *
   * Chain detection: if the engage happens within chainWindow of last
   * release AND the new anchor isn't the one we just left, chain count
   * advances. Anchors landed-on twice in a row don't chain (would let
   * a player exploit a single anchor).
   */
  engage(ship, anchor, hullModifiers, currentTimeSeconds) {
    if (!anchor || ship.slingshotEngaged) return false;
    const minTan = SLINGSHOT_CONFIG.minTangentialSpeed;
    const tanSpeed = this._tangentialSpeed(ship, anchor);
    if (tanSpeed < minTan) return false;

    // Chain window check.
    const since = currentTimeSeconds - this._lastReleaseTime;
    const windowSeconds = SLINGSHOT_CONFIG.chainWindowSeconds * (hullModifiers.chainWindowMult ?? 1);
    if (since <= windowSeconds && this._lastReleasedAnchorRef && this._lastReleasedAnchorRef !== anchor.ref) {
      this._chainCount = Math.min(this._chainCount + 1, SLINGSHOT_CONFIG.maxChainCount);
    } else {
      this._chainCount = 1;
    }

    ship.slingshotEngaged = true;
    ship.slingshotAnchor = anchor;
    ship.slingshotEnergy = 0;
    ship.slingshotChainCount = this._chainCount;
    ship.slingshotEngageRadius = worldDistance(ship.wx, ship.wy, anchor.wx, anchor.wy);
    ship.slingshotOrbitDir = this._orbitDirection(ship, anchor);

    // Snap ship velocity onto the tangent at engage time. Without this
    // a ship that approached at an angle has a radial velocity component
    // that immediately drifts it out of range. We preserve total speed
    // and reorient it purely tangentially — the slingshot is "you grab
    // on, the ride starts." Like a skater catching a rail.
    const [dx0, dy0] = worldDisplacement(ship.wx, ship.wy, anchor.wx, anchor.wy);
    const dist0 = Math.hypot(dx0, dy0) || 1e-4;
    const radNX = dx0 / dist0;
    const radNY = dy0 / dist0;
    const od = ship.slingshotOrbitDir;
    const tanNX = -radNY * od;
    const tanNY = radNX * od;
    const speed0 = Math.hypot(ship.vx, ship.vy);
    ship.vx = tanNX * speed0;
    ship.vy = tanNY * speed0;

    return true;
  }

  /**
   * Per-frame integration while engaged. Apply gravity-cancel + tangential
   * force amplifier; accumulate energy proportional to tangential alignment
   * × anchor mass × proximity. Caller (Ship.update) integrates the
   * resulting accelerations.
   *
   * Returns the velocity delta to apply to the ship this frame, OR null
   * if not engaged or anchor became invalid.
   */
  applyEngagedForces(ship, dt, hullModifiers) {
    if (!ship.slingshotEngaged || !ship.slingshotAnchor) return null;
    const anchor = ship.slingshotAnchor;

    // If anchor died (well consumed star, planetoid expired, etc),
    // emergency-release with whatever energy we banked.
    if (anchor.ref?.alive === false) {
      this.release(ship, hullModifiers, performance.now() / 1000);
      return null;
    }

    // World-space displacement to anchor.
    const [dx, dy] = worldDisplacement(ship.wx, ship.wy, anchor.wx, anchor.wy);
    const dist = Math.hypot(dx, dy) || 1e-4;

    // If the player has flown clear of the engagement range (e.g. they
    // were yanked by another force), auto-release.
    if (dist > anchor.range * 1.1) {
      this.release(ship, hullModifiers, performance.now() / 1000);
      return null;
    }

    // Unit vector toward anchor.
    const radialNX = dx / dist;
    const radialNY = dy / dist;

    // Tangential direction (perpendicular to radial), oriented in the
    // ship's current orbital direction. orbitDir = +1 for CCW, -1 for CW.
    const od = ship.slingshotOrbitDir;
    const tangentNX = -radialNY * od;
    const tangentNY = radialNX * od;

    // Tangential speed component.
    const tanSpeed = ship.vx * tangentNX + ship.vy * tangentNY;

    // Energy accrual. Proximity factor is normalized so engaging at the
    // edge of range pays less than mid-range. (Closer = more, but
    // anchor.killRadius makes the deepest part the riskiest.)
    // Hull energyMult is applied at RELEASE, not here — applying both
    // at accrual and release double-counts the modifier.
    const proximity = 1 - (dist / anchor.range);
    const accrualPerSecond = SLINGSHOT_CONFIG.energyAccrualRate
      * Math.max(0, tanSpeed)
      * anchor.massWeight
      * proximity;
    ship.slingshotEnergy += accrualPerSecond * dt;

    // Velocity adjustment this frame:
    //   1. Cancel most of the radial pull (gravity toward anchor).
    //      The Ship.update gravity step still applies the well-pull
    //      force; we add an opposite-direction radial impulse here.
    //   2. Add a tangential force in the orbit direction so the ship
    //      doesn't bleed angular velocity.
    const radialPull = inversePowerForce(
      dist,
      CONFIG.wells?.shipPullStrength ?? 0.6,
      anchor.ref?.mass ?? anchor.massWeight ?? 1,
      CONFIG.wells?.shipPullFalloff ?? 1.5,
      CONFIG.wells?.maxRange ?? anchor.range
    );
    const cancelMag = radialPull * SLINGSHOT_CONFIG.gravityCancelFraction;

    return {
      // Note: signs here ADD energy to the system in the orbit direction
      // and SUBTRACT from the radial-inward direction (i.e. push outward
      // by the cancel amount).
      vx: (-radialNX * cancelMag + tangentNX * SLINGSHOT_CONFIG.tangentialForce) * dt,
      vy: (-radialNY * cancelMag + tangentNY * SLINGSHOT_CONFIG.tangentialForce) * dt,
    };
  }

  /**
   * Release the slingshot. Clears engaged state and applies an exit
   * velocity boost in the ship's current facing direction proportional
   * to banked energy + chain multiplier.
   */
  release(ship, hullModifiers, currentTimeSeconds) {
    if (!ship.slingshotEngaged) return null;

    const baseEnergy = ship.slingshotEnergy || 0;
    const chainMult = Math.pow(SLINGSHOT_CONFIG.chainMultiplier, Math.max(0, this._chainCount - 1));
    const totalEnergy = baseEnergy * chainMult * SLINGSHOT_CONFIG.releaseMultiplier * (hullModifiers.energyMult ?? 1);

    // Boost in ship's facing direction. release() mutates the ship
    // directly so callers cannot forget to apply the payoff.
    const boostVX = Math.cos(ship.facing) * totalEnergy;
    const boostVY = Math.sin(ship.facing) * totalEnergy;

    const releaseInfo = {
      anchor: ship.slingshotAnchor,
      energyBanked: baseEnergy,
      chainCount: this._chainCount,
      totalEnergyAwarded: totalEnergy,
      boostVX, boostVY,
    };

    // Persist anchor ref for chain detection on the next engage.
    this._lastReleaseTime = currentTimeSeconds;
    this._lastReleasedAnchorRef = ship.slingshotAnchor?.ref ?? null;

    ship.vx += boostVX;
    ship.vy += boostVY;
    ship.slingshotEngaged = false;
    ship.slingshotAnchor = null;
    ship.slingshotEnergy = 0;
    ship.slingshotChainCount = 0;
    ship.slingshotEngageRadius = 0;
    ship.slingshotOrbitDir = 0;
    return releaseInfo;
  }

  /** Cancel any active engagement without applying a boost (death, scene reset). */
  cancel(ship) {
    if (ship) {
      ship.slingshotEngaged = false;
      ship.slingshotAnchor = null;
      ship.slingshotEnergy = 0;
      ship.slingshotChainCount = 0;
      ship.slingshotEngageRadius = 0;
      ship.slingshotOrbitDir = 0;
    }
    this._lastReleaseTime = -Infinity;
    this._lastReleasedAnchorRef = null;
    this._chainCount = 0;
  }

  /** Tangential speed component relative to a candidate anchor. */
  _tangentialSpeed(ship, anchor) {
    const [dx, dy] = worldDisplacement(ship.wx, ship.wy, anchor.wx, anchor.wy);
    const dist = Math.hypot(dx, dy) || 1e-4;
    const radialNX = dx / dist;
    const radialNY = dy / dist;
    // Perpendicular = tangent (sign-agnostic for this query).
    const tx = -radialNY;
    const ty = radialNX;
    return Math.abs(ship.vx * tx + ship.vy * ty);
  }

  /** Sign of the orbital direction at engagement time (+1 CCW, -1 CW). */
  _orbitDirection(ship, anchor) {
    const [dx, dy] = worldDisplacement(ship.wx, ship.wy, anchor.wx, anchor.wy);
    const dist = Math.hypot(dx, dy) || 1e-4;
    const radialNX = dx / dist;
    const radialNY = dy / dist;
    const tangentNX = -radialNY;
    const tangentNY = radialNX;
    const projection = ship.vx * tangentNX + ship.vy * tangentNY;
    return projection >= 0 ? 1 : -1;
  }
}
