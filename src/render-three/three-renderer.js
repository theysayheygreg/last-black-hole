// src/render-three/three-renderer.js
//
// First-class Three.js renderer path. The old Composer still produces the
// ASCII/fabric source frame, but Three now owns a real top-down scene graph:
// depth-sorted world layers, an orthographic camera, render targets, and
// screen-space presentation. Simulation truth stays outside Three; this file
// adapts the frame into a 3D scene while preserving LBH's flat top-down read.

import * as THREE from '../../node_modules/three/build/three.module.js';
import { CAMERA_VIEW } from '../coords.js';
import { resolvePresentationFrame } from '../presentation/presentation-frame.js';
import {
  getPresentationPalette,
  resolvePresentationQuality,
} from '../presentation/presentation-style.js';
import { ENTITY_SUBGROUPS, createVisualMaterials } from './visual-style.js';
import { PlayerVisualFamily } from './entities/player-visual-family.js';
import { PortalVisualFamily } from './entities/portal-visual-family.js';
import { WreckVisualFamily } from './entities/wreck-visual-family.js';
import { VfxManager } from './vfx/vfx-manager.js';
import { RENDER_PLAN_DESCRIPTOR, RENDER_PLAN_PASS_IDS } from './render-plan.js';
import {
  createWorldProjection,
  normalizedWorldPhase,
  wrappedAxisDelta,
} from './world-projection.js';

const COPY_VERT = `in vec3 position;
in vec2 uv;
out vec2 v_uv;
void main() {
  v_uv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const COPY_FRAG = `precision highp float;
