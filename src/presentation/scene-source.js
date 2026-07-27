/**
 * Build the renderer-neutral scene source consumed by presentation-frame.js.
 * Inputs are current client facts; this module neither queries authority nor
 * mutates gameplay owners.
 */
import { MOVEMENT } from '../content/movement.js';

export function createPresentationSceneSource(input = {}) {
  const phase = input.phase;
  const local = input.localPlayer || {};
  const ship = local.ship;
  const world = input.world || {};
  const defaults = input.defaults || {};
  const authoritySlingshot = input.slingshot?.authority || null;
  const localAffordance = input.slingshot?.localAffordance || null;
  const fieldSample = input.semanticFieldSample || null;
  const propulsionActive = phase === 'playing';
  const legacyDeltaVRatio = local.authorityDeltaVRatio ?? local.localDeltaVRatio;
  const heatRatio = local.authorityHeatRatio ?? local.localHeatRatio
    ?? (legacyDeltaVRatio == null ? 0 : 1 - legacyDeltaVRatio);

  return {
    phase,
    isTitleBackdrop: input.isTitleBackdrop,
    ship: ship ? {
      wx: ship.wx,
      wy: ship.wy,
      vx: ship.vx,
      vy: ship.vy,
      facing: ship.facing,
      hullType: local.hullType || 'drifter',
      heatRatio,
      overheated: local.authorityOverheated ?? local.localOverheated
        ?? heatRatio >= MOVEMENT.player.heat.overheatThreshold,
      overheatRemaining: local.authorityOverheatRemaining ?? local.localOverheatRemaining ?? 0,
      noise: local.noise ? {
        audibleRadiusMeters: Math.max(0, Number(local.noise.audibleRadiusMeters) || 0),
        trend: local.noise.trend || 'steady',
        currentSource: local.noise.currentSource || 'IDLE',
        heardListenerCount: Math.max(0, Number(local.noise.heardListenerCount) || 0),
        trackedListenerCount: Math.max(0, Number(local.noise.trackedListenerCount) || 0),
        lockedOnListenerCount: Math.max(0, Number(local.noise.lockedOnListenerCount) || 0),
      } : null,
      // Private compatibility field for older renderer fixtures only.
      deltaVRatio: 1 - heatRatio,
      forceLedger: local.forceLedger || null,
      ruler: local.ruler || null,
      slingshotEngaged: Boolean(ship.slingshotEngaged),
      // Only delivered control may produce propulsion presentation.
      thrusting: propulsionActive && Number(local.deliveredThrust) > 0.01,
      braking: propulsionActive && Number(local.deliveredBrake) > 0.01,
    } : null,
    wells: (world.wells || []).map((well, index) => ({
      id: well.id || well.name || `well-${index}`,
      catalogId: well.catalogId || 'base-well',
      behaviorId: well.behaviorId || 'base-well',
      wx: well.wx,
      wy: well.wy,
      mass: well.mass || 1,
      overdriveTier: Math.max(0, Number(well.overdriveTier) || 0),
      overdriveMultiplier: Math.max(1, Number(well.overdriveMultiplier) || 1),
      killRadius: well.killRadius || defaults.wellKillRadius,
      ringOuter: (well.killRadius || defaults.wellKillRadius) * 2.5,
    })),
    stars: (world.stars || []).filter((star) => star.alive !== false).map((star, index) => ({
      id: star.id || `star-${index}`,
      wx: star.wx,
      wy: star.wy,
      mass: star.mass || 1,
      type: star.type || 'mainSequence',
    })),
    wrecks: (world.wrecks || []).filter((wreck) => wreck.alive !== false).map((wreck, index) => ({
      id: wreck.id || wreck.name || `wreck-${index}`,
      wx: wreck.wx,
      wy: wreck.wy,
      size: wreck.size || 'medium',
      tier: wreck.tier || 1,
      type: wreck.type || 'derelict',
      vx: wreck.vx || 0,
      vy: wreck.vy || 0,
      lootCount: Array.isArray(wreck.loot) ? wreck.loot.length : (wreck.lootCount || 0),
      pickupCooldown: Math.max(0, wreck.pickupCooldown || 0),
      isEcho: wreck.type === 'echo' || wreck.isEcho === true,
      looted: Boolean(wreck.looted),
      valuable: wreck.valuable === true || wreck.type === 'vault',
      valueTier: wreck.valueTier || null,
      visualState: wreck.visualState || null,
    })),
    portals: (world.portals || []).filter((portal) => portal.alive !== false).map((portal, index) => ({
      id: portal.id || `portal-${index}`,
      wx: portal.wx,
      wy: portal.wy,
      type: portal.type || 'standard',
      opacity: portal.opacity ?? 1,
      radius: portal.captureRadius || defaults.portalCaptureRadius,
      blockedByInhibitor: portal.blockedByInhibitor === true,
      finalInhibitor: portal.finalInhibitor === true,
      warning: portal.warning === true,
      critical: portal.critical === true,
    })),
    planetoids: (world.planetoids || []).filter((body) => body.alive !== false).map((body, index) => ({
      id: body.id || `planetoid-${index}`,
      wx: body.wx,
      wy: body.wy,
      vx: body.vx || 0,
      vy: body.vy || 0,
      pathType: body.pathType || 'orbit',
    })),
    waveRings: (world.waveRings || []).map((ring, index) => ({
      id: ring.id || `wave-${index}`,
      sourceWX: ring.sourceWX,
      sourceWY: ring.sourceWY,
      radius: ring.radius,
      amplitude: ring.amplitude,
      initialAmplitude: ring.initialAmplitude || Math.max(1e-4, ring.amplitude || 1),
    })),
    scavengers: (world.scavengers || []).filter((scavenger) => scavenger.alive !== false).map((scavenger, index) => ({
      id: scavenger.id || `scav-${index}`,
      wx: scavenger.wx,
      wy: scavenger.wy,
      vx: scavenger.vx || 0,
      vy: scavenger.vy || 0,
      facing: scavenger.facing || 0,
      archetype: scavenger.archetype || scavenger.personality || 'scavenger',
      state: scavenger.state || 'patrol',
    })),
    remotePlayers: (world.remotePlayers || []).map((player) => ({
      id: player.clientId,
      wx: player.wx,
      wy: player.wy,
      vx: player.vx || 0,
      vy: player.vy || 0,
      status: player.status || 'alive',
      hullType: player.hullType || 'drifter',
    })),
    shipCandidates: (world.shipCandidates || []).map((candidate) => ({
      id: candidate.id,
      wx: candidate.wx,
      wy: candidate.wy,
      vx: candidate.vx || 0,
      vy: candidate.vy || 0,
      facing: candidate.facing || 0,
      variant: candidate.variant || 'sprite-card',
      radius: candidate.radius || 0.040,
    })),
    fauna: (world.fauna || []).map((fauna, index) => ({
      id: fauna.id || `fauna-${index}`,
      wx: fauna.wx,
      wy: fauna.wy,
      size: fauna.size || 2,
      kind: fauna.kind || 'fauna',
    })),
    sentries: (world.sentries || []).map((sentry, index) => ({
      id: sentry.id || `sentry-${index}`,
      wx: sentry.wx,
      wy: sentry.wy,
      state: sentry.state || 'patrol',
    })),
    inhibitors: (world.inhibitors || []).filter((entity) => entity.lifecycle !== 'expired').map((entity, index) => ({
      id: entity.id || `inhibitor-glitch-${index + 1}`,
      kind: entity.kind || 'glitch',
      lifecycle: entity.lifecycle || 'alive',
      wx: entity.position?.wx ?? entity.wx,
      wy: entity.position?.wy ?? entity.wy,
      vx: entity.vx || 0,
      vy: entity.vy || 0,
      radius: entity.radius || 0.1,
      coreRadius: entity.coreRadius || 0.045,
      intensity: entity.intensity || 0,
      age: entity.age ?? entity.ageSeconds ?? 0,
      lifetime: entity.lifetime ?? entity.lifetimeSeconds ?? 0,
      contactRadius: entity.contactRadius || 0,
      target: entity.target ? { ...entity.target } : null,
      lastHeard: entity.lastHeard ? { ...entity.lastHeard } : null,
      inbound: entity.inbound ? { ...entity.inbound } : null,
      awareness: entity.awareness || (entity.kind === 'vessel' ? 'STRATEGIC' : null),
      listensToNoise: entity.kind === 'swarm' && entity.listensToNoise !== false,
      noiseListenerState: entity.noiseListenerState || 'QUIET',
      noiseSearchState: entity.noiseSearchState || 'IDLE',
    })),
    collapseEpoch: world.collapseEpoch || null,
    collapseEpochSchedule: world.collapseEpochSchedule || [],
    slingshot: {
      phase: authoritySlingshot?.phase || ship.slingshotPhase || (ship.slingshotEngaged ? 'arc' : 'idle'),
      affordance: authoritySlingshot?.aim ? {
        wx: authoritySlingshot.aim.anchorWX,
        wy: authoritySlingshot.aim.anchorWY,
        range: authoritySlingshot.aim.anchorRange,
        type: authoritySlingshot.aim.anchorType,
      } : localAffordance ? {
        wx: localAffordance.anchor.wx,
        wy: localAffordance.anchor.wy,
        range: localAffordance.anchor.range,
        type: localAffordance.anchor.type,
      } : null,
      engaged: authoritySlingshot?.engaged ? {
        wx: authoritySlingshot.anchorWX,
        wy: authoritySlingshot.anchorWY,
        range: authoritySlingshot.anchorRange,
        type: authoritySlingshot.anchorType,
        energy: authoritySlingshot.energy || 0,
        chainCount: authoritySlingshot.chainCount || 0,
      } : ship.slingshotEngaged && ship.slingshotAnchor ? {
        wx: ship.slingshotAnchor.wx,
        wy: ship.slingshotAnchor.wy,
        range: ship.slingshotAnchor.range,
        type: ship.slingshotAnchor.type,
        energy: ship.slingshotEnergy || 0,
        chainCount: ship.slingshotChainCount || 0,
      } : null,
      telegraph: authoritySlingshot?.telegraph || ship.slingshotTelegraph || null,
    },
    semanticField: {
      shipSample: fieldSample ? {
        hazard: fieldSample.hazard || 0,
        surf: fieldSample.surf || 0,
        signalShadow: fieldSample.signalShadow || 0,
        current: fieldSample.current || { x: fieldSample.x || 0, y: fieldSample.y || 0 },
      } : null,
    },
  };
}
