/**
 * Canonical WebGL2 sources for FluidSim.
 *
 * The fluid texture is a torus. GL_REPEAT wraps sampling, but shaders that
 * compute point-to-point distance must use `diff - round(diff)` for the
 * shortest path. Neighbor-only passes rely on GL_REPEAT instead.
 */

export const VERT_QUAD = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

// GLSL cannot import coords.js, so shader passes share this tiny mirror of the
// world/fluid/coarse-field Y convention. Keep new shader-side flips here.
export const GLSL_COORDS = `
vec2 lbhGridUvToWorldOffset(vec2 gridUv, float gridWindow) {
  return vec2(gridUv.x - 0.5, -(gridUv.y - 0.5)) * gridWindow;
}

vec2 lbhWorldToCoarseUv(vec2 worldPos, float worldScale) {
  vec2 uv = fract(worldPos / worldScale);
  return vec2(uv.x, 1.0 - uv.y);
}

vec2 lbhCoarseUvToWorld(vec2 coarseUv, float worldScale) {
  return vec2(coarseUv.x, 1.0 - coarseUv.y) * worldScale;
}

vec2 lbhWorldDeltaToFluidUv(vec2 worldDelta, float gridWindow) {
  return vec2(worldDelta.x, -worldDelta.y) / gridWindow + 0.5;
}

vec2 lbhWorldVelocityToFluidVelocity(vec2 worldVelocity) {
  return vec2(worldVelocity.x, -worldVelocity.y);
}
`;

export const FRAG_ADVECT = `#version 300 es
precision highp float;
uniform sampler2D u_velocity;
uniform sampler2D u_source;
uniform float u_dt;
uniform float u_dissipation;
uniform vec2 u_texelSize;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec2 vel = texture(u_velocity, v_uv).xy;
  vec2 pos = v_uv - u_dt * vel * u_texelSize;
  fragColor = u_dissipation * texture(u_source, pos);
}`;

export const FRAG_DIVERGENCE = `#version 300 es
precision highp float;
uniform sampler2D u_velocity;
uniform vec2 u_texelSize;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  float vL = texture(u_velocity, v_uv - vec2(u_texelSize.x, 0.0)).x;
  float vR = texture(u_velocity, v_uv + vec2(u_texelSize.x, 0.0)).x;
  float vB = texture(u_velocity, v_uv - vec2(0.0, u_texelSize.y)).y;
  float vT = texture(u_velocity, v_uv + vec2(0.0, u_texelSize.y)).y;
  float div = 0.5 * (vR - vL + vT - vB);
  fragColor = vec4(div, 0.0, 0.0, 1.0);
}`;

export const FRAG_PRESSURE = `#version 300 es
precision highp float;
uniform sampler2D u_pressure;
uniform sampler2D u_divergence;
uniform vec2 u_texelSize;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  float pL = texture(u_pressure, v_uv - vec2(u_texelSize.x, 0.0)).x;
  float pR = texture(u_pressure, v_uv + vec2(u_texelSize.x, 0.0)).x;
  float pB = texture(u_pressure, v_uv - vec2(0.0, u_texelSize.y)).x;
  float pT = texture(u_pressure, v_uv + vec2(0.0, u_texelSize.y)).x;
  float div = texture(u_divergence, v_uv).x;
  float p = (pL + pR + pB + pT - div) * 0.25;
  fragColor = vec4(p, 0.0, 0.0, 1.0);
}`;

export const FRAG_GRADIENT_SUBTRACT = `#version 300 es
precision highp float;
uniform sampler2D u_pressure;
uniform sampler2D u_velocity;
uniform vec2 u_texelSize;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  float pL = texture(u_pressure, v_uv - vec2(u_texelSize.x, 0.0)).x;
  float pR = texture(u_pressure, v_uv + vec2(u_texelSize.x, 0.0)).x;
  float pB = texture(u_pressure, v_uv - vec2(0.0, u_texelSize.y)).x;
  float pT = texture(u_pressure, v_uv + vec2(0.0, u_texelSize.y)).x;
  vec2 vel = texture(u_velocity, v_uv).xy;
  vel -= 0.5 * vec2(pR - pL, pT - pB);
  fragColor = vec4(vel, 0.0, 1.0);
}`;

