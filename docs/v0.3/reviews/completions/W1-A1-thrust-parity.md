# W1-A1 Thrust Parity

Outcome: partial, done for canonical thrust/brake parity.

What changed: `src/content/movement-step.js` is now the shared browser/Node
movement step. Local `Ship.update()` and the authority adapter consume it for
2.5 stick-relative thrust, 0.4 reverse thrust, shared fuel cost, regen, drag,
speed cap, and integration. Input packets carry the normalized move vector.

Evidence: `node tests/movement-trajectory-parity.cjs`,
`node tests/movement-golden.cjs`, and `node tests/movement-contract.cjs` pass.
The parity fixture compares an actual local `Ship` against the authority step
for a 24-tick no-gravity thrust/brake trajectory with facing intentionally
different from the stick vector.

Deviations: gravity consolidation, fabric convergence, slingshot behavior,
dead-knob cleanup, and other W1 rows remain untouched by scope.

Open questions: none for W1-A1. W1-A still needs its gravity-family and dead-
knob rows resolved before the full W1-A item is complete.

Anchor updates: the old client/server thrust and direction rows in velocity
ledger section F are resolved by the shared step; the remaining F rows are
outside this bounded slice.
