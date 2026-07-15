const SERVER_TUNABLE_CONTRACTS = Object.freeze({
  movement: Object.freeze({
    coastHalfLifeSeconds: Object.freeze({
      unit: "seconds to half speed while coasting",
      range: Object.freeze([0.25, 4]),
      step: 0.05,
      startBias: "authority baseline",
    }),
  }),
  wreckDrift: Object.freeze({
    referenceDriftSpeed: Object.freeze({
      unit: "world-units/s at 1 wu from a mass-1 well",
      range: Object.freeze([0, 0.02]),
      step: 0.001,
      startBias: "quiet drift",
    }),
    dragRate: Object.freeze({
      unit: "per-second velocity decay rate",
      range: Object.freeze([0.5, 3]),
      step: 0.25,
      startBias: "standard damping",
    }),
  }),
  signal: Object.freeze({
    thrustBasePercentPerSecond: Object.freeze({
      unit: "% signal full-scale/s",
      range: Object.freeze([0, 5]),
      step: 0.5,
      startBias: "quiet until opposition matters",
    }),
    coastPercentPerSecond: Object.freeze({
      unit: "% signal full-scale/s",
      range: Object.freeze([0, 2]),
      step: 0.1,
      startBias: "barely audible",
    }),
    wellProximityPercentPerSecond: Object.freeze({
      unit: "% signal full-scale/s",
      range: Object.freeze([0, 2]),
      step: 0.1,
      startBias: "environmental tax",
    }),
    decayBasePercentPerSecond: Object.freeze({
      unit: "% signal full-scale/s",
      range: Object.freeze([0, 10]),
      step: 0.5,
      startBias: "quiet baseline",
    }),
    decayWreckWakePercentPerSecond: Object.freeze({
      unit: "% signal full-scale/s",
      range: Object.freeze([0, 10]),
      step: 0.5,
      startBias: "wake relief",
    }),
    decayAccretionShadowPercentPerSecond: Object.freeze({
      unit: "% signal full-scale/s",
      range: Object.freeze([0, 10]),
      step: 0.5,
      startBias: "shadow relief",
    }),
  }),
});

function signalFractionPerSecond(percent) {
  return Number(percent) / 100;
}

function wreckGravityStrengthFromReferenceSpeed(referenceSpeed, dragRate) {
  return Number(referenceSpeed) * Number(dragRate);
}

module.exports = {
  SERVER_TUNABLE_CONTRACTS,
  signalFractionPerSecond,
  wreckGravityStrengthFromReferenceSpeed,
};
