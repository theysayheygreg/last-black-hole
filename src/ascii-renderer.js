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

// ---- Shaders ----

const VERT_QUAD = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = vec2(a_position.x * 0.5 + 0.5, 0.5 - a_position.y * 0.5);
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

// ASCII post-process fragment shader
// Reads the scene color FBO, divides into character cells,
// looks up a glyph from the font atlas based on luminance,
// and tints it with the scene color.
const FRAG_ASCII = `#version 300 es
precision highp float;

uniform sampler2D u_scene;      // fluid display color FBO
uniform sampler2D u_fontAtlas;  // pre-generated glyph atlas
uniform vec2 u_resolution;     // screen resolution in pixels
uniform float u_cellSize;      // character cell width in pixels
uniform float u_contrast;      // luminance mapping curve power
uniform float u_numChars;      // number of characters in the density ramp
uniform float u_cellAspect;    // cell height / cell width (e.g. 1.5 for 8x12)

in vec2 v_uv;
out vec4 fragColor;

void main() {
  // Cell dimensions in pixels
  float cellW = u_cellSize;
  float cellH = u_cellSize * u_cellAspect;

  // Grid position: which cell are we in?
  vec2 pixelPos = v_uv * u_resolution;
  vec2 cellIndex = floor(pixelPos / vec2(cellW, cellH));
  vec2 cellUV = fract(pixelPos / vec2(cellW, cellH));

  // Sample scene color at cell center (not at pixel position — one sample per cell)
  vec2 cellCenter = (cellIndex + 0.5) * vec2(cellW, cellH) / u_resolution;
  vec4 sceneColor = texture(u_scene, cellCenter);

  // Luminance — perceptual weights
  float lum = dot(sceneColor.rgb, vec3(0.299, 0.587, 0.114));

  // Apply contrast curve to spread the character range
  lum = pow(clamp(lum, 0.0, 1.0), u_contrast);

  // Map luminance to character index (0 = sparse, N-1 = dense)
  float charIndex = floor(lum * (u_numChars - 0.001));
  charIndex = clamp(charIndex, 0.0, u_numChars - 1.0);

  // Atlas lookup: 16x16 grid, character at (col, row)
  float atlasCol = mod(charIndex, 16.0);
  float atlasRow = floor(charIndex / 16.0);

  // UV within the atlas cell — flip Y because canvas Y is inverted vs GL
  vec2 atlasUV = vec2(
    (atlasCol + cellUV.x) / 16.0,
    (atlasRow + (1.0 - cellUV.y)) / 16.0
  );

  float glyphAlpha = texture(u_fontAtlas, atlasUV).r;

  // Boost scene color slightly so dark areas still show faint characters
  vec3 tintColor = sceneColor.rgb + vec3(0.03, 0.04, 0.06);

  // Darken the background between characters for contrast
  vec3 bgColor = sceneColor.rgb * 0.08;

  vec3 finalColor = mix(bgColor, tintColor, glyphAlpha);

  fragColor = vec4(finalColor, 1.0);
}`;

// ---- Font Atlas Generation ----

// Characters sorted by visual weight (sparse -> dense)
const DENSITY_RAMP = ' .`\':;-~=+*!?/%#&$@';

/**
 * Generate a 1024x1024 font atlas texture.
 * 16x16 grid = 64x64px per glyph cell.
 * White glyphs on transparent background.
 * Returns an HTMLCanvasElement ready for GPU upload.
 */
function generateFontAtlas() {
  const atlasSize = 1024;
  const gridSize = 16;
  const cellSize = atlasSize / gridSize; // 64px

  const canvas = document.createElement('canvas');
  canvas.width = atlasSize;
  canvas.height = atlasSize;
  const ctx = canvas.getContext('2d');

  // Clear to black (will be read as 0 alpha)
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, atlasSize, atlasSize);

  // Draw each glyph
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Use a monospace font, sized to fill the cell well
  ctx.font = `${Math.floor(cellSize * 0.85)}px monospace`;

  for (let i = 0; i < DENSITY_RAMP.length; i++) {
    const col = i % gridSize;
    const row = Math.floor(i / gridSize);
    const cx = col * cellSize + cellSize / 2;
    const cy = row * cellSize + cellSize / 2;
    ctx.fillText(DENSITY_RAMP[i], cx, cy);
  }

  return canvas;
}


// ---- ASCII Renderer Class ----

export class ASCIIRenderer {
  constructor(gl) {
    this.gl = gl;
    this._initShader();
    this._initFontAtlas();
    this._initSceneFBO();
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

    this.numChars = DENSITY_RAMP.length;
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

  /**
   * Run the ASCII post-process pass.
   * Call this AFTER fluid.render(sceneTarget, ...) has filled the scene FBO.
   * Renders the ASCII result to the screen (framebuffer null).
   */
  render() {
    const gl = this.gl;
    const ascii = CONFIG.ascii;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    gl.useProgram(this.program);

    // Bind scene color texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.uniform1i(this.uniforms['u_scene'], 0);

    // Bind font atlas
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fontAtlasTex);
    gl.uniform1i(this.uniforms['u_fontAtlas'], 1);

    // Set uniforms
    gl.uniform2f(this.uniforms['u_resolution'], gl.canvas.width, gl.canvas.height);
    gl.uniform1f(this.uniforms['u_cellSize'], ascii.cellSize);
    gl.uniform1f(this.uniforms['u_contrast'], ascii.contrast);
    gl.uniform1f(this.uniforms['u_numChars'], this.numChars);
    gl.uniform1f(this.uniforms['u_cellAspect'], ascii.cellAspect);

    // Draw fullscreen quad
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }
}
