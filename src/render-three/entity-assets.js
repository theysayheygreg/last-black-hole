import * as THREE from '../../node_modules/three/build/three.module.js';

export const ENTITY_ASSET_MANIFEST = Object.freeze({
  shipDrifter: { path: 'assets/visual/entities/ship-drifter.png', classification: 'runtime' },
  shipBreacher: { path: 'assets/visual/entities/ship-breacher.png', classification: 'runtime' },
  shipRemote: { path: 'assets/visual/entities/ship-remote.png', classification: 'runtime' },
  scavengerRaider: { path: 'assets/visual/entities/scavenger-raider.png', classification: 'runtime' },
  scavengerBreacher: { path: 'assets/visual/entities/scavenger-breacher.png', classification: 'runtime' },
  scavengerDrifter: { path: 'assets/visual/entities/scavenger-drifter.svg', classification: 'runtime' },
  wreckIntact: { path: 'assets/visual/entities/wreck-intact.png', classification: 'runtime' },
  wreckLooted: { path: 'assets/visual/entities/wreck-looted.png', classification: 'runtime' },
  wreckValuable: { path: 'assets/visual/entities/wreck-valuable.png', classification: 'runtime' },
  wreckCluster: { path: 'assets/visual/entities/wreck-cluster.png', classification: 'runtime' },
  planetoid: { path: 'assets/visual/entities/planetoid.png', classification: 'runtime' },
  comet: { path: 'assets/visual/entities/comet.png', classification: 'runtime' },
  starWarm: { path: 'assets/visual/entities/star-warm.png', classification: 'runtime' },
  portalExtraction: { path: 'assets/visual/entities/portal-extraction.png', classification: 'runtime' },
  portalRift: { path: 'assets/visual/entities/portal-rift.png', classification: 'runtime' },
  faunaOrganic: { path: 'assets/visual/entities/sentry-fauna.png', classification: 'runtime' },
  sentryThreat: { path: 'assets/visual/entities/sentry-threat.png', classification: 'runtime' },
  inhibitorGlitch: { path: 'assets/visual/entities/inhibitor-glitch.svg', classification: 'runtime' },
  inhibitorSwarm: { path: 'assets/visual/entities/inhibitor-swarm.svg', classification: 'runtime' },
  inhibitorVessel: { path: 'assets/visual/entities/inhibitor-vessel.svg', classification: 'runtime' },
  // Wells stay fabric-first. The old inhibitor shard remains a reference sheet.
  wellInstrument: { path: 'assets/visual/entities/well-instrument.png', classification: 'reference' },
  inhibitorShard: { path: 'assets/visual/entities/inhibitor-shard.png', classification: 'reference' },
});

export const ENTITY_ASSET_PATHS = Object.freeze(Object.fromEntries(
  Object.entries(ENTITY_ASSET_MANIFEST)
    .filter(([, asset]) => asset.classification === 'runtime')
    .map(([id, asset]) => [id, asset.path])
));

export function selectPlayerAsset(entity = {}, { remote = false } = {}) {
  if (remote) return 'shipRemote';
  return entity.hull?.type === 'breacher' || entity.variant === 'breacher'
    ? 'shipBreacher'
    : 'shipDrifter';
}

export function selectWreckAsset(entity = {}) {
  if (entity.visualState === 'looted' || entity.looted) return 'wreckLooted';
  if (entity.visualState === 'valuable' || entity.valuable || entity.valueTier === 'valuable' || entity.variant === 'vault') return 'wreckValuable';
  if (entity.visualState === 'cluster' || entity.size === 'scattered' || entity.variant === 'debris') {
    return 'wreckCluster';
  }
  return 'wreckIntact';
}

export function selectPortalAsset(entity = {}) {
  return entity.visualState === 'rift' || entity.variant === 'rift'
    ? 'portalRift'
    : 'portalExtraction';
}

export function selectPlanetoidAsset(entity = {}) {
  return entity.variant === 'transit' || entity.variant === 'comet' ? 'comet' : 'planetoid';
}

export function selectScavengerAsset(entity = {}) {
  if (/breach/i.test(entity.variant || '') || /breach/i.test(entity.archetype || '')) return 'scavengerBreacher';
  if (/drifter/i.test(entity.variant || '') || /drifter/i.test(entity.archetype || '')) return 'scavengerDrifter';
  return 'scavengerRaider';
}

export function selectFaunaAsset() {
  return 'faunaOrganic';
}

export function selectSentryAsset() {
  return 'sentryThreat';
}

export function selectInhibitorAsset(entity = {}) {
  if (entity.kind === 'vessel') return 'inhibitorVessel';
  if (entity.kind === 'swarm') return 'inhibitorSwarm';
  return 'inhibitorGlitch';
}

function configureTexture(texture, id) {
  texture.name = `entity-sprite:${id}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

export class EntityAssetStore {
  constructor({
    loader = new THREE.TextureLoader(),
    paths = ENTITY_ASSET_PATHS,
    materialFactory = (options) => new THREE.MeshBasicMaterial(options),
  } = {}) {
    this.loader = loader;
    this.paths = paths;
    this.materialFactory = materialFactory;
    this.textures = new Map();
    this.materials = new Map();
    this.loadErrors = new Set();
    this.disposed = false;
    this.loadCount = 0;
    this.peakTextureCount = 0;
    this.peakMaterialCount = 0;
    this.disposeCount = 0;
  }

  getTexture(id) {
    if (this.disposed) throw new Error('Entity asset store is disposed');
    if (!this.paths[id]) throw new Error(`Unknown entity asset: ${id}`);
    if (this.textures.has(id)) return this.textures.get(id);
    const texture = configureTexture(this.loader.load(
      this.paths[id], undefined, undefined, () => this.loadErrors.add(id)
    ), id);
    this.textures.set(id, texture);
    this.loadCount += 1;
    this.peakTextureCount = Math.max(this.peakTextureCount, this.textures.size);
    return texture;
  }

  getMaterial(id) {
    if (this.disposed) throw new Error('Entity asset store is disposed');
    if (this.materials.has(id)) return this.materials.get(id);
    const material = this.materialFactory({
      name: `entity-sprite-material:${id}`,
      map: this.getTexture(id),
      transparent: true,
      alphaTest: 0.08,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
    });
    material.userData = {
      ...(material.userData || {}),
      baseOpacity: 1,
      entityAssetStoreOwned: true,
    };
    this.materials.set(id, material);
    this.peakMaterialCount = Math.max(this.peakMaterialCount, this.materials.size);
    return material;
  }

  getStats() {
    return {
      assetCount: Object.keys(this.paths).length,
      textureCount: this.textures.size,
      materialCount: this.materials.size,
      loadCount: this.loadCount,
      loadErrors: this.loadErrors.size,
      peakTextureCount: this.peakTextureCount,
      peakMaterialCount: this.peakMaterialCount,
      disposed: this.disposed,
      disposeCount: this.disposeCount,
    };
  }

  dispose() {
    if (this.disposed) return;
    for (const material of this.materials.values()) material.dispose?.();
    for (const texture of this.textures.values()) texture.dispose?.();
    this.materials.clear();
    this.textures.clear();
    this.disposed = true;
    this.disposeCount += 1;
  }
}
