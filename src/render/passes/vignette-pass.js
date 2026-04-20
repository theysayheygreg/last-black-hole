// src/render/passes/vignette-pass.js
//
// VignettePass — radial darkening toward screen edges. Focuses the eye
// on the center (where the hole is) and closes the frame.
//
// Slot late in the chain. After Tonemap so the darkening is applied to
// the final LDR color; before ASCII so glyph density near the corners
// picks up the dimmed luminance (fewer/sparser glyphs at the edges).
//
// Tunables:
//   - strength  — how hard the corners fade (0 = no vignette, 1.5 = aggressive)
//   - radius    — where the darkening starts from center (0.5 = halfway, 1.0 = full)
//   - softness  — width of the fade transition

import { Pass } from '../composer.js';

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_input;
uniform float u_strength;
uniform float u_radius;
uniform float u_softness;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec3 c = texture(u_input, v_uv).rgb;
  vec2 p = v_uv - 0.5;
  float d = length(p) * 1.4142;  // normalize to [0,1] at corners
  float v = 1.0 - smoothstep(u_radius, u_radius + u_softness, d) * u_strength;
  fragColor = vec4(c * v, 1.0);
}`;

export class VignettePass extends Pass {
  constructor({ strength = 0.6, radius = 0.55, softness = 0.4 } = {}) {
    super({ name: 'vignette', rendersToScreen: false });
    this.strength = strength;
    this.radius = radius;
    this.softness = softness;
    this.prog = null;
  }

  render({ gl, prevOutputTex, composer }) {
    if (!this.prog) this.prog = composer.compileProgram(FRAG, 'vignette');
    if (!prevOutputTex) throw new Error('VignettePass: prevOutputTex missing');

    gl.useProgram(this.prog.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, prevOutputTex);
    gl.uniform1i(this.prog.uniforms.u_input, 0);
    gl.uniform1f(this.prog.uniforms.u_strength, this.strength);
    gl.uniform1f(this.prog.uniforms.u_radius, this.radius);
    gl.uniform1f(this.prog.uniforms.u_softness, this.softness);
    composer.drawQuad();
  }
}
