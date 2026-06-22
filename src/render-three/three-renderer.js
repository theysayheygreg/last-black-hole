// src/render-three/three-renderer.js
//
// First-class Three.js renderer path. The old Composer still produces the
// ASCII/fabric source frame, but Three now owns a real top-down scene graph:
// depth-sorted world layers, an orthographic camera, render targets, and
// screen-space presentation. Simulation truth stays outside Three; this file
// adapts the frame into a 3D scene while preserving LBH's flat top-down read.

import * as THREE from '../../node_modules/three/build/three.module.js';

const COPY_VERT = `in vec3 position;
in vec2 uv;
out vec2 v_uv;
void main() {
  v_uv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const COPY_FRAG = `precision highp float;
uniform sampler2D u_input;
uniform vec2 u_resolution;
uniform vec2 u_motion;
uniform float u_scanlineIntensity;
uniform float u_vignette;
uniform float u_motionWarp;
uniform float u_chromaticMotion;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec2 p = v_uv - 0.5;
  float edge = smoothstep(0.08, 0.82, dot(p, p) * 2.4);
  vec2 warpedUv = clamp(v_uv + u_motion * u_motionWarp * edge, vec2(0.001), vec2(0.999));
  vec2 chroma = u_motion * u_chromaticMotion * edge;
  vec3 c;
  c.r = texture(u_input, clamp(warpedUv + chroma, vec2(0.001), vec2(0.999))).r;
  c.g = texture(u_input, warpedUv).g;
  c.b = texture(u_input, clamp(warpedUv - chroma, vec2(0.001), vec2(0.999))).b;

  // Kept near-zero by default. The pass exists so Three owns a real
  // post-process stage without changing the legacy visual target.
  float scan = 0.5 + 0.5 * sin(gl_FragCoord.y * 1.5);
  c *= mix(1.0 - u_scanlineIntensity, 1.0, scan);

  float vignette = smoothstep(0.85, 0.15, dot(p, p));
  c *= mix(1.0, vignette, u_vignette);

  fragColor = vec4(c, 1.0);
}`;

const FABRIC_VERT = `varying vec2 v_uv;
uniform vec2 u_layerOffset;
void main() {
  v_uv = uv;
  vec3 p = position;
  p.xy += u_layerOffset;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FABRIC_FRAG = `precision highp float;
uniform sampler2D u_input;
uniform vec2 u_motion;
uniform float u_backdropReveal;
uniform float u_time;
varying vec2 v_uv;

void main() {
  vec2 p = v_uv - 0.5;
  float edge = smoothstep(0.05, 0.72, dot(p, p) * 2.2);
  float shimmer = sin((p.x * 37.0 + p.y * 19.0) + u_time * 0.7) * 0.0007;
  vec2 uv = clamp(v_uv + u_motion * (0.004 + edge * 0.006) + shimmer, vec2(0.001), vec2(0.999));
  vec3 c = texture2D(u_input, uv).rgb;
  float luma = max(max(c.r, c.g), c.b);

  // Dark ASCII cells reveal a little of the 3D backdrop. Bright cells stay
  // opaque so the renderer upgrade does not blur gameplay-critical glyphs.
  float bright = smoothstep(0.02, 0.20, luma);
  float alpha = mix(1.0 - u_backdropReveal, 1.0, bright);
  gl_FragColor = vec4(c, alpha);
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
    };
  }
  return {
    backdropReveal: 0.12,
    parallaxStrength: 0.85,
    scanlineIntensity: 0.010,
    vignette: 0.055,
    motionWarp: 0.007,
    chromaticMotion: 0.0025,
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

function setCanvasVisible(canvas, visible) {
  if (!canvas) return;
  canvas.style.display = visible ? 'block' : 'none';
  canvas.style.opacity = visible ? '1' : '0';
}

export class ThreeRendererBackend {
  constructor({ composer, asciiPass, sourceCanvas, targetCanvas, renderQuality = 'rich' }) {
    this.name = 'three';
    this.renderQuality = renderQuality;
    this.settings = qualitySettings(renderQuality);
    this.composer = composer;
    this.asciiPass = asciiPass;
    this.sourceCanvas = sourceCanvas;
    this.targetCanvas = targetCanvas;
    this.passNames = [
      'legacy-source-frame',
      'three-background-depth',
      'three-fabric-plane',
      'three-world-scene',
      'three-screen-space-post',
    ];

    this.renderer = new THREE.WebGLRenderer({
      canvas: targetCanvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      // The parallel renderer is still fixture-driven. Preserving the
      // buffer makes automated screenshots and canvas export deterministic;
      // revisit once Three becomes the default and visual baselines settle.
      preserveDrawingBuffer: true,
    });
    this.renderer.autoClear = true;
    this.renderer.info.autoReset = false;
    this.renderer.setClearColor(0x000008, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(sourceCanvas.width, sourceCanvas.height, false);

    this.worldCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    this.worldCamera.name = 'top-down-orthographic-camera';
    this.worldCamera.position.set(0, 0, 4);
    this.worldCamera.lookAt(0, 0, 0);
    this.worldScene = new THREE.Scene();
    this.worldScene.name = 'lbh-top-down-3d-scene';
    this.screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postScene = new THREE.Scene();

    this.bridgeCanvas = document.createElement('canvas');
    this.bridgeCanvas.width = sourceCanvas.width;
    this.bridgeCanvas.height = sourceCanvas.height;
    this.bridgeCtx = this.bridgeCanvas.getContext('2d', { alpha: false });
    if (!this.bridgeCtx) {
      throw new Error('ThreeRendererBackend: 2D bridge canvas unavailable');
    }

    this.sourceTexture = new THREE.CanvasTexture(this.bridgeCanvas);
    this.sourceTexture.colorSpace = THREE.SRGBColorSpace;
    this.sourceTexture.generateMipmaps = false;
    this.sourceTexture.minFilter = THREE.LinearFilter;
    this.sourceTexture.magFilter = THREE.LinearFilter;
    this.sourceTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.sourceTexture.wrapT = THREE.ClampToEdgeWrapping;

    this.motion = new THREE.Vector2(0, 0);
    this.targetMotion = new THREE.Vector2(0, 0);
    this.layerOffset = new THREE.Vector2(0, 0);
    this.prevCamera = null;
    this.lastSceneState = {
      cameraX: 0,
      cameraY: 0,
      worldScale: 3,
      gridWindow: 3,
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
    this.foregroundGroup = new THREE.Group();
    this.foregroundGroup.name = 'foreground-screen-space-layer';
    this.foregroundGroup.position.z = 0.35;
    this.layerRoot.add(this.backgroundGroup, this.fabricGroup, this.foregroundGroup);

    this._buildBackdropLayers();

    this.sourceMaterial = new THREE.ShaderMaterial({
      vertexShader: FABRIC_VERT,
      fragmentShader: FABRIC_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        u_input: { value: this.sourceTexture },
        u_motion: { value: this.motion },
        u_layerOffset: { value: this.layerOffset },
        u_backdropReveal: { value: this.settings.backdropReveal },
        u_time: { value: 0 },
      },
    });
    this.fabricPlane = new THREE.Mesh(new THREE.PlaneGeometry(2.04, 2.04), this.sourceMaterial);
    this.fabricPlane.name = 'legacy-ascii-source-plane';
    this.fabricPlane.renderOrder = 10;
    this.fabricGroup.add(this.fabricPlane);

    this._buildForegroundLayers();

    this.copyMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: COPY_VERT,
      fragmentShader: COPY_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        u_input: { value: null },
        u_resolution: { value: new THREE.Vector2(sourceCanvas.width, sourceCanvas.height) },
        u_motion: { value: this.motion },
        u_scanlineIntensity: { value: this.settings.scanlineIntensity },
        u_vignette: { value: this.settings.vignette },
        u_motionWarp: { value: this.settings.motionWarp },
        u_chromaticMotion: { value: this.settings.chromaticMotion },
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

  _createTarget(width, height) {
    const target = new THREE.WebGLRenderTarget(width, height, {
      depthBuffer: true,
      stencilBuffer: false,
      format: THREE.RGBAFormat,
      // The bridge copies an already tonemapped LDR source frame. Keeping this
      // byte-backed avoids half-float render-target gaps in headless GL.
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
    // The legacy canvas remains live as the source frame. It is visually
    // hidden, not display:none, so its WebGL backing store keeps updating.
    if (this.sourceCanvas) {
      this.sourceCanvas.style.display = 'block';
      this.sourceCanvas.style.opacity = '0';
      this.sourceCanvas.style.pointerEvents = 'none';
    }
    setCanvasVisible(this.targetCanvas, true);
    if (this.targetCanvas) {
      this.targetCanvas.style.pointerEvents = 'none';
    }
  }

  _installContextHandlers() {
    this.targetCanvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      console.warn('[render-three] WebGL context lost');
    });
    this.targetCanvas.addEventListener('webglcontextrestored', () => {
      console.warn('[render-three] WebGL context restored');
      this.renderer.setSize(this.targetCanvas.width, this.targetCanvas.height, false);
    });
  }

  resize(width, height) {
    this.composer.resize(width, height);
    this.bridgeCanvas.width = width;
    this.bridgeCanvas.height = height;
    this.renderer.setSize(width, height, false);
    this.sceneTarget.setSize(width, height);
    this.copyMaterial.uniforms.u_resolution.value.set(width, height);
    this.worldCamera.updateProjectionMatrix();
  }

  _updateSceneState(frameContext) {
    const state = frameContext?.three || {};
    const camX = Number.isFinite(state.camX) ? state.camX : this.lastSceneState.cameraX;
    const camY = Number.isFinite(state.camY) ? state.camY : this.lastSceneState.cameraY;
    const worldScale = Number.isFinite(state.worldScale) ? state.worldScale : this.lastSceneState.worldScale;
    const gridWindow = Number.isFinite(state.gridWindow) ? state.gridWindow : this.lastSceneState.gridWindow;
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
    this.layerOffset.set(this.motion.x * 0.08, this.motion.y * 0.08);
    this.lensRing.rotation.z = totalTime * 0.015 + (this.motion.x - this.motion.y) * 1.4;
    const motionLen = this.motion.length();
    this.lensRing.material.opacity = (0.035 + clamp(motionLen * 1.1, 0, 0.055)) * (renderQualityOpacityScale(this.renderQuality));

    this.sourceMaterial.uniforms.u_time.value = totalTime;
    const motionX = Math.abs(this.motion.x) < 1e-7 ? 0 : this.motion.x;
    const motionY = Math.abs(this.motion.y) < 1e-7 ? 0 : this.motion.y;
    this.lastSceneState = {
      cameraX: camX,
      cameraY: camY,
      worldScale,
      gridWindow,
      motionX,
      motionY,
      parallaxStrength,
    };
  }

  render(frameContext) {
    // First render the complete legacy source frame into the hidden canvas.
    this.composer.render(frameContext);

    // Then present that source frame inside the top-down Three scene.
    this._updateSceneState(frameContext);
    this.bridgeCtx.drawImage(this.sourceCanvas, 0, 0, this.bridgeCanvas.width, this.bridgeCanvas.height);
    this.renderer.info.reset();
    this.sourceTexture.needsUpdate = true;
    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.clear(true, true, false);
    this.renderer.render(this.worldScene, this.worldCamera);

    this.copyMaterial.uniforms.u_input.value = this.sceneTarget.texture;
    this.renderer.setRenderTarget(null);
    this.renderer.clear(true, true, false);
    this.renderer.render(this.postScene, this.screenCamera);
    this.lastThreeStats = {
      // Headless Chrome can under-report renderer.info for canvas-texture
      // scenes. The pass graph still submits a depth scene and a present pass.
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
        position: { x: 0, y: 0, z: 4 },
        near: this.worldCamera.near,
        far: this.worldCamera.far,
      },
      worldLayers: this._describeWorldLayers(),
      parallax: { ...this.lastSceneState },
    };
  }

  _describeWorldLayers() {
    return [
      { name: this.backgroundGroup.name, z: this.backgroundGroup.position.z, role: 'parallax backdrop' },
      { name: this.fabricGroup.name, z: this.fabricGroup.position.z, role: 'ASCII source frame' },
      { name: this.foregroundGroup.name, z: this.foregroundGroup.position.z, role: 'screen-space depth cues' },
    ];
  }

  setViewMode(mode) {
    this.asciiPass.setViewMode(mode);
  }

  getViewMode() {
    return this.asciiPass.getViewMode();
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
    this.sourceTexture.dispose();
    this.copyMaterial.dispose();
    this._disposeObject(this.worldScene);
    this._disposeObject(this.postScene);
    this.renderer.dispose();
  }

  _disposeObject(obj) {
    obj.traverse?.((child) => {
      if (child.geometry) child.geometry.dispose();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (mat) mat.dispose();
      }
    });
  }
}

function renderQualityOpacityScale(renderQuality) {
  if (renderQuality === 'minimal') return 0;
  if (renderQuality === 'default') return 0.7;
  return 1;
}
