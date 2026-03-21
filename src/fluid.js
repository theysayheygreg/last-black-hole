/**
 * fluid.js — Navier-Stokes solver on GPU via WebGL 2.
 * Approach A: single fluid sim, waves via oscillating force injection.
 *
 * Pipeline per step:
 *   advect velocity -> diffuse (viscosity) -> add forces -> pressure solve (Jacobi) -> subtract gradient
 *
 * All operations are fragment shader passes on ping-pong framebuffers.
 */

import { CONFIG } from './config.js';

// ---- Shader sources ----

const VERT_QUAD = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAG_ADVECT = `#version 300 es
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

const FRAG_DIVERGENCE = `#version 300 es
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

const FRAG_PRESSURE = `#version 300 es
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

const FRAG_GRADIENT_SUBTRACT = `#version 300 es
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

// Splat shader — injects force/density at a point
const FRAG_SPLAT = `#version 300 es
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
  diff.x *= u_aspectRatio;
  float d = dot(diff, diff);
  float strength = exp(-d / u_radius);
  vec3 base = texture(u_target, v_uv).xyz;
  fragColor = vec4(base + strength * u_value, 1.0);
}`;

// Radial + tangential force for gravity wells — applied to velocity field
// V2: constant radial pull + tangential orbital force. No oscillation.
const FRAG_WELL_FORCE = `#version 300 es
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
const FRAG_CURL = `#version 300 es
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

const FRAG_VORTICITY = `#version 300 es
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
const FRAG_DISPLAY = `#version 300 es
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
// Camera offset in fluid UV space and world scale
uniform vec2 u_camOffset;      // camera center in fluid UV (0-1)
uniform float u_worldScale;    // fraction of fluid texture visible (1/3 = one screen)
uniform float u_time;          // elapsed time in seconds (for shimmer noise)

in vec2 v_uv;
out vec4 fragColor;

