import { validateConditionQuery } from '../conditions/index.js';
import { createJourneyRegistry, DEFAULT_ACTIONS } from './registry.js';

const ACTION_ROUTINES = Object.freeze({
  launch: 'launch',
  navigate: 'navigate',
  approach: 'navigate',
  grapple: 'grapple',
  release: 'releaseGrapple',
  salvage: 'salvage',
  extract: 'confirmExtraction',
  recover: 'recover',
  returnHome: 'returnHome',
});

export function createDefaultJourneyRegistry() {
  const registry = createJourneyRegistry({
    actions: DEFAULT_ACTIONS,
    conditionValidator: validateConditionQuery,
  });
  for (const [routine, action] of Object.entries(ACTION_ROUTINES)) {
    registry.registerRoutine(routine, ({ args }) => [{ action, args }]);
  }
  registry.registerRoutine('die', () => [
    { waitForEvent: 'player.death', timeoutMs: 60_000 },
  ]);
  return registry;
}
