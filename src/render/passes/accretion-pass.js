// src/render/passes/accretion-pass.js
//
// AccretionPass — per-well radial blackbody temperature ramp.
//
// This pass is intentionally decoupled from fluid state. Its job is
// exactly one thing: given the set of well positions and their radii,
// output a pure radial color field where the color is a function of
// (distance-to-nearest-well, well-radii) only — no density input, no
// velocity input, no fluid signal. Additive over whatever came before.
//
// The color ramp follows real black-hole imagery:
//   core (t=-1) black > violet > red > orange > yellow > white (t=0)
//   outer (t=0) white > light blue > blue > purple > black (t=+1)
//
// t parameterization:
//   t = -1 at well's event-horizon core
//   t = 0 at the ring peak (hottest)
//   t = +1 at far outer (cold space)
//
// Frame context (frameContext.accretion):
//   - wellUVs:     Array<[u,v]> well positions in fluid UV
//   - wellShapes:  Array<[coreR, ringInner, ringOuter, orbitalDir]> (world-space radii)
//   - camFU, camFV, worldScale, outerFalloff
//
// The pass writes HDR — the white-hot band exceeds 1.0 so BloomPass
// downstream catches it as a real highlight.

import { Pass } from '../composer.js';

const MAX_WELLS = 32;  // title screens + small maps never exceed this

const FRAG = `#version 300 es
precision highp float;

uniform sampler2D u_input;            // prev scene (additive over this)
uniform vec2 u_wellUV[${MAX_WELLS}];    // wells in fluid UV
uniform vec4 u_wellShape[${MAX_WELLS}]; // (coreR, ringInner, ringOuter, _)
uniform int u_wellCount;
uniform vec2 u_camOffset;             // camera center in fluid UV
uniform float u_worldScale;           // WORLD_SCALE
uniform float u_outerFalloff;          // how far past ringOuter the color reaches
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

    vec4 shape = u_wellShape[i];
    float coreR   = shape.x;
    float ringIn  = shape.y;
    float ringOut = shape.z;
    float ringMid = 0.5 * (ringIn + ringOut);
    float outerReach = ringOut * u_outerFalloff;

    // Parameterize to t in [-1, 1] with t=0 at the ring peak.
    float t;
    if (dist < ringMid) {
      t = -1.0 + (dist - coreR) / max(ringMid - coreR, 1e-4);
    } else {
      t = (dist - ringMid) / max(outerReach - ringMid, 1e-4);
    }

    // Accumulate pure radial color for this well.
    accretion += tempRamp(t);
  }

  fragColor = vec4(base + accretion * u_strength, 1.0);
}`;

export class AccretionPass extends Pass {
  constructor({ strength = 1.0, outerFalloff = 3.2 } = {}) {
    super({ name: 'accretion', rendersToScreen: false });
    this.strength = strength;
    this.outerFalloff = outerFalloff;
    this.prog = null;
  }

  render({ gl, prevOutputTex, frameContext, composer }) {
    if (!this.prog) this.prog = composer.compileProgram(FRAG, 'accretion');
    if (!prevOutputTex) throw new Error('AccretionPass: prevOutputTex missing');

    const ctx = frameContext.accretion;
    if (!ctx) throw new Error('AccretionPass: frameContext.accretion missing');

    gl.useProgram(this.prog.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, prevOutputTex);
    gl.uniform1i(this.prog.uniforms.u_input, 0);

    const count = Math.min(ctx.wellUVs.length, MAX_WELLS);
    gl.uniform1i(this.prog.uniforms.u_wellCount, count);
    for (let i = 0; i < count; i++) {
      const uvLoc = this.prog.uniforms[`u_wellUV[${i}]`];
      if (uvLoc) gl.uniform2fv(uvLoc, ctx.wellUVs[i]);
      const shapeLoc = this.prog.uniforms[`u_wellShape[${i}]`];
      if (shapeLoc) gl.uniform4fv(shapeLoc, ctx.wellShapes[i] ?? [0.01, 0.02, 0.03, 1.0]);
    }

    gl.uniform2f(this.prog.uniforms.u_camOffset, ctx.camFU, ctx.camFV);
    gl.uniform1f(this.prog.uniforms.u_worldScale, ctx.worldScale);
    gl.uniform1f(this.prog.uniforms.u_outerFalloff, this.outerFalloff);
    gl.uniform1f(this.prog.uniforms.u_strength, this.strength);

    composer.drawQuad();
  }
}
