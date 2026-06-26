// src/render/shaders/ascii.glsl.js
//
// Shared ASCII post-process shader source + font-atlas generator.
// Consumed by ASCIIPass (src/render/passes/ascii-pass.js).
//
// The shader divides the scene into character cells, looks up a glyph from
// a pre-rendered font atlas based on cell luminance, and tints with scene
// color. Directional glyph ramps track fluid flow direction. See the
// comments inline for behavior (shimmer, glitch corruption, directional
// selection).

export const FRAG_ASCII = `#version 300 es
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
uniform float u_gridWindow;   // world-units spanned by the fluid grid (for world-anchored noise)
uniform float u_cameraView;   // world-units visible on each axis; matches the square fluid window
uniform float u_viewAspect;   // retained for pass ABI; ignored while the fluid window is square
uniform float u_dirThreshold; // speed threshold for directional character selection
uniform float u_dirBlendRange; // speed window where direction emerges through shimmer
uniform float u_glitchIntensity; // 0.0 = normal, 1.0 = full corruption (scene transitions + wake shock)
uniform int u_inhibitorForm;     // 0=inactive, 1=glitch, 2=swarm, 3=vessel
uniform vec2 u_inhibitorPos;     // fluid UV position of the authoritative Inhibitor
uniform float u_inhibitorRadius; // world-space corruption radius
uniform float u_inhibitorIntensity;
uniform float u_inhibitorTime;

const float INHIBITOR_MATH_ROW = 4.0;
const float INHIBITOR_VESSEL_ROW = 5.0;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  float cellW = u_cellSize;
  float cellH = u_cellSize * u_cellAspect;

  vec2 pixelPos = v_uv * u_resolution;
  vec2 cellIndex = floor(pixelPos / vec2(cellW, cellH));
  vec2 cellUV = fract(pixelPos / vec2(cellW, cellH));

  vec2 cellCenter = (cellIndex + 0.5) * vec2(cellW, cellH) / u_resolution;
  vec4 sceneColor = texture(u_scene, cellCenter);

  float lum = dot(sceneColor.rgb, vec3(0.299, 0.587, 0.114));
  lum = pow(clamp(lum, 0.0, 1.0), u_contrast);

  float rampSize = u_numChars;
  float charIdx = lum * (rampSize - 1.0);

  // World-anchored shimmer so quantum fluctuations don't slide with camera.
  // Match FluidDisplayPass' square fluid-window projection before sampling velocity.
  vec2 cameraOffset = (cellCenter - vec2(0.5) + vec2(u_viewAspect * 0.0, 0.0)) * u_cameraView;
  vec2 fluidUV = u_camOffset + cameraOffset / u_gridWindow;
  vec2 wrappedFluidUV = fract(fluidUV);
  vec2 cellsPerScreen = u_resolution / vec2(cellW, cellH);
  vec2 worldCell = floor(wrappedFluidUV * cellsPerScreen * u_gridWindow);
  vec2 anchoredCell = worldCell;
  float noise = fract(sin(dot(anchoredCell + floor(u_time * 3.0) * 0.17, vec2(12.9898, 78.233))) * 43758.5453);
  float noise2 = fract(sin(dot(anchoredCell * 0.5 + floor(u_time * 1.1) * 0.31, vec2(269.5, 183.3))) * 43758.5453);
  vec2 neighborOffset = vec2(cellW, cellH) / u_resolution;
  float lumRight = dot(texture(u_scene, clamp(cellCenter + vec2(neighborOffset.x, 0.0), vec2(0.0), vec2(1.0))).rgb, vec3(0.299, 0.587, 0.114));
  float lumBelow = dot(texture(u_scene, clamp(cellCenter + vec2(0.0, neighborOffset.y), vec2(0.0), vec2(1.0))).rgb, vec3(0.299, 0.587, 0.114));
  float edgeStrength = abs(lum - lumRight) + abs(lum - lumBelow);
  float disturbance = smoothstep(0.0, 0.3, lum) * 2.8 + 0.2 + edgeStrength * 8.0;
  float threshold = 1.0 - u_shimmer * 0.01 * disturbance;
  if (noise > threshold) {
    charIdx += fract(noise * 7.0) * 2.0 + 1.0;
  }
  float threshold2 = 1.0 - u_shimmer * 0.005 * disturbance;
  if (noise2 > threshold2) {
    charIdx += fract(noise2 * 5.0) * 1.5;
  }

  charIdx = clamp(floor(charIdx), 0.0, rampSize - 1.0);

  vec2 vel = texture(u_velocity, wrappedFluidUV).xy;
  float speed = length(vel) * u_gridWindow / 3.0;

  float rampRow = 0.0;
  if (speed > u_dirThreshold) {
    float angle = abs(atan(vel.y, vel.x));
    if (angle < 0.52 || angle > 2.62)
      rampRow = 1.0;
    else if (angle > 1.05 && angle < 2.09)
      rampRow = 2.0;
    else
      rampRow = 3.0;

    float dirStrength = smoothstep(u_dirThreshold, u_dirThreshold + u_dirBlendRange, speed);
    if (noise < (1.0 - dirStrength)) rampRow = 0.0;
  }

  if (u_glitchIntensity > 0.0) {
    float glitchNoise = fract(sin(dot(cellIndex + floor(u_time * 30.0) * 0.37, vec2(43.23, 71.97))) * 43758.5453);
    if (glitchNoise < u_glitchIntensity) {
      float rndChar = fract(sin(dot(cellIndex * 1.3 + u_time * 17.0, vec2(127.1, 311.7))) * 43758.5453);
      charIdx = floor(rndChar * rampSize * 0.5 + rampSize * 0.5);
      float rndRow = fract(sin(dot(cellIndex * 2.7 + u_time * 11.0, vec2(269.5, 183.3))) * 43758.5453);
      rampRow = floor(rndRow * 4.0);
      float colorNoise = fract(sin(dot(cellIndex * 0.7 + u_time * 23.0, vec2(94.3, 217.9))) * 43758.5453);
      vec3 glitchColor = colorNoise < 0.3 ? vec3(0.8, 0.1, 0.5)
                        : colorNoise < 0.6 ? vec3(0.1, 0.8, 0.7)
                        :                     vec3(0.9, 0.9, 0.9);
      sceneColor.rgb = glitchColor * (0.5 + 0.5 * u_glitchIntensity);
    }
  }

  if (u_inhibitorForm > 0) {
    vec2 inhDiff = wrappedFluidUV - u_inhibitorPos;
    inhDiff = inhDiff - round(inhDiff);  // toroidal world wrap in fluid UV
    float inhDist = length(inhDiff) * u_gridWindow;

    float zone = smoothstep(u_inhibitorRadius * 1.8, u_inhibitorRadius * 0.35, inhDist);
    float chance = zone * u_inhibitorIntensity * 0.24;
    float targetRow = INHIBITOR_MATH_ROW;

    if (u_inhibitorForm == 2) {
      // Swarm tendrils are shader-local: visual corruption follows radial
      // current-like arms without adding per-frame CPU readback.
      float angle = atan(inhDiff.y, inhDiff.x);
      float tendril = pow(max(0.0, sin(angle * 7.0 + u_inhibitorTime * 2.3 + inhDist * 18.0)), 12.0);
      float tendrilBand = smoothstep(u_inhibitorRadius * 2.55, u_inhibitorRadius * 0.75, inhDist)
                        * (1.0 - smoothstep(u_inhibitorRadius * 0.55, u_inhibitorRadius * 0.25, inhDist));
      zone = max(zone, tendril * tendrilBand * 0.85);
      chance = max(chance, zone * u_inhibitorIntensity * 0.42);
    } else if (u_inhibitorForm == 3) {
      targetRow = INHIBITOR_VESSEL_ROW;
      float cosA = cos(u_inhibitorTime * 0.2);
      float sinA = sin(u_inhibitorTime * 0.2);
      vec2 rotDiff = vec2(inhDiff.x * cosA + inhDiff.y * sinA,
                          -inhDiff.x * sinA + inhDiff.y * cosA) * u_gridWindow;
      float rectMask = step(abs(rotDiff.x), u_inhibitorRadius * 0.34)
                     * step(abs(rotDiff.y), u_inhibitorRadius * 1.28);
      zone = max(zone * 0.45, rectMask);
      chance = max(chance, rectMask * u_inhibitorIntensity * 0.92);
    }

    float inhNoise = fract(sin(dot(cellIndex + floor(u_inhibitorTime * 21.0) * 0.43, vec2(53.23, 91.97))) * 43758.5453);
    if (inhNoise < clamp(chance, 0.0, 0.95)) {
      float rndChar = fract(sin(dot(cellIndex * 1.7 + u_inhibitorTime * 13.0, vec2(127.1, 311.7))) * 43758.5453);
      charIdx = floor(rndChar * rampSize);
      rampRow = targetRow;
      sceneColor.rgb = mix(sceneColor.rgb, vec3(1.0, 0.18, 0.48), clamp((0.45 + zone * 0.55) * u_inhibitorIntensity, 0.0, 1.0));
    }
  }

  float atlasCol = charIdx;
  float atlasRow = rampRow;

  vec2 atlasUV = vec2(
    (atlasCol + cellUV.x) / 16.0,
    (atlasRow + (1.0 - cellUV.y)) / 16.0
  );

  float glyphAlpha = texture(u_fontAtlas, atlasUV).r;

  vec3 tintColor = sceneColor.rgb + vec3(0.03, 0.04, 0.06);
  vec3 bgColor = sceneColor.rgb * 0.08;
  vec3 finalColor = mix(bgColor, tintColor, glyphAlpha);

  fragColor = vec4(finalColor, 1.0);
}`;

