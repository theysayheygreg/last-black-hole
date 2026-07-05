# Orrery Review — Loop + Meta Clarity (Fable Pass)

> **Date:** 2026-07-04
> **Packet:** `docs/project/prompts/2026-07-04-fable-loop-meta-clarity-review.md`
> **Reviewed against:** `main` working tree — `src/run-results.js`, `src/profile.js`,
> `src/main.js` (run-end + home/chronicle regions), `scripts/sim-runtime.cjs`
> (`buildRunResult`), `scripts/control-plane-store.cjs` (`applyRunOutcome`,
> `buildRunEntry`), `scripts/content/balance.cjs`, `scripts/player-brain.cjs`,
> `tests/meta-flow.cjs`, `tests/agent-play-eval.cjs`, plus the 2026-07-04 v0.3
> deep review.
> **Rule:** memo only. Nothing here is implemented.

---

## Verdict First

Three things are moving here, and the loop's clarity problem is not a UI
problem. The results screen is honest about *what happened*; the ledger
underneath it is not honest about *what changed*.

1. **The EM number on the results screen is fiction.** The sim computes
   `emEarned = cargoValue + survivalBonus` (`balance.cjs: runEmEarned`), the
   results screen displays it, the run entry records it — and **no code path
   credits it to `profile.exoticMatter`**. Extraction credits EM only for
   vault-overflow auto-sells (`control-plane-store.cjs:~330`, mirrored in
   `main.js:~4175`). Death subtracts a percentage tax (`deathTaxEm`) and
   credits nothing — the design's "small floor on death" exists in the formula
   and nowhere in the ledger. This is the packet's own guardrail violated in
   reverse: the UI claims what the control plane doesn't write.
2. **The Chronicle likely can't see the product's real runs.** Remote runs
   land in control-plane `state.runs`; the client chronicle reads local
   `profile.runRecords`; the profile sync on `leaveRemoteSessionToHome` pulls
   a profile shape that carries no run records (grep: `runRecords` appears
   only in `src/main.js`). Local-authority runs chronicle fine. Packaged
   (remote-authority) runs — the actual product — appear not to. Verify, then
   fix.
3. **Everything else needed for loop clarity already exists.** Results screen
   on shared primitives with extraction/death variants, rig purchase working
   end-to-end locally (proven by `tests/meta-flow.cjs`), rig levels flowing
   into PlayerBrain coefficients (`player-brain.cjs: applyRigUpgrades`),
   2+2 loadout contract asserted in tests, chronicle tab with records and
   echoes. The v0.2 work is **make the ledger true, then show its delta** —
   not new systems.

The slice order below is ordered by that logic: truth first, delta display
second, bridge third, briefing fourth, upgrade legibility fifth.

---

## Q1 — The First 30 Minutes

The clearest journey, using only what exists or is one slice away:

| Minute | Beat | What the player must understand |
|---|---|---|
| 0–2 | Title → profile → Home | "This is my pilot. LAUNCH is the loud red thing." No tutorial screens — the drop briefing carries onboarding weight. |
| 2–4 | Drop briefing (Shallows) → first drop | "I'm going somewhere dangerous, these 2+2 slots are what I'm risking." |
| 4–8 | First run → **first death** (probable, fine, by design) | Results: *what killed me* (`CONSUMED BY CHARYBDIS`), *what I lost* (struck-through manifest), *what I kept* (small EM floor). The floor is the retention mechanism — it must be a real credit, not a formula. |
| 8–10 | Home again | The ledger moved. Even a death changed something. "Again." |
| 10–16 | Second/third run → **first extraction** | Results: manifest cascades to vault, EM delta visible. "That's mine now." |
| 16–18 | Vault | See the items as objects with tiers and values. Sell one T1. EM up. The sell verb teaches that items are money. |
| 18–20 | Rig tab | First affordable upgrade in sight or in reach. Buy Laminar/track I. One line: what it does *next drop*. |
| 20–30 | **The intentional second run** | Drop briefing shows the rig applied. The player chose a map, chose what to risk, and knows why they're going back in. |

Two frictions in the current numbers threaten this arc:

- **First rig level costs 300 EM** (`balance.data.json: rigLevelCosts[0]`).
  With EM coming only from selling and the survival bonus never credited, a
  new player may not touch an upgrade inside 30 minutes. Either credit the
  survival bonus (recommended below) or drop level 1 to ~150. The first
  purchase must land by run 3–4 or the meta loop doesn't exist for demo
  players.
