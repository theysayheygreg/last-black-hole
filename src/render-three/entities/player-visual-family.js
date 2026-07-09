import { VisualFamilyLifecycle } from './visual-family.js';

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
    const budget = Math.max(1, frame.style?.entityBudgets?.players || 32);
    this.objectBudget = budget;
    let remaining = budget;

    // The local ship is the strongest scene read and always claims the first
    // slot; multiplayer density may drop remote echoes, never the pilot.
    const player = frame.localPlayer;
    if (player && player.status !== 'dead') {
      const core = draw.readable(this.group, this.geometries.triangle, this.materials.ship,
        player.world.x, player.world.y, 0.034, -player.movement.facing, 0.16,
        { haloMaterial: this.materials.shipHalo, rimMaterial: this.materials.shipRim, haloRadius: 1.70, rimRadius: 1.18, matteRadius: 2.1 },
        'screen');
      if (core) { this.countObject(4); remaining -= 1; }
    }

    const candidateCount = Math.min(candidates.length, 2, remaining);
    for (let index = 0; index < candidateCount; index++) {
      if (draw.shipCandidate(candidates[index])) { this.countObject(4); remaining -= 1; }
    }
    this.drop(candidates.length - candidateCount);

    let remoteIndex = 0;
    for (; remoteIndex < remotePlayers.length && remaining > 0; remoteIndex++) {
      const remote = remotePlayers[remoteIndex];
      if (remote.status === 'dead') continue;
      const core = draw.readable(this.group, this.geometries.triangle, this.materials.remoteShip,
        remote.world.x, remote.world.y, 0.030, heading(remote), 0.13,
        { haloMaterial: this.materials.remoteShipHalo, rimMaterial: this.materials.remoteShipHalo, matteRadius: 2.0 },
        'screen');
      if (core) { this.countObject(4); remaining -= 1; }
    }
    this.drop(remotePlayers.length - remoteIndex);

    const sling = player?.slingshot;
    const slingAnchor = sling?.anchor || sling?.affordance;
    if (slingAnchor) {
      draw.semantic(this.geometries.ring, this.materials.surfRing,
        slingAnchor.world.x, slingAnchor.world.y, slingAnchor.range || 0.1, 0, 0.13);
      this.submittedParts += 1;
      if (sling.engaged && player && draw.line(
        player.world.x, player.world.y, slingAnchor.world.x, slingAnchor.world.y, this.materials.tether
      )) this.submittedParts += 1;
    }
    return this.getStats();
  }
}
