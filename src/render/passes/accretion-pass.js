// src/render/passes/accretion-pass.js
//
// AccretionPass — per-well radial blackbody temperature ramp.
//
// This pass is intentionally decoupled from fluid state. Its job is
// exactly one thing: given well positions and per-well accretion radii,
// output a pure radial color field. Additive over prev scene.
//
// Color ramp (Greg's spec):
//   core (t=-1) black > violet > red > orange > yellow > white (t=0)
//   outer (t=0) white > light blue > blue > purple > black (t=+1)
//
// IMPORTANT — composition radii vs gameplay radii:
//
// The *fluid* pass uses wellSystem.getRenderShapes() which returns radii
// tuned for gameplay signal (wells-among-many, ring size scales with
// mass, tuned to read on a 3x3 or 10x10 map). On the title screen where
// a single well dominates the frame, those radii put the "hot" peak
// (t=0) OFF-screen — only the inner violet/red segment is visible.
//
// So AccretionPass takes its OWN accretion radii (core/peak/outer)
// keyed to *visible composition*, not gameplay. Caller computes them.
// Title typical: { coreR: 0.30, peakR: 0.40, outerR: 0.60 } for a
// CAMERA_VIEW of 1.0 world-unit.
//
// t parameterization (now uses pass-local radii):
//   dist <= coreR             → t = -1       (event horizon black)
//   coreR < dist < peakR       → t in [-1, 0] (inner hot band)
//   peakR < dist < outerR      → t in [0, +1] (outer cool band)
//   dist >= outerR             → t = +1       (deep space)
//
// Frame context (frameContext.accretion):
//   - wellUVs:    Array<[u,v]> well positions in fluid UV
//   - wellRadii:  Array<[coreR, peakR, outerR]> in world-space
//   - camFU, camFV, worldScale
//
// Output is HDR — white-hot band exceeds 1.0 so BloomPass catches it.

import { Pass } from '../composer.js';

const MAX_WELLS = 32;  // title screens + small maps never exceed this

const FRAG = `#version 300 es
precision highp float;

uniform sampler2D u_input;            // prev scene (additive over this)
uniform vec2 u_wellUV[${MAX_WELLS}];    // wells in fluid UV
uniform vec3 u_wellRadii[${MAX_WELLS}]; // (coreR, peakR, outerR) world-space
uniform int u_wellCount;
uniform vec2 u_camOffset;             // camera center in fluid UV
uniform float u_worldScale;           // WORLD_SCALE
uniform float u_strength;             // master blend for the radial color

in vec2 v_uv;
out vec4 fragColor;

// Blackbody-inspired temperature ramp. t: -1 = core, 0 = hottest ring,
// +1 = far outer. Sequential smoothstep mixes produce smooth bands.
vec3 tempRamp(float t) {
  t = clamp(t, -1.0, 1.0);
  vec3 c = vec3(0.0);
  c = mix(c, vec3(0.30, 0.10, 0.45), smoothstep(-1.0, -0.75, t));   // violet
  c = mix(c, vec3(0.90, 0.22, 0.18), smoothstep(-0.75, -0.45, t));  // red
  c = mix(c, vec3(1.10, 0.55, 0.10), smoothstep(-0.45, -0.22, t));  // orange
  c = mix(c, vec3(1.25, 1.15, 0.55), smoothstep(-0.22, -0.05, t));  // yellow
  c = mix(c, vec3(1.45, 1.45, 1.35), smoothstep(-0.05, 0.05, t));   // white-hot (HDR)
  c = mix(c, vec3(0.55, 0.80, 1.10), smoothstep(0.05, 0.22, t));    // light blue
  c = mix(c, vec3(0.15, 0.35, 0.95), smoothstep(0.22, 0.50, t));    // blue
  c = mix(c, vec3(0.30, 0.10, 0.50), smoothstep(0.50, 0.80, t));    // outer purple
  c = mix(c, vec3(0.0), smoothstep(0.80, 1.0, t));                   // far space
  return c;
}

void main() {
  vec3 base = texture(u_input, v_uv).rgb;

  // Screen-space UV → fluid UV (same transform FluidDisplayPass uses).
  vec2 fluidUV = u_camOffset + (v_uv - 0.5) / u_worldScale;
  vec2 wrapped = fract(fluidUV);

  // Find contribution from each well. Additive: if wells overlap, their
  // color contributions sum (rare in practice since maps space wells out).
  vec3 accretion = vec3(0.0);
  for (int i = 0; i < ${MAX_WELLS}; i++) {
    if (i >= u_wellCount) break;
    vec2 diff = wrapped - u_wellUV[i];
    diff = diff - round(diff);           // toroidal wrap
    float dist = length(diff) * u_worldScale;  // world-space distance

    vec3 radii = u_wellRadii[i];
    float coreR  = radii.x;
    float peakR  = radii.y;
    float outerR = radii.z;

    // Parameterize to t in [-1, +1] with t=0 at peakR (hottest band).
    float t;
    if (dist < peakR) {
      t = -1.0 + (dist - coreR) / max(peakR - coreR, 1e-4);
    } else {
      t = (dist - peakR) / max(outerR - peakR, 1e-4);
    }

    accretion += tempRamp(t);
  }

  fragColor = vec4(base + accretion * u_strength, 1.0);
}`;

export class AccretionPass extends Pass {
  constructor({ strength = 1.0 } = {}) {
    super({ name: 'accretion', rendersToScreen: false });
    this.strength = strength;
    this.prog = null;
  }

  render({ gl, prevOutputTex, frameContext, composer }) {
    if (!this.prog) this.prog = composer.compileProgram(FRAG, 'accretion');
    if (!prevOutputTex) throw new Error('AccretionPass: prevOutputTex missing');

    const ctx = frameContext.accretion;
    if (!ctx) throw new Error('AccretionPass: frameContext.accretion missing');
    if (!ctx.wellRadii) throw new Error('AccretionPass: frameContext.accretion.wellRadii missing');

    gl.useProgram(this.prog.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, prevOutputTex);
    gl.uniform1i(this.prog.uniforms.u_input, 0);

    const count = Math.min(ctx.wellUVs.length, MAX_WELLS);
    gl.uniform1i(this.prog.uniforms.u_wellCount, count);
    for (let i = 0; i < count; i++) {
      const uvLoc = this.prog.uniforms[`u_wellUV[${i}]`];
      if (uvLoc) gl.uniform2fv(uvLoc, ctx.wellUVs[i]);
      const radiiLoc = this.prog.uniforms[`u_wellRadii[${i}]`];
      if (radiiLoc) gl.uniform3fv(radiiLoc, ctx.wellRadii[i] ?? [0.1, 0.15, 0.4]);
    }

    gl.uniform2f(this.prog.uniforms.u_camOffset, ctx.camFU, ctx.camFV);
    gl.uniform1f(this.prog.uniforms.u_worldScale, ctx.worldScale);
    gl.uniform1f(this.prog.uniforms.u_strength, this.strength);

    composer.drawQuad();
  }
}
