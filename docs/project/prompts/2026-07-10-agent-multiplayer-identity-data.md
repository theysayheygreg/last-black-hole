# Agent Prompt: Multiplayer Identity, Authentication, And Data Model

> Produce research and design output, not implementation code.

## Purpose

Design a local-first and cloud-capable identity/data model for 4–8 player LBH
sessions. Reconcile device-local profiles with server-issued player/run
identity, authentication, entitlements, reconnect, host privileges, durable
progression, privacy, deletion, and offline play.

## Branch And Owned Output

- Target branch: `codex/v0.4-multiplayer-architecture`.
- Write scope: only `docs/v0.4/research/multiplayer-identity-data-model.md`.
- Do not edit integrated roadmap, decision log, changelog, or code.

## Read First

- `docs/v0.4/README.md`
- `docs/v0.3/ROADMAP.md`
- `docs/project/LOCAL-PROTOCOL.md`
- `docs/project/NETWORK-ARCHITECTURE-PLAN.md`
- `scripts/control-plane-store.js`
- `scripts/control-plane-runtime.js`
- `scripts/sim-runtime.cjs`
- profile, vault, run-result, and Chronicle schema/source files found from
  those entry points.

## Questions To Answer

1. Which identifiers are stable across account, device, install, profile,
   session, run, player incarnation, connection, and command authority?
2. Which identifiers are public, private, opaque, rotating, or secret?
3. What are the local-only, hosted-account, Steam/platform-account, guest, and
   hybrid migration flows?
4. Which service owns entitlements, saves, progression, matchmaking parties,
   bans, audit events, and conflict resolution?
5. What schema and indexes support idempotency, reconnect, host migration,
   transactional run settlement, deletion/export, and abuse investigation?
6. What is the minimum secure design for a $4.99 indie game without building a
   needless identity platform?

## Deliverable

Write the owned memo with a trust-boundary model, identifier taxonomy, ER/data
model, lifecycle/state transitions, local/cloud source-of-truth table, API
surface, threat model, migration plan, retention/privacy notes, and a clear
MVP recommendation.

## Guardrails

- A client-chosen id is never authorization.
- Do not put long-lived secrets in snapshots, logs, URLs, or replay files.
- Preserve offline/local play where feasible.
- Separate authentication, entitlement, player identity, profile choice,
  session membership, and command authority.