// Splat shader — injects force/density at a point (used by splat + visualSplat)
export const FRAG_SPLAT = `#version 300 es
precision highp float;
uniform sampler2D u_target;
uniform vec2 u_point;      // in UV coords
uniform vec3 u_value;
uniform float u_radius;
uniform float u_aspectRatio;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec2 diff = v_uv - u_point;
  diff = diff - round(diff);  // TOROIDAL WRAPPING RULE
  diff.x *= u_aspectRatio;
  float d = dot(diff, diff);
  float strength = exp(-d / u_radius);
  vec3 base = texture(u_target, v_uv).xyz;
  fragColor = vec4(base + strength * u_value, 1.0);
}`;

// Radial + tangential force for gravity wells — applied to velocity field
// V2: constant radial pull + tangential orbital force. No oscillation.
export const FRAG_WELL_FORCE = `#version 300 es
precision highp float;
uniform sampler2D u_velocity;
uniform vec2 u_wellPos;     // UV coords
uniform float u_gravity;
uniform float u_falloff;
uniform float u_clampRadius;
uniform float u_orbitalStrength; // tangential force as signed fraction of radial (positive = CCW)
uniform float u_dt;
uniform float u_terminalSpeed;
uniform float u_aspectRatio;
uniform vec2 u_texelSize;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec2 vel = texture(u_velocity, v_uv).xy;

  vec2 diff = u_wellPos - v_uv;
  diff = diff - round(diff);  // TOROIDAL WRAPPING RULE
  diff.x *= u_aspectRatio;
  float dist = length(diff);
  float minDist = u_clampRadius * u_texelSize.x;
  float safeDist = max(dist, minDist);

  // Direction toward well (safe normalize)
  vec2 dir = dist > 0.0001 ? diff / dist : vec2(0.0);

  // === GRAVITY: constant inward pull ===
  float gravityMag = u_gravity / pow(safeDist, u_falloff);
  vec2 pullForce = dir * gravityMag;

  // === ORBITAL: tangential force perpendicular to radial ===
  // Rotate radial direction 90 degrees to get tangential
  // CCW: (-dir.y, dir.x), CW: (dir.y, -dir.x)
  vec2 tangent = vec2(-dir.y, dir.x); // CCW base direction
  float orbitalMag = gravityMag * u_orbitalStrength;
  vec2 orbitalForce = tangent * orbitalMag;

  vec2 totalForce = (pullForce + orbitalForce) * u_dt;
  vel += totalForce;

  // Clamp terminal speed near well to prevent singularity buildup
  float speed = length(vel);
  if (speed > u_terminalSpeed && safeDist < 0.25) {
    vel *= u_terminalSpeed / speed;
  }

  fragColor = vec4(vel, 0.0, 1.0);
}`;

// Vorticity computation
export const FRAG_CURL = `#version 300 es
precision highp float;
uniform sampler2D u_velocity;
uniform vec2 u_texelSize;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  float vL = texture(u_velocity, v_uv - vec2(u_texelSize.x, 0.0)).y;
  float vR = texture(u_velocity, v_uv + vec2(u_texelSize.x, 0.0)).y;
  float vB = texture(u_velocity, v_uv - vec2(0.0, u_texelSize.y)).x;
  float vT = texture(u_velocity, v_uv + vec2(0.0, u_texelSize.y)).x;
  float curl = vR - vL - vT + vB;
  fragColor = vec4(0.5 * curl, 0.0, 0.0, 1.0);
}`;

