import * as THREE from '../../node_modules/three/build/three.module.js';

export const ENTITY_ASSET_PATHS = Object.freeze({
  shipDrifter: 'assets/visual/entities/ship-drifter.png',
  shipBreacher: 'assets/visual/entities/ship-breacher.png',
  shipRemote: 'assets/visual/entities/ship-remote.png',
  scavengerRaider: 'assets/visual/entities/scavenger-raider.png',
  scavengerBreacher: 'assets/visual/entities/scavenger-breacher.png',
  wreckIntact: 'assets/visual/entities/wreck-intact.png',
  wreckLooted: 'assets/visual/entities/wreck-looted.png',
  wreckCluster: 'assets/visual/entities/wreck-cluster.png',
  planetoid: 'assets/visual/entities/planetoid.png',
  comet: 'assets/visual/entities/comet.png',
  starWarm: 'assets/visual/entities/star-warm.png',
  portalExtraction: 'assets/visual/entities/portal-extraction.png',
  portalRift: 'assets/visual/entities/portal-rift.png',
  sentryFauna: 'assets/visual/entities/sentry-fauna.png',
});

export function selectPlayerAsset(entity = {}, { remote = false } = {}) {
  if (remote) return 'shipRemote';
  return entity.hull?.type === 'breacher' || entity.variant === 'breacher'
    ? 'shipBreacher'
    : 'shipDrifter';
}

export function selectWreckAsset(entity = {}) {
  if (entity.visualState === 'looted' || entity.looted) return 'wreckLooted';
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
  return /breach/i.test(entity.variant || '') ? 'scavengerBreacher' : 'scavengerRaider';
}

function configureTexture(texture, id) {
  texture.name = `entity-sprite:${id}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
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
    material.userData = { ...(material.userData || {}), entityAssetStoreOwned: true };
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
