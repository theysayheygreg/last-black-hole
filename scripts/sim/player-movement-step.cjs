const movementStep = require("../../src/content/movement-step.js");

module.exports = {
  ...movementStep,
  SERVER_INPUT: movementStep.MOVEMENT_INPUT,
};
