// src/render/passes/color-grade-pass.js
//
// ColorGradePass — split-toning grade. Per-pixel luminance drives a blend
// between a "shadow tint" (applied to dark areas) and a "highlight tint"
// (applied to bright areas). Mids pass through unchanged.
//
// LBH defaults push shadows cool (blue/cyan) and highlights toward the
// accretion-gold palette, giving the scene a consistent identity across
// any map/scene. Tweak the tints per-scene for mood variation.
//
// Slot BEFORE Vignette (so the vignette darkens already-graded colors)
// and AFTER Tonemap (so we're grading LDR, not HDR — LDR grading is
// more predictable and matches how real grading happens in post).
//
// Tunables:
//   - shadowTint, highlightTint — vec3 RGB multipliers (1,1,1 = no tint).
//     Values can exceed 1.0 for boosted saturation.
//   - shadowStrength, highlightStrength — blend amount (0 = no tint,
//     1 = full tint replacement for pixels at the extreme luminance).

import { Pass } from '../composer.js';

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_input;
uniform vec3 u_shadowTint;
uniform vec3 u_highlightTint;
uniform float u_shadowStrength;
uniform float u_highlightStrength;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec3 c = texture(u_input, v_uv).rgb;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  float shadow = 1.0 - smoothstep(0.0, 0.5, lum);
  float highlight = smoothstep(0.5, 1.0, lum);
  c = mix(c, c * u_shadowTint, shadow * u_shadowStrength);
  c = mix(c, c * u_highlightTint, highlight * u_highlightStrength);
  fragColor = vec4(c, 1.0);
}`;

export class ColorGradePass extends Pass {
  constructor({
    shadowTint = [0.75, 0.85, 1.15],        // cool blue bias
    highlightTint = [1.25, 1.10, 0.75],     // warm accretion bias
    shadowStrength = 0.6,
    highlightStrength = 0.5,
  } = {}) {
    super({ name: 'color-grade', rendersToScreen: false });
    this.shadowTint = shadowTint;
    this.highlightTint = highlightTint;
    this.shadowStrength = shadowStrength;
    this.highlightStrength = highlightStrength;
    this.prog = null;
  }

  render({ gl, prevOutputTex, composer }) {
    if (!this.prog) this.prog = composer.compileProgram(FRAG, 'color-grade');
    if (!prevOutputTex) throw new Error('ColorGradePass: prevOutputTex missing');

    gl.useProgram(this.prog.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, prevOutputTex);
    gl.uniform1i(this.prog.uniforms.u_input, 0);
    gl.uniform3fv(this.prog.uniforms.u_shadowTint, this.shadowTint);
    gl.uniform3fv(this.prog.uniforms.u_highlightTint, this.highlightTint);
    gl.uniform1f(this.prog.uniforms.u_shadowStrength, this.shadowStrength);
    gl.uniform1f(this.prog.uniforms.u_highlightStrength, this.highlightStrength);
    composer.drawQuad();
  }
}