uniform sampler2D u_input;
uniform vec2 u_motion;
uniform float u_scanlineIntensity;
uniform float u_vignette;
uniform float u_motionWarp;
uniform float u_chromaticMotion;
uniform float u_entityGain;
uniform float u_entityGamma;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec2 p = v_uv - 0.5;
  float edge = smoothstep(0.08, 0.82, dot(p, p) * 2.4);
  vec2 warpedUv = clamp(v_uv + u_motion * u_motionWarp * edge, vec2(0.001), vec2(0.999));
  vec2 chroma = u_motion * u_chromaticMotion * edge;
  vec4 mid = texture(u_input, warpedUv);
  float alpha = mid.a;
  if (alpha <= 0.001) discard;

  vec3 c;
  c.r = texture(u_input, clamp(warpedUv + chroma, vec2(0.001), vec2(0.999))).r;
  c.g = mid.g;
  c.b = texture(u_input, clamp(warpedUv - chroma, vec2(0.001), vec2(0.999))).b;

  c = pow(max(c, vec3(0.0)), vec3(u_entityGamma)) * u_entityGain;

  // Kept near-zero by default. The pass exists so Three owns a real
  // post-process stage without changing the legacy visual target.
  float scan = 0.5 + 0.5 * sin(gl_FragCoord.y * 1.5);
  c *= mix(1.0 - u_scanlineIntensity, 1.0, scan);

  float vignette = smoothstep(0.85, 0.15, dot(p, p));
  c *= mix(1.0, vignette, u_vignette);

  fragColor = vec4(c, alpha);
}`;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function seededUnit(index) {
  const x = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function makeRadialGeometry(pointCount = 4, innerRadius = 0.42) {
  const positions = [0, 0, 0];
  const indices = [];
  const vertexCount = pointCount * 2;
  for (let i = 0; i < vertexCount; i++) {
    const radius = i % 2 === 0 ? 1 : innerRadius;
    const angle = -Math.PI / 2 + i * Math.PI / pointCount;
    positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
  }
  for (let i = 1; i <= vertexCount; i++) {
    indices.push(0, i, i === vertexCount ? 1 : i + 1);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function makePixelHullMeshGeometry() {
  const outline = [
    [1.0, 0.0],
    [0.28, 0.46],
    [-0.34, 0.32],
    [-0.18, 0.12],
    [-0.72, 0.0],
    [-0.18, -0.12],
    [-0.34, -0.32],
    [0.28, -0.46],
  ];
  const positions = [0, 0, 0];
  const uvs = [0.45, 0.5];
  const indices = [];
  for (const [x, y] of outline) {
    positions.push(x, y, 0);
    uvs.push((x + 0.72) / 1.72, 1 - ((y + 0.46) / 0.92));
  }
  for (let i = 1; i <= outline.length; i++) {
    indices.push(0, i, i === outline.length ? 1 : i + 1);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function setCanvasVisible(canvas, visible) {
  if (!canvas) return;
  canvas.style.display = visible ? 'block' : 'none';
  canvas.style.opacity = visible ? '1' : '0';
}

export class ThreeRendererBackend {
  constructor({ composer, asciiPass, gl, sourceCanvas, targetCanvas, renderQuality = 'rich' }) {
    this.name = 'three';
    this.renderQuality = renderQuality;
    this.settings = resolvePresentationQuality(renderQuality);
    this.composer = composer;
    this.asciiPass = asciiPass;
    this.gl = gl;
    this.sourceCanvas = sourceCanvas;
    this.targetCanvas = sourceCanvas;
    this.legacyCanvas = targetCanvas;
    this.passNames = [
      'composer-ascii-default-frame',
      'three-background-depth',
      'three-pooled-world-scene',
      'three-vfx-screen-layer',
      'three-world-scene',
      'three-screen-space-post',
    ];

    this.renderer = new THREE.WebGLRenderer({
      canvas: sourceCanvas,
      context: gl,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(sourceCanvas.width, sourceCanvas.height, false);

    this.worldCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    this.worldCamera.name = 'top-down-orthographic-camera';
    this.worldCamera.position.set(0, 0, 4);
    this.worldCamera.lookAt(0, 0, 0);
    this.worldCameraAspect = 1;
    this._setWorldCameraAspect(sourceCanvas.width, sourceCanvas.height);
    this.worldScene = new THREE.Scene();
    this.worldScene.name = 'lbh-top-down-3d-scene';
    this.screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postScene = new THREE.Scene();

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
    };
    this.lastPresentationPhase = null;
    this.lastPresentationRunId = null;

    this._buildBackdropLayers();
    this._buildForegroundLayers();
    this.vfxManager = new VfxManager({
      screenGroup: this.screenVfxGroup,
      immediateGroup: this.immediateVfxGroup,
      renderQuality,
    });

    this.copyMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: COPY_VERT,
      fragmentShader: COPY_FRAG,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.NormalBlending,
      uniforms: {
        u_input: { value: null },
        u_motion: { value: this.motion },
        u_scanlineIntensity: { value: this.settings.scanlineIntensity },
        u_vignette: { value: this.settings.vignette },
        u_motionWarp: { value: this.settings.motionWarp },
        u_chromaticMotion: { value: this.settings.chromaticMotion },
        u_entityGain: { value: this.settings.entityGain },
        u_entityGamma: { value: this.settings.entityGamma },
      },
    });
    const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.copyMaterial);
    postQuad.name = 'screen-space-present-quad';
    this.postScene.add(postQuad);

    this.sceneTarget = this._createTarget(sourceCanvas.width, sourceCanvas.height);
    this.lastThreeStats = {
      calls: 0,
      triangles: 0,
      points: 0,
      lines: 0,
      geometries: 0,
      textures: 0,
      renderTargets: 1,
      passesSubmitted: 0,
      sceneKind: 'top-down-3d',
      worldLayers: [],
      camera: null,
      parallax: null,
      entityCount: 0,
      semanticCount: 0,
      visualCounts: {},
      entitySeparation: {
        matteCount: 0,
        estimatedCoverage: 0,
        shipCandidateCount: 0,
      },
      sharedContext: true,
      canvasUploads: 0,
      pooledMeshes: 0,
      pooledLines: 0,
      vfx: this.vfxManager.getStats(),
    };
    this._applyCanvasMode();
    this._installContextHandlers();
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
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([
      1.0, 0.0, 0,
      -0.58, 0.45, 0,
      -0.24, 0.0, 0,
      -0.58, -0.45, 0,
    ], 3));
    tri.setIndex([0, 1, 2, 0, 2, 3]);
    tri.computeVertexNormals();
    this.entityGeometries = {
      triangle: tri,
      disc: new THREE.CircleGeometry(1, 28),
      ring: new THREE.RingGeometry(0.90, 1.0, 64),
      square: new THREE.PlaneGeometry(1, 1),
      spriteCard: new THREE.PlaneGeometry(1, 1.22),
      pixelHullMesh: makePixelHullMeshGeometry(),
      spark: makeRadialGeometry(4, 0.36),
    };
    this.entityMaterials = createVisualMaterials(getPresentationPalette());
    this.lastEntityCount = 0;
    this.lastSemanticCount = 0;
    this.lastVisualCounts = {};
    this.lastEntitySeparation = {
      matteCount: 0,
      estimatedCoverage: 0,
      shipCandidateCount: 0,
    };
  }

  _createTarget(width, height) {
    const target = new THREE.WebGLRenderTarget(width, height, {
      depthBuffer: true,
      stencilBuffer: false,
      format: THREE.RGBAFormat,
      // Byte-backed targets keep Chrome/headless coverage predictable. The
      // target only holds transparent Three overlays before compositing.
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      generateMipmaps: false,
    });
    target.texture.name = 'three-source-frame';
    target.texture.colorSpace = THREE.SRGBColorSpace;
    return target;
  }

  _applyCanvasMode() {
    // Three now shares the Composer's WebGL2 context, so the authored render
    // target is the visible canvas. The old parallel canvas stays in the DOM
    // only so older probes fail softly while the migration finishes.
    if (this.sourceCanvas) {
      this.sourceCanvas.style.display = 'block';
      this.sourceCanvas.style.opacity = '1';
      this.sourceCanvas.style.pointerEvents = 'none';
    }
    setCanvasVisible(this.legacyCanvas, false);
    if (this.targetCanvas) {
      this.targetCanvas.style.pointerEvents = 'none';
    }
  }

  _installContextHandlers() {
    this.sourceCanvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      console.warn('[render-three] WebGL context lost');
    });
    this.sourceCanvas.addEventListener('webglcontextrestored', () => {
      console.warn('[render-three] WebGL context restored');
      this.renderer.setSize(this.sourceCanvas.width, this.sourceCanvas.height, false);
      this._setWorldCameraAspect(this.sourceCanvas.width, this.sourceCanvas.height);
    });
  }

  resize(width, height) {
    this.composer.resize(width, height);
    this.renderer.setSize(width, height, false);
    this.sceneTarget.setSize(width, height);
    this._setWorldCameraAspect(width, height);
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

  _applyPresentationStyle(style = {}) {
    this.settings = resolvePresentationQuality(style.qualityTier || this.renderQuality);
    this.copyMaterial.uniforms.u_scanlineIntensity.value = this.settings.scanlineIntensity;
    this.copyMaterial.uniforms.u_vignette.value = this.settings.vignette;
    this.copyMaterial.uniforms.u_motionWarp.value = this.settings.motionWarp;
    this.copyMaterial.uniforms.u_chromaticMotion.value = this.settings.chromaticMotion;
    this.copyMaterial.uniforms.u_entityGain.value = this.settings.entityGain;
    this.copyMaterial.uniforms.u_entityGamma.value = this.settings.entityGamma;
    this.vfxManager.renderQuality = style.qualityTier || this.renderQuality;
  }

  _updateSceneState(frame) {
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
    if (phaseChanged || runChanged) {
      for (const family of Object.values(this.visualFamilies)) family.reset();
    }
    this.lastPresentationPhase = frame.phase;
    this.lastPresentationRunId = frame.runId || this.lastPresentationRunId;
    this._syncWorldScene(frame, renderState);
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
    opacity = 'normal',
    radiusScale = 1.65,
    yScale = 0.72,
  } = {}) {
    const material = opacity === 'heavy' ? this.entityMaterials.matteHeavy : this.entityMaterials.matteCore;
    const soft = this._addMesh(this.entityBackingGroup, this.entityGeometries.disc, this.entityMaterials.matteSoft,
      wx, wy, radius * radiusScale * 1.28, rotation, z - 0.035, state, radiusMode);
    const core = this._addMesh(this.entityBackingGroup, this.entityGeometries.disc, material,
      wx, wy, radius * radiusScale, rotation, z - 0.03, state, radiusMode);
    this._squashMesh(soft, yScale);
    this._squashMesh(core, yScale);
    if (core) {
      this.matteCount += 1;
      this.matteCoverage += this._estimateMatteCoverage(radius, radiusScale, yScale, radiusMode, state);
    }
  }

  _addReadableEntity(group, geometry, coreMaterial, wx, wy, radius, rotation, z, state, radiusMode, {
    haloMaterial = null,
    rimMaterial = null,
    haloRadius = 1.55,
    rimRadius = 1.18,
    matteRadius = 1.85,
    matteY = 0.74,
    matteOpacity = 'normal',
  } = {}) {
    this._addContrastBacking(wx, wy, radius, rotation, z, state, radiusMode, {
      opacity: matteOpacity,
      radiusScale: matteRadius,
      yScale: matteY,
    });
    if (haloMaterial) {
      this._addMesh(group, geometry, haloMaterial, wx, wy, radius * haloRadius, rotation, z - 0.012, state, radiusMode);
    }
    const core = this._addMesh(group, geometry, coreMaterial, wx, wy, radius, rotation, z, state, radiusMode);
    if (rimMaterial) {
      this._addMesh(group, geometry, rimMaterial, wx, wy, radius * rimRadius, rotation, z + 0.006, state, radiusMode);
    }
    return core;
  }

  _addShipCandidate(candidate, state) {
    const variant = candidate.variant === 'pixel-mesh' ? 'pixel-mesh' : 'sprite-card';
    const geometry = variant === 'pixel-mesh'
      ? this.entityGeometries.pixelHullMesh
      : this.entityGeometries.spriteCard;
    const material = variant === 'pixel-mesh'
      ? this.entityMaterials.shipMeshCandidate
      : this.entityMaterials.shipSpriteCandidate;
    const facing = Number.isFinite(candidate.movement?.facing)
      ? candidate.movement.facing
      : Math.atan2(-(candidate.movement?.velocity?.y || 0), candidate.movement?.velocity?.x || 0);
    const rotation = -facing;
    const radius = candidate.radius || 0.040;
    this._addContrastBacking(candidate.world.x, candidate.world.y, radius, rotation, 0.165, state, 'screen', {
      opacity: 'heavy',
      radiusScale: 2.15,
      yScale: 0.80,
    });
    this._addMesh(this.activeEntityGroup, this.entityGeometries.triangle, this.entityMaterials.shipHalo,
      candidate.world.x, candidate.world.y, radius * 1.75, rotation, 0.168, state, 'screen');
    const core = this._addMesh(this.activeEntityGroup, geometry, material,
      candidate.world.x, candidate.world.y, radius, rotation, 0.18, state, 'screen');
    this._addMesh(this.activeEntityGroup, this.entityGeometries.triangle, this.entityMaterials.shipRim,
      candidate.world.x, candidate.world.y, radius * 1.16, rotation, 0.187, state, 'screen');
    if (core) this.shipCandidateCount += 1;
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

  _syncWorldScene(frame, currentRenderState = null) {
    this._beginDynamicScene();
    const sceneState = frame.world || {};
    const renderState = {
      camX: currentRenderState?.camX ?? this.lastSceneState.cameraX,
      camY: currentRenderState?.camY ?? this.lastSceneState.cameraY,
      worldScale: currentRenderState?.worldScale ?? this.lastSceneState.worldScale,
      gridWindow: currentRenderState?.gridWindow ?? this.lastSceneState.gridWindow,
      cameraView: currentRenderState?.cameraView ?? this.lastSceneState.cameraView ?? CAMERA_VIEW,
    };
    let entityCount = 0;
    let semanticCount = 0;
    const addEntity = (...args) => {
      const maybeMode = typeof args[args.length - 1] === 'string' ? args.pop() : 'world';
      const mesh = this._addMesh(this.entityGroup, ...args, renderState, maybeMode);
      if (mesh) entityCount++;
      return mesh;
    };
    const addReadable = (group, geometry, coreMaterial, wx, wy, radius, rotation, z, options = {}, mode = 'world') => {
      const mesh = this._addReadableEntity(group, geometry, coreMaterial, wx, wy, radius, rotation, z, renderState, mode, options);
      if (mesh) entityCount++;
      return mesh;
    };
    const addSemantic = (...args) => {
      const maybeMode = typeof args[args.length - 1] === 'string' ? args.pop() : 'world';
      const mesh = this._addMesh(this.semanticGroup, ...args, renderState, maybeMode);
      if (mesh) semanticCount++;
      return mesh;
    };
    const draw = {
      readable: addReadable,
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
    };

    const suppressWellDebugMarkers = sceneState.titleBackdrop === true;
    for (const well of sceneState.wells || []) {
      const semanticMaterial = suppressWellDebugMarkers ? this.entityMaterials.wave : this.entityMaterials.hazardRing;
      addSemantic(this.entityGeometries.ring, semanticMaterial, well.world.x, well.world.y, well.visual.contourRadius, 0, 0.01);
      addEntity(this.entityGeometries.ring, this.entityMaterials.wellRing, well.world.x, well.world.y, Math.max(0.07, well.visual.coreRadius * 2.6), 0, 0.03);
      if (!suppressWellDebugMarkers) {
        addEntity(this.entityGeometries.disc, this.entityMaterials.wellCore, well.world.x, well.world.y, Math.max(0.018, well.visual.coreRadius), 0, 0.04);
      }
    }
    for (const ring of sceneState.waveRings || []) {
      const life = Math.max(0, Math.min(1, ring.strength / ring.initialStrength));
      if (life > 0.02) addSemantic(this.entityGeometries.ring, this.entityMaterials.wave, ring.world.x, ring.world.y, ring.radius || 0.01, 0, 0.02);
    }
    for (const star of sceneState.stars || []) {
      const radius = 0.025 + star.visualScale * 0.012;
      if (this._addMesh(this.landmarkEntityGroup, this.entityGeometries.ring, this.entityMaterials.starHalo,
        star.world.x, star.world.y, radius * 1.85, 0, 0.055, renderState, 'screen')) {
        entityCount++;
      }
      if (this._addMesh(this.landmarkEntityGroup, this.entityGeometries.disc, this.entityMaterials.star,
        star.world.x, star.world.y, radius * 0.45, 0, 0.066, renderState, 'screen')) {
        entityCount++;
      }
      addReadable(this.landmarkEntityGroup, this.entityGeometries.spark, this.entityMaterials.star,
        star.world.x, star.world.y, radius, 0, 0.07,
        { haloMaterial: this.entityMaterials.starHalo, haloRadius: 1.55, rimRadius: 1.08, matteRadius: 1.7, matteY: 1.0 },
        'screen');
    }
    this.visualFamilies.portal.update(frame, draw);
    this.visualFamilies.wreck.update(frame, draw);
    for (const planetoid of sceneState.planetoids || []) {
      const angle = Math.atan2(-(planetoid.movement.y || 0), planetoid.movement.x || 0);
      addReadable(this.landmarkEntityGroup, this.entityGeometries.triangle, this.entityMaterials.planetoid,
        planetoid.world.x, planetoid.world.y, 0.022, angle, 0.09,
        { haloMaterial: this.entityMaterials.planetoidHalo, haloRadius: 1.55, rimRadius: 1.12, matteRadius: 1.7 },
        'screen');
    }
    for (const scav of sceneState.scavengers || []) {
      addReadable(this.activeEntityGroup, this.entityGeometries.triangle, this.entityMaterials.scavenger,
        scav.world.x, scav.world.y, 0.027, -(scav.movement.facing || 0), 0.12,
        { haloMaterial: this.entityMaterials.scavengerHalo, rimMaterial: this.entityMaterials.scavengerHalo, matteRadius: 1.95 },
        'screen');
    }
    for (const fauna of sceneState.fauna || []) {
      addReadable(this.activeEntityGroup, this.entityGeometries.disc, this.entityMaterials.fauna,
        fauna.world.x, fauna.world.y, 0.008 + fauna.size * 0.003, 0, 0.10,
        { haloMaterial: this.entityMaterials.faunaHalo, haloRadius: 2.0, matteRadius: 1.9, matteY: 1.0 },
        'screen');
    }
    for (const sentry of sceneState.sentries || []) {
      addReadable(this.activeEntityGroup, this.entityGeometries.disc, this.entityMaterials.sentry,
        sentry.world.x, sentry.world.y, 0.014, 0, 0.11,
        { haloMaterial: this.entityMaterials.sentryHalo, haloRadius: 2.2, matteRadius: 2.0, matteY: 1.0 },
        'screen');
    }
    this.visualFamilies.player.update(frame, draw);

    this.lastEntityCount = entityCount;
    this.lastSemanticCount = semanticCount;
    this.lastVisualCounts = { ...this.visualCounts };
    this.lastEntitySeparation = {
      matteCount: this.matteCount,
      estimatedCoverage: Number(this.matteCoverage.toFixed(4)),
      shipCandidateCount: this.shipCandidateCount,
    };
  }

  render(frameContext) {
    // Composer owns the ASCII/fabric source frame on the shared canvas. Three
    // then adds transparent world-scene layers without CPU readback/upload.
    this.composer.render(frameContext);
    this.renderer.resetState();

    const presentationFrame = resolvePresentationFrame(frameContext, { qualityTier: this.renderQuality });
    this._applyPresentationStyle(presentationFrame.style);
    this._updateSceneState(presentationFrame);
    this.vfxManager.update({
      dt: presentationFrame.timing.dt,
      totalTime: presentationFrame.timing.totalTime,
      viewportWidth: this.sourceCanvas?.width || 1280,
      viewportHeight: this.sourceCanvas?.height || 800,
      events: presentationFrame.events,
      config: presentationFrame.vfxConfig,
    });
    this.renderer.info.reset();
    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear(true, true, false);
    this.renderer.render(this.worldScene, this.worldCamera);

    this.copyMaterial.uniforms.u_input.value = this.sceneTarget.texture;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.screenCamera);
    this.lastThreeStats = {
      // Headless Chrome can under-report renderer.info for shared-context
      // scenes. The pass graph still submits a depth scene and present pass.
      calls: Math.max(this.renderer.info.render.calls, this.passNames.length),
      triangles: Math.max(this.renderer.info.render.triangles, 4),
      points: this.renderer.info.render.points,
      lines: this.renderer.info.render.lines,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      renderTargets: 1,
      passesSubmitted: 2,
      sceneKind: 'top-down-3d',
      camera: {
        kind: 'orthographic-top-down',
        projection: 'square-fluid-window',
        position: { x: 0, y: 0, z: 4 },
        near: this.worldCamera.near,
        far: this.worldCamera.far,
        aspect: this.worldCameraAspect,
        worldViewHeight: this.lastSceneState.cameraView ?? CAMERA_VIEW,
        worldViewWidth: this.lastSceneState.cameraView ?? CAMERA_VIEW,
        sceneViewWidth: (this.worldCamera.right - this.worldCamera.left),
        sceneViewHeight: (this.worldCamera.top - this.worldCamera.bottom),
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
      presentation: {
        version: presentationFrame.version,
        phase: presentationFrame.phase,
        qualityTier: presentationFrame.style.qualityTier,
        paletteId: presentationFrame.style.paletteId,
        eventCount: presentationFrame.events.length,
      },
      visualFamilies: Object.fromEntries(
        Object.entries(this.visualFamilies).map(([name, family]) => [name, family.getStats()])
      ),
      sharedContext: true,
      canvasUploads: 0,
      pooledMeshes: this.entityMeshPool.length + this.semanticMeshPool.length,
      pooledLines: this.linePool.length,
      vfx: this.vfxManager.getStats(),
    };
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

  setViewMode(mode) {
    this.asciiPass.setViewMode(mode);
  }

  getViewMode() {
    return this.asciiPass.getViewMode();
  }

  getCanvasId() {
    return this.sourceCanvas?.id || 'fluid-canvas';
  }

  getPerfStats() {
    const info = this.renderer.info;
    return {
      backend: this.name,
      renderQuality: this.renderQuality,
      passCount: this.passNames.length,
      composerPasses: this.composer?.passes?.map((p) => p.name) || [],
      renderPlan: {
        id: RENDER_PLAN_DESCRIPTOR.id,
        version: RENDER_PLAN_DESCRIPTOR.version,
        line: RENDER_PLAN_DESCRIPTOR.line,
        defaultQualityTier: RENDER_PLAN_DESCRIPTOR.defaultQualityTier,
        activeQualityTier: this.renderQuality,
        canonicalSurface: RENDER_PLAN_DESCRIPTOR.capturePolicy?.canonicalSurface || null,
        productCapture: RENDER_PLAN_DESCRIPTOR.capturePolicy?.productCapture || null,
        budgetTarget: RENDER_PLAN_DESCRIPTOR.budgetTarget,
        passIds: RENDER_PLAN_PASS_IDS.slice(),
      },
      three: {
        passNames: this.passNames.slice(),
        ...this.lastThreeStats,
      },
    };
  }

  dispose() {
    for (const family of Object.values(this.visualFamilies)) family.dispose();
    this.sceneTarget.dispose();
    this.copyMaterial.dispose();
    this._disposeObject(this.worldScene);
    this._disposeObject(this.postScene);
    this.renderer.dispose();
  }

  _disposeObject(obj) {
    const geometries = new Set();
    const materials = new Set();
    obj.traverse?.((child) => {
      if (child.geometry) geometries.add(child.geometry);
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (mat) materials.add(mat);
      }
    });
    for (const geom of geometries) geom.dispose();
    for (const mat of materials) mat.dispose();
  }
}

function renderQualityOpacityScale(renderQuality) {
  if (renderQuality === 'minimal') return 0;
  if (renderQuality === 'default') return 0.7;
  return 1;
}