- **Death currently only taxes.** A new player's first three runs are likely
  deaths. Tax with no floor is "I wasted my time" — the exact feeling the
  design says to prevent (`META-LOOP.md`: "EM is never negative. You always
  earn something"). The code inverted this.

---

## Recommended Slice Order (v0.2 → v0.3)

Each slice is playable/reviewable in a day-night cycle, per the v0.2 roadmap
contract.

### v0.2 (demo polish)

**Slice 1 — Ledger Honesty.** One place credits EM: `applyRunOutcome` (and the
local mirror in `profile.js`). Extraction: credit `survivalBonus` (+ future
milestone bonuses); cargo stays items-to-vault and is *labeled* as salvage
value, not EM earned (see Q6 for why not to credit cargo value directly).
Death: credit `floor(survivalBonus * deathSurvivalPayoutMult)` — the floor the
formula already computes. Decide the death-tax question (Greg call, below).
Results screen labels change to match: `LEDGER +52 EM`, not `earned 342 EM`.
*Definition of done: the number on the results screen equals the profile EM
delta, asserted by a test.*

**Slice 2 — Results Delta.** Add the "what changed" block to results: EM
before → after, `VAULT +3 ITEMS`, death tax as a signed line. Fold the meta
salvage report (`gamePhase 'meta'`) into the results screen or delete it — two
consecutive result-ish screens on every extraction is the loop's only mandatory
menu friction today, and the deep review (S6.1) already flags it as a legacy
surface. One screen, one continue.

**Slice 3 — Chronicle Bridge.** Make remote runs reach the chronicle: either
carry `runRecords` in the control-plane profile snapshot (simplest — the store
already builds `buildRunEntry` with everything the chronicle view needs) or
add a `/runs?profileId=` fetch on home entry. Without this, the demo's
chronicle is empty in the packaged build and the packet's guardrail ("don't
claim client-only UI as shipped") applies to the whole tab.

**Slice 4 — Drop Briefing Truth.** Map select already shows route/risk/seed.
Add the loadout read: equipped 2+2 with `AT RISK: 580 EM` total, and the
rig-applied line (`LAMINAR I — flow lock aligns faster`). This is where risk
tension lives, and it closes the loop: results told you what changed, briefing
tells you what you're betting next.

**Slice 5 — Upgrade Legibility.** Rig tab copy pass: every track shows current
level, next effect in *play terms*, cost, affordable state (already in
`getHomeState`); purchase gets a confirm beat; Home shows a small "changed
since last drop" marker on the rig/vault tabs after a run that changed them.

### v0.3 (structure)

**Slice 6 — Notables and Milestones, real.** `buildRunResult` ships
`milestonesUnlocked: []` always and notables are generic cargo counts. The
event journal work (v0.3 S3.1) is the natural feed for real notables
(personal bests, near-misses, slingshot chains via S5.5 telemetry). Milestone
triggers are defined in `CLASSES-AND-PROGRESSION.md`; implement against the
stats the store already accumulates. Do not build milestone UI in v0.2.

**Slice 7 — Chronicle depth.** History scroll (records exist, UI shows 5 with
no cursor — deep review S6.8.5), signal profile bars, records tab. Echoes
go public here if Greg wants them public at all.

Deliberately **not** sliced: insurance (decided dead — `META-LOOP.md` still
contains the live insurance section *and* the "no insurance" decision; delete
the section), the old 6-track component-upgrade system (see open questions),
loadout presets, per-pilot-per-hull expansion.

---

## Screen-by-Screen Information Hierarchy

Order within each screen = read order at couch distance. First item is the
one-glance read; everything below it is allowed to need a second look.

### Results (Q2 — the one-glance contract)

Same skeleton both outcomes, per `META-LOOP.md` — the code already does this.

**Extraction:**
1. `EXTRACTED` — extract-green/amber, 38px+. Haunted relief, not fireworks.
2. **Ledger delta** — `+86 EM · 3 → VAULT` (this line is new; it is the answer
   to "what changed" and currently doesn't exist truthfully).
3. Manifest — items with tier + value, cascading to vault.
4. Run summary — survival, signal peak zone, inhibitor form.
5. Notables + AI lines (max 3 + 2).
6. `REVIEW SALVAGE` → home. Navigation-colored, never danger-colored (shipped
   correctly).

**Death:**
1. `CONSUMED BY CHARYBDIS` — danger red, cause-specific, entity-named (shipped).
2. **What was lost** — struck-through manifest with total value. Never blur
   this with the floor payout: lost is red and crossed out, kept is a separate
   small amber line.
3. **What was kept** — `RESIDUE +12 EM` (the floor, once it's real). One line.
   Small. It's a consolation, not a reward.
4. Cause detail + run summary.
5. `RETURN HOME` — flow-colored (shipped correctly).

The extraction/death asymmetry is the whole lesson of the game's economy.
Guardrail restated: the two screens share layout, never color meaning, and the
death screen never shows a number that looks like extraction earnings.

### Home

1. Selected tab + pilot identity (name, hull, EM balance) — one strip.
2. **Delta markers** since last run: EM ledger, vault +N badge, rig-affordable
   dot. Home's job between runs is "here's what moved."
3. Launch rail — loudest element, always (shipped as persistent rail; keep).
4. Tab content.
5. Prompts. Defer: missions stub, ship-stats deep dive, any second currency.

### Vault / Loadout

1. Equipped 2+2 slots — the contract, always visible, labeled `AT RISK`.
2. Total value at risk in EM — the dread lever from META-LOOP, one number.
3. Vault grid sorted tier-desc, item = `[T2] name · value`.
4. Verbs: SELL / EQUIP / LOAD — one row, no submenus.
5. Capacity readout (only when >70% full; silent otherwise).
Defer: sort modes, item inspect with coefficient tables, affinity tags beyond
a glyph, bulk-sell.

### Upgrade (Rig)

1. Three tracks, level pips, selected track focus (shipped shape).
2. **Next effect in play language** — "flow lock engages 0.5s faster," never
   "+0.1 currentCoupling." Coefficients are for the dev panel.
3. Cost + affordable state (color, not just number).
4. Purchase confirm beat + "applies next drop" line.
5. Total invested (chronicle-flavored footer, muted).
Defer: respec (never, decided), the old component/rank system, cross-hull
anything.

### Chronicle

1. Career strip: drops / returns / rate — three numbers, one line.
2. Last 5 runs: outcome glyph, time, map, EM, one notable flag (shipped shape,
   needs the remote bridge to be non-empty).
3. Echo fragment if present — one, muted, no header fanfare.
Defer: records tab, signal profile bars, milestones tab, history scroll —
v0.3. An empty milestones tab is worse than no milestones tab.

### Drop Briefing (Map Select)

1. Map preview + selected sector risk (shipped).
2. **What you're risking:** 2+2 loadout summary + `AT RISK` total (new).
3. **What you're bringing:** hull + applied rig one-liner (new).
4. `BEGIN DROP` (shipped, correctly loudest).
5. Seed/signature/hazard texture (shipped; stays texture — and note v0.3
   review S1.6: signature is currently client-side fiction in remote play;
   don't promote it to a decision-bearing read until the server owns it).

---

## Q4 — Motivational vs Noise

**Motivational (earn their pixels):**
- EM ledger delta — the single strongest "why run again" number, once true.
- Manifest with tiers/values — extraction's trophy shelf, death's gut punch.
- Death cause with entity name — turns death into story ("Charybdis again").
- Survival time — universal, comparable, honest.
- At-risk total on loadout/briefing — the dread lever.
- Next rig effect + affordable state — the "one more run and I can afford it"
  hook.
- Signal peak *zone* (word, not float) — identity feedback: was I a ghost or
  a beacon.
- One or two AI outcome lines — "Redline extracted with 4 cargo while you
  died" is motivational spite; keep it to two lines max.

**Noise (cut or demote to texture):**
- `wells visited` — no decision or story attached; cut from results.
- `timePerZone` tables, `inhibitorFormTimes` — chronicle-depth material at
  best; never on results.
- Generic notables ("2 cargo recovered") — redundant with the manifest;
  suppress until notables carry real events.
- Seed/map-scale/well-count on results — briefing texture, not result data.
- Signal peak as a raw float (`FLARE (0.81)`) — the number undercuts the word;
  show the zone, keep the float in the chronicle.
- EM-spent lifetime totals — chronicle only.

---

## Q5 — Copy & Tone Guide

**Verdict: clinical instrument, haunted operator.** The skeleton is
naval-clinical — manifests, ledgers, briefings, drops: procedural language for
a procedural loop, and it's already the shipped voice of the panels (NERV/
Marathon slabs, `BEGIN DROP`, `RETURN HOME`). The haunt lives in exactly one
lowercase line per screen — the shipped "you made it through the aperture" /
"this is what the universe kept" pair is precisely right, and the strongest
copy in the game. Amber warmth appears only on salvage value.

What the blend rejects: **arcade** (score-attack copy breaks dread — no
"BONUS!", no multipliers, no exclamation points anywhere), **corporate**
(no "performance summary," nothing that sounds like a quarterly review),
**full-naval cosplay** (ranks and callsigns would fight the lonely-pilot
fantasy — this universe has no fleet left; that's the point). The clinical
register does the tension work; the haunted line does the meaning work; each
needs the other or you get either a spreadsheet or a poem.

Rules: ALLCAPS for states and commands only. Lowercase for the voice lines.
No exclamation points. Numbers get units. The universe is never addressed and
never addresses you — the UI is the ship's instrument talking, and the
instrument is old.

Example labels and status lines (★ = already shipped, keep):

1. ★ `EXTRACTED` / `CONSUMED BY CHARYBDIS` — outcome states, entity-named.
2. ★ `you made it through the aperture` — extraction subline.
3. ★ `this is what the universe kept` — death subline.
4. `LEDGER 1,240 → 1,326 EM` — the delta line; arrow, not plus-minus soup.
5. `MANIFEST — 3 recovered → vault` — extraction cargo header.
6. `residue +12 EM` — death floor, lowercase, small: consolation, not reward.
7. `AT RISK: 580 EM · loss is loss` — loadout/briefing dread line.
8. `LAMINAR I installed — flow lock aligns faster. applies next drop.`
9. ★ `BEGIN DROP` / `RETURN HOME` — command slabs, action-only labels
   (prompt affordances stay below the slab, per the UI system contract).
10. `47 drops · 31 returns` — chronicle career strip; "returns," not "wins."
11. ★ `no unusual telemetry` — empty-state for notables; the instrument
    shrugging is better than hiding the section.
12. `the vault holds what you couldn't.` — death-screen vault hint, only when
    equipped items were lost; the one permitted knife-twist.

---

## Q6 — Smallest Honest Write-Back Loop

The smallest loop that makes the next run *feel changed*, given what exists:

1. **Credit the ledger in one place.** `applyRunOutcome` in
   `control-plane-store.cjs` is the right owner (the local path in
   `profile.js`/`main.js` mirrors it until local mode consumes the store).
   Extraction: `profile.exoticMatter += survivalBonus` (+ milestones when
   real). Death: `+= floor(survivalBonus * deathSurvivalPayoutMult)`. The
   formulas exist (`balance.cjs`); they're computed on every run and thrown
   away. This is a two-site change plus tests.
2. **Do not auto-credit cargo value as EM.** Cargo→vault-as-items with EM
   realized on sell is the *better* economy than META-LOOP's earnings table,
   which double-counts (items cascade to vault *and* their value appears as
   EM earned). The sell decision is a real decision; keep it. Fix the
   *display* instead: cargo value on results is `salvage value`, not
   `earned`. Update META-LOOP.md to match code truth here — the code won this
   argument.
3. **Show the delta.** Results gains the ledger line and `VAULT +N`. That's
   the entire "what changed after this run?" answer for v0.2.
4. **Rig write-back already works — make it felt.** Purchase persists
   (`performRigUpgrade`), levels reach the sim (`createPlayerBrain →
   applyRigUpgrades`), and ride `RunResult.rigLevels`. What's missing is
   legibility: the briefing's rig-applied line and play-language next-effects.
   For the demo, steer first purchases toward *feelable* effects (pickup
   radius, flow-lock timing) over raw coefficient nudges.
5. **Bridge the chronicle** (slice 3) so the write-back is visible in the
   packaged product, not just localStorage.

Explicitly *not* in the smallest loop: milestones, notables enrichment,
insurance, component upgrades, vault capacity changes, any new currency.

---

## First Public Demo Meta-Loop Definition

**Must work (sim/control-plane writes it, UI shows it, tests prove it):**
- Drop → loot → extract/die → results → home, on the remote-authority stack.
- EM ledger: results number == profile delta, both outcomes. Death floor real.
- Cargo → vault as items; sell → EM; equip into 2+2; equipped items lost on
  death, vault items safe. (The reward/salvage distinction is the game's
  honesty contract — it can never be mocked.)
- One rig purchase persisting and applying next run.
- Chronicle showing the session's real runs (post-bridge).

**Can be mocked / seeded:**
- Notables (curate 2–3 template lines from real run data — cause, cargo
  counts — as today; no invented events).
- Echo fragments (already seeded content by design).
- AI outcome lines are real sim data already — cheap authenticity; keep them.

**Should not be shown yet:**
- Milestones tab or any milestone UI (`milestonesUnlocked` is always empty —
  an empty promise on screen).
- Insurance, anywhere, ever (decided).
- The old component/rank upgrade tracks from META-FLOW (parallel system;
  confusing next to rig tracks).
- The meta salvage report as a separate screen (fold into results).
- Signature-driven "modified universe" claims in the briefing until the
  server actually applies signature mods (v0.3 review S1.6).
- Chronicle records/signal-profile depth — the career strip and last-5 list
  are enough for a demo.

---

## Q7 — Test & Play-Eval Plan

The honesty tests are the point: every claim the results screen makes should
have an assertion tying it to a store read.

**Unit/authority lane (fast, per-commit):**
1. **Ledger honesty test** (new, the keystone): drive extraction and death via
   the authority test harness; assert
   `resultsView.emEarned === profileAfter.exoticMatter - profileBefore.exoticMatter`
   (extraction) and the death floor + tax net matches the displayed lines.
   This test is currently impossible to pass — that's the proof it's needed.
2. **Portal-extraction authority test** — already named in the v0.3 review
   (S0.4): spawn near portal, drive in, assert escape event + profile
   write-back. Do it on main too; it's the loop's climax and has no
   authoritative-snapshot coverage.
3. **Vault/sell/equip round-trip:** extract 2 items → assert vault +2 → sell 1
   → assert EM + value, vault −1 → equip 1 → die → assert equipped item gone,
   vault item intact. One test, the whole risk contract.
4. **Chronicle bridge test:** remote extraction → return home → assert
   `getChronicleView().records[0].runId` matches the session run. (Extends the
   existing `meta-flow.cjs` fixture test, which currently proves the local
   fixture path only.)
5. **Rig write-back test:** exists in `meta-flow.cjs` (purchase, levels,
   EM spend). Add the missing half: after purchase, start a run and assert the
   resolved PlayerBrain coefficient/behavior changed (server-side assert, not
   UI).

**Play-eval lane (`test:agent-eval`, per-milestone):**
6. Extend the agent play eval: after its forced extraction, navigate home and
   assert EM/vault/chronicle reflect the result; capture results, home, vault,
   and rig screenshots into the report so Greg reviews loop truth from the
   summary, not by replaying it.
7. **Comprehension probe:** have the agent answer, from screenshots only:
   "what did this run earn, what was lost, what changed, what would you do
   next?" — written into the eval summary. Wrong answers are design findings,
   not test failures.

**Human pass (once per slice, per the RC-gate pattern):** one scripted
20-minute session following the Q1 journey table; the pass/fail question is
the v0.2.2 definition of done verbatim — *can the player say what changed
after a run, does an upgrade have a visible next-run effect, does death hurt
without erasing motivation.*

---

## Open Questions for Greg

1. **Death economics — floor, tax, or both?** Code taxes (percentage of
   balance) with no floor; META-LOOP specifies a floor and "never negative";
   META-FLOW's 2026-03-27 decision says "some EM loss on death." My
   recommendation: floor credited always, drop the percentage tax for the
   v0.2 demo (equipped-item loss is already the death penalty, and it's a
   better one), revisit tax when balances get big. Your call — it's the
   economy's emotional core.
2. **Retire the old component/rank upgrade system?** `profile.js` carries both
   the 6-track component system (META-FLOW) and the 3-track rig system
   (META-LOOP); the Home UI sells rig tracks. Two progression grammars can't
   ship. I'd kill components for v0.2 (vault-capacity upgrade moves to EM-only
   under rig or milestones later) and mark META-FLOW's upgrade section
   historical.
3. **Meta salvage report: fold or keep?** Recommendation: fold into results.
   If you have an attachment to the two-beat extraction ritual, say so before
   slice 2.
4. **First-upgrade pacing:** credit survival bonus and keep `rigLevelCosts[0]`
   at 300, or also drop it to ~150? Needs a playtest datapoint; I'd credit
   first, measure runs-to-first-purchase, then touch the cost.
5. **Chronicle in the demo: career strip + last 5 only?** That's my
   recommendation; confirm you're comfortable hiding records/milestones/signal
   profile rather than shipping them thin.
6. **Echoes public in v0.2?** They're flavorful and cheap (seeded), but
   they're also the most "unfinished-looking" surface if a tester pokes at
   them. I'd keep them in and unexplained — dread over completeness — but it's
   a taste call.
7. **META-LOOP.md cleanup:** it still contains the insurance section, the
   3-artifact-slot loadout, and the auto-credited cargo-value earnings table —
   all contradicted by decisions or shipped code. Approve a docs pass so the
   next agent doesn't rebuild the wrong economy from it.

---

*The gears that matter here are small: one credit site, one delta line, one
bridge. The loop already turns — it just doesn't tell the truth about turning.*
