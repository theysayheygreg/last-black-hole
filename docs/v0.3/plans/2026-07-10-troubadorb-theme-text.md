# v0.3 Troubadorb Theme and Text Implementation Plan

> Date: 2026-07-10
> Status: **Orrery reconstruction, pending ratification.** The overnight lane
> `overnight/20260710-230616-troubadorb-plan` produced no plan file (zero
> commits, clean worktree). This document was written by Orrery during the
> 2026-07-10 specialist-plan review so the text lane has an executable shape;
> it is deliberately narrower than the palette and timbre plans and should be
> ratified or amended by Greg (or a rerun Troubadorb pass) before its code
> waves execute. See
> `docs/v0.3/reviews/2026-07-10-orrery-specialist-plan-review.md`.
> Scope: the v0.3 Three/authoritative candidate line.

## Purpose

Give Last Singularity one written voice. The palette lane renders "the failing
instrument" visually; the timbre lane renders it sonically; this lane renders
it in words — every player-facing string, name, and description, plus the
glossary the other two lanes cite. The target is restraint: text that reads
like telemetry from a dying instrument, not narration, not flavor-text
padding, and never language that promises capability the sim does not grant.

## Lane ownership and sequencing (from the Orrery review)

- This lane **owns** names/descriptions in `src/content/*.data.json`
  (items, hulls/rigs, signatures, session profiles) and the vocabulary of
  `src/text-corruption.js`. It owns the glossary and voice-guide docs.
- Player-facing string literals in `src/main.js`, `src/hud.js`, and
  `src/run-results.js` are edited by this lane **last**, after the timbre
  lane's audio-router slice and the palette lane's draw-path edits have
  merged — a mechanical sweep over settled code.
- Tasks 1–3 are docs-only Wave 0 and may proceed now. Tasks 4–6 wait for
  Greg's feel/taste verdict and ratification of this plan.
- `docs/v0.3/RC-GATE.md` is edited by the integrator only.

## Current-state inventory (verified 2026-07-10)

| Surface | Location | Observed state |
|---|---|---|
| Product name | `src/main.js:3319,3399` render `LAST SINGULARITY` | Correct. The repo path `last-black-hole` is implementation history; no player-facing string may say "Last Black Hole." |
| Item catalog | `src/content/items.data.json` — 65 named items | Names exist and have stable generated icon ids (RC gate). A tone/consistency pass has never been done as a body of work. |
| Hulls and rigs | `src/content/hulls.data.json` (rig names like Laminar, Edgerunner, Gleanings, Afterburner, Ironclad, Smash & Grab, Harmonics, Anchor) | Public roster is Drifter and Breacher only. Resonant, Shroud, and Hauler are internal; player-facing text must not reference them. |
| Signatures | `src/content/signatures.data.json` (`SIGNATURE_DEFINITIONS`, pools, seeded sets) | Cosmic-signature naming feeds route briefings; needs the same voice as the rest. |
| Outcome language | `src/run-results.js` (`COLLAPSED` for collapse cause; cause/cargo foregrounded) | Matches the timbre plan's collapse language. Keep. |
| Corruption text | `src/text-corruption.js` — bounded combining-mark damage, `DEFAULT_GLITCH_GLYPHS` | The Inhibitor damages language but not the DOM; marks are stripped before reapplication. This safety contract is non-negotiable. |
| HUD/menu strings | `src/main.js`, `src/hud.js` — warnings, prompts, tabs, briefings, profile flows | Functional but never voice-audited; some warnings are ad hoc (`"… destroyed — loot scattered"`). |
| Prior voice work | `docs/public/TWITTER-POST-OPPORTUNITIES.md` ("reporting from the workbench" guidance, Troubadorb-style copy pass 2026-06-27) | The closest existing statement of the product voice; mine it, don't contradict it. |

## Constraints

1. **Truth outside text.** Strings describe sim facts; they never imply
   capability, odds, or consequences the sim does not enforce. Signal taxes
   ambition — the words must not sell it as a purchasable power.
2. **Color words are load-bearing.** Cyan = route/extraction, amber =
   value/salvage, red = immediate consequence, magenta = Inhibitor/corruption/
   anomaly only. Text uses these words with exactly these meanings. "Gold"
   never appears as a semantic color word (Orrery terminology ruling).
3. **The shared metaphor is "the failing instrument."** Text is what the
   instrument prints: terse, lowercase-comfortable telemetry, dread through
   understatement. No triumphal language on extraction; no casino language on
   loot; no jokey error copy.