export const FRAG_VORTICITY = `#version 300 es
precision highp float;
uniform sampler2D u_velocity;
uniform sampler2D u_curl;
uniform float u_curlStrength;
uniform float u_dt;
uniform vec2 u_texelSize;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  float cL = texture(u_curl, v_uv - vec2(u_texelSize.x, 0.0)).x;
  float cR = texture(u_curl, v_uv + vec2(u_texelSize.x, 0.0)).x;
  float cB = texture(u_curl, v_uv - vec2(0.0, u_texelSize.y)).x;
  float cT = texture(u_curl, v_uv + vec2(0.0, u_texelSize.y)).x;
  float cC = texture(u_curl, v_uv).x;

  vec2 force = 0.5 * vec2(abs(cT) - abs(cB), abs(cR) - abs(cL));
  float len = length(force) + 1e-5;
  force = force / len * u_curlStrength * cC;

  vec2 vel = texture(u_velocity, v_uv).xy;
  vel += force * u_dt;
  fragColor = vec4(vel, 0.0, 1.0);
}`;

// Display shader — maps fluid state to visible colors
// V4: gravity field as primary brightness signal — wells visible immediately, no warm-up
// Layers: gravity field → density/velocity overlay → fabric noise → well color gradient → accretion
export const FRAG_DISPLAY = `#version 300 es
precision highp float;
uniform sampler2D u_velocity;
uniform sampler2D u_density;
uniform sampler2D u_visualDensity;  // cosmetic-only density (no physics)
uniform vec3 u_voidColor;
uniform vec3 u_normalColor;
uniform vec3 u_nearWellColor;
uniform vec3 u_hotWellColor;
// Well positions + masses for gravity field visualization
uniform vec2 u_wellPositions[256];
uniform float u_wellMasses[256];
uniform vec4 u_wellShape[256]; // x=core radius, y=ring inner, z=ring outer, w=orbitalDir
uniform int u_wellCount;
uniform float u_densityScale;
uniform float u_gravityScale;
// Camera offset in fluid UV space and grid window
uniform vec2 u_camOffset;      // camera center in fluid UV (0-1)
uniform float u_gridWindow;    // world-units spanned by the camera-anchored fluid texture
uniform float u_cameraView;    // world-units visible on each axis; matches the square fluid window
uniform float u_viewAspect;    // retained for pass ABI; ignored while the fluid window is square
uniform float u_refScale;      // FLUID_REF_SCALE from coords.js — the scale all UV params were tuned at (3.0)
uniform float u_time;          // elapsed time in seconds (for shimmer noise)
// Collection-backed ecology state from the authority projection.
uniform int u_ecologyCount;
uniform vec2 u_ecologyPos[16];
uniform float u_ecologyRadius[16];
uniform float u_ecologyIntensity[16];
uniform float u_ecologyTime[16];
uniform int u_ecologyKind[16]; // 1=glitch, 2=swarm, 3=vessel

in vec2 v_uv;
out vec4 fragColor;

void main() {
  // Sample the same square world slice represented by the fluid texture.
  // Aspect-correct widening belongs in a future rectangular-fluid-window pass.
  vec2 cameraOffset = (v_uv - vec2(0.5) + vec2(u_viewAspect * 0.0, 0.0)) * u_cameraView;
  vec2 fluidUV = u_camOffset + cameraOffset / u_gridWindow;
  vec2 wrappedFluidUV = fract(fluidUV);

  vec2 vel = texture(u_velocity, wrappedFluidUV).xy;
  vec3 dens = texture(u_density, wrappedFluidUV).xyz;
  vec3 visDens = texture(u_visualDensity, wrappedFluidUV).xyz;
  // Visual density is purely additive (no negative injectors exist).
  // See docs/design/VISUAL-DENSITY.md for why negative splats were removed.
  // Normalize UV velocity to world-equivalent speed (calibrated at WORLD_SCALE=3)
  float speed = length(vel) * u_gridWindow / u_refScale;

  // === PRIMARY SCENE SIGNALS ===
  // Physical density = background fabric excitation.
  // Visual density = ring intensity boost (additive only, no negative signals).
  float rawExcitation = length(max(dens, vec3(0.0)));
  float sceneExcitation = 1.0 - exp(-rawExcitation * (u_densityScale * 0.28));
  float ringSignal = 1.0 - exp(-length(visDens) * 0.06);

  // === FABRIC NOISE — subtle texture, strongest in darker regions ===
  vec2 fabricUV = wrappedFluidUV * 12.0 + u_time * 0.02;
  float fabric = fract(sin(dot(fabricUV, vec2(127.1, 311.7))) * 43758.5453);
  float fabric2 = fract(sin(dot(fabricUV * 0.5 + 3.3, vec2(269.5, 183.3))) * 43758.5453);
  float fabricNoise = (fabric * 0.6 + fabric2 * 0.4) * 0.08;
  fabricNoise *= mix(0.3, 1.0, 1.0 - sceneExcitation);

  // Base fabric. Keep it dark. Let rings do the bright work.
  float baseMix = 0.04 + sceneExcitation * 0.18 + smoothstep(0.01, 0.07, speed) * 0.12 + fabricNoise * 0.45;
  vec3 col = mix(u_voidColor, u_normalColor, clamp(baseMix, 0.0, 0.35));

  // Currents should read, but not blow the frame out.
  float flowLight = smoothstep(0.015, 0.08, speed);
  col += vec3(0.03, 0.08, 0.10) * flowLight;

  // === PER-WELL: dark core + one readable accretion band ===
  for (int i = 0; i < 256; i++) {
    if (i >= u_wellCount) break;

    vec2 diff = wrappedFluidUV - u_wellPositions[i];
    diff = diff - round(diff);  // TOROIDAL WRAPPING RULE
    // SHADER DISTANCE RULE: shape values from getRenderShapes() are in world-space.
    // UV diff × worldScale = world-space distance, matching shape units.
    float dist = length(diff) * u_gridWindow;

    vec4 shape = u_wellShape[i];
    float coreRadius = shape.x;
    float ringInner = shape.y;
    float ringOuter = shape.z;
    float orbitalDir = shape.w;
    float coreMask = smoothstep(coreRadius * 1.22, coreRadius * 0.82, dist);
    float horizonMask = smoothstep(coreRadius * 1.18, coreRadius * 1.03, dist)
                      * (1.0 - smoothstep(coreRadius * 1.03, coreRadius * 0.92, dist));
    // Ring band: bright between inner and outer, fades to zero at both edges.
    // Outer fade: smoothstep from outer→inner (1 at inner, 0 at outer)
    // Inner fade: smoothstep from core→inner (0 at core, 1 at inner)
    float ringMask = smoothstep(ringOuter, ringInner, dist)
                   * smoothstep(coreRadius * 1.03, ringInner, dist);
    float haloMask = smoothstep(ringOuter * 1.8, ringOuter, dist)
                   * (1.0 - smoothstep(ringOuter, ringInner, dist));

    float localLive = 1.0 - coreMask;
    float analyticRing = clamp(0.5 + u_wellMasses[i] * 0.36, 0.5, 1.2);
    float ringEnergy = max(ringSignal, analyticRing);
    float localRing = ringMask * mix(0.62, 1.18, ringEnergy);
    vec3 ringColor = mix(u_nearWellColor, u_hotWellColor, clamp(0.12 + ringEnergy * 0.88, 0.0, 1.0));
    vec2 radial = dist > 0.0001 ? diff / length(diff) : vec2(1.0, 0.0);
    vec2 tangent = vec2(-radial.y, radial.x) * orbitalDir;
    float tangentialAlignment = speed > 0.001 ? dot(normalize(vel), tangent) * 0.5 + 0.5 : 0.5;
    float ringBias = mix(0.96, 1.34, tangentialAlignment);

    // Gentle halo outside the ring so the fabric feels disturbed, not flooded.
    col += ringColor * haloMask * (0.26 + 0.12 * ringEnergy) * localLive;

    // Thin event-horizon rim so the lethal edge is legible even on smaller wells.
    col += mix(u_nearWellColor, u_hotWellColor, 0.7) * horizonMask * (0.35 + 0.18 * ringEnergy) * localLive;

    // Main accretion band. This is the bright read, not the whole well.
    col += ringColor * localRing * 1.16 * ringBias * localLive;

    // Surf hint just outside the ring: cool directional band where tangential
    // motion is strongest. Visible between outer*1.04 and outer*2.7.
    // Inner edge: fades IN from 0 at outer*1.04 to 1 at outer*1.5
    // Outer edge: fades OUT from 1 at outer*1.5 to 0 at outer*2.7
    float surfBand = smoothstep(ringOuter * 1.04, ringOuter * 1.5, dist)
                   * (1.0 - smoothstep(ringOuter * 1.5, ringOuter * 2.7, dist));
    float surfHint = surfBand * smoothstep(0.012, 0.055, speed) * mix(0.45, 1.0, tangentialAlignment);
    col += vec3(0.05, 0.22, 0.3) * surfHint * 1.45 * localLive;

    // Final dark core. This must win.
    col = mix(col, vec3(0.0), coreMask * 0.985);
  }

  // === INHIBITOR CORRUPTION ===
  for (int i = 0; i < 16; i++) {
    if (i >= u_ecologyCount) break;
    vec2 inhDiff = wrappedFluidUV - u_ecologyPos[i];
    inhDiff = inhDiff - round(inhDiff);
    float inhDist = length(inhDiff) * u_gridWindow;
    float radius = u_ecologyRadius[i];
    float intensity = u_ecologyIntensity[i];
    float localTime = u_ecologyTime[i];
    vec3 inhColor = vec3(1.0, 0.18, 0.48);

    if (u_ecologyKind[i] == 1) {
      float glitchFade = smoothstep(radius * 1.5, radius * 0.5, inhDist);
      float pulse = 0.5 + 0.5 * sin(localTime * 3.0 + inhDist * 40.0);
      col += inhColor * glitchFade * pulse * intensity * 0.3;
    } else if (u_ecologyKind[i] == 2) {
      float swarmCore = smoothstep(radius, radius * 0.3, inhDist);
      float swarmEdge = smoothstep(radius * 2.0, radius, inhDist);
      col = mix(col, inhColor, swarmCore * intensity * 0.7);
      float edgePulse = 0.7 + 0.3 * sin(localTime * 2.0 + atan(inhDiff.y, inhDiff.x) * 4.0);
      col += inhColor * swarmEdge * (1.0 - swarmCore) * edgePulse * intensity * 0.15;
      float angle = atan(inhDiff.y, inhDiff.x);
      float tendril = pow(max(0.0, sin(angle * 7.0 + localTime * 2.0 + inhDist * 16.0)), 12.0);
      float tendrilBand = smoothstep(radius * 2.45, radius * 0.72, inhDist)
                        * (1.0 - smoothstep(radius * 0.55, radius * 0.25, inhDist));
      col += inhColor * tendril * tendrilBand * intensity * 0.24;
    } else if (u_ecologyKind[i] == 3) {
      float cosA = cos(localTime * 0.2);
      float sinA = sin(localTime * 0.2);
      vec2 rotDiff = vec2(inhDiff.x * cosA + inhDiff.y * sinA,
                          -inhDiff.x * sinA + inhDiff.y * cosA) * u_gridWindow;
      float halfW = radius * 0.3;
      float halfH = radius * 1.2;
      float rectMask = step(abs(rotDiff.x), halfW) * step(abs(rotDiff.y), halfH);
      vec2 gridUV = rotDiff * 80.0;
      float grid = min(step(0.85, fract(gridUV.x)) + step(0.85, fract(gridUV.y)), 1.0);
      vec3 vesselColor = inhColor * (0.6 + grid * 0.4);
      col = mix(col, vesselColor, rectMask * intensity);
      float edgeDist = max(abs(rotDiff.x) - halfW, abs(rotDiff.y) - halfH);
      float edgeGlow = smoothstep(0.02, 0.0, edgeDist) * (1.0 - rectMask);
      col += inhColor * edgeGlow * 0.5;
    }
  }

  // Subtle vignette at screen edges
  vec2 fromCenter = v_uv - 0.5;
  float vignette = 1.0 - dot(fromCenter, fromCenter) * 0.5;
  col *= vignette;

  fragColor = vec4(col, 1.0);
}`;

