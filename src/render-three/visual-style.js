// src/render-three/visual-style.js
//
// Shared visual language for Three-rendered world objects. The first pass keeps
// the old primitive silhouettes, but gives them the same local contrast stack:
// dark backing, bright core, additive rim/halo. Final pixel assets can swap in
// later without changing how objects separate from the ASCII fabric.

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

function makePixelTexture(rows, palette) {
  const height = rows.length;
  const width = Math.max(...rows.map((row) => row.length));
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = rows[y] || '';
    for (let x = 0; x < width; x++) {
      const color = palette[row[x]] || palette['.'];
      const i = (y * width + x) * 4;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = color[3];
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

function makePixelMaterial(texture, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity,
    alphaTest: 0.05,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
}

function rgba(hex, alpha = 255) {
  return [
    (hex >> 16) & 0xff,
    (hex >> 8) & 0xff,
    hex & 0xff,
    alpha,
  ];
}

export function createVisualMaterials(palette = PRESENTATION_PALETTE) {
  const normal = THREE.NormalBlending;
  const add = THREE.AdditiveBlending;
  // Inline pixel masks are fixture candidates, not final art. They let the
  // renderer compare sprite-card and pixel-mesh reads before asset production.
  const shipSpriteTexture = makePixelTexture([
    '....W....',
    '....W....',
    '...WWW...',
    '...WCW...',
    '..WCCCW..',
    '.WWCCCWW.',
    'W.WCWCW.W',
    '..WCCCW..',
    '...C.C...',
    '...B.B...',
    '....B....',
  ], {
    '.': [0, 0, 0, 0],
    'W': rgba(palette.playerWhite),
    'C': rgba(palette.playerCyan),
    'B': rgba(palette.remoteBlue, 220),
  });
  const shipMeshTexture = makePixelTexture([
    '....W....',
    '...WWW...',
    '..WCCW...',
    '.WWCCWW..',
    'W.WCCW.W.',
    '..WCCW...',
    '...CC....',
    '...BB....',
  ], {
    '.': [0, 0, 0, 0],
    'W': rgba(palette.playerWhite),
    'C': rgba(palette.playerCyan),
    'B': rgba(palette.remoteBlue, 225),
  });
  return {
    matteSoft: makeVisualMaterial(palette.matteNearBlack, 0.28, { blending: normal }),
    matteCore: makeVisualMaterial(palette.voidBlack, 0.54, { blending: normal }),
    matteHeavy: makeVisualMaterial(palette.voidBlack, 0.68, { blending: normal }),

    ship: makeVisualMaterial(palette.neutralWhite, 1.0, { blending: normal }),
    shipHalo: makeVisualMaterial(palette.playerCyan, 0.58, { blending: add }),
    shipRim: makeVisualMaterial(palette.playerRim, 0.72, { blending: add }),
    shipSpriteCandidate: makePixelMaterial(shipSpriteTexture, 1.0),
    shipMeshCandidate: makePixelMaterial(shipMeshTexture, 1.0),
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
