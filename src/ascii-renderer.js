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
  v_uv = a_position * 0.5 + 0.5;
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
uniform sampler2D u_velocity;   // fluid velocity texture (for directional chars)
uniform vec2 u_resolution;     // screen resolution in pixels
uniform float u_cellSize;      // character cell width in pixels
uniform float u_contrast;      // luminance mapping curve power
uniform float u_numChars;      // number of characters per ramp (16)
uniform float u_cellAspect;    // cell height / cell width (e.g. 1.5 for 8x12)
uniform float u_time;          // elapsed seconds — drives shimmer
uniform float u_shimmer;       // quantum fluctuation probability (0 = off)
uniform vec2 u_camOffset;     // camera center in fluid UV (for world-anchored noise)
uniform float u_worldScale;   // world scale (for world-anchored noise)
uniform float u_dirThreshold; // speed threshold for directional character selection

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

  // Map luminance to character index within a 16-char ramp (0 = sparse, 15 = dense)
  float rampSize = u_numChars;
  float charIdx = lum * (rampSize - 1.0);

  // Quantum fluctuations: sparse cells that blink, anchored in worldspace.
  vec2 fluidUV = u_camOffset + (cellCenter - 0.5) / u_worldScale;
  vec2 worldCell = floor(fluidUV * u_resolution / vec2(cellW, cellH));
  float noise = fract(sin(dot(worldCell + floor(u_time * 3.0) * 0.17, vec2(12.9898, 78.233))) * 43758.5453);
  float noise2 = fract(sin(dot(worldCell * 0.5 + floor(u_time * 1.1) * 0.31, vec2(269.5, 183.3))) * 43758.5453);
  float disturbance = smoothstep(0.0, 0.3, lum) * 2.8 + 0.2;
  float threshold = 1.0 - u_shimmer * 0.01 * disturbance;
  if (noise > threshold) {
    charIdx += fract(noise * 7.0) * 2.0 + 1.0;
  }
  float threshold2 = 1.0 - u_shimmer * 0.005 * disturbance;
  if (noise2 > threshold2) {
    charIdx += fract(noise2 * 5.0) * 1.5;
  }

  charIdx = clamp(floor(charIdx), 0.0, rampSize - 1.0);

  // === DIRECTIONAL CHARACTER SELECTION ===
  // Sample fluid velocity at this cell's position
  vec2 vel = texture(u_velocity, fluidUV).xy;
  float speed = length(vel) * u_worldScale / 3.0;

  // Select ramp row based on flow direction (0=isotropic, 1=horizontal, 2=vertical, 3=diagonal)
  float rampRow = 0.0;
  if (speed > u_dirThreshold) {
    float angle = abs(atan(vel.y, vel.x));
    if (angle < 0.52 || angle > 2.62)
      rampRow = 1.0;       // horizontal (±30°)
    else if (angle > 1.05 && angle < 2.09)
      rampRow = 2.0;       // vertical (60°-120°)
    else
      rampRow = 3.0;       // diagonal

    // Probabilistic blending: directional emerges from shimmer noise at transition speeds
    float dirStrength = smoothstep(u_dirThreshold, u_dirThreshold * 4.0, speed);
    if (noise < (1.0 - dirStrength)) rampRow = 0.0;  // fall back to isotropic
  }

  // Atlas lookup: 16 columns per row, 4 rows (isotropic, horizontal, vertical, diagonal)
  float atlasCol = charIdx;
  float atlasRow = rampRow;

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

// Four character ramps (16 chars each) for directional ASCII.
// Row 0: isotropic (no flow direction), Row 1: horizontal, Row 2: vertical, Row 3: diagonal.
// Each ramp is sorted by visual weight (sparse → dense).
const RAMPS = [
  ' .`\'-,_:;"~^*+=#%@',        // isotropic (padded to 16 with last char repeated)
  ' .-~-=~-=-==#%@@',            // horizontal emphasis
  ' .:|!:|!|:|!#%@@',            // vertical emphasis
  ' ./\\/\\x/\\/\\x#%@@',        // diagonal emphasis
];
const CHARS_PER_RAMP = 16;

/**
 * Generate a 1024x1024 font atlas texture.
 * 16x16 grid = 64x64px per glyph cell.
 * 4 rows × 16 columns = 4 directional ramps.
 * White glyphs on transparent background.
 */
function generateFontAtlas() {
  const atlasSize = 1024;
  const gridSize = 16;
  const cellSize = atlasSize / gridSize;

  const canvas = document.createElement('canvas');
  canvas.width = atlasSize;
  canvas.height = atlasSize;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, atlasSize, atlasSize);

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.floor(cellSize * 0.85)}px monospace`;

  for (let row = 0; row < RAMPS.length; row++) {
    const ramp = RAMPS[row];
    for (let col = 0; col < CHARS_PER_RAMP; col++) {
      // Use last char in ramp if ramp is shorter than 16
      const ch = col < ramp.length ? ramp[col] : ramp[ramp.length - 1];
      const cx = col * cellSize + cellSize / 2;
      const cy = row * cellSize + cellSize / 2;
      ctx.fillText(ch, cx, cy);
    }
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

  /**
   * Run the ASCII post-process pass.
   * Call this AFTER fluid.render(sceneTarget, ...) has filled the scene FBO.
   * Renders the ASCII result to the screen (framebuffer null).
   */
  render(totalTime = 0, camOffsetU = 0.5, camOffsetV = 0.5, worldScale = 1.0, velocityTex = null) {
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

    // Draw fullscreen quad
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }
}
