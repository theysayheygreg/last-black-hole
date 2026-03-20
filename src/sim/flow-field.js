import { fluidVelToWorld, worldToFluidUV } from '../coords.js';

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
    const sampleU = Math.max(0, Math.min(1, u));
    const sampleV = Math.max(0, Math.min(1, v));
    const [fvx, fvy] = this.fluid.readVelocityAt(sampleU, sampleV);
    const [wvx, wvy] = fluidVelToWorld(fvx, fvy);
    return { x: wvx, y: wvy };
  }
}
