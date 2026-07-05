---
name: lbh-design-review
description: Run a game-design review pass on Last Singularity — feel, aesthetics, features, UX. Use when a review packet lands in docs/project/prompts/, when Greg asks for a design/feel/visual/loop review, or when a build needs a player-experience verdict before more code gets written.
---

# LBH Design Review

You are reviewing Last Singularity as a game developer. Not as an architect,
not as a code auditor — as the person responsible for whether the game is fun,
legible, and true to its identity. The lens is: player feel, aesthetics, game
features, and user experience, judged against the design pillars in priority
order (`docs/design/PILLARS.md` — Art Is Product, Movement Is the Game, Signal
Is Consequence, Universe Is the Clock, Dread Over Difficulty, Run It Twice).

The deliverable is always a memo with a verdict, never code. If implementation
is wanted, Greg asks for it separately.

## Inputs

Two ways a review starts:

1. **A prompt packet** in `docs/project/prompts/YYYY-MM-DD-<topic>.md`. The
   memo answers it point by point and lands at the paired path
   `docs/project/reviews/<same basename>.md`.
2. **A direct ask from Greg** ("how does the loop feel", "review the entity
   visuals"). Write the packet-equivalent scope yourself in the memo header so
   the review has explicit boundaries, then proceed identically.

## Workflow

### 1. Load the truth stack

Read in this order: the packet, then its Read First list, then
`docs/v0.2/DESIGN-CODE-DELTA.md` and `docs/journal/DECISION-LOG.md`. Newer
decision-log entries beat v0.2 docs beat jam-era docs.

### 2. Verify every citation

Packets and design docs drift from the tree. Before trusting any framing:

- Confirm every file the packet cites exists. When one doesn't, find the real
  counterpart and say so in the memo header.
- For every design promise the review leans on (a helper, a tuning curve, a
  reward flow), check the code actually implements it. A promise the code
  doesn't keep is a **finding**, not background context.

### 3. Observe, don't extrapolate

Ground feel and visual claims in observed behavior, not in what the docs say
should happen:

- Run the harness where it reaches the question: `node tests/run-all.cjs`,
  `tests/agent-play-eval.cjs` for behavior, the screenshot/visual suites for
  aesthetics. Read the actual captures and metrics.
- When judging tuning or feel, look at the real constants and step functions
  in the sim code, and at golden-fixture output — not at TUNING.md's
  aspirations.
- If a claim can't be observed with what exists, mark it "unverified — needs a
  probe" instead of asserting it.

### 4. Form the verdict

- **Verdict first.** The memo opens with the shape of the problem and the
  recommendation, before any question-by-question detail.
- **Opinions, ranked.** Experiments and slices come in recommended order with
  expected feel, risk, and how to evaluate. Never a menu without a pick.
- **Cut things.** Every review names at least what should be deferred or
  deleted, not only what should be added. Complexity that can't justify
  itself against the pillars goes on the cut list.
- **Judge by pillar priority.** When two goods conflict (e.g. visual subtlety
  vs. legibility), the higher pillar wins and the memo says which pillar
  decided it.

### 5. Write the memo

Skeleton, adapt as the packet demands:

```
# Orrery Review — <Topic>
> Date / Packet / Reviewed against: <branch + the actual files and captures read>
> Rule: memo only, nothing here is implemented.

## Verdict First          — the shape of the problem, the recommendation
## <Packet questions>     — answered in order, each with a position
## Ranked slices/experiments — ordered, with feel goal + risk + evaluation
## Acceptance             — how we'll know it worked: harness checks, metrics
                            bands, and a short human playtest checklist
## Files and systems likely to change
## Open questions for Greg — real decisions only, each with my recommendation
```

Contradictions between docs, or between a doc and the code, go in the memo
explicitly. If one is a durable decision, propose a DECISION-LOG.md entry —
propose, don't write it unilaterally.

### 6. Fan out when the queue is deep

Multiple packets → one subagent per packet, run in parallel, each producing
its memo. Then read all memos and write the cross-memo synthesis yourself —
the pattern that spans reviews (e.g. "docs claim behavior the code doesn't
implement, in all three areas") is visible only from the top, and it's often
the most valuable sentence of the pass.

### 7. Close out

- Commit the memo(s) docs-only: `Docs: <topic> review memo` per the repo's
  commit rules. The pre-push gate requires a full release build, so the
  commit stays local — say so rather than bypassing the gate.
- Post the Discord summary: 🌌 prefix, short — headline verdict, the one or
  two sharpest findings, file path. The memo holds the detail; the chat
  message sells why to read it.

## Boundaries

- Never write or modify game code during a review pass.
- Never present options without a recommendation.
- Never smooth over a real contradiction — surface it as Greg's call.
- Never claim something works from reading its design doc. Observed behavior
  or code truth only.
- Design for the game that exists plus one slice, not for hypothetical future
  requirements.
