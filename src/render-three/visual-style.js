// src/render-three/visual-style.js
//
// Shared visual language for Three-rendered world objects. Generated sprite
// cores and procedural affordances use one bounded contrast treatment table.

import * as THREE from '../../node_modules/three/build/three.module.js';
import { PRESENTATION_PALETTE } from '../presentation/presentation-style.js';

export const ENTITY_SUBGROUPS = [
  ['entityBackingGroup', 'entity-backing-layer', 'contact mattes and fabric softening'],
  ['landmarkEntityGroup', 'landmark-entity-layer', 'stars, portals, planetoids, route anchors'],
  ['salvageEntityGroup', 'salvage-entity-layer', 'wrecks, cargo, debris, pickup glints'],
  ['activeEntityGroup', 'active-entity-layer', 'player, rivals, scavengers, fauna, sentries'],
  ['immediateVfxGroup', 'immediate-vfx-layer', 'thrust, sparks, short-lived state effects'],
];

export function makeVisualMaterial(color, opacity, {
  blending = THREE.AdditiveBlending,
  depthTest = false,
  depthWrite = false,
} = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest,
    depthWrite,
    blending,
    side: THREE.DoubleSide,
  });
}

export const ENTITY_SPRITE_TREATMENTS = Object.freeze({
  player: Object.freeze({ halo: 'shipHalo', rim: 'shipRim', haloRadius: 1.45, rimRadius: 1.08, matteRadius: 1.72, matteY: 0.78 }),
  remotePlayers: Object.freeze({ halo: 'remoteShipHalo', rim: 'remoteShipHalo', haloRadius: 1.42, rimRadius: 1.07, matteRadius: 1.65, matteY: 0.78 }),
  wrecks: Object.freeze({ halo: 'wreckHalo', rim: 'wreckRim', haloRadius: 1.35, rimRadius: 1.05, matteRadius: 2.35, matteY: 0.82, matteOpacity: 'heavy' }),
  portals: Object.freeze({ halo: 'portalHalo', rim: 'portal', haloRadius: 1.34, rimRadius: 1.04, matteRadius: 1.24, matteY: 1, matteOpacity: 'heavy' }),
  stars: Object.freeze({ halo: 'starHalo', rim: 'star', haloRadius: 1.42, rimRadius: 1.04, matteRadius: 1.35, matteY: 1 }),
  planetoids: Object.freeze({ halo: 'planetoidHalo', rim: 'planetoid', haloRadius: 1.35, rimRadius: 1.04, matteRadius: 1.45, matteY: 0.82 }),
  scavengers: Object.freeze({ halo: 'scavengerHalo', rim: 'scavengerHalo', haloRadius: 1.38, rimRadius: 1.05, matteRadius: 1.55, matteY: 0.78 }),
  fauna: Object.freeze({ halo: 'faunaHalo', rim: 'fauna', haloRadius: 1.45, rimRadius: 1.04, matteRadius: 1.55, matteY: 0.9 }),
  sentries: Object.freeze({ halo: 'sentryHalo', rim: 'sentry', haloRadius: 1.5, rimRadius: 1.04, matteRadius: 1.6, matteY: 0.9 }),
});

export function createVisualMaterials(palette = PRESENTATION_PALETTE) {
  const normal = THREE.NormalBlending;
  const add = THREE.AdditiveBlending;
  return {
    matteSoft: makeVisualMaterial(palette.matteNearBlack, 0.28, { blending: normal }),
    matteCore: makeVisualMaterial(palette.voidBlack, 0.54, { blending: normal }),
    matteHeavy: makeVisualMaterial(palette.voidBlack, 0.68, { blending: normal }),

    ship: makeVisualMaterial(palette.neutralWhite, 1.0, { blending: normal }),
    shipHalo: makeVisualMaterial(palette.playerCyan, 0.58, { blending: add }),
    shipRim: makeVisualMaterial(palette.playerRim, 0.72, { blending: add }),
    remoteShip: makeVisualMaterial(palette.remoteWhite, 0.96, { blending: normal }),
    remoteShipHalo: makeVisualMaterial(palette.remoteBlue, 0.50, { blending: add }),
    scavenger: makeVisualMaterial(palette.threatRed, 0.98, { blending: normal }),
    scavengerHalo: makeVisualMaterial(palette.threatHalo, 0.56, { blending: add }),

    wellCore: makeVisualMaterial(palette.hazardCore, 0.34, { blending: add }),
    wellRing: makeVisualMaterial(palette.fabricBlue, 0.40, { blending: add }),
    hazardRing: makeVisualMaterial(palette.hazardRing, 0.28, { blending: add }),
    surfRing: makeVisualMaterial(palette.fabricSurf, 0.32, { blending: add }),
    wave: makeVisualMaterial(palette.fabricWave, 0.26, { blending: add }),

    star: makeVisualMaterial(palette.warmStar, 0.90, { blending: add }),
    starHalo: makeVisualMaterial(palette.warmStarHalo, 0.42, { blending: add }),
    wreck: makeVisualMaterial(palette.salvageBone, 1.0, { blending: normal }),
    wreckHalo: makeVisualMaterial(palette.salvageRim, 0.52, { blending: add }),
    wreckRim: makeVisualMaterial(palette.neutralWhite, 0.72, { blending: add }),
    lootedWreck: makeVisualMaterial(palette.salvageMuted, 0.58, { blending: normal }),
    lootedWreckHalo: makeVisualMaterial(palette.salvageMutedRim, 0.24, { blending: add }),
    // Route apertures stay cyan. Magenta belongs to Inhibitor/corruption.
    portal: makeVisualMaterial(palette.routeCyanCore, 0.86, { blending: add }),
    portalHalo: makeVisualMaterial(palette.routeCyan, 0.54, { blending: add }),
    riftPortal: makeVisualMaterial(palette.playerWhite, 0.90, { blending: add }),
    riftPortalHalo: makeVisualMaterial(palette.routeCyanCore, 0.58, { blending: add }),
    planetoid: makeVisualMaterial(palette.routeWhite, 0.86, { blending: normal }),
    planetoidHalo: makeVisualMaterial(palette.routeHalo, 0.36, { blending: add }),
    fauna: makeVisualMaterial(palette.ecologyCore, 0.76, { blending: add }),
    faunaHalo: makeVisualMaterial(palette.ecologyGreen, 0.34, { blending: add }),
    sentry: makeVisualMaterial(palette.sentryCore, 0.88, { blending: add }),
    sentryHalo: makeVisualMaterial(palette.sentryHalo, 0.42, { blending: add }),

    tether: new THREE.LineBasicMaterial({
      color: palette.playerWhite,
      transparent: true,
      opacity: 0.72,
      depthTest: false,
      depthWrite: false,
      blending: add,
    }),
  };
}
