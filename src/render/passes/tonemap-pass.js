// src/render/passes/tonemap-pass.js
//
// TonemapPass — compresses HDR scene color into LDR before final display
// or ASCII quantization. Uses the ACES filmic tonemap (Narkowicz 2015
// approximation) for a standard filmic rolloff: near-linear for shadows
// and midtones, soft compression for highlights, avoids hue shift in
// bright regions.
//
// Insert AFTER any HDR-producing pass (FluidDisplayPass, BloomPass) and
// BEFORE any LDR-consuming pass (ASCIIPass quantizes luminance and
// clamps to [0,1] internally, so tonemap first to preserve headroom
// distinctions).
//
// Tunable: exposure — multiplier applied before tonemapping. Useful for
// fade-in sequences or dev-time HDR range inspection.

import { Pass } from '../composer.js';

// ACES filmic tonemap by Krzysztof Narkowicz. Cheap, filmic, widely used.
// Input: linear HDR RGB. Output: linear LDR RGB in [0, 1].
const FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_input;
uniform float u_exposure;
in vec2 v_uv;
out vec4 fragColor;

vec3 acesTonemap(vec3 c) {
  float a = 2.51;
  float b = 0.03;
  float y = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((c * (a * c + b)) / (c * (y * c + d) + e), 0.0, 1.0);
}

void main() {
  vec3 hdr = texture(u_input, v_uv).rgb * u_exposure;
  fragColor = vec4(acesTonemap(hdr), 1.0);
}`;

export class TonemapPass extends Pass {
  constructor({ exposure = 1.0 } = {}) {
    super({ name: 'tonemap', rendersToScreen: false });
    this.exposure = exposure;
    this.prog = null;
  }

  render({ gl, prevOutputTex, composer }) {
    if (!this.prog) this.prog = composer.compileProgram(FRAG, 'tonemap');
    if (!prevOutputTex) throw new Error('TonemapPass: prevOutputTex missing');

    gl.useProgram(this.prog.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, prevOutputTex);
    gl.uniform1i(this.prog.uniforms.u_input, 0);
    gl.uniform1f(this.prog.uniforms.u_exposure, this.exposure);
    composer.drawQuad();
  }
}
