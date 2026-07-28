// Owns the Three world scene as one bounded presentation component.

import * as THREE from '../../node_modules/three/build/three.module.js';
import { CAMERA_VIEW } from '../coords.js';
import { getPresentationPalette, resolvePresentationQuality } from '../presentation/presentation-style.js';
import { ENTITY_CONTACT_MATTE_TREATMENTS, ENTITY_SUBGROUPS, createVisualMaterials } from './visual-style.js';
import { EntityAssetStore, selectInhibitorAsset, selectPlayerAsset } from './entity-assets.js';
import { PlayerVisualFamily } from './entities/player-visual-family.js';
import { PortalVisualFamily } from './entities/portal-visual-family.js';
import { WreckVisualFamily } from './entities/wreck-visual-family.js';
import { WorldSpriteVisualFamily } from './entities/world-sprite-visual-family.js';
import { TemporalVisibilityContract } from './entities/temporal-visibility.js';
import { VfxManager } from './vfx/vfx-manager.js';
import { createWorldProjection, normalizedWorldPhase, wrappedAxisDelta } from './world-projection.js';
import { resolveEntityPresentationScale, SPRITE_CARD_SCALE } from './entity-presentation-scale.js';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

const NOOP_ON_BEFORE_RENDER = () => {};
const TEMPORAL_SPRITE_FAMILIES = Object.freeze([
  'player', 'shipCandidates', 'remotePlayers', 'wrecks', 'portals',
  'stars', 'planetoids', 'scavengers', 'fauna', 'sentries', 'inhibitors',
]);

function collectTemporalSpriteExpectations(frame = {}) {
  const expected = [];
  const add = (family, entity) => {
    if (entity?.id) expected.push({ id: entity.id, family, role: family });
  };
  add('player', frame.localPlayer);
  for (const family of TEMPORAL_SPRITE_FAMILIES) {
    if (family === 'player') continue;
    for (const entity of frame.world?.[family] || []) add(family, entity);
  }
  return expected;
}

