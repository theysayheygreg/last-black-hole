import { VisualFamilyLifecycle } from './visual-family.js';
import { selectPlayerAsset } from '../entity-assets.js';

function heading(entity) {
  const facing = entity?.movement?.facing;
  if (Number.isFinite(facing)) return -facing;
  const velocity = entity?.movement?.velocity || {};
  return Math.atan2(-(velocity.y || 0), velocity.x || 0);
}

function unitVector(from, to) {
  const x = (to?.x || 0) - (from?.x || 0);
  const y = (to?.y || 0) - (from?.y || 0);
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
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
        draw.state?.('player', player, 'absent', 0);
      } else if (remaining <= 0) {
        draw.budgetCull?.('player', player, 0);
      } else {
        const core = draw.sprite(this.group, selectPlayerAsset(player), player.world.x, player.world.y,
          0, -player.movement.facing - Math.PI * 0.5, 'player', player);
        if (core) { this.countObject(1); remaining -= 1; }
        // Ports carry propulsion state, not a permanent heading decoration:
        // rear strokes for thrust, forward puffs for braking, nothing while coasting.
        const movement = player.movement || {};
        const speed = Math.hypot(movement.velocity?.x || 0, movement.velocity?.y || 0);
        const mode = speed >= 0.002 && (movement.thrusting || movement.braking)
          ? (movement.braking ? 'braking' : 'thrusting')
          : null;
        if (mode) {
          const facing = heading(player);
          const wake = { x: -Math.cos(facing), y: Math.sin(facing) };
          const lateral = { x: -wake.y, y: wake.x };
          const direction = mode === 'braking' ? { x: -wake.x, y: -wake.y } : wake;
          const length = mode === 'braking' ? 0.018 : 0.034;
          for (const side of [-1, 1]) {
            const start = {
              x: player.world.x + direction.x * 0.017 + lateral.x * side * 0.010,
              y: player.world.y + direction.y * 0.017 + lateral.y * side * 0.010,
            };
            const end = { x: start.x + direction.x * length, y: start.y + direction.y * length };
            if (draw.line(start.x, start.y, end.x, end.y, this.materials.thrusterWake)) this.submittedParts += 1;
          }
        }
      }
    }

    let visibleCandidates = 0;
    let droppedCandidates = 0;
    for (const candidate of candidates) {
      if (remaining <= 0 || visibleCandidates >= 2) {
        draw.budgetCull?.('shipCandidates', candidate, candidate.radius || 0);
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
        draw.state?.('remotePlayers', remote, 'absent', 0);
        continue;
      }
      if (remaining <= 0) {
        draw.budgetCull?.('remotePlayers', remote, 0);
        droppedRemotes += 1;
        continue;
      }
      const core = draw.sprite(this.group, selectPlayerAsset(remote, { remote: true }),
        remote.world.x, remote.world.y, 0, heading(remote) - Math.PI * 0.5, 'remotePlayers', remote);
      if (core) { this.countObject(1); remaining -= 1; }
    }
    this.drop(droppedRemotes);

    const sling = player?.slingshot;
    const telegraph = sling?.telegraph;
    const aimAnchor = telegraph?.aimCue?.anchor || sling?.affordance;
    const slingAnchor = sling?.anchor || sling?.affordance || telegraph?.lock?.anchor;
    if (slingAnchor) {
      // A clipped orbital chord and anchor ticks replace the diagnostic range
      // ellipse. The route remains authored even when labels are hidden.
      const radius = Math.max(0.045, slingAnchor.range || aimAnchor?.range || 0.1);
      const towardPlayer = player ? unitVector(slingAnchor.world, player.world) : { x: 1, y: 0 };
      const tangent = { x: -towardPlayer.y, y: towardPlayer.x };
      const near = { x: slingAnchor.world.x + tangent.x * radius * 0.76, y: slingAnchor.world.y + tangent.y * radius * 0.76 };
      const far = { x: slingAnchor.world.x - tangent.x * radius * 0.76, y: slingAnchor.world.y - tangent.y * radius * 0.76 };
      if (draw.line(near.x, near.y, far.x, far.y, this.materials.tether)) this.submittedParts += 1;
      for (const side of [-1, 1]) {
        const tick = { x: slingAnchor.world.x + tangent.x * radius * side, y: slingAnchor.world.y + tangent.y * radius * side };
        const tip = { x: tick.x + towardPlayer.x * radius * 0.18, y: tick.y + towardPlayer.y * radius * 0.18 };
        if (draw.line(tick.x, tick.y, tip.x, tip.y, this.materials.thrusterWake)) this.submittedParts += 1;
      }
      if ((sling.engaged || telegraph?.lock || telegraph?.ownedArc) && player && draw.line(
        player.world.x, player.world.y, slingAnchor.world.x, slingAnchor.world.y, this.materials.tether
      )) this.submittedParts += 1;
    }
    const ghost = telegraph?.releaseGhost;
    if (ghost && player) {
      const direction = ghost.direction || { x: 1, y: 0 };
      const magnitude = Math.hypot(direction.x, direction.y) || 1;
      const unspoolMs = Math.max(1, (ghost.unspoolSeconds || 0.125) * 1000);
      const elapsedMs = Math.max(0, 1000 - (ghost.remainingMs || 0));
      const ghostDistance = 0.20 * Math.min(1, elapsedMs / unspoolMs);
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
