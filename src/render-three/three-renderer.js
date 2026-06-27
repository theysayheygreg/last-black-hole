// src/render-three/three-renderer.js
//
// First-class Three.js renderer path. The old Composer still produces the
// ASCII/fabric source frame, but Three now owns a real top-down scene graph:
// depth-sorted world layers, an orthographic camera, render targets, and
// screen-space presentation. Simulation truth stays outside Three; this file
// adapts the frame into a 3D scene while preserving LBH's flat top-down read.

import * as THREE from '../../node_modules/three/build/three.module.js';
import { CAMERA_VIEW, worldRadiusToSceneScale } from '../coords.js';
import { ENTITY_SUBGROUPS, createVisualMaterials } from './visual-style.js';

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

function qualitySettings(renderQuality) {
  if (renderQuality === 'minimal') {
    return {
      backdropReveal: 0.0,
      parallaxStrength: 0.0,
      scanlineIntensity: 0.0,
      vignette: 0.0,
      motionWarp: 0.0,
      chromaticMotion: 0.0,
      entityGain: 1.0,
      entityGamma: 1.0,
    };
  }
  if (renderQuality === 'default') {
    return {
      backdropReveal: 0.07,
      parallaxStrength: 0.55,
      scanlineIntensity: 0.006,
      vignette: 0.035,
      motionWarp: 0.004,
      chromaticMotion: 0.0018,
      entityGain: 1.22,
      entityGamma: 0.88,
    };
  }
  return {
    backdropReveal: 0.12,
    parallaxStrength: 0.85,
    scanlineIntensity: 0.010,
    vignette: 0.055,
    motionWarp: 0.007,
    chromaticMotion: 0.0025,
    entityGain: 1.38,
    entityGamma: 0.82,
  };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function wrappedDelta(next, prev, wrap) {
  if (!Number.isFinite(next) || !Number.isFinite(prev)) return 0;
  let d = next - prev;
  if (Number.isFinite(wrap) && wrap > 0) {
    const half = wrap / 2;
    if (d > half) d -= wrap;
    if (d < -half) d += wrap;
  }
  return d;
}

function normalizedPhase(value, wrap) {
  if (!Number.isFinite(value) || !Number.isFinite(wrap) || wrap <= 0) return 0;
  const unit = ((value / wrap) % 1 + 1) % 1;
  return unit - 0.5;
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

function setCanvasVisible(canvas, visible) {
  if (!canvas) return;
  canvas.style.display = visible ? 'block' : 'none';
  canvas.style.opacity = visible ? '1' : '0';
}

export class ThreeRendererBackend {
  constructor({ composer, asciiPass, gl, sourceCanvas, targetCanvas, renderQuality = 'rich' }) {
    this.name = 'three';
    this.renderQuality = renderQuality;
    this.settings = qualitySettings(renderQuality);
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
    this.layerRoot.add(this.backgroundGroup, this.fabricGroup, this.semanticGroup, this.entityGroup, this.foregroundGroup);
    this._buildWorldEntityResources();
    this.entityMeshPool = [];
    this.semanticMeshPool = [];
    this.linePool = [];
    this.entityMeshCursor = 0;
    this.semanticMeshCursor = 0;
    this.lineCursor = 0;

    this._buildBackdropLayers();
    this._buildForegroundLayers();

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
      sharedContext: true,
      canvasUploads: 0,
      pooledMeshes: 0,
      pooledLines: 0,
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
      spark: makeRadialGeometry(4, 0.36),
    };
    this.entityMaterials = createVisualMaterials();
    this.lastEntityCount = 0;
    this.lastSemanticCount = 0;
    this.lastVisualCounts = {};
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

  _updateSceneState(frameContext) {
    const state = frameContext?.three || {};
    const camX = Number.isFinite(state.camX) ? state.camX : this.lastSceneState.cameraX;
    const camY = Number.isFinite(state.camY) ? state.camY : this.lastSceneState.cameraY;
    const worldScale = Number.isFinite(state.worldScale) ? state.worldScale : this.lastSceneState.worldScale;
    const gridWindow = Number.isFinite(state.gridWindow) ? state.gridWindow : this.lastSceneState.gridWindow;
    const cameraView = Number.isFinite(state.cameraView) ? state.cameraView : (this.lastSceneState.cameraView ?? CAMERA_VIEW);
    const totalTime = Number.isFinite(state.totalTime) ? state.totalTime : 0;
    const prev = this.prevCamera || { x: camX, y: camY };
    const dCamX = wrappedDelta(camX, prev.x, worldScale);
    const dCamY = wrappedDelta(camY, prev.y, worldScale);
    this.prevCamera = { x: camX, y: camY };

    const ship = state.ship || {};
    const shipVX = Number.isFinite(ship.vx) ? ship.vx : 0;
    const shipVY = Number.isFinite(ship.vy) ? ship.vy : 0;
    const parallaxStrength = this.settings.parallaxStrength;
    const targetX = clamp((dCamX / Math.max(gridWindow, 0.001)) * 0.75 + (shipVX / Math.max(gridWindow, 0.001)) * 0.006, -0.045, 0.045);
    const targetY = clamp((-dCamY / Math.max(gridWindow, 0.001)) * 0.75 + (-shipVY / Math.max(gridWindow, 0.001)) * 0.006, -0.045, 0.045);
    this.targetMotion.set(targetX, targetY).multiplyScalar(parallaxStrength);
    this.motion.lerp(this.targetMotion, 0.22);

    const phaseX = normalizedPhase(camX, worldScale);
    const phaseY = normalizedPhase(camY, worldScale);
    this.backgroundGroup.position.x = -phaseX * 0.10 * parallaxStrength - this.motion.x * 0.65;
    this.backgroundGroup.position.y = phaseY * 0.10 * parallaxStrength - this.motion.y * 0.65;
    this.farStars.position.x = -phaseX * 0.08 * parallaxStrength;
    this.farStars.position.y = phaseY * 0.08 * parallaxStrength;
    this.nearStars.position.x = -phaseX * 0.15 * parallaxStrength - this.motion.x * 0.8;
    this.nearStars.position.y = phaseY * 0.15 * parallaxStrength - this.motion.y * 0.8;
    this.lensRing.rotation.z = totalTime * 0.015 + (this.motion.x - this.motion.y) * 1.4;
    const motionLen = this.motion.length();
    this.lensRing.material.opacity = (0.035 + clamp(motionLen * 1.1, 0, 0.055)) * (renderQualityOpacityScale(this.renderQuality));

    this._syncWorldScene(state.scene || {});
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
    const worldScale = Number.isFinite(state.worldScale) ? state.worldScale : this.lastSceneState.worldScale;
    const cameraView = Math.max(0.001, Number.isFinite(state.cameraView) ? state.cameraView : (this.lastSceneState.cameraView ?? CAMERA_VIEW));
    const dx = wrappedDelta(wx, state.camX ?? this.lastSceneState.cameraX, worldScale);
    const dy = wrappedDelta(wy, state.camY ?? this.lastSceneState.cameraY, worldScale);
    return {
      // The sim window is square; scale X into the aspect-wide orthographic
      // volume so hazards line up with the stretched fluid texture.
      x: (dx / cameraView) * 2 * this.worldCameraAspect,
      y: (-dy / cameraView) * 2,
      scale: 2 / cameraView,
    };
  }

  _isSceneVisible(point, radius = 0.04) {
    const xLimit = Math.max(1, this.worldCameraAspect || 1) + 0.25 + radius;
    return Math.abs(point.x) <= xLimit && Math.abs(point.y) <= 1.25 + radius;
  }

  _beginDynamicScene() {
    this.entityMeshCursor = 0;
    this.semanticMeshCursor = 0;
    this.lineCursor = 0;
    this.visualCounts = {};
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
    const cameraView = Math.max(0.001, Number.isFinite(state.cameraView) ? state.cameraView : (this.lastSceneState.cameraView ?? CAMERA_VIEW));
    const sceneScale = worldRadiusToSceneScale(Math.max(0.001, radius), this.worldCameraAspect, cameraView, radiusMode);
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

  _syncWorldScene(sceneState) {
    this._beginDynamicScene();
    const renderState = {
      camX: this.lastSceneState.cameraX,
      camY: this.lastSceneState.cameraY,
      worldScale: this.lastSceneState.worldScale,
      gridWindow: this.lastSceneState.gridWindow,
      cameraView: this.lastSceneState.cameraView ?? CAMERA_VIEW,
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

    for (const well of sceneState.wells || []) {
      addSemantic(this.entityGeometries.ring, this.entityMaterials.hazardRing, well.wx, well.wy, well.ringOuter || 0.1, 0, 0.01);
      addEntity(this.entityGeometries.ring, this.entityMaterials.wellRing, well.wx, well.wy, Math.max(0.07, (well.killRadius || 0.04) * 2.6), 0, 0.03);
      addEntity(this.entityGeometries.disc, this.entityMaterials.wellCore, well.wx, well.wy, Math.max(0.018, well.killRadius || 0.04), 0, 0.04);
    }
    for (const ring of sceneState.waveRings || []) {
      const life = Math.max(0, Math.min(1, (ring.amplitude || 0) / Math.max(1e-4, ring.initialAmplitude || 1)));
      if (life > 0.02) addSemantic(this.entityGeometries.ring, this.entityMaterials.wave, ring.sourceWX, ring.sourceWY, ring.radius || 0.01, 0, 0.02);
    }
    for (const star of sceneState.stars || []) {
      const radius = 0.025 + (star.mass || 1) * 0.012;
      if (this._addMesh(this.landmarkEntityGroup, this.entityGeometries.ring, this.entityMaterials.starHalo,
        star.wx, star.wy, radius * 1.85, 0, 0.055, renderState, 'screen')) {
        entityCount++;
      }
      if (this._addMesh(this.landmarkEntityGroup, this.entityGeometries.disc, this.entityMaterials.star,
        star.wx, star.wy, radius * 0.45, 0, 0.066, renderState, 'screen')) {
        entityCount++;
      }
      addReadable(this.landmarkEntityGroup, this.entityGeometries.spark, this.entityMaterials.star,
        star.wx, star.wy, radius, 0, 0.07,
        { haloMaterial: this.entityMaterials.starHalo, haloRadius: 1.55, rimRadius: 1.08, matteRadius: 1.7, matteY: 1.0 },
        'screen');
    }
    for (const portal of sceneState.portals || []) {
      const isRift = portal.type === 'rift';
      const material = isRift ? this.entityMaterials.riftPortal : this.entityMaterials.portal;
      const halo = isRift ? this.entityMaterials.riftPortalHalo : this.entityMaterials.portalHalo;
      addReadable(this.landmarkEntityGroup, this.entityGeometries.ring, material,
        portal.wx, portal.wy, portal.radius || 0.08, 0, 0.08,
        { haloMaterial: halo, haloRadius: 1.55, rimRadius: 1.10, matteRadius: 1.25, matteY: 1.0, matteOpacity: 'heavy' });
    }
    for (const wreck of sceneState.wrecks || []) {
      const size = wreck.size === 'large' ? 0.035 : wreck.size === 'small' || wreck.size === 'scattered' ? 0.018 : 0.026;
      const material = wreck.looted ? this.entityMaterials.lootedWreck : this.entityMaterials.wreck;
      const halo = wreck.looted ? this.entityMaterials.lootedWreckHalo : this.entityMaterials.wreckHalo;
      addReadable(this.salvageEntityGroup, this.entityGeometries.square, material,
        wreck.wx, wreck.wy, size, Math.PI * 0.25, 0.07,
        { haloMaterial: halo, haloRadius: 1.45, rimRadius: 1.10, matteRadius: 2.25, matteY: 0.82, matteOpacity: 'heavy' },
        'screen');
    }
    for (const planetoid of sceneState.planetoids || []) {
      const angle = Math.atan2(-(planetoid.vy || 0), planetoid.vx || 0);
      addReadable(this.landmarkEntityGroup, this.entityGeometries.triangle, this.entityMaterials.planetoid,
        planetoid.wx, planetoid.wy, 0.022, angle, 0.09,
        { haloMaterial: this.entityMaterials.planetoidHalo, haloRadius: 1.55, rimRadius: 1.12, matteRadius: 1.7 },
        'screen');
    }
    for (const scav of sceneState.scavengers || []) {
      addReadable(this.activeEntityGroup, this.entityGeometries.triangle, this.entityMaterials.scavenger,
        scav.wx, scav.wy, 0.027, -(scav.facing || 0), 0.12,
        { haloMaterial: this.entityMaterials.scavengerHalo, rimMaterial: this.entityMaterials.scavengerHalo, matteRadius: 1.95 },
        'screen');
    }
    for (const player of sceneState.remotePlayers || []) {
      if (player.status === 'dead') continue;
      const angle = Math.atan2(-(player.vy || 0), player.vx || 0);
      addReadable(this.activeEntityGroup, this.entityGeometries.triangle, this.entityMaterials.remoteShip,
        player.wx, player.wy, 0.030, angle, 0.13,
        { haloMaterial: this.entityMaterials.remoteShipHalo, rimMaterial: this.entityMaterials.remoteShipHalo, matteRadius: 2.0 },
        'screen');
    }
    for (const fauna of sceneState.fauna || []) {
      addReadable(this.activeEntityGroup, this.entityGeometries.disc, this.entityMaterials.fauna,
        fauna.wx, fauna.wy, 0.008 + (fauna.size || 2) * 0.003, 0, 0.10,
        { haloMaterial: this.entityMaterials.faunaHalo, haloRadius: 2.0, matteRadius: 1.9, matteY: 1.0 },
        'screen');
    }
    for (const sentry of sceneState.sentries || []) {
      addReadable(this.activeEntityGroup, this.entityGeometries.disc, this.entityMaterials.sentry,
        sentry.wx, sentry.wy, 0.014, 0, 0.11,
        { haloMaterial: this.entityMaterials.sentryHalo, haloRadius: 2.2, matteRadius: 2.0, matteY: 1.0 },
        'screen');
    }

    const ship = sceneState.ship;
    if (ship) {
      addReadable(this.activeEntityGroup, this.entityGeometries.triangle, this.entityMaterials.ship,
        ship.wx, ship.wy, 0.034, -(ship.facing || 0), 0.16,
        { haloMaterial: this.entityMaterials.shipHalo, rimMaterial: this.entityMaterials.shipRim, haloRadius: 1.70, rimRadius: 1.18, matteRadius: 2.1 },
        'screen');
    }

    const sling = sceneState.slingshot || {};
    const slingAnchor = sling.engaged || sling.affordance;
    if (slingAnchor) {
      addSemantic(this.entityGeometries.ring, this.entityMaterials.surfRing, slingAnchor.wx, slingAnchor.wy, slingAnchor.range || 0.1, 0, 0.13);
      if (sling.engaged && ship) {
        if (this._addLine(this.entityGroup, ship.wx, ship.wy, slingAnchor.wx, slingAnchor.wy, this.entityMaterials.tether, renderState)) {
          entityCount++;
        }
      }
    }

    this.lastEntityCount = entityCount;
    this.lastSemanticCount = semanticCount;
    this.lastVisualCounts = { ...this.visualCounts };
  }

  render(frameContext) {
    // Composer owns the ASCII/fabric source frame on the shared canvas. Three
    // then adds transparent world-scene layers without CPU readback/upload.
    this.composer.render(frameContext);
    this.renderer.resetState();

    this._updateSceneState(frameContext);
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
      sharedContext: true,
      canvasUploads: 0,
      pooledMeshes: this.entityMeshPool.length + this.semanticMeshPool.length,
      pooledLines: this.linePool.length,
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
      three: {
        passNames: this.passNames.slice(),
        ...this.lastThreeStats,
      },
    };
  }

  dispose() {
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
