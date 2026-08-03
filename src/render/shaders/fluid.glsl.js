import { FABRIC_WELL_UNIFORM_BUDGET } from '../fabric-well-budget.js';

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
// Layers: gravity field → density/velocity overlay → sparse lanes → well color gradient → accretion
export const FRAG_DISPLAY = `#version 300 es
precision highp float;
uniform sampler2D u_velocity;
uniform sampler2D u_coarse;
uniform sampler2D u_density;
uniform sampler2D u_visualDensity;  // cosmetic-only density (no physics)
uniform vec3 u_voidColor;
uniform vec3 u_normalColor;
uniform vec3 u_nearWellColor;
uniform vec3 u_hotWellColor;
// Well positions + masses for gravity field visualization
uniform vec2 u_wellPositions[${FABRIC_WELL_UNIFORM_BUDGET}];
uniform float u_wellMasses[${FABRIC_WELL_UNIFORM_BUDGET}];
uniform vec4 u_wellShape[${FABRIC_WELL_UNIFORM_BUDGET}]; // x=core radius, y=ring inner, z=ring outer, w=orbitalDir
uniform vec4 u_wellProfile[${FABRIC_WELL_UNIFORM_BUDGET}]; // x=current reach, y=gravity falloff, z=full gravity, w=feather
uniform int u_wellCount;
uniform float u_densityScale;
uniform float u_gravityScale;
// Camera offset in fluid UV space and grid window
uniform vec2 u_camOffset;      // camera center in fluid UV (0-1)
uniform float u_gridWindow;    // world-units spanned by the camera-anchored fluid texture
uniform float u_cameraView;    // world-units visible on each axis; matches the square fluid window
uniform float u_viewAspect;    // retained for pass ABI; ignored while the fluid window is square
uniform float u_refScale;      // FLUID_REF_SCALE from coords.js — the scale all UV params were tuned at (3.0)
uniform float u_worldScale;    // authoritative world span used to keep lanes world anchored
uniform vec2 u_worldCamera;    // camera center in global fluid UV for the coarse field
uniform float u_time;          // elapsed time in seconds (for downstream lane animation)
// Collection-backed ecology state from the authority projection.
uniform int u_ecologyCount;
uniform vec2 u_ecologyPos[16];
uniform float u_ecologyRadius[16];
uniform float u_ecologyIntensity[16];
uniform float u_ecologyTime[16];
uniform int u_ecologyKind[16]; // 1=glitch, 2=swarm, 3=vessel
// Source-bound event waves are a material layer, not detached geometry.
uniform int u_waveCount;
uniform vec2 u_waveSource[8];
uniform vec4 u_waveShape[8]; // x=radius, y=front width, z=state, w=strength
uniform float u_waveTelegraph[8];

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

  // Base fabric stays quiet; the lane layer below is the only route-scale
  // current cue. This keeps local texture from impersonating gameplay flow.
  float baseMix = 0.004 + sceneExcitation * 0.03;
  vec3 col = mix(u_voidColor, u_normalColor, clamp(baseMix, 0.0, 0.07));

  // Sparse world-anchored lanes. The coarse texture is the accepted remote
  // current; local velocity is only a fallback for title/legacy sandbox views.
  vec2 coarseUV = fract(u_worldCamera + (v_uv - vec2(0.5))
    * (u_cameraView / u_worldScale) * vec2(1.0, -1.0));
  vec2 coarseFlow = texture(u_coarse, coarseUV).xy;
  vec2 laneFlow = length(coarseFlow) > 0.0001 ? coarseFlow : vel;
  float laneSpeed = length(laneFlow) * u_worldScale / u_refScale;
  float laneStrength = clamp(laneSpeed / 0.22, 0.0, 1.0);
  if (laneSpeed > 0.0001) {
    vec2 laneWorld = coarseUV * u_worldScale;
    float nearestWellDistance = 999.0;
    vec2 nearestWellWorld = laneWorld;
    vec2 nearestDelta = vec2(0.0);
    vec4 nearestProfile = vec4(0.0);
    float nearestOrbitalDir = 1.0;
    for (int i = 0; i < ${FABRIC_WELL_UNIFORM_BUDGET}; i++) {
      if (i >= u_wellCount) break;
      // u_wellPositions is camera-relative fluid UV; restore its global
      // fluid location before comparing it with the world-anchored lane.
      vec2 wellGlobalUV = fract(u_worldCamera
        + (u_wellPositions[i] - vec2(0.5)) * (u_gridWindow / u_worldScale));
      vec2 wellWorld = wellGlobalUV * u_worldScale;
      vec2 delta = laneWorld - wellWorld;
      delta -= round(delta / u_worldScale) * u_worldScale;
      float distanceToWell = length(delta);
      vec4 profile = u_wellProfile[i];
      if (profile.x > 0.0 && distanceToWell < min(nearestWellDistance, profile.x)) {
        nearestWellDistance = distanceToWell;
        nearestWellWorld = wellWorld;
        nearestDelta = delta;
        nearestProfile = profile;
        nearestOrbitalDir = u_wellShape[i].w;
      }
    }

    float currentWeight = 0.0;
    float gravityWeight = 0.0;
    float fullGravityWeight = 0.0;
    float coreQuiet = 0.0;
    if (nearestProfile.x > 0.0) {
      currentWeight = 1.0 - smoothstep(nearestProfile.x * 0.28, nearestProfile.x, nearestWellDistance);
      float gravityEnvelope = nearestProfile.y + nearestProfile.w;
      gravityWeight = 1.0 - smoothstep(nearestProfile.y * 0.24, gravityEnvelope, nearestWellDistance);
      fullGravityWeight = 1.0 - smoothstep(nearestProfile.z * 0.38, nearestProfile.z * 1.08, nearestWellDistance);
      coreQuiet = 1.0 - smoothstep(nearestProfile.z * 0.28, nearestProfile.z, nearestWellDistance);

      vec2 radial = nearestWellDistance > 0.0001
        ? nearestDelta / nearestWellDistance
        : vec2(1.0, 0.0);
      vec2 tangent = vec2(-radial.y, radial.x) * nearestOrbitalDir;
      float bendAngle = nearestOrbitalDir * currentWeight * (0.72 + gravityWeight * 0.48);
      float cosine = cos(bendAngle);
      float sine = sin(bendAngle);
      vec2 bentRadial = vec2(
        radial.x * cosine - radial.y * sine,
        radial.x * sine + radial.y * cosine
      );
      float compression = 1.0 - gravityWeight * 0.28 - fullGravityWeight * 0.38;
      laneWorld = nearestWellWorld + bentRadial * nearestWellDistance * compression;
      laneFlow = normalize(mix(laneFlow, tangent, currentWeight * 0.68));
    }

    vec2 laneDir = normalize(laneFlow);

    // B+C event-wave read: a broad material swell travels with the existing
    // lanes and fades quickly behind the authoritative front. The broken
    // crest is a sparse material accent, never a second ring primitive.
    float waveSwell = 0.0;
    float waveCrest = 0.0;
    vec2 waveDeformation = vec2(0.0);
    for (int wi = 0; wi < 8; wi++) {
      if (wi >= u_waveCount) break;
      vec4 wave = u_waveShape[wi];
      if (wave.z < 0.5) continue; // telegraph belongs to the source well
      vec2 waveDelta = laneWorld - u_waveSource[wi];
      waveDelta -= round(waveDelta / u_worldScale) * u_worldScale;
      float waveDistance = length(waveDelta);
      float width = max(0.001, wave.y);
      float front = exp(-abs(waveDistance - wave.x) / (width * 1.5));
      float behindDistance = max(0.0, wave.x - waveDistance);
      float behind = exp(-behindDistance / (width * 2.0));
      float swell = max(front, behind * 0.5) * wave.w;
      waveSwell = max(waveSwell, swell);
      if (waveDistance > 0.0001) waveDeformation += normalize(waveDelta) * swell * 0.08;

      float angle = atan(waveDelta.y, waveDelta.x);
      float segment = fract(angle * 1.7 + float(wi) * 0.23);
      float sparse = step(0.16, segment) * (1.0 - step(0.78, segment));
      waveCrest = max(waveCrest, front * sparse * wave.w);
    }
    laneWorld += waveDeformation;
    laneFlow = normalize(laneFlow + waveDeformation * 0.75);
    laneDir = normalize(laneFlow);
    vec2 laneSide = vec2(-laneDir.y, laneDir.x);
    float across = dot(laneWorld, laneSide);
    float along = dot(laneWorld, laneDir);
    const float laneSpacing = 0.92;
    float laneCenter = floor(across / laneSpacing + 0.5) * laneSpacing;
    float laneDistance = abs(across - laneCenter);
    float splitWeight = nearestProfile.z > 0.0
      ? 1.0 - smoothstep(nearestProfile.z * 0.72, nearestProfile.z * 1.32, nearestWellDistance)
      : 0.0;
    float splitOffset = splitWeight * nearestProfile.z * 1.35;
    float splitDistance = min(
      abs(across - laneCenter - splitOffset),
      abs(across - laneCenter + splitOffset)
    );
    laneDistance = mix(laneDistance, splitDistance, splitWeight);
    // The lethal neighborhood owns a dark material void. This suppresses the
    // inherited excitation texture so the well body, rim, and curved approach
    // lanes read as one cause instead of a bright anonymous patch.
    col *= mix(1.0, 0.16, coreQuiet);
    // Strength reads as longer, faster downstream strokes—not extra lanes or
    // thicker full-field coverage. The generous spacing preserves visual rest.
    float laneWidth = mix(0.012, 0.016, laneStrength);
    float localLaneWidth = laneWidth * mix(1.0, 1.38, gravityWeight * (1.0 - coreQuiet));
    float laneBody = 1.0 - smoothstep(localLaneWidth, localLaneWidth * 2.1, laneDistance);
    float markLength = mix(0.45, 1.25, laneStrength);
    float markPhase = fract(along / markLength - u_time * mix(0.12, 0.90, laneStrength));
    float markAttack = smoothstep(0.22, 0.28, markPhase);
    float markRelease = 1.0 - smoothstep(0.58, 0.66, markPhase);
    float brokenMark = markAttack * markRelease;
    float laneSignal = laneBody * brokenMark * smoothstep(0.01, 0.06, laneSpeed)
      * mix(0.34, 1.0, 1.0 - coreQuiet);
    vec3 laneColor = mix(vec3(0.018, 0.065, 0.14), vec3(0.08, 0.34, 0.60), laneStrength);
    laneColor = mix(laneColor, vec3(0.18, 0.52, 0.78), gravityWeight * 0.35 + fullGravityWeight * 0.65);
    // Event-wave treatment remains its existing green overlay until the
    // dedicated wave/noise pass; this slice only clarifies steady current.
    laneColor = mix(laneColor, vec3(0.12, 0.52, 0.46), clamp(waveSwell * 0.75, 0.0, 0.8));
    col += laneColor * laneSignal * 0.72 * mix(1.0, 1.42, gravityWeight * (1.0 - coreQuiet));
    col += vec3(0.24, 0.82, 0.70) * waveCrest * 0.42;
  }

  // === PER-WELL: dark core + one readable accretion band ===
  for (int i = 0; i < ${FABRIC_WELL_UNIFORM_BUDGET}; i++) {
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
    vec2 wellGlobalUV = fract(u_worldCamera
      + (u_wellPositions[i] - vec2(0.5)) * (u_gridWindow / u_worldScale));
    vec2 wellWorld = wellGlobalUV * u_worldScale;
    float telegraph = 0.0;
    for (int wi = 0; wi < 8; wi++) {
      if (wi >= u_waveCount) break;
      vec4 wave = u_waveShape[wi];
      if (wave.z > 0.5) continue;
      vec2 waveDelta = wellWorld - u_waveSource[wi];
      waveDelta -= round(waveDelta / u_worldScale) * u_worldScale;
      float sourceMatch = 1.0 - smoothstep(0.015, 0.08, length(waveDelta));
      telegraph = max(telegraph, sourceMatch * u_waveTelegraph[wi]);
    }
    // The source well tightens and brightens during the authored prelaunch
    // window; progress comes from the authority projection, not u_time.
    float telegraphScale = 1.0 + telegraph * 0.14;
    float displayDist = dist * telegraphScale;
    // Preserve gameplay radii as truth while guaranteeing that the authored
    // lethal body has a compact readable silhouette at Deck resolution.
    float visualCoreRadius = max(coreRadius, u_cameraView * 0.014);
    float coreMask = smoothstep(visualCoreRadius * 1.18, visualCoreRadius * 0.82, displayDist);
    float horizonMask = smoothstep(visualCoreRadius * 1.24, visualCoreRadius * 1.02, displayDist)
                      * (1.0 - smoothstep(visualCoreRadius * 1.02, visualCoreRadius * 0.88, displayDist));
    // Ring band: bright between inner and outer, fades to zero at both edges.
    // Outer fade: smoothstep from outer→inner (1 at inner, 0 at outer)
    // Inner fade: smoothstep from core→inner (0 at core, 1 at inner)
    float visualRingInner = max(ringInner, visualCoreRadius * 1.28);
    float visualRingOuter = max(ringOuter, visualCoreRadius * 1.85);
    float ringMask = smoothstep(visualRingOuter, visualRingInner, displayDist)
                   * smoothstep(visualCoreRadius * 1.03, visualRingInner, displayDist);
    float localLive = 1.0 - coreMask;
    float analyticRing = clamp(0.5 + u_wellMasses[i] * 0.36, 0.5, 1.2);
    float ringEnergy = max(ringSignal, analyticRing) + telegraph * 0.65;
    float localRing = ringMask * mix(0.62, 1.18, ringEnergy);
    vec3 ringColor = mix(u_nearWellColor, u_hotWellColor, clamp(0.12 + ringEnergy * 0.88, 0.0, 1.0));
    vec2 radial = dist > 0.0001 ? diff / length(diff) : vec2(1.0, 0.0);
    vec2 tangent = vec2(-radial.y, radial.x) * orbitalDir;
    float tangentialAlignment = speed > 0.001 ? dot(normalize(vel), tangent) * 0.5 + 0.5 : 0.5;
    float ringBias = mix(0.96, 1.34, tangentialAlignment);

    // Thin event-horizon rim so the lethal edge is legible even on smaller wells.
    col += mix(u_nearWellColor, u_hotWellColor, 0.7) * horizonMask * (0.35 + 0.18 * ringEnergy) * localLive;

    // Main accretion band. This is the bright read, not the whole well.
    col += ringColor * localRing * 1.16 * ringBias * localLive;

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