4. **Public roster discipline.** Drifter and Breacher only. Internal hull
   names are rejected at join boundaries by the sim; text must match.
5. **Corruption stays bounded.** Any glyph/mark vocabulary change preserves
   `text-corruption.js`'s strip-before-reapply contract and DOM safety.
6. **No new text systems.** No localization framework, no string-table
   refactor, no lore database in v0.3. Strings stay where they live; this is
   a voice pass, not an i18n migration.

## Tasks

### Task 1 — Theme glossary (Wave 0, docs only)

Add `docs/v0.3/theme-glossary.md`: canonical spellings and meanings for
product name, route/extraction terms (aperture, residence, confirm, abort),
outcome terms (extracted, collapsed, residue, echo), color-role words, entity
family names (fauna vs sentry, scavenger, Inhibitor forms), and Chronicle/
career terms. Both the palette style guide and the timbre cue sheet cite this
glossary rather than defining terms locally.

**Acceptance:** every term the other two plans use appears once, with one
meaning; conflicts found while writing it are surfaced to the integrator, not
silently resolved.

### Task 2 — Voice guide (Wave 0, docs only)

Add `docs/v0.3/text-voice-guide.md`: the written rendering of "the failing
instrument." Sentence-length ceilings, capitalization rules (when the
instrument SHOUTS and when it mutters), warning-escalation language, what
silence means in text (empty fields, dashes, truncation as dread), and
worked before/after examples drawn from current strings.

**Acceptance:** a contributor can rewrite any string in voice without asking;
the guide agrees with `TWITTER-POST-OPPORTUNITIES.md`'s workbench-report tone.

### Task 3 — String inventory (Wave 0, docs only)

Enumerate every player-facing string in `src/main.js`, `src/hud.js`,
`src/run-results.js`, and `src/content/*.data.json` into a review table:
keep / retune / rewrite / delete, with owner and wave. Flag any string that
violates a constraint above (capability promises, internal hull mentions,
color-word misuse, product-name drift).

**Acceptance:** the sweep in Tasks 4–5 is mechanical execution of this table;
no string is rewritten ad hoc.

### Task 4 — Content naming pass (code wave, owns `src/content/`)

Apply the inventory to items, hulls/rigs, signatures, and session-profile
names/descriptions in `src/content/*.data.json`. Item names must survive at
Deck icon scale next to the palette lane's icon hierarchy (short, front-loaded
distinctions). Keep stable ids untouched — the RC gate's 65 stable icon ids
bind to ids, not display names; verify with `npm run test:ui` and the asset
tests before commit.

### Task 5 — UI string sweep (code wave, lands last)

Apply the inventory to string literals in `src/main.js`, `src/hud.js`, and
`src/run-results.js` after the timbre router and palette draw-path slices have
merged. Small, screen-scoped commits (title/profile, Home, briefing, HUD
warnings, results). No logic changes; if a string's trigger is wrong, file it
against the owning lane instead of patching around it.

### Task 6 — Corruption vocabulary review (code wave, small)

Review `DEFAULT_GLITCH_GLYPHS` and mark pools in `src/text-corruption.js`
against the voice guide (the Inhibitor should damage language in-theme).
Preserve the bounded-marks contract and existing tests exactly.

## Verification

- `npm run test:fast` and `npm run test:ui` after every content/string slice;
  `npm run test:agent-eval` for the screens the sweep touched.
- Grep gates, recorded in the PR body: no player-facing `Last Black Hole`, no
  `Resonant|Shroud|Hauler` in player-facing strings, no semantic `gold`.
- Human read-through of all eighteen agent-eval screenshots at 1280x800 for
  voice consistency — automation cannot judge tone.

## Explicit non-goals

- No gameplay, sim, protocol, renderer, audio, or coordinate changes.
- No localization/i18n framework, string-table extraction, or lore codex.
- No marketing/public copy beyond keeping `docs/public/` consistent if a
  canonical term changes.
- No renaming of repo paths, code identifiers, or content ids.
- No edits to `docs/v0.3/RC-GATE.md` (integrator only).

## Rollback notes

- Each task lands as its own commit(s); content JSON changes are reverted with
  `git revert`, never by hand-editing back.
- If a renamed item/signature breaks a test binding, restore the prior display
  name in that slice and fix the inventory table — ids must never have been
  touched in the first place.
