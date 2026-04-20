// src/render/passes/scanlines-pass.js
//
// ScanlinesPass — horizontal CRT-style scanline modulation. Darkens
// every other pixel row (frequency-tunable), giving the image a real
// monitor-beam texture. Completes the CRT/terminal aesthetic that
// ASCII quantization + chromatic aberration already establish.
//
// Uses gl_FragCoord.y (screen-space pixel coord) not v_uv, so the
// scanlines stay locked to the pixel grid regardless of canvas size.
// Otherwise the effect would shift scale with the window.
//
// Terminal pass by default. Slot at the very end of the chain.
//
// Tunables:
//   - intensity  — darkening depth at the trough (0 = no effect, 0.5 = 50% dim)
//   - frequency  — scanline density in radians-per-pixel. 0.5 = one dark
//                  line every ~6 pixels; higher = denser lines

import { Pass } from '../composer.js';

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_input;
uniform float u_intensity;
uniform float u_frequency;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec3 c = texture(u_input, v_uv).rgb;
  // Sinusoid modulation — smoother than a hard on/off line pattern.
  float scan = 0.5 + 0.5 * sin(gl_FragCoord.y * u_frequency);
  float mod_ = mix(1.0 - u_intensity, 1.0, scan);
  fragColor = vec4(c * mod_, 1.0);
}`;

export class ScanlinesPass extends Pass {
  constructor({ intensity = 0.25, frequency = 1.6, rendersToScreen = true } = {}) {
    super({ name: 'scanlines', rendersToScreen });
    this.intensity = intensity;
    this.frequency = frequency;
    this.prog = null;
  }

  render({ gl, prevOutputTex, composer }) {
    if (!this.prog) this.prog = composer.compileProgram(FRAG, 'scanlines');
    if (!prevOutputTex) throw new Error('ScanlinesPass: prevOutputTex missing');

    gl.useProgram(this.prog.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, prevOutputTex);
    gl.uniform1i(this.prog.uniforms.u_input, 0);
    gl.uniform1f(this.prog.uniforms.u_intensity, this.intensity);
    gl.uniform1f(this.prog.uniforms.u_frequency, this.frequency);
    composer.drawQuad();
  }
}
