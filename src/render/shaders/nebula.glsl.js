// src/render/shaders/nebula.glsl.js
//
// Nebula shader — ported from gradient-bang/client/starfield/src/shaders/
// NebulaShader.ts. Domain-warp fractal field producing swirling galactic
// streaks against black. Intended as a skybox-layer background behind the
// fluid sim + ASCII pass, blended at low intensity so it reads as "the
// ghost of a galaxy" rather than wallpaper.
//
// GLSL source kept as plain string exports. Portable to any engine that
// accepts GLSL fragment shaders — no Three.js specifics in the shader
// body. Integration point is the Three.js ShaderMaterial (or any
// equivalent) that wraps these strings and provides uniforms.
//
// See docs/reference/GRADIENT-BANG-REFERENCE.md for the source context.

export const nebulaVertexShader = /* glsl */ `
  varying vec3 vWorldPosition;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vWorldPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const nebulaFragmentShader = /* glsl */ `
  precision highp float;

  uniform vec2 uResolution;
  uniform float uIntensity;
  uniform vec3 uTint;
  uniform vec3 uNebulaColorPrimary;
  uniform vec3 uNebulaColorSecondary;
  uniform float uIterPrimary;
  uniform float uIterSecondary;
  uniform float uDomainScale;

  // Domain-warp controls
  uniform vec3 uWarpOffset;        // Domain fold offset
  uniform float uWarpDecay;        // Iteration decay rate

  varying vec3 vWorldPosition;
  varying vec2 vUv;

  const int MAX_ITER = 18;

  // Procedural field function for nebula generation.
  // Iterated domain-fold: at each step, fold p = abs(p) / dot(p, p) + warpOffset.
  // Accumulate weighted exp(-k * (mag - prev)^2) to build the density field.
  float fieldFunc(vec3 p, float s, int iter) {
    float accum = s / 4.0;
    float prev = 0.0;
    float tw = 0.0;
    for (int i = 0; i < MAX_ITER; ++i) {
      if (i >= iter) { break; }
      float mag = dot(p, p);
      p = abs(p) / max(mag, 1e-5) + uWarpOffset;
      float w = exp(-float(i) / uWarpDecay);
      accum += w * exp(-9.025 * pow(abs(mag - prev), 2.2));
      tw += w;
      prev = mag;
    }
    return max(0.0, 5.2 * accum / max(tw, 1e-4) - 0.65);
  }

  // Fast pseudo-random for star sprinkle layer
  vec3 nrand3(vec2 co) {
    vec3 a = fract(cos(co.x * 8.3e-3 + co.y) * vec3(1.3e5, 4.7e5, 2.9e5));
    vec3 b = fract(sin(co.x * 0.3e-3 + co.y) * vec3(8.1e5, 1.0e5, 0.1e5));
    return mix(a, b, 0.5);
  }

  vec4 starLayer(vec2 p) {
    float scale = max(uResolution.x, 600.0);
    vec2 seed = floor(1.9 * p * scale / 1.5);
    vec3 rnd = nrand3(seed);
    return vec4(pow(rnd.y, 17.0));
  }

  void main() {
    vec3 direction = normalize(vWorldPosition);

    // 3D position for seamless spherical noise sampling
    vec3 p3d = direction * 2.0;

    // 2D spherical UVs for vignette + stars
    float theta = atan(direction.x, -direction.z);
    float phi = asin(direction.y);
    vec2 sphericalUV = vec2(theta / 6.28318530718 + 0.5, phi / 3.14159265359 + 0.5);
    vec2 uv2 = sphericalUV * 2.0 - 1.0;

    // Primary noise layer
    vec3 p = p3d / (2.5 * uDomainScale) + vec3(0.8, -1.3, 0.0);
    float t1 = fieldFunc(p, 0.15, int(uIterPrimary));

    // Secondary noise layer
    vec3 p2 = p3d / (4.0 * uDomainScale) + vec3(2.0, -1.3, -1.0);
    float t2 = fieldFunc(p2, 0.9, int(uIterSecondary));

    // Vignette mask for edge fade
    float v = (1.0 - exp((abs(uv2.x) - 1.0) * 6.0)) * (1.0 - exp((abs(uv2.y) - 1.0) * 6.0));

    // Combine layers
    float baseD = (0.225 * t1 * t1 * t1 + 0.48 * t1 * t1 + 0.9 * t1) * mix(0.6, 1.0, v);
    float c2d = (5.5 * t2 * t2 * t2 + 2.1 * t2 * t2 + 0.99 * t2) * mix(0.5, 0.2, v);

    // Star sprinkle
    vec4 stars = starLayer(sphericalUV * 4.0) + starLayer(sphericalUV * 6.0);
    float starScale = mix(1.0, 0.1, smoothstep(0.1, 1.0, uIntensity));

    // Final color composition
    vec3 col = baseD * uNebulaColorPrimary + c2d * uNebulaColorSecondary + stars.xyz * starScale;
    col *= uTint * uIntensity;
    col = clamp(col, 0.0, 1.0);

    gl_FragColor = vec4(col, clamp(uIntensity, 0.0, 1.0));
  }
`;

// Default uniform values. Start with full intensity (1.0) so the nebula
// is visibly present out of the box for the prototype; Greg will tune
// down to the "ghost of a galaxy" register (likely 0.3-0.5) once we
// integrate with the fluid sim and the ASCII pass adds its own density.
// Colors: cool magenta-cyan palette that survives the ASCII pass without
// competing with it.
export const NEBULA_DEFAULTS = {
  uIntensity:            1.0,
  uTint:                 [1.0, 1.0, 1.0],
  uNebulaColorPrimary:   [0.55, 0.30, 0.85],   // violet — primary band color
  uNebulaColorSecondary: [0.20, 0.55, 0.80],   // cyan — secondary layer
  uIterPrimary:          6,
  uIterSecondary:        8,
  uDomainScale:          1.0,
  uWarpOffset:           [-0.5, -0.4, -1.487], // gradient-bang default
  uWarpDecay:            5.0,
};
