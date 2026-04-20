// src/render/passes/bloom-pass.js
//
// BloomPass — adds a glow to bright regions of the scene. Classic pipeline:
//   1. bright-pass extract (downsampled)
//   2. separable gaussian blur (horizontal → vertical)
//   3. additive composite back onto the original scene
//
// The downsample factor (`scale`) is the single biggest perf knob: blur at
// 0.5× resolution is 4× cheaper than full-res, 0.25× is 16× cheaper. Most
// bloom looks fine at 0.5× because it's a low-frequency effect anyway.
//
// Slotting: put BloomPass AFTER FluidDisplayPass (or any color pass whose
// output you want to bloom) and BEFORE ASCIIPass if you want glyphs to
// pick up the bloom in their luminance quantization. Put it AFTER ASCII
// if you want glow only outside the text — but the current Composer keeps
// ASCII as the terminal screen pass, so bloom has to come before.
//
// Input textures:
//   - prevOutputTex (bound as u_input / u_scene): the scene to bloom.
//
// Tunables (constructor options):
//   - threshold  — luminance cutoff for bright-pass. 0.5 is a good start.
//   - knee       — soft-transition width around threshold.
//   - strength   — multiplier on the blurred highlights when compositing.
//   - blurRadius — gaussian sample offset multiplier in texels.
//   - scale      — scratch-buffer scale (0.5 = half res).
//
// All tunables are live-mutable via pass.threshold = x, etc.

import { Pass } from '../composer.js';

const FRAG_BRIGHT_PASS = `#version 300 es
precision highp float;
uniform sampler2D u_input;
uniform float u_threshold;
uniform float u_knee;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  vec3 c = texture(u_input, v_uv).rgb;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  float soft = smoothstep(u_threshold - u_knee, u_threshold + u_knee, lum);
  fragColor = vec4(c * soft, 1.0);
}`;

const FRAG_BLUR = `#version 300 es
precision highp float;
uniform sampler2D u_input;
uniform vec2 u_direction;    // scaled (dx, dy) in texels
uniform vec2 u_texelSize;
in vec2 v_uv;
out vec4 fragColor;
// 5-tap gaussian with optimized weights/offsets (Jimenez '14 style).
void main() {
  vec2 off1 = 1.3846153846 * u_direction * u_texelSize;
  vec2 off2 = 3.2307692308 * u_direction * u_texelSize;
  vec3 c = texture(u_input, v_uv).rgb * 0.2270270270;
  c += texture(u_input, v_uv + off1).rgb * 0.3162162162;
  c += texture(u_input, v_uv - off1).rgb * 0.3162162162;
  c += texture(u_input, v_uv + off2).rgb * 0.0702702703;
  c += texture(u_input, v_uv - off2).rgb * 0.0702702703;
  fragColor = vec4(c, 1.0);
}`;

const FRAG_COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform float u_strength;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  vec3 orig = texture(u_scene, v_uv).rgb;
  vec3 bloom = texture(u_bloom, v_uv).rgb;
  fragColor = vec4(orig + bloom * u_strength, 1.0);
}`;

export class BloomPass extends Pass {
  constructor(gl, {
    threshold = 0.5,
    knee = 0.15,
    strength = 1.0,
    blurRadius = 2.5,
    scale = 0.5,
  } = {}) {
    super({ name: 'bloom', rendersToScreen: false });
    this.gl = gl;
    this.threshold = threshold;
    this.knee = knee;
    this.strength = strength;
    this.blurRadius = blurRadius;
    this.scale = scale;
    this.scratchA = null;
    this.scratchB = null;
    this.progs = null;
  }

  _ensurePrograms(composer) {
    if (this.progs) return;
    this.progs = {
      bright: composer.compileProgram(FRAG_BRIGHT_PASS, 'bloom-bright'),
      blur: composer.compileProgram(FRAG_BLUR, 'bloom-blur'),
      composite: composer.compileProgram(FRAG_COMPOSITE, 'bloom-composite'),
    };
  }

  _ensureScratch(w, h) {
    const gl = this.gl;
    const sw = Math.max(1, Math.floor(w * this.scale));
    const sh = Math.max(1, Math.floor(h * this.scale));
    if (this.scratchA && this.scratchA.w === sw && this.scratchA.h === sh) return;
    if (this.scratchA) {
      gl.deleteTexture(this.scratchA.tex);
      gl.deleteFramebuffer(this.scratchA.fbo);
    }
    if (this.scratchB) {
      gl.deleteTexture(this.scratchB.tex);
      gl.deleteFramebuffer(this.scratchB.fbo);
    }
    this.scratchA = this._createFBO(sw, sh);
    this.scratchB = this._createFBO(sw, sh);
  }

  // RGBA16F so bloom operates in HDR — matches the composer's ping-pong
  // format. Bright-pass and blur both preserve values > 1.0 until the
  // final composite writes back into the HDR ping-pong.
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

  resize(w, h) {
    this._ensureScratch(w, h);
  }

  render({ gl, prevOutputTex, targetFBO, composer }) {
    this._ensurePrograms(composer);
    this._ensureScratch(composer.width, composer.height);

    // 1. bright-pass: prevOutputTex → scratchA (downsampled)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scratchA.fbo);
    gl.viewport(0, 0, this.scratchA.w, this.scratchA.h);
    gl.useProgram(this.progs.bright.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, prevOutputTex);
    gl.uniform1i(this.progs.bright.uniforms.u_input, 0);
    gl.uniform1f(this.progs.bright.uniforms.u_threshold, this.threshold);
    gl.uniform1f(this.progs.bright.uniforms.u_knee, this.knee);
    composer.drawQuad();

    // 2. horizontal blur: scratchA → scratchB
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scratchB.fbo);
    gl.viewport(0, 0, this.scratchB.w, this.scratchB.h);
    gl.useProgram(this.progs.blur.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scratchA.tex);
    gl.uniform1i(this.progs.blur.uniforms.u_input, 0);
    gl.uniform2f(this.progs.blur.uniforms.u_direction, this.blurRadius, 0);
    gl.uniform2f(this.progs.blur.uniforms.u_texelSize, 1 / this.scratchA.w, 1 / this.scratchA.h);
    composer.drawQuad();

    // 3. vertical blur: scratchB → scratchA
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scratchA.fbo);
    gl.viewport(0, 0, this.scratchA.w, this.scratchA.h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scratchB.tex);
    gl.uniform1i(this.progs.blur.uniforms.u_input, 0);
    gl.uniform2f(this.progs.blur.uniforms.u_direction, 0, this.blurRadius);
    gl.uniform2f(this.progs.blur.uniforms.u_texelSize, 1 / this.scratchB.w, 1 / this.scratchB.h);
    composer.drawQuad();

    // 4. composite: prevOutputTex + scratchA (upsampled via linear filter) → targetFBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO.fbo);
    gl.viewport(0, 0, targetFBO.w, targetFBO.h);
    gl.useProgram(this.progs.composite.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, prevOutputTex);
    gl.uniform1i(this.progs.composite.uniforms.u_scene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.scratchA.tex);
    gl.uniform1i(this.progs.composite.uniforms.u_bloom, 1);
    gl.uniform1f(this.progs.composite.uniforms.u_strength, this.strength);
    composer.drawQuad();
  }
}
