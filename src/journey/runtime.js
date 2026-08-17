import { validateJourneyDefinition, validateJourneyStep } from './schema.js';

const systemClock = Object.freeze({
  now: () => Date.now(),
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
});

function requireMethod(owner, name, label) {
  if (!owner || typeof owner[name] !== 'function') throw new TypeError(`${label} requires ${name}()`);
}

function stepKind(step) {
  return ['action', 'routine', 'waitForCondition', 'waitForEvent', 'assertCondition'].find((kind) => kind in step);
}

function activeTargetFor(step) {
  return step.target ?? step.args?.target ?? step.args?.targetId ?? null;
}

async function optionalRead(owner, name, fallback) {
  return typeof owner?.[name] === 'function' ? owner[name]() : fallback;
}

export class JourneyRuntime {
  #registry;
  #driver;
  #conditions;
  #clock;
  #maxRoutineDepth;

  constructor({ registry, driver, conditions, clock = systemClock, maxRoutineDepth = 12 } = {}) {
    requireMethod(driver, 'configureSetup', 'Journey driver');
    requireMethod(driver, 'configureControllerPolicy', 'Journey driver');
    requireMethod(driver, 'dispatchAction', 'Journey driver');
    requireMethod(driver, 'waitForEvent', 'Journey driver');
    requireMethod(conditions, 'evaluate', 'Journey condition reader');
    requireMethod(conditions, 'assert', 'Journey condition reader');
    requireMethod(conditions, 'snapshot', 'Journey condition reader');
    requireMethod(clock, 'now', 'Journey clock');
    requireMethod(clock, 'sleep', 'Journey clock');
    if (!registry) throw new TypeError('JourneyRuntime requires a Journey registry');
    this.#registry = registry;
    this.#driver = driver;
    this.#conditions = conditions;
    this.#clock = clock;
    this.#maxRoutineDepth = maxRoutineDepth;
  }

  async run(rawJourney) {
    const journey = validateJourneyDefinition(rawJourney, this.#registry);
    const startedAt = this.#clock.now();
    const stepReceipts = [];
    let lastCompletedStep = null;
    let activeStep = null;
    let activeTarget = null;

    try {
      await this.#driver.configureSetup(journey.setup);
      await this.#driver.configureControllerPolicy(journey.controllerPolicy);
      const execution = { journey, startedAt, stepReceipts };
      for (let index = 0; index < journey.steps.length; index += 1) {
        activeStep = journey.steps[index];
        activeTarget = activeTargetFor(activeStep);
        await this.#executeStep(activeStep, execution, 0, `${index + 1}`);
        lastCompletedStep = { index, id: activeStep.id, kind: stepKind(activeStep) };
        stepReceipts.push({ ...lastCompletedStep, status: 'passed', elapsedMs: this.#clock.now() - startedAt });
      }
      return this.#buildReceipt({
        journey,
        status: journey.knownFailure ? 'unexpected-pass' : 'passed',
        startedAt,
        lastCompletedStep,
        activeStep: null,
        activeTarget: null,
        stepReceipts,
      });
    } catch (error) {
      return this.#buildReceipt({
        journey,
        status: journey.knownFailure ? 'known-failure' : 'failed',
        startedAt,
        lastCompletedStep,
        activeStep,
        activeTarget,
        stepReceipts,
        error,
      });
    }
  }

  async #executeStep(step, execution, depth, receiptPath) {
    const kind = stepKind(step);
    if (kind === 'action') {
      await this.#driver.dispatchAction(step.action, step.args, {
        journeyId: execution.journey.id,
        stepId: step.id,
        target: activeTargetFor(step),
      });
      return;
    }
    if (kind === 'routine') {
      if (depth >= this.#maxRoutineDepth) throw new RangeError(`Journey routine nesting exceeds ${this.#maxRoutineDepth}`);
      const expand = this.#registry.requireRoutine(step.routine);
      const expanded = await expand({ args: step.args, journey: execution.journey });
      if (!Array.isArray(expanded) || expanded.length === 0) {
        throw new TypeError(`Journey routine ${step.routine} must expand to a non-empty step array`);
      }
      for (let index = 0; index < expanded.length; index += 1) {
        const child = validateJourneyStep(expanded[index], this.#registry, `routine.${step.routine}[${index}]`);
        await this.#executeStep(child, execution, depth + 1, `${receiptPath}.${index + 1}`);
        execution.stepReceipts.push({
          id: child.id,
          kind: stepKind(child),
          routine: step.routine,
          path: `${receiptPath}.${index + 1}`,
          status: 'passed',
          elapsedMs: this.#clock.now() - execution.startedAt,
        });
      }
      return;
    }
    if (kind === 'waitForCondition') {
      const deadline = this.#clock.now() + step.timeoutMs;
      while (!await this.#conditions.evaluate(step.waitForCondition)) {
        const remaining = deadline - this.#clock.now();
        if (remaining <= 0) throw new Error(`Timed out waiting for condition after ${step.timeoutMs}ms`);
        await this.#clock.sleep(Math.min(step.pollMs, remaining));
      }
      return;
    }
    if (kind === 'waitForEvent') {
      const observed = await this.#driver.waitForEvent(step.waitForEvent, { timeoutMs: step.timeoutMs });
      if (!observed) throw new Error(`Timed out waiting for authority event ${step.waitForEvent} after ${step.timeoutMs}ms`);
      return;
    }
    // Match the Phase 1B ConditionStore assert(query, context, message) seam.
    await this.#conditions.assert(step.assertCondition, undefined, step.message);
  }

  async #buildReceipt({ journey, status, startedAt, lastCompletedStep, activeStep, activeTarget, stepReceipts, error = null }) {
    const conditionSnapshot = await this.#conditions.snapshot();
    const authorityEvents = await optionalRead(this.#driver, 'getAuthorityEvents', []);
    const evidencePaths = await optionalRead(this.#driver, 'getEvidencePaths', []);
    const driverArtifacts = await optionalRead(this.#driver, 'getArtifactManifest', []);
    const navigationSnapshot = await optionalRead(this.#driver, 'getNavigationSnapshot', null);
    const finishedAt = this.#clock.now();
    return Object.freeze({
      journeyId: journey.id,
      status,
      knownFailure: journey.knownFailure,
      lastCompletedStep,
      activeStep: activeStep ? { id: activeStep.id, kind: stepKind(activeStep) } : null,
      activeTarget: activeTarget ?? await optionalRead(this.#driver, 'getActiveTarget', null),
      navigationSnapshot,
      conditionSnapshot,
      authorityEvents,
      elapsedMs: finishedAt - startedAt,
      evidencePaths,
      artifactManifest: Object.freeze([
        ...driverArtifacts,
        ...evidencePaths.map((path) => ({ type: 'evidence', path })),
      ]),
      steps: Object.freeze(stepReceipts),
      summary: status === 'passed'
        ? `${journey.id} completed ${stepReceipts.length} recorded steps`
        : `${journey.id} ${status} at ${activeStep?.id || 'setup'}: ${error?.message || 'expected failure passed'}`,
      error: error ? { name: error.name, message: error.message } : null,
    });
  }
}
