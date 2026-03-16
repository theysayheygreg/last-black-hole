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

// Radial force for gravity wells — applied to velocity field
const FRAG_WELL_FORCE = `#version 300 es
precision highp float;
uniform sampler2D u_velocity;
uniform vec2 u_wellPos;     // UV coords
uniform float u_gravity;
uniform float u_falloff;
uniform float u_clampRadius;
uniform float u_waveAmp;    // oscillation amplitude this frame (signed)
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

  // Radial inward force: gravity / r^falloff
  // Force falls off with distance, clamped near center
  float forceMag = u_gravity / pow(safeDist, u_falloff);

  // Persistent inward pull — always toward well
  vec2 pullForce = dir * forceMag;

  // Oscillating wave: positive waveAmp pushes outward, negative pulls inward
  // This creates the expanding wave rings
  // Wave force is strongest at moderate distance (not at center or far away)
  float waveProfile = exp(-dist * 8.0) * dist * 20.0; // peaks around dist=0.12
  vec2 waveForce = -dir * u_waveAmp * waveProfile;

  vec2 totalForce = (pullForce + waveForce) * u_dt;
  vel += totalForce;

  // Clamp terminal speed near well to prevent singularity buildup
  float speed = length(vel);
  if (speed > u_terminalSpeed && safeDist < 0.2) {
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
const FRAG_DISPLAY = `#version 300 es
precision highp float;
uniform sampler2D u_velocity;
uniform sampler2D u_density;
uniform vec3 u_voidColor;
uniform vec3 u_normalColor;
uniform vec3 u_nearWellColor;
uniform vec3 u_hotWellColor;
// Well positions for coloring (up to 4)
uniform vec2 u_wellPositions[4];
uniform int u_wellCount;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec2 vel = texture(u_velocity, v_uv).xy;
  vec3 dens = texture(u_density, v_uv).xyz;

  float speed = length(vel);
  float density = length(dens);

  // Base color: deep void to teal based on density
  vec3 col = mix(u_voidColor, u_normalColor, clamp(density * 2.0, 0.0, 1.0));

  // Add velocity brightness
  col += speed * 0.3;

  // Tint near wells: shift toward amber/red
  for (int i = 0; i < 4; i++) {
    if (i >= u_wellCount) break;
    float dist = distance(v_uv, u_wellPositions[i]);
    float wellInfluence = smoothstep(0.3, 0.02, dist);
    vec3 wellColor = mix(u_nearWellColor, u_hotWellColor, smoothstep(0.15, 0.02, dist));
    col = mix(col, wellColor, wellInfluence * 0.6);
    // Void center
    float voidStrength = smoothstep(0.04, 0.01, dist);
    col = mix(col, vec3(0.0), voidStrength);
  }

  fragColor = vec4(col, 1.0);
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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

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

  _useProgram(prog) {
    this.gl.useProgram(prog.program);
    return prog.uniforms;
  }

  /**
   * Apply gravity well forces to the velocity field.
   * Called once per well per step.
   */
  applyWellForce(wellUV, gravity, falloff, clampRadius, waveAmp, dt, terminalSpeed) {
    const gl = this.gl;
    const u = this._useProgram(this.programs.wellForce);
    gl.uniform1i(u['u_velocity'], 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform2f(u['u_wellPos'], wellUV[0], wellUV[1]);
    gl.uniform1f(u['u_gravity'], gravity);
    gl.uniform1f(u['u_falloff'], falloff);
    gl.uniform1f(u['u_clampRadius'], clampRadius);
    gl.uniform1f(u['u_waveAmp'], waveAmp);
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

    // 4. Advect density
    u = this._useProgram(this.programs.advect);
    gl.uniform1i(u['u_velocity'], 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform1i(u['u_source'], 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.density.read.tex);
    gl.uniform1f(u['u_dt'], dt * res);
    gl.uniform1f(u['u_dissipation'], CONFIG.fluid.densityDissipation);
    gl.uniform2fv(u['u_texelSize'], this.texelSize);
    this._blit(this.density.write);
    this.density.swap();

    // 5. Compute divergence
    u = this._useProgram(this.programs.divergence);
    gl.uniform1i(u['u_velocity'], 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform2fv(u['u_texelSize'], this.texelSize);
    this._blit(this.divergenceFBO);

    // 6. Clear pressure
    u = this._useProgram(this.programs.clear);
    gl.uniform4f(u['u_clearValue'], 0, 0, 0, 1);
    this._blit(this.pressure.read);

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
   */
  render(target, wellPositionsUV) {
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
}
