"use strict";

class BenchValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "BenchValidationError";
    this.code = "bench-validation";
  }
}

function benchValidation(message) {
  return new BenchValidationError(message);
}

function isBenchValidationError(error) {
  return error instanceof BenchValidationError || error?.code === "bench-validation";
}

module.exports = {
  BenchValidationError,
  benchValidation,
  isBenchValidationError,
};
