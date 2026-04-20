// src/render/passes/fluid-display-pass.js
//
// FluidDisplayPass — wraps FluidSim.render() as a Pass.
//
// FluidSim has an internal render() that takes an external target FBO and
// fills it with the analytic scene color (dark core + accretion band + halo
// + fabric noise + ambient flow). This pass delegates to that render, using
// the Composer-provided targetFBO.
//
// Physics stepping is NOT part of this pass. The caller must call
// fluid.step(dt) + fluid.applyWellForce(...) etc. before composer.render().
// This pass only visualizes the fluid's current state.
//
// Frame context (pulled from frameContext.fluidDisplay):
//   - wellUVs:    Array<[u,v]> well positions in fluid UV
//   - wellMasses: Array<number>
//   - wellShapes: Array<[coreR, ringInnerR, ringOuterR, orbitalDir]>
//   - camFU, camFV:    camera center in fluid UV
//   - worldScale:      WORLD_SCALE (typically 3.0)
//   - totalTime:       elapsed seconds (drives fabric noise)
//   - inhibitorData:   null on title; object when gameplay has an inhibitor

import { Pass } from '../composer.js';

export class FluidDisplayPass extends Pass {
  constructor(fluid) {
    super({ name: 'fluid-display', rendersToScreen: false });
    this.fluid = fluid;
  }

  render({ targetFBO, frameContext }) {
    const ctx = frameContext.fluidDisplay;
    if (!ctx) {
      throw new Error('FluidDisplayPass: frameContext.fluidDisplay missing');
    }
    this.fluid.render(
      targetFBO,
      ctx.wellUVs,
      ctx.camFU, ctx.camFV,
      ctx.worldScale,
      ctx.totalTime,
      ctx.wellMasses,
      ctx.wellShapes,
      ctx.inhibitorData ?? null,
    );
  }
}
