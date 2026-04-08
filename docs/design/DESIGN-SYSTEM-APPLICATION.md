# Applying the Design System

> DESIGN-SYSTEM.md is the vocabulary. This doc is the work order.
>
> The design system doc (written by another agent) is a canonical reference — exact color values, font stacks, panel specs, animation rules. It's excellent prior art. This doc's job is to take that reference and convert it into a concrete plan for LBH's current state: what already complies, what drifts, what's missing, and what the next UI work should inherit.

---

## Why This Doc Exists

DESIGN-SYSTEM.md answers "what are LBH's design tokens?" It does not answer "where does the existing code violate them, and what order do we fix things in?" This doc is that.

It also has a second job: the Returnal application plan and the Ghosts v1 spec (shipping alongside this) both propose new UI — results screen enhancements, scout fragments, doppler-ghost outlines, chronicle wreck glyphs. Every one of those has to cite the design system rather than invent new tokens. This doc makes that citation easy.

---

## Current State: Compliance Audit

Five surfaces are currently rendered:
1. **In-game HUD** (DOM panels in `index-a.html`)
2. **Home screen / meta tabs** (canvas-rendered in `main.js`)
3. **Map select + seed preview panel** (canvas-rendered)
4. **End-of-run screen** (canvas-rendered, dead/escaped/collapsed)
5. **Inventory panel** (DOM overlay)

### Where LBH Already Complies

**In-game HUD panels** are on-spec:
- Font stack `'JetBrains Mono', 'SF Mono', 'Fira Code', monospace` ✓
- Panel background `rgba(0, 2, 12, 0.6)` ✓
- Panel border `1px solid rgba(80, 100, 140, 0.2)` ✓
- Signal meter is 120px × 4px, teal-fill, positioned below timer ✓
- HUD at screen edges, center unoccupied ✓

**Signal meter** is textbook:
- Teal base `rgba(80, 200, 180, 0.85)`
- 9px uppercase letter-spaced label
- Thin 4px bar with zone-colored fill
- Smooth lerp on fill width (150ms), instant zone color change ✓

**Typography hierarchy** mostly holds:
- Timer 16px, panel text 13px, labels 9px uppercase ✓
- Warnings centered, glow via text-shadow rather than bold ✓

### Where LBH Drifts

Five concrete violations to fix:

**1. Inventory panel background is opaque.** `index-a.html:235` uses `rgba(0, 2, 12, 0.92)` — that's 92% opacity, effectively a veil. DESIGN-SYSTEM says `rgba(0, 2, 12, 0.6)`. Violates Don't Rule "don't put decorative overlays or veils over the fluid sim." The inventory panel is the worst offender because it's large and opens over the gameplay area — when you hit Tab, the sim disappears.

**Fix:** drop to `0.6`, increase glow and contrast on the text inside so it stays readable. If readability fails, the fix is darker text-shadow on individual cells, not a thicker background.

**2. Panel borders drift from the canonical value.** Several panels use `rgba(80, 100, 140, 0.3)`, `0.15`, and `0.12`. The spec says `0.2`. Small drift, but the cumulative effect is that the UI looks "not quite of a piece." 

**Fix:** replace all panel borders with `rgba(80, 100, 140, 0.2)` unless there's a documented reason to go darker or lighter. The signal panel's teal border tint (`rgba(80, 200, 180, 0.15)`) is a *deliberate* exception (teal accent on signal) and should be preserved — add a comment making that intentional.

**3. Home screen / meta tabs use canvas text, not DOM.** Home/vault/rig/loadout are all drawn via `ctx.fillText()` in `main.js`. This means they can't inherit the design system's font stack automatically and have to re-specify on every call. They're also fragile — spacing is pixel-perfect per line, hard to adjust.

