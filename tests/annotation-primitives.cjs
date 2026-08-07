const path = require('path');
const { pathToFileURL } = require('url');
const nodeAssert = require('assert');
const { TestRunner, assert } = require('./helpers.cjs');

const ROOT = path.resolve(__dirname, '..');

async function importModule(relativePath) {
  return import(pathToFileURL(path.join(ROOT, relativePath)).href);
}

function assertThrows(fn, pattern, label) {
  let caught = null;
  try { fn(); } catch (error) { caught = error; }
  assert(caught, `${label} must throw`);
  assert(pattern.test(String(caught.message || caught)), `${label}: ${caught.message || caught}`);
}

async function run() {
  const runner = new TestRunner('AnnotationPrimitives');
  const primitives = await importModule('src/render-three/annotations/analytic-primitives.js');
  const grammar = await importModule('src/render-three/annotations/category-grammar.js');

  await runner.run('Analytic plans are pixel-local and zoom-invariant', async () => {
    const desktop = primitives.resolveAnnotationWeight({ viewportClass: 'desktop' });
    const deck = primitives.resolveAnnotationWeight({ viewportClass: 'deck' });
    assert(desktop.zoomInvariant && deck.zoomInvariant, 'Annotation weight must ignore world zoom');
    assert(deck.strokePx > desktop.strokePx && deck.minimumPx >= desktop.minimumPx,
      'Deck policy must preserve a stronger readable pixel floor');
    const dashed = primitives.makeDashedRingPlan({ extentPx: 48, dashCount: 8 });
    assert(dashed.localSpace === 'anchor-pixels' && dashed.segments.length === 8,
      'Dashed ring must be a local analytic plan with all requested dashes');
    assert(Object.isFrozen(dashed) && Object.isFrozen(dashed.segments), 'Plans must be immutable');
  });

  await runner.run('Primitive plans cover the complete shared geometry vocabulary', async () => {
    const plans = [
      primitives.makeRingPlan({ extentPx: 40 }),
      primitives.makeArcPlan({ extentPx: 40, startTurn: 0.1, endTurn: 0.9 }),
      primitives.makeSegmentedRingPlan({ extentPx: 40, segmentCount: 5 }),
      primitives.makeTaperedPointerPlan({ lengthPx: 30, baseWidthPx: 8 }),
      primitives.makeLinePlan({ lengthPx: 30 }),
      primitives.makeCornerBracketPlan({ extentPx: 40 }),
      primitives.makeOutlinePlan({ points: [{ u: -1, v: -1 }, { u: 1, v: -1 }, { u: 0, v: 1 }] }),
      primitives.makeProgressSectorPlan({ extentPx: 40, progress: 0.6 }),
      primitives.makeRepeatedNotchPlan({ extentPx: 40, notchCount: 3 }),
    ];
    nodeAssert.deepStrictEqual(plans.map((entry) => entry.kind), [
      'ring', 'arc', 'segmented-ring', 'tapered-pointer', 'line', 'corner-bracket', 'outline', 'progress-sector', 'repeated-notches',
    ], 'Shared library must expose the approved analytic vocabulary');
  });

  await runner.run('Category grammar stays readable without color', async () => {
    const noise = grammar.makeCategoryAnnotationPlan('noise');
    const portal = grammar.makeCategoryAnnotationPlan('portal', { collapseProgress: 0.7, apertureProgress: 0.3 });
    const grapple = grammar.makeCategoryAnnotationPlan('grapple', { attached: true });
    const salvage = grammar.makeCategoryAnnotationPlan('salvage');
    const vessel = grammar.makeCategoryAnnotationPlan('vessel', { hostile: true });
    const inhibitor = grammar.makeCategoryAnnotationPlan('inhibitor');
    assert(noise.pieces[0].kind === 'dashed-ring', 'Noise must use dashed ring geometry');
    assert(portal.pieces[0].kind === 'segmented-ring' && portal.pieces[0].segmentCount === 5,
      'Portal must retain its five-segment route ring');
    assert(portal.pieces.filter((piece) => piece.kind === 'progress-sector').length === 2,
      'Portal must retain both collapse and aperture timing arcs');
    assert(grapple.pieces.some((piece) => piece.kind === 'line'), 'Attached grapple must include a tether plan');
    assert(salvage.pieces.find((piece) => piece.kind === 'repeated-notches').notchCount === 3,
      'Salvage must retain three notch category read');
    assert(vessel.pieces[0].corners.length === 4, 'Vessel must retain four-corner category read');
    assert(inhibitor.pieces[1].inward, 'Inhibitor must retain inward containment geometry');
    [noise, portal, grapple, salvage, vessel, inhibitor].forEach((entry) => {
      assert(entry.colorIndependent, `${entry.category} cannot require color for category reading`);
    });
  });

  await runner.run('Invalid analytic geometry fails at the shared owner', async () => {
    assertThrows(() => primitives.makeDashedRingPlan({ extentPx: 0 }), /extentPx/, 'Zero extent');
    assertThrows(() => primitives.makeSegmentedRingPlan({ extentPx: 12, segmentCount: 1 }), /segmentCount/, 'One segment');
    assertThrows(() => primitives.makeProgressSectorPlan({ extentPx: 12, progress: 1.1 }), /progress/, 'Oversized progress');
    assertThrows(() => primitives.resolveAnnotationWeight({ viewportClass: 'phone' }), /viewportClass/, 'Unknown viewport class');
    assertThrows(() => grammar.makeCategoryAnnotationPlan('unknown'), /category/, 'Unknown category');
  });

  const ok = runner.summary();
  process.exit(ok ? 0 : 1);
}

run().catch((error) => {
  console.error('Annotation primitive test fatal error:', error);
  process.exit(1);
});
