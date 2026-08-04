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
import { FLUID_REF_SCALE, uvScale } from './coords.js';
import { eventWaveSourceFluidWorld } from './presentation/well-wave-presentation.js';
import { FABRIC_WELL_UNIFORM_BUDGET } from './render/fabric-well-budget.js';
import {
  authorityFloor,
  resampleAuthoritativeField,
} from './authoritative-field.mjs';
import {
  FRAG_ADVECT,
  FRAG_AUTHORITY_FORCE,
  FRAG_CLEAR,
  FRAG_CURL,
  FRAG_DISSIPATION,
  FRAG_DISPLAY,
  FRAG_DIVERGENCE,
  FRAG_GRADIENT_SUBTRACT,
  FRAG_PRESSURE,
  FRAG_SPLAT,
  FRAG_TRANSLATE,
  FRAG_VORTICITY,
  FRAG_WELL_FORCE,
  VERT_QUAD,
} from './render/shaders/fluid.glsl.js';

export class FluidSim {
  constructor(gl) {
    this.gl = gl;
    this.res = CONFIG.fluid.resolution;
    this.texelSize = [1.0 / this.res, 1.0 / this.res];
    this.authoritativeField = null;
    this.authorityFloor = 0;

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
      translate: this._createProgram(VERT_QUAD, FRAG_TRANSLATE),
      authorityForce: this._createProgram(VERT_QUAD, FRAG_AUTHORITY_FORCE),
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
    // Coarse field — world-anchored low-res velocity grid that backs the
    // fluid grid's inflow boundary. Ping-pong so captured transient flow
    // can decay toward the well baseline instead of disappearing as soon
    // as a cell leaves the live fluid window.
    this.coarseRes = CONFIG.fluid.coarseResolution;
    this.coarseField = this._createDoubleFBO(this.coarseRes, this.coarseRes);
    this._clearTarget(this.coarseField.read, 0, 0, 0, 0);
    this._clearTarget(this.coarseField.write, 0, 0, 0, 0);
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
   * Called once per well per step. Wells outside the camera-anchored grid
   * window are skipped. FRAG_WELL_FORCE is toroidal, so applying an
   * off-window well directly would pull the wrong edge of the texture.
   * Distant wells still influence the boundary through the coarse field.
   */
  applyWellForce(wellUV, gravity, falloff, clampRadius, orbitalStrength, dt, terminalSpeed) {
    if (wellUV[0] < -0.05 || wellUV[0] > 1.05 || wellUV[1] < -0.05 || wellUV[1] > 1.05) return;
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
   * Inject a force/density splat (e.g., ship thrust wake). Splats whose
   * UV center falls outside the grid window are skipped — see comment on
   * applyWellForce for why.
   */
  splat(x, y, dx, dy, radius, r, g, b) {
    if (x < -0.05 || x > 1.05 || y < -0.05 || y > 1.05) return;
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
    if (x < -0.05 || x > 1.05 || y < -0.05 || y > 1.05) return;
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
      // Dissipation radii live in the camera-window fluid texture. Scale by
      // GRID_WINDOW, never total map size, so large maps keep the same visible
      // persistence zone around wells/stars.
      const dissipScale = uvScale();
      gl.uniform1f(u['u_nearRadius'], CONFIG.fluid.dissipationNearRadius * dissipScale);
      gl.uniform1f(u['u_farRadius'], CONFIG.fluid.dissipationFarRadius * dissipScale);
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

    // Authority is the gameplay-visible floor. Presentation turbulence can
    // remain, but it is clamped against the registered field before display.
    this.forceFromAuthoritativeField();
  }

  /**
   * Render the fluid to screen (or to a target FBO).
   * @param {Object} target - FBO target or null for screen
   * @param {Array} wellPositionsUV - well positions in fluid UV space
   * @param {number} camOffsetU - camera center X in fluid UV (0-1)
   * @param {number} camOffsetV - camera center Y in fluid UV (0-1)
   * @param {number} gridWindow - world-units spanned by the camera-anchored fluid texture
   * @param {number} cameraView - world-units visible on each axis
   * @param {number} viewAspect - retained for pass ABI; ignored while the fluid window is square
   * @param {number} totalTime - elapsed time in seconds
   * @param {Array} wellMasses - mass per well, matching wellPositionsUV order
   * @param {Array} wellShapes - visual well shape data, matching wellPositionsUV order
   * @param {Object|null} inhibitorData - bounded collection-backed ecology projection
   * @param {Array} wellProfiles - authored deformation profiles, matching wellPositionsUV order
   * @param {number} worldScale - total world span used by the lane prototype
   * @param {Array} worldCameraUV - camera center in global fluid UV for coarse sampling
   */
  render(target, wellPositionsUV, camOffsetU = 0.5, camOffsetV = 0.5, gridWindow = 1.0, cameraView = 1.0, viewAspect = 1.0, totalTime = 0, wellMasses = [], wellShapes = [], inhibitorData = null, wellProfiles = [], worldScale = 3.0, worldCameraUV = [0.5, 0.5], wavePresentation = []) {
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
    gl.uniform1i(u['u_coarse'], 3);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.coarseField.read.tex);

    gl.uniform3fv(u['u_voidColor'], CONFIG.color.voidColor);
    gl.uniform3fv(u['u_normalColor'], CONFIG.color.normalSpace);
    gl.uniform3fv(u['u_nearWellColor'], CONFIG.color.nearWell);
    gl.uniform3fv(u['u_hotWellColor'], CONFIG.color.hotWell);
    gl.uniform1f(u['u_densityScale'], CONFIG.color.densityScale);
    gl.uniform1f(u['u_gravityScale'], CONFIG.color.gravityScale);

    // Camera + time uniforms
    gl.uniform2f(u['u_camOffset'], camOffsetU, camOffsetV);
    gl.uniform1f(u['u_gridWindow'], gridWindow);
    gl.uniform1f(u['u_cameraView'], cameraView);
    gl.uniform1f(u['u_viewAspect'], viewAspect);
    gl.uniform1f(u['u_refScale'], FLUID_REF_SCALE);
    gl.uniform1f(u['u_worldScale'], worldScale);
    gl.uniform2fv(u['u_worldCamera'], worldCameraUV);
    gl.uniform1f(u['u_time'], totalTime);

    // Set well positions and masses for gravity field visualization
    // Defense in depth: every caller shares the shader's fixed product budget.
    const count = Math.min(FABRIC_WELL_UNIFORM_BUDGET, wellPositionsUV.length);
    gl.uniform1i(u['u_wellCount'], count);
    for (let i = 0; i < count; i++) {
      const posLoc = u[`u_wellPositions[${i}]`];
      if (posLoc) gl.uniform2fv(posLoc, wellPositionsUV[i]);
      const massLoc = u[`u_wellMasses[${i}]`];
      if (massLoc) gl.uniform1f(massLoc, wellMasses[i] ?? 1.0);
      const shapeLoc = u[`u_wellShape[${i}]`];
      if (shapeLoc) gl.uniform4fv(shapeLoc, wellShapes[i] ?? [0.01, 0.02, 0.03, 1.0]);
      const profileLoc = u[`u_wellProfile[${i}]`];
      if (profileLoc) gl.uniform4fv(profileLoc, wellProfiles[i] ?? [0, 0, 0, 0]);
    }

    // Collection-backed ecology uniforms. The fixed cap keeps the shader ABI
    // bounded while preserving every live threat's local corruption language.
    const ecology = inhibitorData?.entities || [];
    gl.uniform1i(u['u_ecologyCount'], Math.min(16, ecology.length));
    for (let i = 0; i < 16; i += 1) {
      const entity = ecology[i];
      const kind = entity?.kind === 'vessel' ? 3 : entity?.kind === 'swarm' ? 2 : entity?.kind === 'glitch' ? 1 : 0;
      const pos = entity ? [entity.posU, entity.posV] : [0, 0];
      const posLoc = u[`u_ecologyPos[${i}]`];
      if (posLoc) gl.uniform2fv(posLoc, pos);
      gl.uniform1f(u[`u_ecologyRadius[${i}]`], entity?.radius ?? 0);
      gl.uniform1f(u[`u_ecologyIntensity[${i}]`], entity?.intensity ?? 0);
      gl.uniform1f(u[`u_ecologyTime[${i}]`], entity?.localTime ?? 0);
      gl.uniform1i(u[`u_ecologyKind[${i}]`], kind);
    }

    const waves = Array.isArray(wavePresentation) ? wavePresentation.slice(0, 8) : [];
    gl.uniform1i(u['u_waveCount'], waves.length);
    for (let i = 0; i < 8; i += 1) {
      const wave = waves[i];
      const sourceLoc = u[`u_waveSource[${i}]`];
      const shapeLoc = u[`u_waveShape[${i}]`];
      const telegraphLoc = u[`u_waveTelegraph[${i}]`];
      if (sourceLoc) gl.uniform2fv(sourceLoc, eventWaveSourceFluidWorld(wave, worldScale));
      if (shapeLoc) gl.uniform4fv(shapeLoc, [
        wave?.radius ?? 0,
        wave?.frontWidth ?? CONFIG.events.waveWidth,
        wave?.state === 'active' ? 1 : 0,
        wave?.strengthRatio ?? 0,
      ]);
      if (telegraphLoc) gl.uniform1f(telegraphLoc, wave?.telegraphProgress ?? 0);
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
    destroyDoubleFBO(this.coarseField);
    destroyFBO(this.divergenceFBO);
    destroyFBO(this.curlFBO);

    // Create new framebuffers at the new resolution
    this.res = newRes;
    this.texelSize = [1.0 / this.res, 1.0 / this.res];
    this.authoritativeField = null;
    this.authorityFloor = 0;
    this._createFramebuffers();
  }

  /**
   * Translate fluid contents by the camera-derived texture offset — used to
   * keep world-stationary currents stable when the camera-anchored grid
   * scrolls. Run once per frame with the shared coordinate projection.
   *
   * Texels scrolling in from outside the source range read from the
   * coarse field at the corresponding world position, which carries the
   * latest server-owned world-scale current truth.
   *
   * Shifts velocity (which has the coarse-field inflow). Density and
   * visualDensity scroll with empty inflow. They're cosmetic and don't
   * carry world-scale velocity memory.
   */
  _translateVelocity(textureOffsetU, textureOffsetV, camera, gridWindow, worldScale) {
    const gl = this.gl;
    const u = this._useProgram(this.programs.translate);
    gl.uniform1i(u['u_source'], 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform1i(u['u_coarse'], 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.coarseField.read.tex);
    gl.uniform1i(u['u_useCoarse'], 1);
    gl.uniform2f(u['u_textureOffset'], textureOffsetU, textureOffsetV);
    gl.uniform2f(u['u_camera'], camera[0], camera[1]);
    gl.uniform1f(u['u_gridWindow'], gridWindow);
    gl.uniform1f(u['u_worldScale'], worldScale);
    this._blit(this.velocity.write);
    this.velocity.swap();
  }

  // Density buffers don't have world-scale truth — they're cosmetic
  // emissions (wakes, splats). Use plain translate without coarse-field
  // inflow; leading-edge cosmetic content just arrives empty.
  _translateBufferEmpty(buffer, textureOffsetU, textureOffsetV) {
    const gl = this.gl;
    const u = this._useProgram(this.programs.translate);
    gl.uniform1i(u['u_source'], 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, buffer.read.tex);
    gl.uniform1i(u['u_coarse'], 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, buffer.read.tex);
    gl.uniform1i(u['u_useCoarse'], 0);
    gl.uniform2f(u['u_textureOffset'], textureOffsetU, textureOffsetV);
    gl.uniform2f(u['u_camera'], 0, 0);
    gl.uniform1f(u['u_gridWindow'], 1.0);
    gl.uniform1f(u['u_worldScale'], 1.0);
    this._blit(buffer.write);
    buffer.swap();
  }

  translate(textureOffsetU, textureOffsetV, camera, gridWindow, worldScale) {
    if (textureOffsetU === 0 && textureOffsetV === 0) return;
    this._translateVelocity(textureOffsetU, textureOffsetV, camera, gridWindow, worldScale);
    this._translateBufferEmpty(this.density, textureOffsetU, textureOffsetV);
    this._translateBufferEmpty(this.visualDensity, textureOffsetU, textureOffsetV);
  }

  /**
   * Register the latest server-owned field in the world-anchored GPU texture.
   * The field is resampled once per authority tick; the fluid solver then
   * forces from it after every fixed simulation step.
   */
  setAuthoritativeCoarseField(field) {
    const hasCells = Array.isArray(field?.cells) && field.cells.length > 0;
    const hasPackedData = typeof field?.data === 'string' && Number(field?.cellCount) > 0;
    if (!field || (!hasCells && !hasPackedData)) {
      this.clearAuthoritativeCoarseField();
      return false;
    }
    if (this.authoritativeField === field) return false;

    const data = resampleAuthoritativeField(field, this.coarseRes);
    const gl = this.gl;
    for (const target of [this.coarseField.read, this.coarseField.write]) {
      gl.bindTexture(gl.TEXTURE_2D, target.tex);
      gl.texSubImage2D(
        gl.TEXTURE_2D, 0, 0, 0, this.coarseRes, this.coarseRes,
        gl.RGBA, gl.FLOAT, data,
      );
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.authoritativeField = field;
    // The packet floor is world-unit authority; the GPU texture is reference-scaled.
    this.authorityFloor = authorityFloor(field) / FLUID_REF_SCALE;
    return true;
  }

  clearAuthoritativeCoarseField() {
    if (!this.authoritativeField) return;
    this.authoritativeField = null;
    this.authorityFloor = 0;
    this._clearTarget(this.coarseField.read, 0, 0, 0, 0);
    this._clearTarget(this.coarseField.write, 0, 0, 0, 0);
  }

  forceFromAuthoritativeField() {
    if (!this.authoritativeField) return false;
    const gl = this.gl;
    const u = this._useProgram(this.programs.authorityForce);
    gl.uniform1i(u['u_velocity'], 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.tex);
    gl.uniform1i(u['u_authority'], 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.coarseField.read.tex);
    gl.uniform1f(u['u_detailFloor'], this.authorityFloor);
    this._blit(this.velocity.write);
    this.velocity.swap();
    return true;
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
    this._clearTarget(this.coarseField.read, 0, 0, 0, 0);
    this._clearTarget(this.coarseField.write, 0, 0, 0, 0);
    this.authoritativeField = null;
    this.authorityFloor = 0;
  }
}