// Rows 0-3 are normal space. Rows 4-5 are reserved for Inhibitors so their
// corruption reads as a separate language instead of a denser normal fabric.
export const RAMPS = [
  ' .`\'-,_:;~*+=#%@',
  ' .-~-=~=--==#%@@',
  ' .:|!:|!|:|!#%@@',
  ' ./\\//\\//++##%@@',
  ' ΨΩ∞⌁∑∫√∂∆≈≠±×÷∴',
  ' ╔║╗═╬░▓█╚╝╠╣╦╩╬',
];
export const CHARS_PER_RAMP = 16;

/**
 * Generate a 1024×1024 font atlas canvas. 16 columns × N glyph rows,
 * 64×64 px per cell. White glyphs on black background — the shader reads
 * the red channel as alpha and mixes it against the scene color.
 */
export function generateFontAtlas() {
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
      const ch = col < ramp.length ? ramp[col] : ramp[ramp.length - 1];
      const cx = col * cellSize + cellSize / 2;
      const cy = row * cellSize + cellSize / 2;
      ctx.fillText(ch, cx, cy);
    }
  }

  return canvas;
}

/**
 * Build a WebGL font-atlas texture from the generated canvas. Caller owns
 * the texture (call gl.deleteTexture when done).
 */
export function createFontAtlasTexture(gl) {
  const canvas = generateFontAtlas();
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}