function seededUnit(index) {
  const x = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function renderQualityOpacityScale(renderQuality) {
  if (renderQuality === 'minimal') return 0;
  if (renderQuality === 'default') return 0.7;
  return 1;
}

export class WorldScenePresentation {
  constructor({ renderQuality = 'rich' } = {}) {
    this.renderQuality = renderQuality;
    this.settings = resolvePresentationQuality(renderQuality);
    this.worldCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    this.worldCamera.name = 'top-down-orthographic-camera';
    this.worldCamera.position.set(0, 0, 4);
    this.worldCamera.lookAt(0, 0, 0);
    this.worldCameraAspect = 1;
    this.viewportWidth = 1280;
    this.viewportHeight = 720;
    this._setWorldCameraAspect(1, 1);
    this.worldScene = new THREE.Scene();
    this.worldScene.name = 'lbh-top-down-3d-scene';
    this.motion = new THREE.Vector2(0, 0);
    this.targetMotion = new THREE.Vector2(0, 0);
    this.prevCamera = null;
    this.lastSceneState = {
      cameraX: 0,
      cameraY: 0,
      worldScale: 3,
      gridWindow: 3,
      cameraView: CAMERA_VIEW,
      motionX: 0,
      motionY: 0,
      parallaxStrength: this.settings.parallaxStrength,
    };

    this.layerRoot = new THREE.Group();
    this.layerRoot.name = 'top-down-depth-root';
    this.worldScene.add(this.layerRoot);
    this.backgroundGroup = new THREE.Group();
    this.backgroundGroup.name = 'background-parallax-field';
    this.backgroundGroup.position.z = -0.75;
    this.fabricGroup = new THREE.Group();
    this.fabricGroup.name = 'fabric-source-layer';
    this.fabricGroup.position.z = 0;
    this.semanticGroup = new THREE.Group();
    this.semanticGroup.name = 'semantic-flow-field-layer';
    this.semanticGroup.position.z = 0.16;
    this.entityGroup = new THREE.Group();
    this.entityGroup.name = 'world-entity-layer';
    this.entityGroup.position.z = 0.24;
    for (const [propertyName, groupName] of ENTITY_SUBGROUPS) {
      this[propertyName] = new THREE.Group();
      this[propertyName].name = groupName;
      this.entityGroup.add(this[propertyName]);
    }
    this.foregroundGroup = new THREE.Group();
    this.foregroundGroup.name = 'foreground-screen-space-layer';
    this.foregroundGroup.position.z = 0.35;
    this.screenVfxGroup = new THREE.Group();
    this.screenVfxGroup.name = 'screen-vfx-layer';
    this.screenVfxGroup.position.z = 0.42;
    this.layerRoot.add(this.backgroundGroup, this.fabricGroup, this.semanticGroup, this.entityGroup, this.foregroundGroup, this.screenVfxGroup);
    this._buildWorldEntityResources();
    this.entityMeshPool = [];
    this.semanticMeshPool = [];
    this.linePool = [];
    this.entityMeshCursor = 0;
    this.semanticMeshCursor = 0;
    this.lineCursor = 0;
    this.currentProjection = createWorldProjection({
      x: 0,
      y: 0,
      worldScale: this.lastSceneState.worldScale,
      view: this.lastSceneState.cameraView,
    }, this.worldCameraAspect);

    this.visualFamilies = {
      player: new PlayerVisualFamily({
        group: this.activeEntityGroup,
        geometries: this.entityGeometries,
        materials: this.entityMaterials,
      }).create(),
      wreck: new WreckVisualFamily({
        group: this.salvageEntityGroup,
        geometries: this.entityGeometries,
        materials: this.entityMaterials,
      }).create(),
      portal: new PortalVisualFamily({
        group: this.landmarkEntityGroup,
        geometries: this.entityGeometries,
        materials: this.entityMaterials,
      }).create(),
      worldSprites: new WorldSpriteVisualFamily({
        landmarkGroup: this.landmarkEntityGroup,
        activeGroup: this.activeEntityGroup,
      }).create(),
    };
    this.temporalVisibility = new TemporalVisibilityContract();
    this.temporalFrameId = null;
    this.entitySpriteMaterials = new Set();
    this.lastPresentationPhase = null;
    this.lastPresentationRunId = null;

    this._buildBackdropLayers();
    this._buildForegroundLayers();
    this.vfxManager = new VfxManager({
      screenGroup: this.screenVfxGroup,
      immediateGroup: this.immediateVfxGroup,
      renderQuality,
    });

  }

  get scene() { return this.worldScene; }
  get camera() { return this.worldCamera; }

  resize(width, height) {
    this.viewportWidth = Math.max(1, Number(width) || 1280);
    this.viewportHeight = Math.max(1, Number(height) || 720);
    this._setWorldCameraAspect(width, height);
  }

  update(frame, { diagnosticView = false, viewportWidth = 1280, viewportHeight = 800 } = {}) {
    this.settings = resolvePresentationQuality(frame.style?.qualityTier || this.renderQuality);
    this.vfxManager.renderQuality = frame.style?.qualityTier || this.renderQuality;
    this._updateSceneState(frame, diagnosticView);
    this.vfxManager.update({
      dt: frame.timing.dt,
      totalTime: frame.timing.totalTime,
      viewportWidth,
      viewportHeight,
      events: frame.events,
      config: frame.vfxConfig,
    });
  }

  reset({ phase, runId } = {}) {
    for (const family of Object.values(this.visualFamilies)) family.reset();
    this.vfxManager.reset();
    this.temporalVisibility.reset({ phase, runId });
    this.temporalFrameId = null;
    this.lastPresentationPhase = phase;
    this.lastPresentationRunId = runId || this.lastPresentationRunId;
  }

  _buildBackdropLayers() {
    const grid = new THREE.Group();
    grid.name = 'subtle-depth-grid';
    const gridMat = new THREE.LineBasicMaterial({
      color: 0x24415f,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    });
    const positions = [];
    const extent = 1.35;
    const step = 0.18;
    for (let x = -extent; x <= extent + 0.001; x += step) {
      positions.push(x, -extent, -0.03, x, extent, -0.03);
    }
    for (let y = -extent; y <= extent + 0.001; y += step) {
      positions.push(-extent, y, -0.03, extent, y, -0.03);
    }
    const gridGeom = new THREE.BufferGeometry();
    gridGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const gridLines = new THREE.LineSegments(gridGeom, gridMat);
    gridLines.name = 'screen-anchored-parallax-grid';
    gridLines.renderOrder = 1;
    grid.add(gridLines);

    this.farStars = this._createStarLayer('far-star-depth', 96, -0.18, 0x36506d, 1.4, 1.4);
    this.nearStars = this._createStarLayer('near-star-depth', 38, -0.02, 0x6d859f, 1.9, 1.15);
    this.backgroundGroup.add(grid, this.farStars, this.nearStars);
  }

  _createStarLayer(name, count, z, color, size, spread) {
    const positions = [];
    for (let i = 0; i < count; i++) {
      const x = (seededUnit(i * 3 + 1) * 2 - 1) * spread;
      const y = (seededUnit(i * 3 + 2) * 2 - 1) * spread;
      positions.push(x, y, z + seededUnit(i * 3 + 3) * 0.04);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color,
      size,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geom, mat);
    points.name = name;
    points.renderOrder = 2;
    return points;
  }

  _buildForegroundLayers() {
    const ringGeom = new THREE.RingGeometry(0.62, 0.64, 96);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x54708a,
      transparent: true,
      opacity: 0.045,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.lensRing = new THREE.Mesh(ringGeom, ringMat);
    this.lensRing.name = 'motion-lens-depth-cue';
    this.lensRing.renderOrder = 20;
    this.foregroundGroup.add(this.lensRing);
  }

  _buildWorldEntityResources() {
    this.entityGeometries = {
      disc: new THREE.CircleGeometry(1, 28),
      ring: new THREE.RingGeometry(0.90, 1.0, 64),
      spriteCard: new THREE.PlaneGeometry(1, 1),
    };
    this.entityMaterials = createVisualMaterials(getPresentationPalette());
    this.entityAssets = new EntityAssetStore();
    this.lastEntityCount = 0;
    this.lastSemanticCount = 0;
    this.lastVisualCounts = {};
    this.lastEntitySeparation = {
      matteCount: 0,
      estimatedCoverage: 0,
      shipCandidateCount: 0,
    };
  }

  _setWorldCameraAspect(width, height) {
    const safeWidth = Math.max(1, Number(width) || 1);
    const safeHeight = Math.max(1, Number(height) || 1);
    const aspect = safeWidth / safeHeight;
    this.worldCameraAspect = aspect;
    // The camera volume matches the canvas aspect, but _scenePoint maps the
    // square fluid window across it. That preserves the sim/renderer contract
    // while still letting Three own the 3D scene and screen-space passes.
    this.worldCamera.left = -aspect;
    this.worldCamera.right = aspect;
    this.worldCamera.top = 1;
    this.worldCamera.bottom = -1;
    this.worldCamera.updateProjectionMatrix();
  }

  _scenePoint(wx, wy, state = this.lastSceneState) {
    return this.currentProjection.project(wx, wy);
  }

  _isSceneVisible(point, radius = 0.04) {
    return this.currentProjection.isVisible(point, radius);
  }

  _beginDynamicScene() {
    this.entityMeshCursor = 0;
    this.semanticMeshCursor = 0;
    this.lineCursor = 0;
    this.visualCounts = {};
    this.matteCount = 0;
    this.matteCoverage = 0;
    this.shipCandidateCount = 0;
    this.spriteCoreCount = 0;
    this.genericSpritePartCount = 0;
    this.wellDebugPrimitiveCount = 0;
    this.stateVfxCount = 0;
    this.opacityEntityCount = 0;
    for (const mesh of this.entityMeshPool) mesh.visible = false;
    for (const mesh of this.semanticMeshPool) mesh.visible = false;
    for (const line of this.linePool) line.visible = false;
  }

  _meshPoolFor(group) {
    return group === this.semanticGroup
      ? { pool: this.semanticMeshPool, cursorKey: 'semanticMeshCursor' }
      : { pool: this.entityMeshPool, cursorKey: 'entityMeshCursor' };
  }

  _addMesh(group, geometry, material, wx, wy, radius, rotation = 0, z = 0, state = this.lastSceneState, radiusMode = 'world') {
    if (!Number.isFinite(wx) || !Number.isFinite(wy)) return null;
    const point = this._scenePoint(wx, wy, state);
    const sceneScale = this.currentProjection.radius(Math.max(0.001, radius), radiusMode);
    sceneScale.x = Math.max(0.002, sceneScale.x);
    sceneScale.y = Math.max(0.002, sceneScale.y);
    if (!this._isSceneVisible(point, Math.max(sceneScale.x, sceneScale.y))) return null;
    const { pool, cursorKey } = this._meshPoolFor(group);
    let mesh = pool[this[cursorKey]];
    if (!mesh) {
      mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      pool.push(mesh);
      group.add(mesh);
    } else if (mesh.parent !== group) {
      group.add(mesh);
    }
    this[cursorKey] += 1;
    mesh.geometry = geometry;
    mesh.material = material;
    // Backing, diagnostic, semantic, and sprite cards share bounded pools.
    // Clear sprite-only hooks before a mesh changes visual role.
    mesh.onBeforeRender = NOOP_ON_BEFORE_RENDER;
    mesh.userData = {};
    if (Number.isFinite(material?.userData?.baseOpacity)) {
      material.opacity = material.userData.baseOpacity;
    }
    mesh.position.set(point.x, point.y, z);
    mesh.scale.set(sceneScale.x, sceneScale.y, 1);
    mesh.rotation.z = rotation;
    mesh.renderOrder = 14 + Math.round(z * 100);
    mesh.visible = true;
    this._countVisualGroup(group);
    return mesh;
  }

  _estimateMatteCoverage(radius, radiusScale, yScale, radiusMode, state = this.lastSceneState) {
    // This is a broad visual budget canary, not a pixel-accurate area test.
    // It catches runaway backing layers before they erase the ASCII fabric.
    const sceneScale = this.currentProjection.radius(Math.max(0.001, radius * radiusScale), radiusMode);
    const sceneArea = Math.max(0.001, (this.worldCamera.right - this.worldCamera.left) * (this.worldCamera.top - this.worldCamera.bottom));
    return (Math.PI * sceneScale.x * sceneScale.y * Math.max(0.1, yScale)) / sceneArea;
  }

  _countVisualGroup(group) {
    const key = group?.name || 'unknown';
    this.visualCounts[key] = (this.visualCounts[key] || 0) + 1;
  }

  _squashMesh(mesh, yScale = 1) {
    if (mesh && Number.isFinite(yScale) && yScale > 0) {
      mesh.scale.y *= yScale;
    }
    return mesh;
  }

  _addContrastBacking(wx, wy, radius, rotation, z, state, radiusMode, {
    radiusScale = 1.65,
    yScale = 0.72,
  } = {}) {
    const core = this._addMesh(this.entityBackingGroup, this.entityGeometries.disc, this.entityMaterials.matteContact,
      wx, wy, radius * radiusScale, rotation, z - 0.03, state, radiusMode);
    this._squashMesh(core, yScale);
    if (core) {
      this.matteCount += 1;
      this.matteCoverage += this._estimateMatteCoverage(radius, radiusScale, yScale, radiusMode, state);
    }
  }

  _addShipCandidate(candidate, state) {
    const facing = Number.isFinite(candidate.movement?.facing)
      ? candidate.movement.facing
      : Math.atan2(-(candidate.movement?.velocity?.y || 0), candidate.movement?.velocity?.x || 0);
    const rotation = -facing - Math.PI * 0.5;
    const scale = resolveEntityPresentationScale({
      family: 'shipCandidates',
      entity: candidate,
      authorityRadius: candidate.radius || 0,
      camera: state,
      cameraView: state.cameraView,
      canvasHeight: this.viewportHeight,
    });
    const core = this._addSpriteEntity(this.activeEntityGroup, selectPlayerAsset(candidate),
      candidate.world.x, candidate.world.y, scale.spriteRadius, rotation, 0.18, state, 'player', candidate, 'shipCandidates');
    if (core) this.shipCandidateCount += 1;
    return core;
  }

  _spriteInView(wx, wy, radius, state = this.lastSceneState, radiusMode = 'screen') {
    if (!Number.isFinite(wx) || !Number.isFinite(wy)) return false;
    const point = this._scenePoint(wx, wy, state);
    const sceneScale = this.currentProjection.radius(Math.max(0.001, radius), radiusMode);
    return this._isSceneVisible(point, Math.max(sceneScale.x, sceneScale.y));
  }

  _recordSpriteState(family, entity, state, radius = 0.04, role = family) {
    if (!entity?.id) return false;
    const inView = state === 'visible' || state === 'transparent'
      ? true
      : state === 'absent' || state === 'reset'
        ? false
        : this._spriteInView(entity.world?.x, entity.world?.y, radius,
          this.temporalRenderState || this.lastSceneState, 'screen');
    return this.temporalVisibility.record({
      id: entity.id,
      family,
      role,
      state,
      coreSubmitted: state === 'visible' || state === 'transparent',
      inView,
      opacity: entity.opacity ?? (state === 'transparent' ? 0 : 1),
      reason: state,
      occlusion: 'unsupported',
    });
  }

  _addSpriteEntity(group, assetId, wx, wy, radius, rotation, z, state, treatmentId, entity = {}, family = treatmentId) {
    const treatment = ENTITY_CONTACT_MATTE_TREATMENTS[treatmentId] || ENTITY_CONTACT_MATTE_TREATMENTS.fauna;
    this._addContrastBacking(wx, wy, radius, rotation, z, state, 'screen', {
      radiusScale: treatment.matteRadius * SPRITE_CARD_SCALE,
      yScale: treatment.matteY,
    });
    const core = this._addMesh(group, this.entityGeometries.spriteCard, this.entityAssets.getMaterial(assetId),
      wx, wy, radius * SPRITE_CARD_SCALE, rotation, z, state, 'screen');
    if (entity.id) {
      const entityOpacity = clamp(entity.opacity ?? 1, 0, 1);
      const visibleState = core
        ? (entityOpacity <= 0.001 ? 'transparent' : 'visible')
        : (this._spriteInView(wx, wy, radius * SPRITE_CARD_SCALE, state, 'screen') ? 'unknown' : 'offscreen-cull');
      this.temporalVisibility.record({
        id: entity.id,
        family,
        role: treatmentId,
        coreSubmitted: Boolean(core),
        inView: Boolean(core) || visibleState === 'unknown',
        opacity: entityOpacity,
        state: visibleState,
        reason: visibleState,
        occlusion: 'unsupported',
      });
    }
    if (core) {
      const entityOpacity = clamp(entity.opacity ?? 1, 0, 1);
      core.userData.entityOpacity = entityOpacity;
      let spriteMaterial = core.lbhSpriteMaterials?.get(assetId);
      if (!spriteMaterial) {
        spriteMaterial = this.entityAssets.getMaterial(assetId).clone();
        spriteMaterial.name = `entity-sprite-material:pooled:${assetId}`;
        spriteMaterial.userData = {
          ...(spriteMaterial.userData || {}),
          baseOpacity: 1,
          pooledEntitySprite: true,
        };
        if (!core.lbhSpriteMaterials) core.lbhSpriteMaterials = new Map();
        core.lbhSpriteMaterials.set(assetId, spriteMaterial);
        this.entitySpriteMaterials.add(spriteMaterial);
      }
      core.material = spriteMaterial;
      spriteMaterial.opacity = entityOpacity;
      this.spriteCoreCount += 1;
      if (entityOpacity < 1) this.opacityEntityCount += 1;
    }
    return core;
  }

  _addLine(group, ax, ay, bx, by, material, state = this.lastSceneState) {
    const a = this._scenePoint(ax, ay, state);
    const b = this._scenePoint(bx, by, state);
    if (!this._isSceneVisible(a, 0.02) && !this._isSceneVisible(b, 0.02)) return null;
    let line = this.linePool[this.lineCursor];
    if (!line) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      line = new THREE.Line(geom, material);
      line.frustumCulled = false;
      this.linePool.push(line);
      group.add(line);
    }
    this.lineCursor += 1;
    const attr = line.geometry.getAttribute('position');
    attr.array.set([a.x, a.y, 0, b.x, b.y, 0]);
    attr.needsUpdate = true;
    line.material = material;
    line.renderOrder = 28;
    line.visible = true;
    return line;
  }

  _updateSceneState(frame, diagnosticView) {
    const camera = frame.camera || {};
    const camX = Number.isFinite(camera.x) ? camera.x : this.lastSceneState.cameraX;
    const camY = Number.isFinite(camera.y) ? camera.y : this.lastSceneState.cameraY;
    const worldScale = Number.isFinite(camera.worldScale) ? camera.worldScale : this.lastSceneState.worldScale;
    const gridWindow = Number.isFinite(camera.gridWindow) ? camera.gridWindow : this.lastSceneState.gridWindow;
    const cameraView = Number.isFinite(camera.view) ? camera.view : (this.lastSceneState.cameraView ?? CAMERA_VIEW);
    const totalTime = Number.isFinite(frame.timing?.totalTime) ? frame.timing.totalTime : 0;
    const prev = this.prevCamera || { x: camX, y: camY };
    const dCamX = wrappedAxisDelta(camX, prev.x, worldScale);
    const dCamY = wrappedAxisDelta(camY, prev.y, worldScale);
    this.prevCamera = { x: camX, y: camY };

    const shipVelocity = frame.localPlayer?.movement?.velocity || {};
    const shipVX = Number.isFinite(shipVelocity.x) ? shipVelocity.x : 0;
    const shipVY = Number.isFinite(shipVelocity.y) ? shipVelocity.y : 0;
    const parallaxStrength = this.settings.parallaxStrength;
    const targetX = clamp((dCamX / Math.max(gridWindow, 0.001)) * 0.75 + (shipVX / Math.max(gridWindow, 0.001)) * 0.006, -0.045, 0.045);
    const targetY = clamp((-dCamY / Math.max(gridWindow, 0.001)) * 0.75 + (-shipVY / Math.max(gridWindow, 0.001)) * 0.006, -0.045, 0.045);
    this.targetMotion.set(targetX, targetY).multiplyScalar(parallaxStrength);
    this.motion.lerp(this.targetMotion, 0.22);

    const phaseX = normalizedWorldPhase(camX, worldScale);
    const phaseY = normalizedWorldPhase(camY, worldScale);
    this.backgroundGroup.position.x = -phaseX * 0.10 * parallaxStrength - this.motion.x * 0.65;
    this.backgroundGroup.position.y = phaseY * 0.10 * parallaxStrength - this.motion.y * 0.65;
    this.farStars.position.x = -phaseX * 0.08 * parallaxStrength;
    this.farStars.position.y = phaseY * 0.08 * parallaxStrength;
    this.nearStars.position.x = -phaseX * 0.15 * parallaxStrength - this.motion.x * 0.8;
    this.nearStars.position.y = phaseY * 0.15 * parallaxStrength - this.motion.y * 0.8;
    this.lensRing.rotation.z = totalTime * 0.015 + (this.motion.x - this.motion.y) * 1.4;
    const motionLen = this.motion.length();
    this.lensRing.material.opacity = (0.035 + clamp(motionLen * 1.1, 0, 0.055)) * (renderQualityOpacityScale(this.renderQuality));

    const renderState = { camX, camY, cameraX: camX, cameraY: camY, worldScale, gridWindow, cameraView };
    this.currentProjection = createWorldProjection({ x: camX, y: camY, worldScale, view: cameraView }, this.worldCameraAspect);
    const phaseChanged = frame.phase !== this.lastPresentationPhase;
    const runChanged = frame.runId && this.lastPresentationRunId && frame.runId !== this.lastPresentationRunId;
    if (phaseChanged || runChanged) this.reset({ phase: frame.phase, runId: frame.runId });
    this.lastPresentationPhase = frame.phase;
    this.lastPresentationRunId = frame.runId || this.lastPresentationRunId;
    this._syncWorldScene(frame, renderState, diagnosticView);
    const motionX = Math.abs(this.motion.x) < 1e-7 ? 0 : this.motion.x;
    const motionY = Math.abs(this.motion.y) < 1e-7 ? 0 : this.motion.y;
    this.lastSceneState = {
      cameraX: camX,
      cameraY: camY,
      worldScale,
      gridWindow,
      cameraView,
      motionX,
      motionY,
      parallaxStrength,
      sceneEntityCount: this.lastEntityCount,
      semanticCount: this.lastSemanticCount,
    };
  }

  _syncWorldScene(frame, currentRenderState = null, diagnosticView = false) {
    this._beginDynamicScene();
    this.temporalFrameId = this.temporalFrameId == null ? 0 : this.temporalFrameId + 1;
    this.temporalVisibility.beginFrame({
      phase: frame.phase,
      runId: frame.runId,
      frameId: this.temporalFrameId,
      expected: collectTemporalSpriteExpectations(frame),
      families: TEMPORAL_SPRITE_FAMILIES,
    });
    const sceneState = frame.world || {};
    const renderState = {
      camX: currentRenderState?.camX ?? this.lastSceneState.cameraX,
      camY: currentRenderState?.camY ?? this.lastSceneState.cameraY,
      worldScale: currentRenderState?.worldScale ?? this.lastSceneState.worldScale,
      gridWindow: currentRenderState?.gridWindow ?? this.lastSceneState.gridWindow,
      cameraView: currentRenderState?.cameraView ?? this.lastSceneState.cameraView ?? CAMERA_VIEW,
    };
    this.temporalRenderState = renderState;
    let entityCount = 0;
    let semanticCount = 0;
    const addEntity = (...args) => {
      const maybeMode = typeof args[args.length - 1] === 'string' ? args.pop() : 'world';
      const mesh = this._addMesh(this.entityGroup, ...args, renderState, maybeMode);
      if (mesh) entityCount++;
      return mesh;
    };
    const addSemantic = (...args) => {
      const maybeMode = typeof args[args.length - 1] === 'string' ? args.pop() : 'world';
      const mesh = this._addMesh(this.semanticGroup, ...args, renderState, maybeMode);
      if (mesh) {
        semanticCount++;
        this.stateVfxCount += 1;
      }
      return mesh;
    };
    const draw = {
      semantic: addSemantic,
      line: (ax, ay, bx, by, material) => {
        const line = this._addLine(this.entityGroup, ax, ay, bx, by, material, renderState);
        if (line) entityCount++;
        return line;
      },
      shipCandidate: (candidate) => {
        const mesh = this._addShipCandidate(candidate, renderState);
        if (mesh) entityCount++;
        return mesh;
      },
      sprite: (group, assetId, wx, wy, radius, rotation, treatmentId, entity = {}, family = treatmentId) => {
        const scale = resolveEntityPresentationScale({
          family,
          entity,
          authorityRadius: radius,
          camera: renderState,
          cameraView: renderState.cameraView,
          canvasHeight: this.viewportHeight,
        });
        const mesh = this._addSpriteEntity(group, assetId, wx, wy, scale.spriteRadius, rotation, 0.13,
          renderState, treatmentId, entity, family);
        if (mesh) entityCount++;
        return mesh;
      },
      budgetCull: (family, entity, radius = 0.04) => this._recordSpriteState(
        family, entity, 'budget-cull', resolveEntityPresentationScale({
          family, entity, authorityRadius: radius, camera: renderState,
          cameraView: renderState.cameraView, canvasHeight: this.viewportHeight,
        }).spriteRadius,
      ),
      state: (family, entity, state, radius = 0.04) => this._recordSpriteState(
        family, entity, state, resolveEntityPresentationScale({
          family, entity, authorityRadius: radius, camera: renderState,
          cameraView: renderState.cameraView, canvasHeight: this.viewportHeight,
        }).spriteRadius,
      ),
    };

    for (const well of sceneState.wells || []) {
      if (diagnosticView) {
        if (addSemantic(this.entityGeometries.ring, this.entityMaterials.hazardRing,
          well.world.x, well.world.y, well.visual.contourRadius, 0, 0.01)) this.wellDebugPrimitiveCount += 1;
        if (addEntity(this.entityGeometries.ring, this.entityMaterials.wellRing,
          well.world.x, well.world.y, Math.max(0.07, well.visual.coreRadius * 2.6), 0, 0.03)) this.wellDebugPrimitiveCount += 1;
        if (addEntity(this.entityGeometries.disc, this.entityMaterials.wellCore,
          well.world.x, well.world.y, Math.max(0.018, well.visual.coreRadius), 0, 0.04)) this.wellDebugPrimitiveCount += 1;
      }
    }
    // Inhibitor identity belongs to authored silhouettes. Only the Vessel's
    // named target tell remains a line; generic magenta rings are retired.
    for (const inhibitor of sceneState.inhibitors || []) {
      const radius = Math.max(0.012, inhibitor.radius || 0.1);
      if (inhibitor.kind === 'vessel' && inhibitor.target && Number.isFinite(inhibitor.target.wx)
          && Number.isFinite(inhibitor.target.wy)) {
        draw.line(
          inhibitor.world.x,
          inhibitor.world.y,
          inhibitor.target.wx,
          inhibitor.target.wy,
          this.entityMaterials.inhibitorRing,
        );
      }
      const mesh = draw.sprite(
        this.activeEntityGroup,
        selectInhibitorAsset(inhibitor),
        inhibitor.world.x,
        inhibitor.world.y,
        radius,
        0,
        'anomaly',
        inhibitor,
        'inhibitors',
      );
      if (!mesh) this._recordSpriteState('inhibitors', inhibitor, 'offscreen-cull', radius, inhibitor.kind || 'inhibitor');
    }
    // Wave growth remains authoritative fabric state. Product Three mode does
    // not add a generic ring on top; named slingshot/portal state owns the
    // semantic affordances that sprites cannot carry.
    this.visualFamilies.portal.update(frame, draw);
    this.visualFamilies.wreck.update(frame, draw);
    this.visualFamilies.worldSprites.update(frame, draw);
    this.visualFamilies.player.update(frame, draw);

    this.lastEntityCount = entityCount;
    this.lastSemanticCount = semanticCount;
    this.lastVisualCounts = { ...this.visualCounts };
    this.lastEntitySeparation = {
      matteCount: this.matteCount,
      estimatedCoverage: Number(this.matteCoverage.toFixed(4)),
      shipCandidateCount: this.shipCandidateCount,
      spriteCoreCount: this.spriteCoreCount,
      genericSpritePartCount: this.genericSpritePartCount,
      wellDebugPrimitiveCount: this.wellDebugPrimitiveCount,
      stateVfxCount: this.stateVfxCount,
      opacityEntityCount: this.opacityEntityCount,
      pooledSpriteMaterials: this.entitySpriteMaterials.size,
    };
    this.temporalVisibility.endFrame();
    this.lastEntitySeparation.temporalVisibility = this.temporalVisibility.getStats({
      families: TEMPORAL_SPRITE_FAMILIES,
    });
  }

  _describeWorldLayers() {
    return [
      { name: this.backgroundGroup.name, z: this.backgroundGroup.position.z, role: 'parallax backdrop' },
      { name: this.fabricGroup.name, z: this.fabricGroup.position.z, role: 'Composer-owned ASCII frame' },
      { name: this.semanticGroup.name, z: this.semanticGroup.position.z, role: 'semantic flow/hazard channels' },
      {
        name: this.entityGroup.name,
        z: this.entityGroup.position.z,
        role: '3D world entities',
        children: ENTITY_SUBGROUPS.map(([propertyName, _groupName, role]) => ({
          name: this[propertyName].name,
          z: this[propertyName].position.z,
          role,
        })),
      },
      { name: this.foregroundGroup.name, z: this.foregroundGroup.position.z, role: 'screen-space depth cues' },
      { name: this.screenVfxGroup.name, z: this.screenVfxGroup.position.z, role: 'screen-space VFX accents below UI' },
    ];
  }

  getStats() {
    return {
      camera: {
        kind: 'orthographic-top-down',
        projection: 'square-fluid-window',
        position: { x: 0, y: 0, z: 4 },
        near: this.worldCamera.near,
        far: this.worldCamera.far,
        aspect: this.worldCameraAspect,
        worldViewHeight: this.lastSceneState.cameraView ?? CAMERA_VIEW,
        worldViewWidth: this.lastSceneState.cameraView ?? CAMERA_VIEW,
        sceneViewWidth: this.worldCamera.right - this.worldCamera.left,
        sceneViewHeight: this.worldCamera.top - this.worldCamera.bottom,
        left: this.worldCamera.left,
        right: this.worldCamera.right,
        top: this.worldCamera.top,
        bottom: this.worldCamera.bottom,
      },
      worldLayers: this._describeWorldLayers(),
      parallax: { ...this.lastSceneState },
      entityCount: this.lastEntityCount,
      semanticCount: this.lastSemanticCount,
      visualCounts: this.lastVisualCounts,
      entitySeparation: this.lastEntitySeparation,
      visualFamilies: Object.fromEntries(
        Object.entries(this.visualFamilies).map(([name, family]) => [name, family.getStats()])
      ),
      pooledMeshes: this.entityMeshPool.length + this.semanticMeshPool.length,
      pooledLines: this.linePool.length,
      entityAssets: this.entityAssets.getStats(),
      vfx: this.vfxManager.getStats(),
    };
  }

  dispose() {
    for (const family of Object.values(this.visualFamilies)) family.dispose();
    this.vfxManager.dispose();
    for (const material of this.entitySpriteMaterials) material.dispose();
    this.entitySpriteMaterials.clear();
    this.entityAssets.dispose();
    this._disposeObject(this.worldScene, {
      geometries: [
        ...Object.values(this.entityGeometries),
        ...Object.values(this.vfxManager.geometries),
      ],
      materials: Object.values(this.entityMaterials),
    });
  }

  _disposeObject(obj, { geometries: ownedGeometries = [], materials: ownedMaterials = [] } = {}) {
    const geometries = new Set(ownedGeometries);
    const materials = new Set(ownedMaterials);
    obj.traverse?.((child) => {
      if (child.geometry) geometries.add(child.geometry);
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (mat && !mat.name?.startsWith('entity-sprite-material:')) materials.add(mat);
      }
    });
    for (const geom of geometries) geom.dispose();
    for (const mat of materials) mat.dispose();
  }
}
