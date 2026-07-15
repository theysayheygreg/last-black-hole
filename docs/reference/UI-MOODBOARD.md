# LBH UI Moodboard

> **v0.2 status:** Reference board for the next UI pass. This is a design
> translation doc, not a license to copy another game's panels, logos, or
> typography.

## Purpose

Last Singularity's world language moved forward with the Three scene hierarchy:
black void, ASCII fabric, semantic lanes, punchy entities, and crisp HUD. The
UI now needs the same discipline. It should feel like a mission-critical
instrument panel built around the player's dying-universe read, not a generic
space dashboard.

## Reference Set

| Reference | What To Study | What LBH Should Borrow | What LBH Should Avoid |
|-----------|---------------|------------------------|-----------------------|
| Evangelion / NERV computer UI | ritualized emergency screens, bracketed geometry, operational density, red/orange warning language, peripheral telemetry | command-screen seriousness, corner brackets, warning choreography, asymmetric panels, the sense that every label is part of a machine under stress | exact NERV logos, exact layouts, unreadable microtext as primary information, all-red panic screens for normal play |
| Bungie's Marathon reboot | bold extraction-game graphic confidence, saturated accent color, sparse high-value UI over dangerous space, strong menu attitude | brighter accents, large primary actions, graphic category colors, sharper selection and warning states | making the UI feel like a conventional shooter, full-screen neon walls, burying LBH's ASCII fabric under opaque panels |
| Returnal | minimal in-run HUD, helmet/scanline mood, results/death tone, UI that feels tied to a repeating loop | quiet in-match edge HUD, mournful results screens, diegetic scanline treatment | realistic sci-fi visor clutter, smooth alien UI that erases LBH's terminal/pixel identity |
| LBH Three hierarchy board | current layer stack, pixel-resolved entities, contact mattes, bright silhouettes over black | shared role palette and contrast rules between UI, entity, and post stack | treating the UI as a separate product skin instead of part of the same scene language |

Sources and reference links:

- Evangelion UI archive: <https://astromono.com/portfolio/ui/neon-genesis-evangelion>
- Marathon official site: <https://marathonthegame.com/>
- Marathon press kit: <https://press.bungie.com/Marathon>
- Returnal reference doc: `docs/reference/RETURNAL-REFERENCE.md`
- Three visual hierarchy: `docs/design/THREE-SCENE-VISUAL-HIERARCHY.md`

## Moodboard Translation

The target is **ritualized operations over cosmic dread**.

Evangelion gives us the seriousness: UI is not decoration, it is procedure.
Screens should feel as though they are routing power, pressure, signal, and
collapse through an old machine. Warning states should have ceremony: a hard
red panel, a clear reason, a single next action.

Marathon gives us permission to be louder. LBH has been correctly dark, but
some colors have been too dim for the black field. Selection, launch, salvage,
danger, and anomaly states should be saturated enough to read instantly, then
constrained to role-bound areas so the screen does not become neon soup.

Returnal keeps the in-run HUD honest. During play, the center belongs to motion
and fabric. Between runs, the UI can become denser and more theatrical because
the player is no longer steering around a well.

## What Carries Forward

- **Dark scene, bright decisions.** The void can dominate; action choices,
  warnings, resource states, and selected items cannot be dim.
- **Instrument panels, not cards.** Panels use thin borders, corner brackets,
  internal ticks, and deep translucent backing. They should feel bolted to a
  cockpit display, not like app cards.
- **One role palette across world and UI.** Cyan means player/flow/tech. Amber
  means salvage/value. Red means immediate danger/collapse. Magenta/violet
  means Inhibitor/anomaly. Bone white means peak energy or primary text.
- **Microtext is texture only.** Tiny labels and calibration marks can sell the
  machine, but the real decision text has to pass Deck, desk, and couch reads.
- **CRT is the display shell.** Most bloom, lens, and world post sit below UI.
  CRT/scanline treatment may sit over everything if it remains legible.

## Concept Target Images

Generated concept targets live in:

`docs/reference/target-visuals/2026-06-28-ui/`

Use them as composition and contrast studies, not as exact screen specs. The
image model invented some labels, currencies, and IDs that are not game canon.
Implementation should preserve the mood, hierarchy, and readability while using
the real LBH terms and mechanics.

## Map Select Survey-Terminal Target

The accepted Map Select direction is a survey terminal with a strict scan path:

1. The left register establishes the three playable scales, then generic locked
   sectors.
2. The center reconstruction is the hero: broad, uncertain topology with
   incomplete scan tiles and no exact entity placement.
3. The right rail interprets the selected survey through possible contents,
   broad risk, and incomplete confidence.

Use language such as `POSSIBLE CONTACTS`, ranges, and `SURVEY CONFIDENCE`.
Avoid guaranteed-object language and never turn the center into a route map:
player spawn, exact wells, portals, wrecks, object layout, path sequence, and
signal pressure are not player-facing Map Select information. Valid and locked
states share the terminal frame language, while locked content becomes
withheld/redacted and removes the launch action. Reduced motion keeps that state
as a static corruption treatment.

The active-device affordance is part of the visual target. A valid launch uses
the shared graphical controller glyph contract at Deck scale; a locked row has
no action prompt. Deck/controller captures must not fall back to raw keyboard
text or duplicate the command label.
