// src/render/passes/gain-pass.js
//
// GainPass — trivial scalar multiplier on color output.
// Used to attenuate (or boost) an upstream pass's contribution without
// modifying its shader. Primary use case: dim FluidDisplayPass on the
// title so AccretionPass's temperature ramp dominates, while leaving
// the fluid shader's gameplay output alone.
//
// Tunable:
//   - gain — scalar multiplier on RGB. 1.0 = no change, 0.15 = heavy
//     attenuation. Can exceed 1.0 to boost HDR.

import { Pass } from '../composer.js';

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_input;
uniform float u_gain;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  vec3 c = texture(u_input, v_uv).rgb * u_gain;
  fragColor = vec4(c, 1.0);
}`;

export class GainPass extends Pass {
  constructor({ gain = 1.0, name = 'gain' } = {}) {
    super({ name, rendersToScreen: false });
    this.gain = gain;
    this.prog = null;
  }

  render({ gl, prevOutputTex, composer }) {
    if (!this.prog) this.prog = composer.compileProgram(FRAG, this.name);
    if (!prevOutputTex) throw new Error(`${this.name}: prevOutputTex missing`);

    gl.useProgram(this.prog.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, prevOutputTex);
    gl.uniform1i(this.prog.uniforms.u_input, 0);
    gl.uniform1f(this.prog.uniforms.u_gain, this.gain);
    composer.drawQuad();
  }
}
