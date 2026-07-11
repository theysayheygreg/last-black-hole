# Agent Prompt: Hosted Authority Costs And $4.99 Unit Economics

> Perform current web research. Produce a cited cost model, not code.

## Purpose

Compare centrally hosted one-run/one-authority deployment options for 4–8
player LBH sessions and derive cost and margin models at 1K, 10K, 100K, and 1M
copies sold for a $4.99 game.

## Branch And Owned Output

- Target branch: `codex/v0.4-multiplayer-architecture`.
- Write scope: only `docs/v0.4/research/hosted-costs-unit-economics.md`.
- Do not edit integrated roadmap, decision log, changelog, or code.

## Read First

- `docs/v0.4/README.md`
- `docs/v0.3/ROADMAP.md`
- `docs/project/EVE-ARCHITECTURE-RESEARCH.md`
- `docs/project/LOCAL-PROTOCOL.md`
- `docs/project/NETWORK-ARCHITECTURE-PLAN.md`
- current package/runtime entry points and Deep Field performance budgets.

## Research Requirements

- Use current official pricing/docs for Cloudflare, Vercel, and at least three
  platforms suited to stateful game servers or container/process instances.
- Explicitly test whether each vendor supports long-lived stateful WebSocket or
  UDP-style game sessions; do not assume serverless request products do.
- Include control plane, auth, database, object storage, observability, relay,
  DDoS/egress, backups, support, and idle-capacity considerations.
- Cite all vendor price and constraint claims inline with access date.

## Questions To Answer

1. Which topology best hosts one LBH run as one authority process?
2. What are the smallest viable, recommended, and scale-out vendor stacks?
3. What are cost per active player-hour, per run-hour, monthly fixed cost, and
   egress cost under low/expected/high traffic cases?
4. Given 1K/10K/100K/1M copies at $4.99, what are gross receipts, storefront
   deduction, refunds/tax assumptions, net receipts, service costs, reserve,
   and contribution margin?
5. How sensitive is sustainability to concurrency, hours played, session size,
   retention, regions, and store fee?

## Deliverable

Write the owned memo with vendor fit/constraint table, architecture options,
dated pricing table, transparent formulas, low/expected/high workload model,
unit economics at all requested sales scales, sensitivity/break-even analysis,
recommended stack, and explicit unknowns requiring a live benchmark or quote.

## Guardrails

- Copies sold is not concurrent players.
- Separate one-time receipts from recurring monthly operating costs.
- Do not hide free-tier cliffs or assume permanent promotional pricing.
- Do not count developer salary as zero; show operating contribution both
  before and after an explicit labor/support allowance.

