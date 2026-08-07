const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function main() {
  const root = path.resolve(__dirname, '..');
  const THREE = await import(path.join(root, 'node_modules/three/build/three.module.js'));
  const { AnnotationPresentation } = await import(path.join(root, 'src/render-three/annotations/annotation-presentation.js'));
  const { createWorldProjection, clampViewportRayToRim } = await import(path.join(root, 'src/render-three/world-projection.js'));
  const group = new THREE.Group();
  const annotations = new AnnotationPresentation({ group });
  const projection = createWorldProjection({ x: 1.5, y: 1.5, worldScale: 3, view: 1 }, 1.6);
  const frame = {
    phase: 'playing',
    localPlayer: {
      world: { x: 1.5, y: 1.5 },
      movement: { noise: { audibleRadiusMeters: 1800, trend: 'rising' } },
      slingshot: { engaged: true, anchor: { world: { x: 1.7, y: 1.5 }, range: 0.2 } },
    },
    world: {
      portals: [{ id: 'portal', label: 'EXFIL', world: { x: 1.8, y: 1.5 }, radius: 0.08, final: true, collapseProgress: 0.6, apertureProgress: 0.4, opacity: 1 }],
      wrecks: [{ id: 'wreck', label: 'SALVAGE', world: { x: 1.2, y: 1.5 }, radius: 0.05, looted: false }],
      remotePlayers: [], scavengers: [], inhibitors: [], wells: [], stars: [], planetoids: [],
    },
    annotations: {
      audibleContacts: [{ id: 'heard', world: { x: 2.4, y: 1.5 }, rangeMeters: 1600, magnitude: 0.7, identified: false }],
      reservedRegions: [],
    },
  };
  const stats = annotations.update(frame, { projection, viewportWidth: 1280, viewportHeight: 800, aspect: 1.6 });
  assert(stats.submitted >= 8, `expected shared category pieces, got ${JSON.stringify(stats)}`);
  assert.strictEqual(stats.rimContacts, 1);
  assert(group.children.every((child) => child.renderOrder < 14), 'annotations must render before entity mattes');
  const strokeMeshes = group.children.filter((child) => child.isMesh);
  assert(strokeMeshes.length > 0 && strokeMeshes.every((child) => !child.isLine), 'annotations use filled stroke meshes rather than 1px WebGL lines');
  const deckStroke = strokeMeshes[0].geometry.getAttribute('position');
  const a = { x: deckStroke.getX(0), y: deckStroke.getY(0) };
  const b = { x: deckStroke.getX(1), y: deckStroke.getY(1) };
  const widthPx = Math.hypot((a.x - b.x) * 1280 / (2 * 1.6), (a.y - b.y) * 800 / 2);
  assert(Math.abs(widthPx - 3) < 0.01, `Deck stroke floor must render at 3px, got ${widthPx}`);
  assert(clampViewportRayToRim({ x: 1600, y: 400 }, 1280, 800, 30)?.x === 1250);
  const offscreenOnly = {
    phase: 'playing',
    localPlayer: { world: { x: 1.5, y: 1.5 }, movement: { noise: { audibleRadiusMeters: 0 } } },
    world: { portals: [{ id: 'hidden', world: { x: 2.35, y: 1.5 }, radius: 0.08 }], wrecks: [], remotePlayers: [], scavengers: [], inhibitors: [], wells: [], stars: [], planetoids: [] },
    annotations: { audibleContacts: [], reservedRegions: [] },
  };
  const hiddenStats = annotations.update(offscreenOnly, { projection, viewportWidth: 1280, viewportHeight: 800, aspect: 1.6 });
  assert.strictEqual(hiddenStats.submitted, 0, 'off-screen entities must not leak geometry around the viewport edge');
  annotations.reset();
  assert(group.children.every((child) => child.visible === false));
  annotations.dispose();

  const mainSource = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const portalSource = fs.readFileSync(path.join(root, 'src/portals.js'), 'utf8');
  const playerSource = fs.readFileSync(path.join(root, 'src/render-three/entities/player-visual-family.js'), 'utf8');
  const backendSource = fs.readFileSync(path.join(root, 'src/render/renderer-backend.js'), 'utf8');
  assert(!mainSource.includes('renderNoiseOverlay') && !mainSource.includes('renderSlingshotOverlay')
    && !mainSource.includes('drawEdgeArrow') && !mainSource.includes('PROXIMITY FLAVOR TEXT LABELS'));
  assert(!portalSource.includes('render(ctx, camX') && !playerSource.includes('const sling = player?.slingshot'));
  assert(!backendSource.includes('LegacyRendererBackend') && !backendSource.includes('falling back to legacy'));
  console.log('SpatialAnnotationSystem: ok');
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
