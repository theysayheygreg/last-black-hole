/**
 * ascii-renderer.js — ASCII dithering post-process shader.
 *
 * Layer 0 of the rendering pipeline:
 *   Fluid FBO -> display shader -> scene FBO -> ASCII post-process -> screen
 *
 * The fluid sim's color output is divided into character cells.
 * Each cell's luminance maps to a glyph from a pre-generated font atlas.
 * The glyph is tinted by the fluid color at that cell.
 *
 * This IS the product (Pillar 1: Art Is Product).
 */

import { CONFIG } from './config.js';
import { FRAG_ASCII, CHARS_PER_RAMP, generateFontAtlas } from './render/shaders/ascii.glsl.js';

// ---- Shaders ----

const VERT_QUAD = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAG_SCENE = `#version 300 es
precision highp float;

uniform sampler2D u_scene;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  fragColor = texture(u_scene, v_uv);
}`;

// FRAG_ASCII + RAMPS + generateFontAtlas live in src/render/shaders/ascii.glsl.js
// so the new multi-pass Composer (src/render/composer.js) and this legacy
// renderer share one source of truth.

// ---- ASCII Renderer Class ----

export class ASCIIRenderer {
  constructor(gl) {
    this.gl = gl;
    this._initShader();
    this._initFontAtlas();
    this._initSceneFBO();
    this.viewMode = 'ascii';
  }

  _initShader() {
    const gl = this.gl;

    // Compile vertex shader
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, VERT_QUAD);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      console.error('ASCII vert shader error:', gl.getShaderInfoLog(vs));
    }

    // Compile fragment shader
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, FRAG_ASCII);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error('ASCII frag shader error:', gl.getShaderInfoLog(fs));
    }

    // Link program
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'a_position');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('ASCII program link error:', gl.getProgramInfoLog(prog));
    }

    // Cache uniforms
    this.program = prog;
    this.uniforms = {};
    const numUniforms = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < numUniforms; i++) {
      const info = gl.getActiveUniform(prog, i);
      this.uniforms[info.name] = gl.getUniformLocation(prog, info.name);
    }

    // Fullscreen quad VAO (shares vertex layout with fluid shaders)
    const quadVerts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    this.quadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.quadVAO);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const fsScene = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fsScene, FRAG_SCENE);
    gl.compileShader(fsScene);
    if (!gl.getShaderParameter(fsScene, gl.COMPILE_STATUS)) {
      console.error('Scene frag shader error:', gl.getShaderInfoLog(fsScene));
    }

    const sceneProg = gl.createProgram();
    gl.attachShader(sceneProg, vs);
    gl.attachShader(sceneProg, fsScene);
    gl.bindAttribLocation(sceneProg, 0, 'a_position');
    gl.linkProgram(sceneProg);
    if (!gl.getProgramParameter(sceneProg, gl.LINK_STATUS)) {
      console.error('Scene program link error:', gl.getProgramInfoLog(sceneProg));
    }

    this.sceneProgram = sceneProg;
    this.sceneUniforms = {
      u_scene: gl.getUniformLocation(sceneProg, 'u_scene'),
    };
  }

  _initFontAtlas() {
    const gl = this.gl;
    const atlasCanvas = generateFontAtlas();

    this.fontAtlasTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.fontAtlasTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.numChars = CHARS_PER_RAMP;
  }

  /**
   * Create a full-resolution FBO that the fluid display pass renders into,
   * so the ASCII shader can read it as a texture.
   */
  _initSceneFBO() {
    const gl = this.gl;
    const w = gl.canvas.width;
    const h = gl.canvas.height;

    this.sceneTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.sceneFBO = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.sceneWidth = w;
    this.sceneHeight = h;
  }

  /**
   * Returns the scene FBO target object that fluid.render() can blit into.
   * Matches the {fbo, tex, w, h} shape that FluidSim._blit() expects.
   */
  getSceneTarget() {
    return {
      fbo: this.sceneFBO,
      tex: this.sceneTex,
      w: this.sceneWidth,
      h: this.sceneHeight,
    };
  }

  /**
   * Handle window resize — recreate the scene FBO at the new resolution.
   */
  resize(w, h) {
    if (w === this.sceneWidth && h === this.sceneHeight) return;
    const gl = this.gl;

    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    this.sceneWidth = w;
    this.sceneHeight = h;
  }

  setViewMode(mode = 'ascii') {
    this.viewMode = mode === 'scene' ? 'scene' : 'ascii';
  }

  getViewMode() {
    return this.viewMode;
  }

  /**
   * Run the ASCII post-process pass.
   * Call this AFTER fluid.render(sceneTarget, ...) has filled the scene FBO.
   * Renders the ASCII result to the screen (framebuffer null).
   */
  render(totalTime = 0, camOffsetU = 0.5, camOffsetV = 0.5, worldScale = 1.0, velocityTex = null, glitchIntensity = 0) {
    const gl = this.gl;
    const ascii = CONFIG.ascii;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    if (this.viewMode === 'scene') {
      gl.useProgram(this.sceneProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.uniform1i(this.sceneUniforms['u_scene'], 0);
      gl.bindVertexArray(this.quadVAO);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      return;
    }

    gl.useProgram(this.program);

    // Bind scene color texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.uniform1i(this.uniforms['u_scene'], 0);

    // Bind font atlas
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fontAtlasTex);
    gl.uniform1i(this.uniforms['u_fontAtlas'], 1);

    // Bind velocity texture for directional character selection
    if (velocityTex) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, velocityTex);
      gl.uniform1i(this.uniforms['u_velocity'], 2);
    }

    // Set uniforms
    gl.uniform2f(this.uniforms['u_resolution'], gl.canvas.width, gl.canvas.height);
    gl.uniform1f(this.uniforms['u_cellSize'], ascii.cellSize);
    gl.uniform1f(this.uniforms['u_contrast'], ascii.contrast);
    gl.uniform1f(this.uniforms['u_numChars'], this.numChars);
    gl.uniform1f(this.uniforms['u_cellAspect'], ascii.cellAspect);
    gl.uniform1f(this.uniforms['u_time'], totalTime);
    gl.uniform1f(this.uniforms['u_shimmer'], ascii.shimmer);
    gl.uniform2f(this.uniforms['u_camOffset'], camOffsetU, camOffsetV);
    gl.uniform1f(this.uniforms['u_worldScale'], worldScale);
    gl.uniform1f(this.uniforms['u_dirThreshold'], ascii.dirThreshold ?? 0.01);
    gl.uniform1f(this.uniforms['u_glitchIntensity'], glitchIntensity);

    // Draw fullscreen quad
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }
}