void main() {
  // Map screen UV to fluid UV via camera offset
  vec2 fluidUV = u_camOffset + (v_uv - 0.5) / u_worldScale;
  vec2 wrappedFluidUV = fract(fluidUV);

  vec2 vel = texture(u_velocity, wrappedFluidUV).xy;
  vec3 dens = texture(u_density, wrappedFluidUV).xyz;
  vec3 visDens = texture(u_visualDensity, wrappedFluidUV).xyz;
  // Scene shaping owns two separate signals:
  //   positive visual density = excitation / glow / accretion
  //   negative visual density = collapse / void / absence
  vec3 posVis = max(visDens, vec3(0.0));
  vec3 negVis = max(-visDens, vec3(0.0));
  // Normalize UV velocity to world-equivalent speed (calibrated at WORLD_SCALE=3)
  float speed = length(vel) * u_worldScale / 3.0;

  // Scale UV distances to world-equivalent so glow matches across map sizes
  float uvS = 3.0 / u_worldScale;

  // === PRIMARY SCENE SIGNALS ===
  // Physical density = background fabric excitation.
  // Positive visual density = ring intensity, not whole-frame brightness.
  // Negative visual density = explicit collapse / absence.
  float rawExcitation = length(max(dens, vec3(0.0)));
  float sceneExcitation = 1.0 - exp(-rawExcitation * (u_densityScale * 0.28));
  float rawRing = length(posVis);
  float ringSignal = 1.0 - exp(-rawRing * 0.06);

  // Collapse must survive quantization as a separate, subtractive signal.
  float rawVoid = max(negVis.r, max(negVis.g, negVis.b));
  float voidField = 1.0 - exp(-rawVoid * 3.5);
  float liveSpace = 1.0 - voidField;

  // === FABRIC NOISE — subtle texture, strongest in darker regions ===
  vec2 fabricUV = wrappedFluidUV * 12.0 + u_time * 0.02;
  float fabric = fract(sin(dot(fabricUV, vec2(127.1, 311.7))) * 43758.5453);
  float fabric2 = fract(sin(dot(fabricUV * 0.5 + 3.3, vec2(269.5, 183.3))) * 43758.5453);
  float fabricNoise = (fabric * 0.6 + fabric2 * 0.4) * 0.08;
  fabricNoise *= mix(0.3, 1.0, 1.0 - sceneExcitation);

  // Base fabric. Keep it dark. Let rings do the bright work.
  float baseMix = 0.04 + sceneExcitation * 0.18 + smoothstep(0.01, 0.07, speed) * 0.12 + fabricNoise * 0.45;
  vec3 col = mix(u_voidColor, u_normalColor, clamp(baseMix, 0.0, 0.35));
  col *= liveSpace;

  // Currents should read, but not blow the frame out.
  float flowLight = smoothstep(0.015, 0.08, speed);
  col += vec3(0.03, 0.08, 0.10) * flowLight * liveSpace;

  // === PER-WELL: dark core + one readable accretion band ===
  for (int i = 0; i < 256; i++) {
    if (i >= u_wellCount) break;

    vec2 diff = wrappedFluidUV - u_wellPositions[i];
    diff = diff - round(diff);
    float dist = length(diff) / uvS;

    vec4 shape = u_wellShape[i];
    float coreRadius = shape.x;
    float ringInner = shape.y;
    float ringOuter = shape.z;
    float orbitalDir = shape.w;
    float coreMask = smoothstep(coreRadius * 1.22, coreRadius * 0.82, dist);
    float ringMask = smoothstep(ringOuter, ringInner, dist)
                   * (1.0 - smoothstep(ringInner, coreRadius * 1.03, dist));
    float haloMask = smoothstep(ringOuter * 1.8, ringOuter, dist)
                   * (1.0 - smoothstep(ringOuter, ringInner, dist));

    float localLive = liveSpace * (1.0 - coreMask);
    float analyticRing = clamp(0.25 + u_wellMasses[i] * 0.32, 0.25, 1.0);
    float ringEnergy = max(ringSignal, analyticRing);
    float localRing = ringMask * mix(0.28, 1.0, ringEnergy);
    vec3 ringColor = mix(u_nearWellColor, u_hotWellColor, clamp(0.12 + ringEnergy * 0.88, 0.0, 1.0));
    vec2 radial = dist > 0.0001 ? diff / length(diff) : vec2(1.0, 0.0);
    vec2 tangent = vec2(-radial.y, radial.x) * orbitalDir;
    float tangentialAlignment = speed > 0.001 ? dot(normalize(vel), tangent) * 0.5 + 0.5 : 0.5;
    float ringBias = mix(0.82, 1.18, tangentialAlignment);

    // Gentle halo outside the ring so the fabric feels disturbed, not flooded.
    col += ringColor * haloMask * 0.12 * localLive;

    // Main accretion band. This is the bright read, not the whole well.
    col += ringColor * localRing * 0.8 * ringBias * localLive;

    // Surf hint just outside the ring: where tangential motion is strongest,
    // add a cool directional band instead of more brightness.
    float surfBand = smoothstep(ringOuter * 1.55, ringOuter * 1.05, dist)
                   * (1.0 - smoothstep(ringOuter * 2.45, ringOuter * 1.55, dist));
    float surfHint = surfBand * smoothstep(0.012, 0.055, speed) * mix(0.45, 1.0, tangentialAlignment);
    col += vec3(0.025, 0.14, 0.18) * surfHint * 1.1 * localLive;

    // Final dark core. This must win.
    col = mix(col, vec3(0.0), coreMask * 0.985);
  }

  // Subtle vignette at screen edges
  vec2 fromCenter = v_uv - 0.5;
  float vignette = 1.0 - dot(fromCenter, fromCenter) * 0.5;
  col *= vignette;

  fragColor = vec4(col, 1.0);
}`;

// Distance-based dissipation — density fades faster far from wells
// Near wells: persistent accretion zones. Far from wells: quick fadeout.
const FRAG_DISSIPATION = `#version 300 es
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
    diff = diff - round(diff);  // toroidal shortest path
    float d = length(diff);
    minDist = min(minDist, d);
  }

  // Blend dissipation based on distance to nearest source
  float blend = smoothstep(u_farRadius, u_nearRadius, minDist);
  float dissipation = mix(u_farDissipation, u_nearDissipation, blend);

  fragColor = vec4(dens * dissipation, 1.0);
}`;

// Density splat — for injecting visible dye alongside forces
const FRAG_CLEAR = `#version 300 es
precision highp float;
uniform vec4 u_clearValue;
out vec4 fragColor;
void main() {
  fragColor = u_clearValue;
}`;


export class FluidSim {
  constructor(gl) {
    this.gl = gl;
    this.res = CONFIG.fluid.resolution;
    this.texelSize = [1.0 / this.res, 1.0 / this.res];

    this._initGL();
    this._createFramebuffers();
  }

  _initGL() {
    const gl = this.gl;

    // Compile all shader programs
    this.programs = {
      advect: this._createProgram(VERT_QUAD, FRAG_ADVECT),
      divergence: this._createProgram(VERT_QUAD, FRAG_DIVERGENCE),
      pressure: this._createProgram(VERT_QUAD, FRAG_PRESSURE),
      gradientSubtract: this._createProgram(VERT_QUAD, FRAG_GRADIENT_SUBTRACT),
      splat: this._createProgram(VERT_QUAD, FRAG_SPLAT),
      wellForce: this._createProgram(VERT_QUAD, FRAG_WELL_FORCE),
      curl: this._createProgram(VERT_QUAD, FRAG_CURL),
      vorticity: this._createProgram(VERT_QUAD, FRAG_VORTICITY),
      display: this._createProgram(VERT_QUAD, FRAG_DISPLAY),
      dissipation: this._createProgram(VERT_QUAD, FRAG_DISSIPATION),
      clear: this._createProgram(VERT_QUAD, FRAG_CLEAR),
    };

    // Fullscreen quad
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

  _createFramebuffers() {
    const res = this.res;
    // Double-buffered FBOs for velocity, pressure, density
    this.velocity = this._createDoubleFBO(res, res);
    this.density = this._createDoubleFBO(res, res);
    this.pressure = this._createDoubleFBO(res, res);
    this.divergenceFBO = this._createFBO(res, res);
    this.curlFBO = this._createFBO(res, res);
    // Visual-only density buffer — cosmetic effects that don't affect physics
    this.visualDensity = this._createDoubleFBO(res, res);
  }

  _createFBO(w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { fbo, tex, w, h };
  }

  _createDoubleFBO(w, h) {
    return {
      read: this._createFBO(w, h),
      write: this._createFBO(w, h),
      swap() {
        const tmp = this.read;
        this.read = this.write;
        this.write = tmp;
      }
    };
  }

  _createProgram(vertSrc, fragSrc) {
    const gl = this.gl;
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vertSrc);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      console.error('Vertex shader error:', gl.getShaderInfoLog(vs));
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fragSrc);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error('Fragment shader error:', gl.getShaderInfoLog(fs));
    }

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'a_position');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(prog));
    }

    // Cache uniform locations
    const uniforms = {};
    const numUniforms = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < numUniforms; i++) {
      const info = gl.getActiveUniform(prog, i);
      // Handle array uniforms — strip [0] for base name
      const baseName = info.name.replace(/\[0\]$/, '');
      if (info.size > 1) {
        for (let j = 0; j < info.size; j++) {
          const arrName = `${baseName}[${j}]`;
          uniforms[arrName] = gl.getUniformLocation(prog, arrName);
        }
      }
      uniforms[info.name] = gl.getUniformLocation(prog, info.name);
      if (info.name !== baseName) {
        uniforms[baseName] = gl.getUniformLocation(prog, info.name);
      }
    }

    return { program: prog, uniforms };
  }

  _drawQuad() {
    const gl = this.gl;
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  _blit(target) {
    const gl = this.gl;
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.viewport(0, 0, target.w, target.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    }
    this._drawQuad();
  }

  _clearTarget(target, r = 0, g = 0, b = 0, a = 1) {
    const gl = this.gl;
    const u = this._useProgram(this.programs.clear);
    gl.uniform4f(u['u_clearValue'], r, g, b, a);
    this._blit(target);
  }

  _useProgram(prog) {
    this.gl.useProgram(prog.program);
    return prog.uniforms;
  }

  /**
   * Apply gravity well forces to the velocity field.
   * Called once per well per step.
   */
  applyWellForce(wellUV, gravity, falloff, clampRadius, orbitalStrength, dt, terminalSpeed) {
    const gl = this.gl;
    const u = this._useProgram(this.programs.wellForce);
    gl.uniform1i(u['u_velocity'], 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform2f(u['u_wellPos'], wellUV[0], wellUV[1]);
    gl.uniform1f(u['u_gravity'], gravity);
    gl.uniform1f(u['u_falloff'], falloff);
    gl.uniform1f(u['u_clampRadius'], clampRadius);
    gl.uniform1f(u['u_orbitalStrength'], orbitalStrength);
    gl.uniform1f(u['u_dt'], dt);
    gl.uniform1f(u['u_terminalSpeed'], terminalSpeed);
    gl.uniform1f(u['u_aspectRatio'], 1.0); // square sim texture
    gl.uniform2fv(u['u_texelSize'], this.texelSize);
    this._blit(this.velocity.write);
    this.velocity.swap();
  }

  /**
   * Inject a force/density splat (e.g., ship thrust wake).
   */
  splat(x, y, dx, dy, radius, r, g, b) {
    const gl = this.gl;
    // Velocity splat
    const u = this._useProgram(this.programs.splat);
    gl.uniform1i(u['u_target'], 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform2f(u['u_point'], x, y);
    gl.uniform3f(u['u_value'], dx, dy, 0.0);
    gl.uniform1f(u['u_radius'], radius);
    gl.uniform1f(u['u_aspectRatio'], 1.0);
    this._blit(this.velocity.write);
    this.velocity.swap();

    // Density splat
    const u2 = this._useProgram(this.programs.splat);
    gl.uniform1i(u2['u_target'], 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.density.read.tex);
    gl.uniform2f(u2['u_point'], x, y);
    gl.uniform3f(u2['u_value'], r, g, b);
    gl.uniform1f(u2['u_radius'], radius);
    gl.uniform1f(u2['u_aspectRatio'], 1.0);
    this._blit(this.density.write);
    this.density.swap();
  }

  /**
   * Inject a visual-only density splat. Appears in the display shader
   * but does NOT affect the physics simulation (no velocity, no dissipation).
   */
  visualSplat(x, y, radius, r, g, b) {
    const gl = this.gl;
    const u = this._useProgram(this.programs.splat);
    gl.uniform1i(u['u_target'], 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.visualDensity.read.tex);
    gl.uniform2f(u['u_point'], x, y);
    gl.uniform3f(u['u_value'], r, g, b);
    gl.uniform1f(u['u_radius'], radius);
    gl.uniform1f(u['u_aspectRatio'], 1.0);
    this._blit(this.visualDensity.write);
    this.visualDensity.swap();
  }

  /**
   * Fade the visual density buffer (called once per frame before visual splats).
   * Provides short persistence for trails and afterglow effects.
   */
  fadeVisualDensity(fadeRate = 0.92) {
    const gl = this.gl;
    const u = this._useProgram(this.programs.advect);
    gl.uniform1i(u['u_velocity'], 0);
    gl.activeTexture(gl.TEXTURE0);
    // Use a zero-velocity field so advection doesn't move anything — just dissipates
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform1i(u['u_source'], 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.visualDensity.read.tex);
    gl.uniform1f(u['u_dt'], 0);  // no advection movement
    gl.uniform1f(u['u_dissipation'], fadeRate);
    gl.uniform2fv(u['u_texelSize'], this.texelSize);
    this._blit(this.visualDensity.write);
    this.visualDensity.swap();
  }

  /**
   * Main simulation step.
   */
  step(dt) {
    const gl = this.gl;
    const res = this.res;

    // 1. Curl (for vorticity confinement)
    let u = this._useProgram(this.programs.curl);
    gl.uniform1i(u['u_velocity'], 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform2fv(u['u_texelSize'], this.texelSize);
    this._blit(this.curlFBO);

    // 2. Vorticity confinement
    u = this._useProgram(this.programs.vorticity);
    gl.uniform1i(u['u_velocity'], 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform1i(u['u_curl'], 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.curlFBO.tex);
    gl.uniform1f(u['u_curlStrength'], CONFIG.fluid.curl);
    gl.uniform1f(u['u_dt'], dt);
    gl.uniform2fv(u['u_texelSize'], this.texelSize);
    this._blit(this.velocity.write);
    this.velocity.swap();

    // 3. Advect velocity
    u = this._useProgram(this.programs.advect);
    gl.uniform1i(u['u_velocity'], 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform1i(u['u_source'], 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform1f(u['u_dt'], dt * res);
    gl.uniform1f(u['u_dissipation'], CONFIG.fluid.dissipation);
    gl.uniform2fv(u['u_texelSize'], this.texelSize);
    this._blit(this.velocity.write);
    this.velocity.swap();

    // 4. Advect density (uniform dissipation from advect shader)
    u = this._useProgram(this.programs.advect);
    gl.uniform1i(u['u_velocity'], 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform1i(u['u_source'], 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.density.read.tex);
    gl.uniform1f(u['u_dt'], dt * res);
    gl.uniform1f(u['u_dissipation'], 1.0); // no dissipation here — handled by distance-based pass below
    gl.uniform2fv(u['u_texelSize'], this.texelSize);
    this._blit(this.density.write);
    this.density.swap();

    // 4b. Distance-based density dissipation — near wells: persistent, far: quick fadeout
    if (this._wellPositionsUV && this._wellPositionsUV.length > 0) {
      u = this._useProgram(this.programs.dissipation);
      gl.uniform1i(u['u_density'], 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.density.read.tex);
      gl.uniform1f(u['u_nearDissipation'], CONFIG.fluid.nearDissipation);
      gl.uniform1f(u['u_farDissipation'], CONFIG.fluid.farDissipation);
      gl.uniform1f(u['u_nearRadius'], CONFIG.fluid.dissipationNearRadius);
      gl.uniform1f(u['u_farRadius'], CONFIG.fluid.dissipationFarRadius);
      const count = this._wellPositionsUV.length;
      gl.uniform1i(u['u_wellCount'], count);
      for (let i = 0; i < count; i++) {
        const loc = u[`u_wellPositions[${i}]`];
        if (loc) gl.uniform2fv(loc, this._wellPositionsUV[i]);
      }
      this._blit(this.density.write);
      this.density.swap();
    }

    // 5. Compute divergence
    u = this._useProgram(this.programs.divergence);
    gl.uniform1i(u['u_velocity'], 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform2fv(u['u_texelSize'], this.texelSize);
    this._blit(this.divergenceFBO);

    // 6. Clear pressure
    this._clearTarget(this.pressure.read);

    // 7. Pressure solve (Jacobi iteration)
    for (let i = 0; i < CONFIG.fluid.pressureIterations; i++) {
      u = this._useProgram(this.programs.pressure);
      gl.uniform1i(u['u_pressure'], 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.tex);
      gl.uniform1i(u['u_divergence'], 1);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.divergenceFBO.tex);
      gl.uniform2fv(u['u_texelSize'], this.texelSize);
      this._blit(this.pressure.write);
      this.pressure.swap();
    }

    // 8. Gradient subtraction (pressure projection)
    u = this._useProgram(this.programs.gradientSubtract);
    gl.uniform1i(u['u_pressure'], 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.tex);
    gl.uniform1i(u['u_velocity'], 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform2fv(u['u_texelSize'], this.texelSize);
    this._blit(this.velocity.write);
    this.velocity.swap();
  }

  /**
   * Render the fluid to screen (or to a target FBO).
   * @param {Object} target - FBO target or null for screen
   * @param {Array} wellPositionsUV - well positions in fluid UV space
   * @param {number} camOffsetU - camera center X in fluid UV (0-1)
   * @param {number} camOffsetV - camera center Y in fluid UV (0-1)
   * @param {number} worldScale - how many world-units map to the full texture (default 1 for legacy)
   * @param {number} totalTime - elapsed time in seconds
   * @param {Array} wellMasses - mass per well, matching wellPositionsUV order
   */
  render(target, wellPositionsUV, camOffsetU = 0.5, camOffsetV = 0.5, worldScale = 1.0, totalTime = 0, wellMasses = [], wellShapes = []) {
    const gl = this.gl;
    const u = this._useProgram(this.programs.display);
    gl.uniform1i(u['u_velocity'], 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform1i(u['u_density'], 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.density.read.tex);
    gl.uniform1i(u['u_visualDensity'], 2);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.visualDensity.read.tex);

    gl.uniform3fv(u['u_voidColor'], CONFIG.color.voidColor);
    gl.uniform3fv(u['u_normalColor'], CONFIG.color.normalSpace);
    gl.uniform3fv(u['u_nearWellColor'], CONFIG.color.nearWell);
    gl.uniform3fv(u['u_hotWellColor'], CONFIG.color.hotWell);
    gl.uniform1f(u['u_densityScale'], CONFIG.color.densityScale);
    gl.uniform1f(u['u_gravityScale'], CONFIG.color.gravityScale);

    // Camera + time uniforms
    gl.uniform2f(u['u_camOffset'], camOffsetU, camOffsetV);
    gl.uniform1f(u['u_worldScale'], worldScale);
    gl.uniform1f(u['u_time'], totalTime);

    // Set well positions and masses for gravity field visualization
    const count = wellPositionsUV.length;
    gl.uniform1i(u['u_wellCount'], count);
    for (let i = 0; i < count; i++) {
      const posLoc = u[`u_wellPositions[${i}]`];
      if (posLoc) gl.uniform2fv(posLoc, wellPositionsUV[i]);
      const massLoc = u[`u_wellMasses[${i}]`];
      if (massLoc) gl.uniform1f(massLoc, wellMasses[i] ?? 1.0);
      const shapeLoc = u[`u_wellShape[${i}]`];
      if (shapeLoc) gl.uniform4fv(shapeLoc, wellShapes[i] ?? [0.01, 0.02, 0.03, 1.0]);
    }

    if (target) {
      this._blit(target);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      this._drawQuad();
    }
  }

  /**
   * Read fluid velocity at a UV coordinate (0-1 range).
   * Returns [vx, vy] by reading back from GPU.
   * Note: readPixels is slow — use sparingly (once per frame for ship).
   */
  readVelocityAt(uvX, uvY) {
    const gl = this.gl;
    const wrappedX = ((uvX % 1) + 1) % 1;
    const wrappedY = ((uvY % 1) + 1) % 1;
    const pixelX = Math.min(this.res - 1, Math.floor(wrappedX * this.res));
    const pixelY = Math.min(this.res - 1, Math.floor(wrappedY * this.res));

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocity.read.fbo);

    // Try FLOAT read first (works on most desktop GPUs)
    try {
      const buf = new Float32Array(4);
      gl.readPixels(pixelX, pixelY, 1, 1, gl.RGBA, gl.FLOAT, buf);
      if (gl.getError() === gl.NO_ERROR) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return [buf[0], buf[1]];
      }
    } catch (e) {
      // Fall through to fallback
    }

    // Fallback: read as half-float if FLOAT fails
    // For headless/software rendering, just return zero
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return [0, 0];
  }

  /**
   * Read fluid density at a UV coordinate (0-1 range).
   * Returns [r, g, b] by reading back from GPU.
   * Note: readPixels is slow — use sparingly.
   */
  readDensityAt(uvX, uvY) {
    const gl = this.gl;
    const wrappedX = ((uvX % 1) + 1) % 1;
    const wrappedY = ((uvY % 1) + 1) % 1;
    const pixelX = Math.min(this.res - 1, Math.floor(wrappedX * this.res));
    const pixelY = Math.min(this.res - 1, Math.floor(wrappedY * this.res));

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.density.read.fbo);

    try {
      const buf = new Float32Array(4);
      gl.readPixels(pixelX, pixelY, 1, 1, gl.RGBA, gl.FLOAT, buf);
      if (gl.getError() === gl.NO_ERROR) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return [buf[0], buf[1], buf[2]];
      }
    } catch (e) {
      // Fall through to fallback
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return [0, 0, 0];
  }

  /**
   * Set well positions in fluid UV space for the distance-based dissipation pass.
   * Call once per frame before step(), with the same UV positions used for rendering.
   */
  setWellPositions(wellPositionsUV) {
    this._wellPositionsUV = wellPositionsUV;
  }

  /**
   * Reinitialize the fluid sim at a new resolution.
   * Destroys existing framebuffers and creates new ones.
   */
  reinitialize(newRes) {
    const gl = this.gl;

    // Delete old framebuffers and textures
    const destroyFBO = (fbo) => {
      gl.deleteTexture(fbo.tex);
      gl.deleteFramebuffer(fbo.fbo);
    };
    const destroyDoubleFBO = (dfbo) => {
      destroyFBO(dfbo.read);
      destroyFBO(dfbo.write);
    };

    destroyDoubleFBO(this.velocity);
    destroyDoubleFBO(this.density);
    destroyDoubleFBO(this.pressure);
    destroyDoubleFBO(this.visualDensity);
    destroyFBO(this.divergenceFBO);
    destroyFBO(this.curlFBO);

    // Create new framebuffers at the new resolution
    this.res = newRes;
    this.texelSize = [1.0 / this.res, 1.0 / this.res];
    this._createFramebuffers();
  }

  /**
   * Clear all simulation buffers so a restart begins from a real blank state.
   */
  clear() {
    this._clearTarget(this.velocity.read);
    this._clearTarget(this.velocity.write);
    this._clearTarget(this.density.read);
    this._clearTarget(this.density.write);
    this._clearTarget(this.pressure.read);
    this._clearTarget(this.pressure.write);
    this._clearTarget(this.divergenceFBO);
    this._clearTarget(this.curlFBO);
    this._clearTarget(this.visualDensity.read);
    this._clearTarget(this.visualDensity.write);
  }
}
