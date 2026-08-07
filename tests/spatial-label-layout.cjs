const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

async function run() {
  const layout = await import(pathToFileURL(path.join(ROOT, 'src/presentation/annotation-label-layout.js')).href);
  const overlaps = layout.annotationRectsOverlap;
  const state = layout.createAnnotationLabelLayoutState();

  const crowded = layout.placeAnnotationLabels([
    { id: 'salvage', placement: 'fixed', order: 1, width: 86, height: 18, subjectBounds: { x: 300, y: 300, w: 34, h: 34 } },
    { id: 'vessel', placement: 'moving', order: 2, width: 86, height: 18, subjectBounds: { x: 340, y: 300, w: 34, h: 34 } },
  ], { width: 1280, height: 800 }, state);
  assert.strictEqual(crowded.placed.length, 2, 'crowded labels should find separate annotation lanes');
  for (const label of crowded.placed) {
    assert(!overlaps(label.bounds, label.subjectBounds, 0), `${label.id} covered its subject`);
  }
  assert(!overlaps(crowded.placed[0].bounds, crowded.placed[1].bounds, 0), 'labels overlapped each other');

  const edge = layout.placeAnnotationLabels([
    { id: 'edge', width: 150, height: 22, candidates: ['northWest', 'southEast'], subjectBounds: { x: 2, y: 2, w: 22, h: 22 } },
  ], { width: 320, height: 200 });
  assert.strictEqual(edge.placed.length, 1, 'edge label should clamp into the viewport');
  assert(edge.placed[0].bounds.x >= edge.viewport.edgeMargin && edge.placed[0].bounds.y >= edge.viewport.edgeMargin,
    'edge label escaped the safe screen gutter');
  assert(!overlaps(edge.placed[0].bounds, edge.placed[0].subjectBounds), 'edge clamp covered the subject');

  const radiusEntry = layout.placeAnnotationLabels([
    { id: 'radius', anchor: { x: 220, y: 140 }, interactionRadius: 28, width: 100, height: 18, minZoom: 0.8 },
  ], { width: 480, height: 300, zoom: 1 });
  assert.strictEqual(radiusEntry.placed.length, 1, 'screen-space interaction radius did not reserve subject coverage');
  assert(!overlaps(radiusEntry.placed[0].bounds, { x: 192, y: 112, w: 56, h: 56 }), 'label covered the interaction radius');
  const zoomCulled = layout.placeAnnotationLabels([
    { id: 'radius', anchor: { x: 220, y: 140 }, interactionRadius: 28, width: 100, height: 18, minZoom: 0.8 },
  ], { width: 480, height: 300, zoom: 0.7 });
  assert.strictEqual(zoomCulled.rejected[0].reason, 'below-zoom-threshold', 'wide-view label did not obey its zoom threshold');

  const fixedFirst = layout.placeAnnotationLabels([
    { id: 'landmark', placement: 'fixed', width: 80, height: 18, candidates: ['north', 'south'], subjectBounds: { x: 500, y: 300, w: 30, h: 30 } },
  ], { width: 1280, height: 800 }, state);
  const fixedSecond = layout.placeAnnotationLabels([
    { id: 'landmark', placement: 'fixed', width: 80, height: 18, candidates: ['north', 'south'], subjectBounds: { x: 530, y: 320, w: 30, h: 30 } },
  ], { width: 1280, height: 800 }, state);
  assert.strictEqual(fixedFirst.placed[0].candidate, fixedSecond.placed[0].candidate,
    'fixed landmark changed its admitted anchor side');

  const movingState = layout.createAnnotationLabelLayoutState();
  const movingFirst = layout.placeAnnotationLabels([
    { id: 'contact', placement: 'moving', width: 80, height: 18, candidates: ['east', 'west'], subjectBounds: { x: 500, y: 300, w: 30, h: 30 } },
  ], { width: 1280, height: 800 }, movingState);
  const movingSecond = layout.placeAnnotationLabels([
    { id: 'contact', placement: 'moving', width: 80, height: 18, candidates: ['east', 'west'], subjectBounds: { x: 506, y: 304, w: 30, h: 30 } },
  ], { width: 1280, height: 800 }, movingState);
  assert.strictEqual(movingFirst.placed[0].candidate, movingSecond.placed[0].candidate,
    'moving contact switched sides without a blocked prior lane');
  const movingBlocked = layout.placeAnnotationLabels([
    { id: 'contact', placement: 'moving', width: 80, height: 18, candidates: ['east', 'west'], subjectBounds: { x: 506, y: 304, w: 30, h: 30 } },
  ], { width: 1280, height: 800, reservedRegions: [{ x: 540, y: 292, w: 100, h: 50 }] }, movingState);
  assert.strictEqual(movingBlocked.placed[0].candidate, 'west', 'moving contact did not move after its previous lane became blocked');

  const deckPolicy = layout.resolveAnnotationLabelViewport({ width: 1280, height: 800, viewportClass: 'deck' });
  const desktopPolicy = layout.resolveAnnotationLabelViewport({ width: 1280, height: 800, viewportClass: 'desktop' });
  assert(deckPolicy.clearance > desktopPolicy.clearance && deckPolicy.edgeMargin > desktopPolicy.edgeMargin,
    'Deck labels require a larger readable gutter');
  const deck = layout.placeAnnotationLabels([
    { id: 'deck-salvage', width: 150, height: 24, subjectBounds: { x: 620, y: 390, w: 42, h: 42 } },
  ], {
    width: 1280,
    height: 800,
    viewportClass: 'deck',
    shipHeatBounds: { x: 560, y: 470, w: 196, h: 30 },
    shipSpeedBounds: { x: 560, y: 430, w: 196, h: 26 },
  });
  assert.strictEqual(deck.placed.length, 1, 'Deck label should avoid the ship instrument stack');
  assert(!overlaps(deck.placed[0].bounds, { x: 560, y: 430, w: 196, h: 26 }), 'Deck label overlapped ship speed');
  assert(!overlaps(deck.placed[0].bounds, { x: 560, y: 470, w: 196, h: 30 }), 'Deck label overlapped Heat');

  layout.resetAnnotationLabelLayoutState(state);
  assert.strictEqual(state.anchors.size, 0, 'layout reset must release previous run anchors');
  console.log('Spatial annotation label layout: ok');
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