**Fix (medium lift):** this is a bigger refactor — migrate home screens to DOM overlays. But the immediate cleanup is to centralize the canvas text calls into a helper like `drawHUDText(ctx, { text, x, y, role })` where `role` is one of `title | body | label | ability-cyan | ability-gold` etc. The helper pulls font/size/color from a single table. This is a 1-hour fix that buys us all future compliance for free.

**4. Map select seed preview panel has no canonical spec.** I wrote the preview panel fresh during the seed determinism work, and I made up the colors (`rgba(140, 175, 255, 0.7)` for labels, custom tier colors). Most of them happen to be close to the design system but not exact.

**Fix:** re-audit the preview panel against the color tokens. Use the exact hex values from DESIGN-SYSTEM.md §2. Specifically:
- Signature label should be inhibitor magenta `rgba(204, 26, 128, ...)` or accretion gold depending on whether we want "threat flavor" or "loot flavor" for signatures. I lean magenta — signatures are the universe's mood, not treasure.
- Well names should be teal `rgba(0, 128, 128, 0.7)` — neutral spatial info.
- Tier colors for sample loot should match the established tier palette (T3 gold, T4 magenta).

**5. End-of-run screen uses bespoke RGBA per case.** The death/extraction screen has its own color palette (`rgba(100, 255, 255, ...)` for escape, `rgba(255, 30, 30, ...)` for dead, `rgba(180, 80, 255, ...)` for collapsed). None of these are in DESIGN-SYSTEM.md. They're fine visually — the issue is that they're *invented*, which means the screen can't be re-themed if we shift palettes later.

**Fix:** map end-of-run colors back to the canonical tokens:
- EXTRACTED → accretion gold `#FFD966` (victory = earned value)
- CONSUMED → inhibitor magenta `#CC1A80` (killed by the universe)
- COLLAPSED → muted teal variant (time ran out = neutral dimming)

This is a semantic alignment, not a visual one. The screens can look the same afterward if we pick close shades — the point is the color tokens become consistent across the game.

### What's Missing Entirely

Three pieces of the design system have no LBH implementation yet:

**A. Hologram inspection screens** (§4 of DESIGN-SYSTEM.md implicitly, §10 explicit in RETURNAL-REFERENCE.md). The current inventory panel is a flat grid. The design system gives us permission to make inspection screens feel more instrument-panel-like, but we haven't used that permission. Low priority for v1, high priority for v2.

**B. Alien glyph rendering for affinity tags.** Our item catalog uses string affinities (`'drifter'`, `'breacher'`). DESIGN-SYSTEM.md says nothing about glyphs specifically, but the font stack + monospace-only rule gives us a way in: use single unicode glyph characters to represent hulls, render at panel text size, color-coded per hull. This is a lightweight alternative to full glyph resolution over time.

**C. Dimensional tear transition compliance.** The transition effect is specified in §8 with exact timings (0.6s ramp up, 0.25s hold, 0.6s ramp down, glitch colors, brightness formula). We have a transition system but I haven't verified it matches these numbers. Needs an audit pass.

---

## Gold Means Value, Magenta Means Threat

The single most useful rule in the design system is in §10: **"Gold means value/loot, magenta means threat, teal means neutral/signal."**

This is a semantic color contract. Any new UI we write should cite it by reference. Some places it applies immediately:

- **Chronicle wrecks** (GHOSTS-V1.md): wreck inscriptions and pilot names render in accretion gold `#FFD966` — they are value.
- **Doppler-ghosts**: the cyan outline is borderline — it's inhibitor cyan `#1ACCB3` and carries the "threat-adjacent" reading. The ghost is not hostile, but it IS a shadow of threat. Cyan is the right token.
- **Scout fragments**: teal `#008080` — neutral narrative drip. They are not loot and not danger.
- **The Inhibitor approach edge-dim**: inhibitor magenta `#CC1A80` radiating inward from the edge of the screen. Direct match.
- **Results screen**: EXTRACTED = gold, CONSUMED = magenta, COLLAPSED = teal dim. (See fix 5 above.)

