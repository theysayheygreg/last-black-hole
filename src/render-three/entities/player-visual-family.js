import { VisualFamilyLifecycle } from './visual-family.js';
import { selectPlayerAsset } from '../entity-assets.js';

function heading(entity) {
  const facing = entity?.movement?.facing;
  if (Number.isFinite(facing)) return -facing;
  const velocity = entity?.movement?.velocity || {};
  return Math.atan2(-(velocity.y || 0), velocity.x || 0);
}

export class PlayerVisualFamily extends VisualFamilyLifecycle {
  constructor({ group, geometries, materials }) {
    super('player');
    this.group = group;
    this.geometries = geometries;
    this.materials = materials;
  }

  update(frame, draw) {
    this.beginUpdate();
    const remotePlayers = frame.world?.remotePlayers || [];
    const candidates = frame.world?.shipCandidates || [];
    const budget = Math.max(0, frame.style?.entityBudgets?.players ?? 32);
    this.objectBudget = budget;
    let remaining = budget;

    // When enabled, the local ship claims the first slot; multiplayer density
    // may drop remote echoes, never the pilot.
    const player = frame.localPlayer;
    if (player) {
      if (player.status === 'dead') {
        draw.state?.('player', player, 'absent', 0.044);
      } else if (remaining <= 0) {
        draw.budgetCull?.('player', player, 0.044);
      } else {
        const core = draw.sprite(this.group, selectPlayerAsset(player), player.world.x, player.world.y,
          0.044, -player.movement.facing - Math.PI * 0.5, 'player', player);
        if (core) { this.countObject(1); remaining -= 1; }
      }
    }

    let visibleCandidates = 0;
    let droppedCandidates = 0;
    for (const candidate of candidates) {
      if (remaining <= 0 || visibleCandidates >= 2) {
        draw.budgetCull?.('shipCandidates', candidate, candidate.radius || 0.040);
        droppedCandidates += 1;
        continue;
      }
      if (draw.shipCandidate(candidate)) {
        this.countObject(4);
        visibleCandidates += 1;
        remaining -= 1;
      }
    }
    this.drop(droppedCandidates);

    let droppedRemotes = 0;
    for (const remote of remotePlayers) {
      if (remote.status === 'dead') {
        draw.state?.('remotePlayers', remote, 'absent', 0.040);
        continue;
      }
      if (remaining <= 0) {
        draw.budgetCull?.('remotePlayers', remote, 0.040);
        droppedRemotes += 1;
        continue;
      }
      const core = draw.sprite(this.group, selectPlayerAsset(remote, { remote: true }),
        remote.world.x, remote.world.y, 0.040, heading(remote) - Math.PI * 0.5, 'remotePlayers', remote);
      if (core) { this.countObject(1); remaining -= 1; }
    }
    this.drop(droppedRemotes);

    const sling = player?.slingshot;
    const telegraph = sling?.telegraph;
    const aimAnchor = telegraph?.aimCue?.anchor || sling?.affordance;
    const slingAnchor = sling?.anchor || sling?.affordance || telegraph?.lock?.anchor;
    if (aimAnchor) {
      draw.semantic(this.geometries.ring, this.materials.surfRing,
        aimAnchor.world.x, aimAnchor.world.y, aimAnchor.range || 0.1, 0, 0.13);
      this.submittedParts += 1;
    }
    if (slingAnchor) {
      if (!aimAnchor || slingAnchor.world.x !== aimAnchor.world.x || slingAnchor.world.y !== aimAnchor.world.y) {
        draw.semantic(this.geometries.ring, this.materials.surfRing,
          slingAnchor.world.x, slingAnchor.world.y, slingAnchor.range || 0.1, 0, 0.13);
        this.submittedParts += 1;
      }
      if ((sling.engaged || telegraph?.lock || telegraph?.ownedArc) && player && draw.line(
        player.world.x, player.world.y, slingAnchor.world.x, slingAnchor.world.y, this.materials.tether
      )) this.submittedParts += 1;
    }
    const ghost = telegraph?.releaseGhost;
    if (ghost && player) {
      const direction = ghost.direction || { x: 1, y: 0 };
      const magnitude = Math.hypot(direction.x, direction.y) || 1;
      const ghostDistance = 0.16;
      if (draw.line(
        player.world.x,
        player.world.y,
        player.world.x + (direction.x / magnitude) * ghostDistance,
        player.world.y + (direction.y / magnitude) * ghostDistance,
        this.materials.tether,
      )) this.submittedParts += 1;
    }
    return this.getStats();
  }
}
