function resolveAuthorityApproachTarget({
  player,
  targetId,
  wrecks = [],
  portals = [],
  worldScale,
  worldDistance,
  pickupRadiusForPlayer,
  portalCaptureRadius,
  isPortalAvailable,
} = {}) {
  const id = String(targetId || '').trim();
  if (!id) return null;
  const distanceTo = (target) => worldDistance(
    player.wx,
    player.wy,
    target.wx,
    target.wy,
    worldScale,
  );
  const wreck = wrecks.find((entry) => entry.id === id
    && entry.alive !== false && !entry.looted);
  if (wreck) {
    return {
      explicit: true,
      id: wreck.id,
      kind: 'salvage',
      distance: distanceTo(wreck),
      radius: pickupRadiusForPlayer(player),
    };
  }
  const portal = portals.find((entry) => entry.id === id && isPortalAvailable(entry));
  if (portal) {
    return {
      explicit: true,
      id: portal.id,
      kind: 'portal',
      distance: distanceTo(portal),
      radius: portalCaptureRadius(portal),
    };
  }
  return null;
}

module.exports = { resolveAuthorityApproachTarget };
