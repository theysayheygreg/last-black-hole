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

/**
 * Keep or cycle a player-owned salvage approach target using authority facts.
 * Geometry stays in the canonical coordinate owner through worldDistance.
 */
export function resolveExplicitSalvageApproachSelection(
  snapshot,
  player,
  currentTargetId = null,
  cycleRequested = false,
) {
  const wrecks = (snapshot?.world?.wrecks || [])
    .filter((wreck) => wreck?.id && wreck.alive !== false && wreck.looted !== true)
    .map((wreck) => ({
      wreck,
      id: String(wreck.id),
      distance: player ? worldDistance(player.wx, player.wy, wreck.wx, wreck.wy) : Infinity,
    }))
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
  const currentIndex = wrecks.findIndex((entry) => entry.id === String(currentTargetId || ''));

  if (!cycleRequested) {
    const retained = currentIndex >= 0 ? wrecks[currentIndex] : null;
    return { id: retained?.id || null, wreck: retained?.wreck || null, reason: retained ? 'retained' : 'invalidated' };
  }
  if (!player || wrecks.length === 0) return { id: null, wreck: null, reason: 'unavailable' };
  if (currentIndex < 0) return { id: wrecks[0].id, wreck: wrecks[0].wreck, reason: 'selected' };
  const next = wrecks[currentIndex + 1] || null;
  return { id: next?.id || null, wreck: next?.wreck || null, reason: next ? 'cycled' : 'cleared' };
}
