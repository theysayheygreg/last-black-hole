// src/render-three/render-plan.js
//
// Declarative v0.3 renderer contract scaffold. Nothing here renders; the
// descriptor names the pass graph, budgets, fixtures, captures, and Deck notes
// future diagnostics can report against.

export const RENDER_QUALITY_TIERS = Object.freeze([
  'minimal',
  'default',
  'rich',
  'capture',
]);

export const RENDER_PLAN_PASS_IDS = Object.freeze([
  'fabricSource',
  'voidDepth',
  'worldAnnotations',
  'entityEchoes',
  'vfxEvents',
  'asciiComposite',
  'hudBridge',
  'debugOverlay',
]);

export const RENDER_PLAN_DESCRIPTOR = Object.freeze({
  id: 'last-singularity-three-render-plan-v0.3',
  version: 1,
  line: 'v0.3',
  defaultQualityTier: 'default',
  deckQualityTier: 'default',
  qualityTiers: RENDER_QUALITY_TIERS,
  budgetTarget: Object.freeze({
    fps: 60,
    frameMs: 16.67,
    deckFrameMs: 16.67,
    renderMs: Object.freeze({
      minimal: 4.0,
      default: 7.5,
      rich: 10.0,
      capture: 14.0,
    }),
  }),
  fixturePolicy: Object.freeze({
    developmentFixtures: Object.freeze(['visualReference', 'shipBakeoff']),
    representativeCaptures: Object.freeze([
      'title',
      'gameplayDrop',
      'gameplayWarmed',
      'collapseResults',
    ]),
    productTruth: 'finalAscii',
    diagnostics: Object.freeze(['rawScene', 'debugOverlay', 'passStats']),
  }),
  capturePolicy: Object.freeze({
    canonicalSurface: 'asciiComposite',
    productCapture: 'finalAscii',
    diagnosticOnly: Object.freeze(['voidDepth', 'entityEchoes', 'debugOverlay']),
    rawSceneRule: 'diagnostic-only',
  }),
  debugView: Object.freeze({
    default: 'finalAscii',
    options: Object.freeze([
      'finalAscii',
      'rawScene',
      'mattes',
      'passStats',
      'labels',
      'fixtures',
    ]),
  }),
  deckCaveats: Object.freeze([
    'Default quality should fit the 60fps frame budget before rich or capture tiers are judged.',
    'Labels-off captures must still separate player, threat, salvage, route anchor, ecology, and anomaly reads.',
    'Dense matte and bloom coverage must stay bounded so the ASCII fabric remains readable on the Deck display.',
  ]),
  passes: Object.freeze([
    Object.freeze({
      id: 'fabricSource',
      name: 'Fabric Source',
      purpose: 'Fluid, ASCII source frame, and authored well-profile inputs.',
      inputs: Object.freeze(['fluidFrame', 'wellProfiles', 'worldScale']),
      outputs: Object.freeze(['fabricFrame', 'wellDeformationMask']),
      qualityTier: 'minimal',
      renderTargetSize: 'fluid-resolution',
      debugView: 'fabricSource',
      budgetTarget: Object.freeze({ defaultMs: 2.4, deckMs: 2.8, captureMs: 3.2 }),
      fixturePolicy: 'required',
      capturePolicy: 'canonical-source',
      deckCaveats: Object.freeze([
        'Keep per-pass cost strict; avoid per-entity full-frame work in this lane.',
      ]),
    }),
    Object.freeze({
      id: 'voidDepth',
      name: 'Void Depth',
      purpose: 'Black void, distant stars, dark parallax, and backdrop depth.',
      inputs: Object.freeze(['cameraState', 'mapBackdropHints', 'time']),
      outputs: Object.freeze(['depthFrame', 'parallaxStats']),
      qualityTier: 'default',
      renderTargetSize: 'viewport',
      debugView: 'rawScene',
      budgetTarget: Object.freeze({ defaultMs: 0.8, deckMs: 0.9, captureMs: 1.4 }),
      fixturePolicy: 'development',
      capturePolicy: 'diagnostic',
      deckCaveats: Object.freeze([
        'Preserve black dominance without hiding route objects or fabric contours.',
      ]),
    }),
    Object.freeze({
      id: 'worldAnnotations',
      name: 'World Annotations',
      purpose: 'Signal-gated analytic category marks and stable labels below entity mattes.',
      inputs: Object.freeze(['presentationFrame', 'audibleContacts', 'cameraState', 'hudReservedRegions']),
      outputs: Object.freeze(['annotationFrame', 'labelLayout', 'rimContactStats']),
      qualityTier: 'minimal',
      renderTargetSize: 'viewport',
      debugView: 'labels',
      budgetTarget: Object.freeze({ defaultMs: 0.7, deckMs: 0.9, captureMs: 1.2 }),
      fixturePolicy: 'development-and-representative',
      capturePolicy: 'canonical-through-ascii',
      deckCaveats: Object.freeze([
        'Category silhouettes and label clearance remain readable without relying on color.',
      ]),
    }),
    Object.freeze({
      id: 'entityEchoes',
      name: 'Entity Echoes',
      purpose: 'Renderable snapshot hints for ships, wrecks, portals, stars, fauna, sentries, and route anchors.',
      inputs: Object.freeze(['renderableHints', 'cameraState', 'materialFamilies']),
      outputs: Object.freeze(['entityFrame', 'objectCounts', 'matteCoverage']),
      qualityTier: 'default',
      renderTargetSize: 'viewport',
      debugView: 'entityEchoes',
      budgetTarget: Object.freeze({ defaultMs: 1.8, deckMs: 2.2, captureMs: 3.0 }),
      fixturePolicy: 'development-and-representative',
      capturePolicy: 'canonical-through-ascii',
      deckCaveats: Object.freeze([
        'Labels-off Deck reads must still distinguish silhouette category and role color.',
      ]),
    }),
    Object.freeze({
      id: 'vfxEvents',
      name: 'VFX Events',
      purpose: 'Renderer-neutral event accents, bounded particles, wake traces, and screen/world beats.',
      inputs: Object.freeze(['rendererNeutralEvents', 'vfxQuality', 'cameraState']),
      outputs: Object.freeze(['vfxFrame', 'particleCounts', 'vfxDrops']),
      qualityTier: 'default',
      renderTargetSize: 'viewport',
      debugView: 'vfxEvents',
      budgetTarget: Object.freeze({ defaultMs: 1.2, deckMs: 1.5, captureMs: 2.4 }),
      fixturePolicy: 'development',
      capturePolicy: 'canonical-through-ascii',
      deckCaveats: Object.freeze([
        'Particle counts must return to idle baseline after submitted events expire.',
      ]),
    }),
    Object.freeze({
      id: 'asciiComposite',
      name: 'ASCII Composite',
      purpose: 'Canonical product surface after post-processing, quantization, scan, and grade.',
      inputs: Object.freeze(['fabricFrame', 'depthFrame', 'entityFrame', 'vfxFrame', 'composerSettings']),
      outputs: Object.freeze(['finalAscii', 'composerStats']),
      qualityTier: 'minimal',
      renderTargetSize: 'viewport',
      debugView: 'finalAscii',
      budgetTarget: Object.freeze({ defaultMs: 1.6, deckMs: 1.8, captureMs: 2.2 }),
      fixturePolicy: 'required',
      capturePolicy: 'canonical-product',
      deckCaveats: Object.freeze([
        'Minimal quality still keeps FluidDisplay, Tonemap, and ASCII baseline legible.',
      ]),
    }),
    Object.freeze({
      id: 'hudBridge',
      name: 'HUD Bridge',
      purpose: 'DOM and canvas UI above the scene/post chain with readable operational text.',
      inputs: Object.freeze(['hudState', 'inputPromptState', 'viewportMetrics']),
      outputs: Object.freeze(['hudComposite', 'readabilityStats']),
      qualityTier: 'minimal',
      renderTargetSize: 'viewport',
      debugView: 'hudBridge',
      budgetTarget: Object.freeze({ defaultMs: 0.7, deckMs: 0.9, captureMs: 1.0 }),
      fixturePolicy: 'representative',
      capturePolicy: 'canonical-product',
      deckCaveats: Object.freeze([
        'Couch-readable values and prompts outrank decorative motion in this lane.',
      ]),
    }),
    Object.freeze({
      id: 'debugOverlay',
      name: 'Debug Overlay',
      purpose: 'Pass stats, labels, fixture markers, material counts, and capture mode.',
      inputs: Object.freeze(['passStats', 'fixtureMarkers', 'diagnosticLabels']),
      outputs: Object.freeze(['debugComposite', 'diagnosticReport']),
      qualityTier: 'capture',
      renderTargetSize: 'viewport',
      debugView: 'debugOverlay',
      budgetTarget: Object.freeze({ defaultMs: 0.0, deckMs: 0.0, captureMs: 1.4 }),
      fixturePolicy: 'development',
      capturePolicy: 'diagnostic-only',
      deckCaveats: Object.freeze([
        'Disabled for product Deck captures unless a diagnostic run explicitly requests it.',
      ]),
    }),
  ]),
});

export function getRenderPlanPass(id) {
  return RENDER_PLAN_DESCRIPTOR.passes.find((pass) => pass.id === id) || null;
}