// Distance-based dissipation — density fades faster far from wells
// Near wells: persistent accretion zones. Far from wells: quick fadeout.
export const FRAG_DISSIPATION = `#version 300 es
precision highp float;
uniform sampler2D u_density;
uniform vec2 u_wellPositions[256];
uniform int u_wellCount;
uniform float u_nearDissipation;
uniform float u_farDissipation;
uniform float u_nearRadius;
uniform float u_farRadius;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec3 dens = texture(u_density, v_uv).xyz;

  // Find distance to nearest density source (well, star, or loot)
  // Uses toroidal wrapping to avoid seams at UV boundaries
  float minDist = 999.0;
  for (int i = 0; i < 256; i++) {
    if (i >= u_wellCount) break;
    vec2 diff = v_uv - u_wellPositions[i];
    diff = diff - round(diff);  // TOROIDAL WRAPPING RULE
    float d = length(diff);
    minDist = min(minDist, d);
  }

  // Blend dissipation based on distance to nearest source
  float blend = smoothstep(u_farRadius, u_nearRadius, minDist);
  float dissipation = mix(u_farDissipation, u_nearDissipation, blend);

  fragColor = vec4(dens * dissipation, 1.0);
}`;

// Density splat — for injecting visible dye alongside forces
export const FRAG_CLEAR = `#version 300 es
precision highp float;
uniform vec4 u_clearValue;
out vec4 fragColor;
void main() {
  fragColor = u_clearValue;
}`;

