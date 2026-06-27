// src/render-three/visual-style.js
//
// Shared visual language for Three-rendered world objects. The first pass keeps
// the old primitive silhouettes, but gives them the same local contrast stack:
// dark backing, bright core, additive rim/halo. Final pixel assets can swap in
// later without changing how objects separate from the ASCII fabric.

import * as THREE from '../../node_modules/three/build/three.module.js';

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

export function createVisualMaterials() {
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
    'W': [235, 252, 255, 255],
    'C': [89, 211, 255, 255],
    'B': [48, 152, 255, 220],
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
    'W': [240, 252, 255, 255],
    'C': [98, 225, 255, 255],
    'B': [64, 126, 255, 225],
  });
  return {
    matteSoft: makeVisualMaterial(0x000006, 0.28, { blending: normal }),
    matteCore: makeVisualMaterial(0x000000, 0.54, { blending: normal }),
    matteHeavy: makeVisualMaterial(0x000000, 0.68, { blending: normal }),

    ship: makeVisualMaterial(0xffffff, 1.0, { blending: normal }),
    shipHalo: makeVisualMaterial(0x74d7ff, 0.58, { blending: add }),
    shipRim: makeVisualMaterial(0xd9fbff, 0.72, { blending: add }),
    shipSpriteCandidate: makePixelMaterial(shipSpriteTexture, 1.0),
    shipMeshCandidate: makePixelMaterial(shipMeshTexture, 1.0),
    remoteShip: makeVisualMaterial(0x98d8ff, 0.96, { blending: normal }),
    remoteShipHalo: makeVisualMaterial(0x3fb8ff, 0.50, { blending: add }),
    scavenger: makeVisualMaterial(0xff3b35, 0.98, { blending: normal }),
    scavengerHalo: makeVisualMaterial(0xff1f39, 0.56, { blending: add }),

    wellCore: makeVisualMaterial(0xff210f, 0.34, { blending: add }),
    wellRing: makeVisualMaterial(0x74b8ff, 0.40, { blending: add }),
    hazardRing: makeVisualMaterial(0xff3b22, 0.28, { blending: add }),
    surfRing: makeVisualMaterial(0x9cfbff, 0.32, { blending: add }),
    wave: makeVisualMaterial(0xb8ffff, 0.26, { blending: add }),

    star: makeVisualMaterial(0xffe08a, 0.90, { blending: add }),
    starHalo: makeVisualMaterial(0xff9e38, 0.42, { blending: add }),
    wreck: makeVisualMaterial(0xf8fbff, 1.0, { blending: normal }),
    wreckHalo: makeVisualMaterial(0xdcecff, 0.52, { blending: add }),
    wreckRim: makeVisualMaterial(0xffffff, 0.72, { blending: add }),
    lootedWreck: makeVisualMaterial(0x7f8994, 0.58, { blending: normal }),
    lootedWreckHalo: makeVisualMaterial(0x8b96a4, 0.24, { blending: add }),
    portal: makeVisualMaterial(0xff6de2, 0.86, { blending: add }),
    portalHalo: makeVisualMaterial(0xff36c8, 0.54, { blending: add }),
    riftPortal: makeVisualMaterial(0x9dfcff, 0.90, { blending: add }),
    riftPortalHalo: makeVisualMaterial(0x4beeff, 0.58, { blending: add }),
    planetoid: makeVisualMaterial(0xd7f2ff, 0.86, { blending: normal }),
    planetoidHalo: makeVisualMaterial(0x8ee2ff, 0.36, { blending: add }),
    fauna: makeVisualMaterial(0x7dffd8, 0.76, { blending: add }),
    faunaHalo: makeVisualMaterial(0x36ffc3, 0.34, { blending: add }),
    sentry: makeVisualMaterial(0x35ff98, 0.88, { blending: add }),
    sentryHalo: makeVisualMaterial(0x00ff88, 0.42, { blending: add }),

    tether: new THREE.LineBasicMaterial({
      color: 0xbfeaff,
      transparent: true,
      opacity: 0.72,
      depthTest: false,
      depthWrite: false,
      blending: add,
    }),
  };
}