This rule is doing *semantic* work, not aesthetic work. When the player learns "gold = loot, magenta = threat," they can read the screen faster. That's worth a lot.

---

## The Agent Prompt Guide Section Is Actually Useful

§10 of DESIGN-SYSTEM.md has four example component prompts. I should start using them verbatim in future PRs:

> "Build a HUD panel with JetBrains Mono 13px, background rgba(0, 2, 12, 0.6), border 1px solid rgba(80, 100, 140, 0.2), radius 2px, padding 8px 12px, text-shadow 0 0 6px currentColor"

When another agent (or a future me) writes a new HUD panel, they should be pasting that prompt. Same for results screens, warnings, signal meters. The prompt guide is a copy-paste contract — it eliminates the "I made up a color" failure mode.

**Action item:** Any new UI component in the ghosts/Returnal work cites the exact prompt from §10. If the component doesn't fit an existing prompt, we extend §10 with a new one. No inventing.

---

## Priority Queue: Work to Do

In order:

1. **Fix the inventory panel opacity** (1 hour). Drop `0.92` → `0.6`, tune text contrast. Single commit.
2. **Normalize panel borders** (30 min). Global replace of non-canonical borders, add intentional-exception comments where needed.
3. **Map end-of-run screen colors to canonical tokens** (1 hour). Gold/magenta/teal-dim, not bespoke.
4. **Re-audit seed preview panel colors** (30 min). Specifically: signature label → magenta, well names → teal, tier colors → exact.
5. **Introduce `drawHUDText()` helper** (1-2 hours). Centralize canvas text calls, map roles to tokens.
6. **Audit dimensional tear transition timings** against §8 (30 min).
7. **Add hologram inspection mode to META-LOOP backlog** (trivial — just a note). Actual implementation is a later sprint.

The first four items are small fixes that bring compliance up significantly. They should ship as a single "design system compliance pass" commit group before any of the ghosts/Returnal work goes live.

---

## What DESIGN-SYSTEM.md Unlocks

Three things get easier now that this doc exists:

1. **Multi-agent UI work has a source of truth.** Another agent writing a new screen can read DESIGN-SYSTEM.md and produce on-brand work without needing Greg to review color choices.
2. **Future design docs can reference instead of redefine.** The Ghosts v1 spec (GHOSTS-V1.md) and the Returnal application plan (RETURNAL-APPLICATION.md) both point at DESIGN-SYSTEM.md for colors rather than specifying their own.
3. **Regressions become visible.** If someone adds a panel with `rgba(0, 0, 0, 0.8)`, it's now a *violation*, not an aesthetic choice. Reviews can catch it.

The design system is one of those infrastructure docs that feels like overhead when you write it and saves weeks of drift once it exists. The work the other agent did was correct and should be the first thing any new UI PR cites.

---

## Open Questions for Greg

1. **Is the opacity fix (0.92 → 0.6 on inventory) readable?** I believe so, but this is a feel call. If it's too see-through, we can add `backdrop-filter: blur(2px)` as a middle-ground compromise.
2. **Do we want to keep the 3 bespoke end-of-run colors as flavor, or standardize?** I lean standardize. Semantic consistency > one-off flavor. But if "the extraction screen is cyan because extraction is cold/alien" was an intentional feel choice, say so and I'll leave it.
3. **Should the home screen eventually become DOM overlays instead of canvas?** Bigger question. Canvas is pixel-precise but fragile; DOM inherits design system automatically. My vote: v2 migrates home to DOM, v1 stays canvas with the `drawHUDText()` helper.
4. **Does the "alien glyph for affinity" idea need a full design pass before shipping, or is a unicode-symbol v1 fine?** Unicode would let us ship tomorrow. Custom glyph atlas is a week.

See RETURNAL-APPLICATION.md and GHOSTS-V1.md for the specific features this design system work will be cited by.
