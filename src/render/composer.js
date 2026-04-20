// src/render/composer.js
//
// LBH-native multi-pass render composer. Vanilla WebGL 2, no Three.js.
//
// Model: a pipeline is an ordered list of Pass objects. The composer owns
// two ping-pong RGBA8 FBOs at canvas resolution. Each pass either writes
// into one of those FBOs (becoming input to the next pass) or writes to
// the default framebuffer (screen).
//
// Adding a new effect is one new Pass subclass + one line in the chain
// config. The fluid sim's internal physics passes still live inside
// FluidSim — this composer only sequences the visible "display" passes
// that run after the sim step.
//
// Shared resources:
//   - FULLSCREEN_VERT: standard fullscreen-triangle-strip vertex shader.
//     Every pass that uses the composer's quad VAO should bind a program
//     built against this vertex shader. Passes with exotic geometry can
//     ignore the shared quad and draw their own.
//   - composer.quadVAO: 4-vert triangle strip covering clip space.
//   - composer.drawQuad(): bind quadVAO + drawArrays.
//   - composer.compileProgram(fragSrc): compile + link using
//     FULLSCREEN_VERT, return { program, uniforms } (matches the shape
//     FluidSim._createProgram produces).

export const FULLSCREEN_VERT = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

/**
 * Compile + link a GL program from fragment source, using FULLSCREEN_VERT
 * as the vertex shader. Collects uniform locations into a { name → location }
 * map that also handles array uniforms (both `name[0]` and `name` forms
 * resolve to location 0, and `name[i]` resolves per-element).
 */
export function compileProgram(gl, fragSrc, label = 'pass') {
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, FULLSCREEN_VERT);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    throw new Error(`[${label}] vert shader: ${gl.getShaderInfoLog(vs)}`);
  }
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, fragSrc);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    throw new Error(`[${label}] frag shader: ${gl.getShaderInfoLog(fs)}`);
  }
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.bindAttribLocation(program, 0, 'a_position');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`[${label}] program link: ${gl.getProgramInfoLog(program)}`);
  }

  const uniforms = {};
  const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < numUniforms; i++) {
    const info = gl.getActiveUniform(program, i);
    const baseName = info.name.replace(/\[0\]$/, '');
    if (info.size > 1) {
      for (let j = 0; j < info.size; j++) {
        const arrName = `${baseName}[${j}]`;
        uniforms[arrName] = gl.getUniformLocation(program, arrName);
      }
    }
    uniforms[info.name] = gl.getUniformLocation(program, info.name);
    if (info.name !== baseName) {
      uniforms[baseName] = gl.getUniformLocation(program, info.name);
    }
  }

  return { program, uniforms };
}

/**
 * Base class for a render pass.
 *
 * Subclass contract:
 *   - render({ gl, prevOutputTex, targetFBO, frameContext, composer })
 *       prevOutputTex — the previous pass's output texture, or null for the
 *                       first pass in the chain.
 *       targetFBO     — { fbo, tex, w, h } for off-screen passes,
 *                       null when rendersToScreen = true.
 *       frameContext  — caller-provided per-frame bag of data (uniforms,
 *                       external textures). Each pass picks out its own
 *                       namespace by convention.
 *       composer      — the owning Composer (exposes drawQuad, quadVAO).
 *   - resize(w, h)
 *       Called when the canvas changes size. Override if the pass owns
 *       render targets whose size must match.
 *
 * Properties:
 *   - name:             string, for debugging.
 *   - rendersToScreen:  true if this pass is the terminal stage (writes to
 *                       the default framebuffer). Composer binds FBO null
 *                       and viewport=canvas before calling render().
 */
export class Pass {
  constructor({ name, rendersToScreen = false } = {}) {
    this.name = name ?? this.constructor.name;
    this.rendersToScreen = rendersToScreen;
  }

  resize(_w, _h) {}

  render(_ctx) {
    throw new Error(`${this.name}.render() not implemented`);
  }
}

/**
 * Composer — owns the pass list and the ping-pong FBOs between passes.
 * Construct, add passes, call render(frameContext) per frame.
 */
export class Composer {
  constructor(gl) {
    this.gl = gl;
    this.passes = [];
    this.width = gl.canvas.width;
    this.height = gl.canvas.height;
    this._initQuad();
    this.fboA = this._createFBO(this.width, this.height);
    this.fboB = this._createFBO(this.width, this.height);
  }

  _initQuad() {
    const gl = this.gl;
    const verts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    this.quadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.quadVAO);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  _createFBO(w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
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

  _resizeFBO(target, w, h) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, target.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    target.w = w;
    target.h = h;
  }

  add(pass) {
    this.passes.push(pass);
    pass.resize(this.width, this.height);
    return pass;
  }

  resize(w, h) {
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this._resizeFBO(this.fboA, w, h);
    this._resizeFBO(this.fboB, w, h);
    for (const p of this.passes) p.resize(w, h);
  }

  /**
   * Utility for Pass subclasses to compile a program that works with the
   * shared quad VAO + FULLSCREEN_VERT vertex shader.
   */
  compileProgram(fragSrc, label) {
    return compileProgram(this.gl, fragSrc, label);
  }

  drawQuad() {
    const gl = this.gl;
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  render(frameContext = {}) {
    const gl = this.gl;
    let prevOutputTex = null;
    let pingPongToggle = 0;
    for (let i = 0; i < this.passes.length; i++) {
      const pass = this.passes[i];
      let targetFBO = null;
      if (pass.rendersToScreen) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      } else {
        targetFBO = pingPongToggle === 0 ? this.fboA : this.fboB;
        pingPongToggle = 1 - pingPongToggle;
        gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO.fbo);
        gl.viewport(0, 0, targetFBO.w, targetFBO.h);
      }
      pass.render({ gl, prevOutputTex, targetFBO, frameContext, composer: this });
      prevOutputTex = targetFBO ? targetFBO.tex : null;
    }
    return prevOutputTex;
  }
}
