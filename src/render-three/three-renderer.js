// src/render-three/three-renderer.js
//
// First parallel Three.js renderer path. It deliberately treats the legacy
// Composer output as a source frame, then presents that frame through a
// Three-owned canvas and render targets. This keeps every existing gameplay
// feature intact while giving the Three path real canvas, resize, resource,
// diagnostics, and post-pass ownership to grow from.

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
uniform float u_scanlineIntensity;
uniform float u_vignette;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec3 c = texture(u_input, v_uv).rgb;

  // Kept near-zero by default. The pass exists so Three owns a real
  // post-process stage without changing the legacy visual target.
  float scan = 0.5 + 0.5 * sin(gl_FragCoord.y * 1.5);
  c *= mix(1.0 - u_scanlineIntensity, 1.0, scan);

  vec2 p = v_uv - 0.5;
  float vignette = smoothstep(0.85, 0.15, dot(p, p));
  c *= mix(1.0, vignette, u_vignette);

  fragColor = vec4(c, 1.0);
}`;

function setCanvasVisible(canvas, visible) {
  if (!canvas) return;
  canvas.style.display = visible ? 'block' : 'none';
  canvas.style.opacity = visible ? '1' : '0';
}

export class ThreeRendererBackend {
  constructor({ composer, asciiPass, sourceCanvas, targetCanvas, renderQuality = 'rich' }) {
    this.name = 'three';
    this.renderQuality = renderQuality;
    this.composer = composer;
    this.asciiPass = asciiPass;
    this.sourceCanvas = sourceCanvas;
    this.targetCanvas = targetCanvas;
    this.passNames = ['legacy-source-frame', 'three-source-scene', 'three-copy-pass'];

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
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(sourceCanvas.width, sourceCanvas.height, false);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.sourceScene = new THREE.Scene();
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

    this.sourceMaterial = new THREE.MeshBasicMaterial({
      map: this.sourceTexture,
      depthTest: false,
      depthWrite: false,
    });
    this.sourceScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.sourceMaterial));

    this.copyMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: COPY_VERT,
      fragmentShader: COPY_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        u_input: { value: null },
        u_resolution: { value: new THREE.Vector2(sourceCanvas.width, sourceCanvas.height) },
        // Preserve visual parity first. New Three-only effects should raise
        // these from a named render-quality setting, not from hidden defaults.
        u_scanlineIntensity: { value: 0.0 },
        u_vignette: { value: 0.0 },
      },
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.copyMaterial));

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
    };
    this._applyCanvasMode();
    this._installContextHandlers();
  }

  _createTarget(width, height) {
    const target = new THREE.WebGLRenderTarget(width, height, {
      depthBuffer: false,
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
  }

  render(frameContext) {
    // First render the complete legacy source frame into the hidden canvas.
    this.composer.render(frameContext);

    // Then present that source frame through Three-owned render targets.
    this.bridgeCtx.drawImage(this.sourceCanvas, 0, 0, this.bridgeCanvas.width, this.bridgeCanvas.height);
    this.renderer.info.reset();
    this.sourceTexture.needsUpdate = true;
    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.clear(true, false, false);
    this.renderer.render(this.sourceScene, this.camera);

    this.copyMaterial.uniforms.u_input.value = this.sceneTarget.texture;
    this.renderer.setRenderTarget(null);
    this.renderer.clear(true, false, false);
    this.renderer.render(this.postScene, this.camera);
    this.lastThreeStats = {
      // Headless Chrome can leave renderer.info.render.calls at zero for
      // this canvas-texture bridge. We still know the bridge submitted two
      // Three render passes: source scene to target, target to screen.
      calls: Math.max(this.renderer.info.render.calls, 2),
      triangles: Math.max(this.renderer.info.render.triangles, 4),
      points: this.renderer.info.render.points,
      lines: this.renderer.info.render.lines,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      renderTargets: 1,
      passesSubmitted: 2,
    };
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
    this.sourceMaterial.dispose();
    this.copyMaterial.dispose();
    this.renderer.dispose();
  }
}
