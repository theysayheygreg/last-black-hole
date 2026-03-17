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
// V3: camera-aware — samples fluid at camera-offset UV, supports world wrapping
// - Velocity magnitude boosts brightness (fast flow = brighter/denser ASCII chars)
// - Flow direction tints color: toward a well = amber, away = teal
const FRAG_DISPLAY = `#version 300 es
precision highp float;
uniform sampler2D u_velocity;
uniform sampler2D u_density;
uniform vec3 u_voidColor;
uniform vec3 u_normalColor;
uniform vec3 u_nearWellColor;
uniform vec3 u_hotWellColor;
// Well positions for coloring (up to 4) — in fluid UV space
uniform vec2 u_wellPositions[4];
uniform int u_wellCount;
uniform float u_densityScale;
// Camera offset in fluid UV space and world scale
uniform vec2 u_camOffset;      // camera center in fluid UV (0-1)
uniform float u_worldScale;    // fraction of fluid texture visible (1/3 = one screen)
uniform float u_time;          // elapsed time in seconds (for shimmer noise)

in vec2 v_uv;
out vec4 fragColor;

void main() {
  // Map screen UV to fluid UV via camera offset
  // v_uv goes 0-1 across the screen; we want to see a 1/worldScale-sized slice
  // centered on u_camOffset
  vec2 fluidUV = u_camOffset + (v_uv - 0.5) / u_worldScale;
  // Texture uses REPEAT wrap, so no manual wrapping needed

  vec2 vel = texture(u_velocity, fluidUV).xy;
  vec3 dens = texture(u_density, fluidUV).xyz;

  float speed = length(vel);
  float rawDensity = length(dens);

  // Tone-map density: raw values range 0–300+, compress to 0–1 via exponential curve
  float density = 1.0 - exp(-rawDensity * u_densityScale);

  // Combine density and velocity magnitude for brightness signal
  float combined = density + speed * 1.5;

  // Base color: deep void to teal based on combined signal
  vec3 col = mix(u_voidColor, u_normalColor, clamp(combined, 0.0, 1.0));

  // Velocity magnitude brightness boost — makes currents visible as brighter bands
  // Thresholds lowered so ship/planetoid wakes register against ambient density
  float speedBrightness = smoothstep(0.0, 0.06, speed);
  col += speedBrightness * vec3(0.12, 0.25, 0.30);

  // High-velocity regions get a cyan highlight (wave crests / strong currents)
  float waveCrest = smoothstep(0.03, 0.12, speed);
  col = mix(col, vec3(0.1, 0.6, 0.7), waveCrest * 0.4);

  // Shimmer noise — time-varying luminance jitter so adjacent ASCII cells
  // flicker between characters. Creates living texture in the fabric.
  // Without this, large regions map to the same character and look static.
  float shimmer = fract(sin(dot(fluidUV * 200.0 + u_time * 0.3, vec2(12.9898, 78.233))) * 43758.5453);
  col += (shimmer - 0.5) * 0.06;

  // === FLOW DIRECTION TINTING ===
  for (int i = 0; i < 4; i++) {
    if (i >= u_wellCount) break;

    // Distance in fluid UV space (with wrapping consideration)
    vec2 diff = fluidUV - u_wellPositions[i];
    // Toroidal shortest path in UV space
    diff = diff - round(diff);
    float dist = length(diff);

    // Direction from this pixel toward the well
    vec2 toWell = dist > 0.0001 ? -diff / dist : vec2(0.0);

    float flowAlignment = speed > 0.001 ? dot(normalize(vel), toWell) : 0.0;
    float flowInfluence = smoothstep(0.5, 0.05, dist) * smoothstep(0.0, 0.08, speed);

    vec3 warmTint = vec3(0.25, 0.12, 0.02);
    vec3 coolTint = vec3(0.02, 0.12, 0.18);
    vec3 flowTint = mix(coolTint, warmTint, flowAlignment * 0.5 + 0.5);
    col += flowTint * flowInfluence * 0.4;

    // Well proximity coloring (amber/red near wells)
    float wellInfluence = smoothstep(0.35, 0.02, dist);
    vec3 wellColor = mix(u_nearWellColor, u_hotWellColor, smoothstep(0.15, 0.02, dist));
    col = mix(col, wellColor, wellInfluence * 0.6);
    float ringGlow = smoothstep(0.08, 0.04, dist) * (1.0 - smoothstep(0.02, 0.01, dist));
    col += ringGlow * vec3(0.3, 0.1, 0.02);
    float voidStrength = smoothstep(0.035, 0.008, dist);
    col = mix(col, vec3(0.0), voidStrength);
  }

  // Subtle vignette at screen edges (use screen UV, not fluid UV)
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
uniform vec2 u_wellPositions[12];
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
  float minDist = 999.0;
  for (int i = 0; i < 12; i++) {
    if (i >= u_wellCount) break;
    float d = distance(v_uv, u_wellPositions[i]);
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
      const count = Math.min(this._wellPositionsUV.length, 12);
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
   */
  render(target, wellPositionsUV, camOffsetU = 0.5, camOffsetV = 0.5, worldScale = 1.0, totalTime = 0) {
    const gl = this.gl;
    const u = this._useProgram(this.programs.display);
    gl.uniform1i(u['u_velocity'], 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform1i(u['u_density'], 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.density.read.tex);

    gl.uniform3fv(u['u_voidColor'], CONFIG.color.voidColor);
    gl.uniform3fv(u['u_normalColor'], CONFIG.color.normalSpace);
    gl.uniform3fv(u['u_nearWellColor'], CONFIG.color.nearWell);
    gl.uniform3fv(u['u_hotWellColor'], CONFIG.color.hotWell);
    gl.uniform1f(u['u_densityScale'], CONFIG.color.densityScale);

    // Camera + time uniforms
    gl.uniform2f(u['u_camOffset'], camOffsetU, camOffsetV);
    gl.uniform1f(u['u_worldScale'], worldScale);
    gl.uniform1f(u['u_time'], totalTime);

    // Set well positions for coloring
    const count = Math.min(wellPositionsUV.length, 4);
    gl.uniform1i(u['u_wellCount'], count);
    for (let i = 0; i < count; i++) {
      const loc = u[`u_wellPositions[${i}]`];
      if (loc) gl.uniform2fv(loc, wellPositionsUV[i]);
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
    const pixelX = Math.floor(uvX * this.res);
    const pixelY = Math.floor(uvY * this.res);

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
    const pixelX = Math.floor(uvX * this.res);
    const pixelY = Math.floor(uvY * this.res);

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
  }
}
