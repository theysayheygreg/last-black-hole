import { fluidVelToWorld, worldToFluidUV } from '../coords.js';

function wrapUV(value) {
  return ((value % 1) + 1) % 1;
}

export class FlowField {
  constructor(fluid = null) {
    this.fluid = fluid;
  }

  setFluid(fluid) {
    this.fluid = fluid;
  }

  sample(wx, wy) {
    if (!this.fluid) return { x: 0, y: 0 };
    const [u, v] = worldToFluidUV(wx, wy);
    return this.sampleUV(u, v);
  }

  sampleUV(u, v) {
    if (!this.fluid) return { x: 0, y: 0 };
    const sampleU = wrapUV(u);
    const sampleV = wrapUV(v);
    const [fvx, fvy] = this.fluid.readVelocityAt(sampleU, sampleV);
    const [wvx, wvy] = fluidVelToWorld(fvx, fvy);
    return { x: wvx, y: wvy };
  }
}
