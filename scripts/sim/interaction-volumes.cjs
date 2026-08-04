"use strict";

// Contact volumes are gameplay geometry, not sprite scale. Keeping these
// values here lets the authority, Ballpark, and focused tests agree on what
// "close enough" means without making presentation pixels into collision.
const INTERACTION_VOLUME_CONFIG = Object.freeze({
  playerBodyRadius: 0.035,
  nearMissGraceRadius: 0.012,
});

function nonNegativeRadius(value, fallback = 0) {
  const radius = Number(value);
  return Number.isFinite(radius) && radius >= 0 ? radius : fallback;
}

function playerBodyRadius(player) {
  return nonNegativeRadius(
    player?.radius ?? player?.collisionRadius,
    INTERACTION_VOLUME_CONFIG.playerBodyRadius,
  );
}

function interactionTargetRadius({
  semanticRadius = 0,
  graceRadius = INTERACTION_VOLUME_CONFIG.nearMissGraceRadius,
} = {}) {
  return nonNegativeRadius(semanticRadius)
    + nonNegativeRadius(graceRadius);
}

function effectiveInteractionRadius(player, options = {}) {
  return playerBodyRadius(player) + interactionTargetRadius(options);
}

function isWithinInteractionRadius(distance, player, options = {}) {
  return Number(distance) <= effectiveInteractionRadius(player, options);
}

module.exports = {
  INTERACTION_VOLUME_CONFIG,
  effectiveInteractionRadius,
  interactionTargetRadius,
  isWithinInteractionRadius,
  playerBodyRadius,
};
