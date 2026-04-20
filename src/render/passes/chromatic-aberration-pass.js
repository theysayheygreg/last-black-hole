// src/render/passes/chromatic-aberration-pass.js
//
// ChromaticAberrationPass — lens artifact that samples R, G, B channels
// at slightly different offsets, scaling with distance from center.
// Produces visible color fringing at the edges; none at the center.
//
// Slot late (after Tonemap / after HDR has been compressed to LDR). It
// operates on final color, not on scene-linear light, because that's
// how real lens aberration reads to the eye.
//
// Tunables:
//   - strength — max offset in normalized UV at the corners (0.005 is
//                very subtle, 0.02 is aggressive, 0.05 is cinematic)
//   - centerFalloff — exponent on the radial distance; higher values
//                     keep the center clean and push aberration to the
//                     corners only (2.0 is quadratic, default).

import { Pass } from '../composer.js';

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_input;
uniform float u_strength;
uniform float u_falloff;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec2 p = v_uv - 0.5;
  float d = pow(length(p) * 1.4142, u_falloff); // [0,1] at corners, shaped
  vec2 dir = length(p) > 0.0001 ? p / length(p) : vec2(0.0);
  vec2 offset = dir * u_strength * d;

  // Split channels: R samples outward, B samples inward, G stays put.
  float r = texture(u_input, v_uv + offset).r;
  float g = texture(u_input, v_uv).g;
  float b = texture(u_input, v_uv - offset).b;
  fragColor = vec4(r, g, b, 1.0);
}`;

export class ChromaticAberrationPass extends Pass {
  constructor({ strength = 0.004, falloff = 2.0 } = {}) {
    super({ name: 'chromatic-aberration', rendersToScreen: false });
    this.strength = strength;
    this.falloff = falloff;
    this.prog = null;
  }

  render({ gl, prevOutputTex, composer }) {
    if (!this.prog) this.prog = composer.compileProgram(FRAG, 'chromatic-aberration');
    if (!prevOutputTex) throw new Error('ChromaticAberrationPass: prevOutputTex missing');

    gl.useProgram(this.prog.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, prevOutputTex);
    gl.uniform1i(this.prog.uniforms.u_input, 0);
    gl.uniform1f(this.prog.uniforms.u_strength, this.strength);
    gl.uniform1f(this.prog.uniforms.u_falloff, this.falloff);
    composer.drawQuad();
  }
}
