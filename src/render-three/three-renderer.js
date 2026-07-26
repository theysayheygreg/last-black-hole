// Shared-context Three backend and sole frame orchestrator.

import * as THREE from '../../node_modules/three/build/three.module.js';
import { resolvePresentationFrame } from '../presentation/presentation-frame.js';
import { resolvePresentationQuality } from '../presentation/presentation-style.js';
import { RENDER_PLAN_DESCRIPTOR, RENDER_PLAN_PASS_IDS } from './render-plan.js';
import { WorldScenePresentation } from './world-scene-presentation.js';

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

    this.worldPresentation = new WorldScenePresentation({ renderQuality });
    this.worldPresentation.resize(sourceCanvas.width, sourceCanvas.height);
    this.screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postScene = new THREE.Scene();
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
        u_motion: { value: this.worldPresentation.motion },
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
    const initialWorldStats = this.worldPresentation.getStats();
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
        spriteCoreCount: 0,
        genericSpritePartCount: 0,
        wellDebugPrimitiveCount: 0,
        stateVfxCount: 0,
        opacityEntityCount: 0,
      },
      sharedContext: true,
      canvasUploads: 0,
      pooledMeshes: 0,
      pooledLines: 0,
      entityAssets: initialWorldStats.entityAssets,
      vfx: initialWorldStats.vfx,
    };
    this._applyCanvasMode();
    this._installContextHandlers();
  }

  _createTarget(width, height) {
    const target = new THREE.WebGLRenderTarget(width, height, {
      depthBuffer: true,
      stencilBuffer: false,
      format: THREE.RGBAFormat,
      // Byte-backed targets keep Chrome/headless coverage predictable.
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
    // Three shares the Composer WebGL2 context; the legacy canvas stays hidden.
    if (this.sourceCanvas) {
      this.sourceCanvas.style.display = 'block';
      this.sourceCanvas.style.opacity = '1';
      this.sourceCanvas.style.pointerEvents = 'none';
    }
    setCanvasVisible(this.legacyCanvas, false);
    if (this.targetCanvas) this.targetCanvas.style.pointerEvents = 'none';
  }

  _installContextHandlers() {
    this.onContextLost = (event) => {
      event.preventDefault();
      console.warn('[render-three] WebGL context lost');
    };
    this.onContextRestored = () => {
      console.warn('[render-three] WebGL context restored');
      this.renderer.setSize(this.sourceCanvas.width, this.sourceCanvas.height, false);
      this.worldPresentation.resize(this.sourceCanvas.width, this.sourceCanvas.height);
    };
    this.sourceCanvas.addEventListener('webglcontextlost', this.onContextLost);
    this.sourceCanvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  resize(width, height) {
    this.composer.resize(width, height);
    this.renderer.setSize(width, height, false);
    this.sceneTarget.setSize(width, height);
    this.worldPresentation.resize(width, height);
  }

  _applyPresentationStyle(style = {}) {
    this.settings = resolvePresentationQuality(style.qualityTier || this.renderQuality);
    this.copyMaterial.uniforms.u_scanlineIntensity.value = this.settings.scanlineIntensity;
    this.copyMaterial.uniforms.u_vignette.value = this.settings.vignette;
    this.copyMaterial.uniforms.u_motionWarp.value = this.settings.motionWarp;
    this.copyMaterial.uniforms.u_chromaticMotion.value = this.settings.chromaticMotion;
    this.copyMaterial.uniforms.u_entityGain.value = this.settings.entityGain;
    this.copyMaterial.uniforms.u_entityGamma.value = this.settings.entityGamma;
  }

  render(frameContext) {
    // Composer resolves the fabric first; Three overlays the world without readback.
    this.composer.render(frameContext);
    this.renderer.resetState();

    const presentationFrame = resolvePresentationFrame(frameContext, { qualityTier: this.renderQuality });
    this._applyPresentationStyle(presentationFrame.style);
    const diagnosticView = this.getViewMode() === 'scene';
    this.worldPresentation.update(presentationFrame, {
      diagnosticView,
      viewportWidth: this.sourceCanvas?.width || 1280,
      viewportHeight: this.sourceCanvas?.height || 800,
    });
    this.renderer.info.reset();
    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear(true, true, false);
    this.renderer.render(this.worldPresentation.scene, this.worldPresentation.camera);

    this.copyMaterial.uniforms.u_input.value = this.sceneTarget.texture;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.screenCamera);
    const worldStats = this.worldPresentation.getStats();
    this.lastThreeStats = {
      // Shared-context scenes can under-report; the pass graph still submits both passes.
      calls: Math.max(this.renderer.info.render.calls, this.passNames.length),
      triangles: Math.max(this.renderer.info.render.triangles, 4),
      points: this.renderer.info.render.points,
      lines: this.renderer.info.render.lines,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      renderTargets: 1,
      passesSubmitted: 2,
      sceneKind: 'top-down-3d',
      ...worldStats,
      presentation: {
        version: presentationFrame.version,
        phase: presentationFrame.phase,
        qualityTier: presentationFrame.style.qualityTier,
        paletteId: presentationFrame.style.paletteId,
        eventCount: presentationFrame.events.length,
      },
      sharedContext: true,
      canvasUploads: 0,
    };
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
    return {
      backend: this.name,
      renderQuality: this.renderQuality,
      passCount: this.passNames.length,
      composerPasses: this.composer?.passes?.map((pass) => pass.name) || [],
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
    this.sourceCanvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.sourceCanvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.worldPresentation.dispose();
    this.sceneTarget.dispose();
    this._disposeObject(this.postScene);
    this.renderer.dispose();
  }

  _disposeObject(obj) {
    const geometries = new Set();
    const materials = new Set();
    obj.traverse?.((child) => {
      if (child.geometry) geometries.add(child.geometry);
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of mats) if (material) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }
}