// Translate the source texture by u_delta (in UV) and write to the
// target. The grid is camera-anchored; when the camera moves we shift
// existing fluid contents by the camera's UV delta so currents stay
// world-stationary. Texels that scroll in from outside the source
// range read from the coarse field, which carries remembered world flow
// plus a well-driven baseline.
//
// World position from grid v_uv:
//   worldPos = (camera) + (v_uv - 0.5) * gridWindow
// World-UV (toroidal): worldPos / worldScale, then fract() to wrap.
export const FRAG_TRANSLATE = `#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform sampler2D u_coarse;
uniform int u_useCoarse;
uniform vec2 u_delta;
uniform vec2 u_camera;        // camera world position
uniform float u_gridWindow;
uniform float u_worldScale;
in vec2 v_uv;
out vec4 fragColor;
${GLSL_COORDS}
void main() {
  vec2 src = v_uv - u_delta;
  if (src.x < 0.0 || src.x > 1.0 || src.y < 0.0 || src.y > 1.0) {
    if (u_useCoarse == 0) {
      fragColor = vec4(0.0);
      return;
    }
    // Off-grid inflow: read the coarse field at the world position
    // this v_uv represents, then sample the world-anchored coarse field.
    vec2 worldPos = u_camera + lbhGridUvToWorldOffset(v_uv, u_gridWindow);
    vec2 coarseUV = lbhWorldToCoarseUv(worldPos, u_worldScale);
    fragColor = texture(u_coarse, coarseUV);
  } else {
    fragColor = texture(u_source, src);
  }
}`;

// Authority is uploaded by the server snapshot. Presentation detail may
// survive the fluid solve, but it is bounded so it cannot reverse a current
// stronger than the accepted ambient authority floor.
export const FRAG_AUTHORITY_FORCE = `#version 300 es
precision highp float;
uniform sampler2D u_velocity;
uniform sampler2D u_authority;
uniform float u_detailFloor;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec2 authority = texture(u_authority, v_uv).xy;
  vec2 detail = texture(u_velocity, v_uv).xy - authority;
  float detailMagnitude = length(detail);
  if (detailMagnitude > u_detailFloor && detailMagnitude > 1e-6) {
    detail *= u_detailFloor / detailMagnitude;
  }
  fragColor = vec4(authority + detail, 0.0, 1.0);
}`;
