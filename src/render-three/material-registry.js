// src/render-three/material-registry.js
//
// Named material families for the v0.3 renderer contract. These entries are
// metadata only; concrete Three materials still live where rendering happens.

export const MATERIAL_QUALITY_TIERS = Object.freeze([
  'minimal',
  'default',
  'rich',
  'capture',
]);

export const REQUIRED_MATERIAL_FAMILY_IDS = Object.freeze([
  'asciiFabric',
  'entityEcho',
  'shipContactMatte',
  'thrusterWake',
  'portalAperture',
  'inhibitorShard',
  'titleFault',
  'scanNoise',
]);

export const MATERIAL_FAMILIES = Object.freeze([
  Object.freeze({
    id: 'asciiFabric',
    name: 'ASCII Fabric',
    category: 'fabric',
    defaultQualityTier: 'default',
    minimumQualityTier: 'minimal',
    captureQualityTier: 'capture',
    defaults: Object.freeze({
      paletteRole: 'fabricBlue',
      blendMode: 'postComposite',
      contrastRole: 'canonicalSurface',
    }),
    budgetClass: 'strict',
    fixturePolicy: 'required',
  }),
  Object.freeze({
    id: 'entityEcho',
    name: 'Entity Echo',
    category: 'entity',
    defaultQualityTier: 'default',
    minimumQualityTier: 'minimal',
    captureQualityTier: 'capture',
    defaults: Object.freeze({
      paletteRole: 'roleColor',
      blendMode: 'normalWithRim',
      contrastRole: 'categorySilhouette',
    }),
    budgetClass: 'medium',
    fixturePolicy: 'development-and-representative',
  }),
  Object.freeze({
    id: 'shipContactMatte',
    name: 'Ship Contact Matte',
    category: 'matte',
    defaultQualityTier: 'default',
    minimumQualityTier: 'minimal',
    captureQualityTier: 'capture',
    defaults: Object.freeze({
      paletteRole: 'voidBlack',
      blendMode: 'normalMatte',
      contrastRole: 'localBacking',
    }),
    budgetClass: 'bounded',
    fixturePolicy: 'shipBakeoff',
  }),
  Object.freeze({
    id: 'thrusterWake',
    name: 'Thruster Wake',
    category: 'vfx',
    defaultQualityTier: 'default',
    minimumQualityTier: 'minimal',
    captureQualityTier: 'capture',
    defaults: Object.freeze({
      paletteRole: 'playerCyan',
      blendMode: 'additiveTrail',
      contrastRole: 'movementAccent',
    }),
    budgetClass: 'bounded',
    fixturePolicy: 'representative',
  }),
  Object.freeze({
    id: 'portalAperture',
    name: 'Portal Aperture',
    category: 'route',
    defaultQualityTier: 'default',
    minimumQualityTier: 'minimal',
    captureQualityTier: 'capture',
    defaults: Object.freeze({
      paletteRole: 'routeCyan',
      blendMode: 'additiveAperture',
      contrastRole: 'routeExit',
    }),
    budgetClass: 'medium',
    fixturePolicy: 'development-and-representative',
  }),
  Object.freeze({
    id: 'inhibitorShard',
    name: 'Inhibitor Shard',
    category: 'threat',
    defaultQualityTier: 'default',
    minimumQualityTier: 'default',
    captureQualityTier: 'capture',
    defaults: Object.freeze({
      paletteRole: 'inhibitorMagenta',
      blendMode: 'additiveShard',
      contrastRole: 'dreadAccent',
    }),
    budgetClass: 'bounded',
    fixturePolicy: 'development',
  }),
  Object.freeze({
    id: 'titleFault',
    name: 'Title Fault',
    category: 'screenVfx',
    defaultQualityTier: 'default',
    minimumQualityTier: 'minimal',
    captureQualityTier: 'capture',
    defaults: Object.freeze({
      paletteRole: 'corruptMagenta',
      blendMode: 'screenAccent',
      contrastRole: 'titleIdentity',
    }),
    budgetClass: 'bounded',
    fixturePolicy: 'titleVfx',
  }),
  Object.freeze({
    id: 'scanNoise',
    name: 'Scan Noise',
    category: 'post',
    defaultQualityTier: 'default',
    minimumQualityTier: 'minimal',
    captureQualityTier: 'capture',
    defaults: Object.freeze({
      paletteRole: 'phosphorBlue',
      blendMode: 'postComposite',
      contrastRole: 'textureOnly',
    }),
    budgetClass: 'strict',
    fixturePolicy: 'required',
  }),
]);

export const MATERIAL_FAMILY_BY_ID = Object.freeze(
  Object.fromEntries(MATERIAL_FAMILIES.map((family) => [family.id, family]))
);

export function getMaterialFamily(id) {
  return MATERIAL_FAMILY_BY_ID[id] || null;
}

export function hasMaterialFamily(id) {
  return Boolean(getMaterialFamily(id));
}
