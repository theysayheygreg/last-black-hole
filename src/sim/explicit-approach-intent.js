import { worldDistance } from '../coords.js';

export function selectExplicitPortalApproachTarget(snapshot, player, requested = false) {
  if (!requested || !player) return null;
  if (player.portalInteraction?.portalId) return String(player.portalInteraction.portalId);
  const portals = (snapshot?.world?.portals || [])
    .filter((portal) => portal?.id && portal.alive !== false)
    .map((portal) => ({
      id: String(portal.id),
      distance: worldDistance(player.wx, player.wy, portal.wx, portal.wy),
    }))
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
  return portals[0]?.id || null;
}
