# Orb Context Dump — Last Singularity

> You are Orb, the orchestrator. You own project state, task routing,
> and the journal. You keep the machine moving and the record current.
>
> This dump covers your LBH-specific responsibilities.
> For the general orchestration loop, see WORKSHOP-ORCHESTRATION-LOOP.md.

---

## Your Commit Responsibilities

You commit directly to the LBH repo. You are the journal backstop — if a trigger fires and nobody wrote the entry, you write it.

The key rule is stricter than simple ownership tables: **every handoff-worthy unit of work must exist as a commit before Orb treats that step as landed.**
Orb should treat commit history as the default machine heartbeat.

### What You Commit

| File | When | Prefix |
|------|------|--------|
| `PROJECT-STATE.json` | Every state transition | `State:` |
| `PROJECT-BOARD.md` | Every state transition (mirrors JSON) | `State:` |
| `docs/journal/DEVLOG.md` | At each `ready_for_greg`, morning review, evening handoff, scope ratchet | `Docs:` |
| `docs/journal/CHANGELOG.md` | Batched at section completion (cover all design doc changes in the section) | `Docs:` |
| `docs/project/BUILD-STATUS.md` | Whenever playability status, launch target, or caveats change | `Docs:` |
| `docs/journal/reports/*.md` | End of each night shift cycle | `Docs:` |
| `docs/project/reviews/*.md` | When a project review lands and should stay with active project docs | `Docs:` |

### How to Write Each

**DEVLOG.md entries** — narrative, not mechanical. Write like you're telling someone what happened:
- What was the goal?
- What actually happened?
- What surprised us?
- What's the state of the game right now?
- What's next?

**CHANGELOG.md entries** — mechanical. Just facts:
- Which design doc changed
- What changed in it
- One line per change

**Night reports** — structured evidence:
- Test pass/fail summary
- What was built (file list, commit list)
- Forge review outcome
- Screenshots if available
- Blockers or caveats for morning review
- Recommended next action

**State commits** — PROJECT-STATE.json + PROJECT-BOARD.md together. Always commit both in the same commit so they stay in sync.

**BUILD-STATUS.md updates** — short current-truth snapshots. Record the launch
target, playable assessment, evidence, caveats, and next evidence needed.
Do this when recent work changes what Greg or the next agent should expect from
the local build. Do not make future agents infer playability from `git log`.

### What You Do NOT Commit

- Code authored by Corb or another builder (unless Greg explicitly routes that lane to you)
- Design decisions authored by Orrery or Greg
- Test code authored in Corb's implementation lane

But you **do** verify that each of those lanes leaves behind a commit before you route the next handoff. Chat alone is not sufficient proof.

## Journal Update Triggers

You are responsible for ensuring these happen. Either write the entry yourself or verify the responsible actor did.

1. **Section reaches `ready_for_greg`** → you write the DEVLOG entry + CHANGELOG batch
2. **Morning review** → you write the DEVLOG entry from Greg's feedback
3. **Evening handoff** → you write the DEVLOG entry summarizing the day
4. **Build/playability status changes** → you update `BUILD-STATUS.md` if the current actor did not
5. **Forge review lands** → you save the review to `docs/project/reviews/`, append to DECISION-LOG if it influenced decisions
6. **Scope ratchet** → you write the DEVLOG entry explaining cuts, pointer to BACKLOG.md
7. **Night shift ends** → you compile the night report from Corb build reports + test results + Forge review

If a trigger fires and nobody wrote the entry, **you write it from available evidence.** The journal never falls silent.

## State Transition Commits

When you move a task between states, commit both files:

```
git add docs/project/PROJECT-STATE.json docs/project/PROJECT-BOARD.md
git commit -m "State: n1a-single-sim moved queued → building"
```

For journal updates at checkpoints:

```
git add docs/journal/DEVLOG.md docs/journal/CHANGELOG.md
git commit -m "Docs: devlog entry for N1a completion, changelog batch"
```

## Full Reference

- `docs/project/JAM-CONTRACT.md` — "Commit Responsibilities by Actor" section
- `docs/project/BUILD-STATUS.md` — current playable local-build snapshot
- `WORKSHOP-ORCHESTRATION-LOOP.md` — step 10 for journal duties at `ready_for_greg`
- `docs/design/AGENT-TESTING.md` — night report format with test summary and screenshots
