// src/render-three/visual-style.js
//
// Shared visual language for Three-rendered world objects. Generated sprites
// own their silhouettes; this table only describes deliberate contact mattes.

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
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest,
    depthWrite,
    blending,
    side: THREE.DoubleSide,
  });
  material.userData = { ...(material.userData || {}), baseOpacity: opacity };
  return material;
}

export const ENTITY_CONTACT_MATTE_TREATMENTS = Object.freeze({
  // The pilot gets a tight local cutout, not a gray dinner plate. Its bright
  // sprite/rim and thrust language do the work above the fabric.
  player: Object.freeze({ matteRadius: 1.32, matteY: 0.72 }),
  remotePlayers: Object.freeze({ matteRadius: 1.65, matteY: 0.78 }),
  wrecks: Object.freeze({ matteRadius: 1.48, matteY: 0.76 }),
  portals: Object.freeze({ matteRadius: 1.24, matteY: 1 }),
  stars: Object.freeze({ matteRadius: 1.35, matteY: 1 }),
  planetoids: Object.freeze({ matteRadius: 1.45, matteY: 0.82 }),
  scavengers: Object.freeze({ matteRadius: 1.55, matteY: 0.78 }),
  fauna: Object.freeze({ matteRadius: 1.55, matteY: 0.9 }),
  sentries: Object.freeze({ matteRadius: 1.6, matteY: 0.9 }),
});

export function createVisualMaterials(palette = PRESENTATION_PALETTE) {
  const normal = THREE.NormalBlending;
  const add = THREE.AdditiveBlending;
  return {
    matteContact: makeVisualMaterial(palette.voidBlack, 0.17, { blending: normal }),

    ship: makeVisualMaterial(palette.neutralWhite, 1.0, { blending: normal }),
    remoteShip: makeVisualMaterial(palette.remoteWhite, 0.96, { blending: normal }),
    scavenger: makeVisualMaterial(palette.threatRed, 0.98, { blending: normal }),

    wellCore: makeVisualMaterial(palette.hazardCore, 0.34, { blending: add }),
    wellRing: makeVisualMaterial(palette.fabricBlue, 0.40, { blending: add }),
    hazardRing: makeVisualMaterial(palette.hazardRing, 0.28, { blending: add }),
    surfRing: makeVisualMaterial(palette.fabricSurf, 0.32, { blending: add }),
    wave: makeVisualMaterial(palette.fabricWave, 0.26, { blending: add }),

    star: makeVisualMaterial(palette.warmStar, 0.90, { blending: add }),
    wreck: makeVisualMaterial(palette.salvageBone, 1.0, { blending: normal }),
    lootedWreck: makeVisualMaterial(palette.salvageMuted, 0.58, { blending: normal }),
    // Route state accents stay family-owned. Magenta belongs to Inhibitor/corruption.
    portal: makeVisualMaterial(palette.routeCyanCore, 0.86, { blending: add }),
    riftPortal: makeVisualMaterial(palette.playerWhite, 0.90, { blending: add }),
    portalFinalState: makeVisualMaterial(palette.routeWhite, 0.40, { blending: add }),
    planetoid: makeVisualMaterial(palette.routeWhite, 0.86, { blending: normal }),
    fauna: makeVisualMaterial(palette.ecologyCore, 0.76, { blending: add }),
    sentry: makeVisualMaterial(palette.sentryCore, 0.88, { blending: add }),
    inhibitorCore: makeVisualMaterial(palette.inhibitorMagenta, 0.86, { blending: add }),
    inhibitorRing: makeVisualMaterial(palette.corruptMagenta, 0.42, { blending: add }),

    tether: new THREE.LineBasicMaterial({
      color: palette.playerWhite,
      transparent: true,
      opacity: 0.72,
      depthTest: false,
      depthWrite: false,
      blending: add,
    }),
    thrusterWake: new THREE.LineBasicMaterial({
      color: palette.playerCyan,
      transparent: true,
      opacity: 0.88,
      depthTest: false,
      depthWrite: false,
      blending: add,
    }),
  };
}
