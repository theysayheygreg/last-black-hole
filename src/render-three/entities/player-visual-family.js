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
          const affordance = movement.affordance || {};
          const plumeCant = mode === 'thrusting' ? Number(affordance.plumeCantRadians) || 0 : 0;
          const rawPlumeScale = Number(affordance.plumeScale);
          const plumeScale = mode === 'thrusting'
            ? (Number.isFinite(rawPlumeScale) ? Math.max(0.12, Math.min(1, rawPlumeScale)) : 1)
            : 1;
          // Movement headings are screen/world Y-down; Three presentation is
          // Y-up, so the delivered cant crosses the same canonical sign seam
          // as the facing angle above.
          const wakeHeading = facing - plumeCant;
          const wake = { x: -Math.cos(wakeHeading), y: Math.sin(wakeHeading) };
          const lateral = { x: -wake.y, y: wake.x };
          const direction = mode === 'braking' ? { x: -wake.x, y: -wake.y } : wake;
          const length = mode === 'braking' ? 0.018 : 0.034 * plumeScale;
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

    return this.getStats();
  }
}
