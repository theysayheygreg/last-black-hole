# Test Suite Value Audit

Date: 2026-06-22

This is a value pass over the current LBH automated tests. The question is not
"which tests pass today?" It is "which tests protect real contracts, and which
ones are doing work that could be caught earlier, cheaper, or more clearly?"

## Short Answer

The suite has real value. The strongest tests are the ones that protect
cross-process contracts, renderer shape, movement/math contracts, and content
generation behavior. The weakest tests are browser tests that assert static DOM
presence, hand-written data shape checks that should be schema validation, and
old flow tests that duplicate newer profile/home journeys.

The suite should not be made smaller by deleting randomly. It should be made
sharper:

- keep browser automation for things that only a browser can prove;
- move static content shape checks into schemas;
- move pure formatting and inventory/model behavior into module tests;
- keep authority-process tests because they catch integration failures no
  schema can see;
- replace broad old flow scripts with one or two intentional real-user journeys
  plus Codex browser playtest notes.

## What Is Providing Value Right Now

### High Value: Keep As First-Class Gates

`tests/smoke.cjs`

This is the right fast canary: boot page, canvas, WebGL, no JS errors, frame
step hook, perf stats. It catches "the game does not load" without pretending
to validate gameplay.

`tests/renderer.cjs`

This is valuable because Art Is Product is a pillar. It checks nonblank scene
and ASCII captures, renderer backend identity, Three scene kind, camera kind,
world layers, and pass graph. It should remain a visual lane, not part of every
tiny static edit.

`tests/remote-authority.cjs`

This is one of the most valuable suites. It touches the real sim protocol,
snapshots, inputs, inventory actions, hazards, death writeback, second-client
join, map continuity, host leave, and promotion. These are exactly the things
that fail between systems.

`tests/control-plane.cjs`, `tests/telemetry-smoke.cjs`, `tests/infra-smoke.cjs`,
`tests/sim-lifecycle.cjs`

These protect the runtime productization layer. They are slower, but they ask
questions static tests cannot answer: does the sim register, does telemetry
emit, does the embedded process path boot, and does idle shutdown behave?

`tests/player-brain.cjs`, `tests/overload-state.cjs`, `tests/coarse-field.cjs`,
`tests/wreck-drift.cjs`

These are good examples of cheap, focused model tests. They exercise math or
state transitions directly, without launching a browser unless the browser is
part of the contract.

`tests/fluid-window.cjs`

This protects a real architectural invariant: large maps must keep one fixed
fluid window and cull off-window wells. It is browser-backed because the proof
depends on the live render/test API state.

`tests/keyboard-mouse.cjs`, `tests/controller.cjs`

These are valuable because input packaging is easy to break. They should stay,
but they need a sharper assertion for remote brake intent: remote input should
carry a facing/intent vector even when thrust is zero.

`tests/items.cjs`, `tests/signatures.cjs`, `tests/balance.cjs`

The valuable parts are not "does JSON have fields?" The valuable parts are
behavioral:

- tier gates prevent early high-tier drops;
- legacy generation call shape still works;
- wreck-age value does not compound;
- signature rolling respects map-size pools and streak protection;
- balance relationships preserve the intended economy and hull identities.

Keep those. Move generic shape validation upstream.

`tests/run-results.cjs`

This is useful because it protects the RunResult view-model vocabulary: cargo
extracted/lost, signal peak, inhibitor form, AI lines, notables, and earnings.
It does not need a full browser forever, but until the view model is extracted
as a pure module, this test is doing real work.

## Medium Value: Keep, But Refactor The Question

`tests/validation.cjs`

This file is doing too much. Some checks are high-value project contracts:

- map source counts must fit shader array limits;
- UV-space and world-space constants should stay in plausible ranges;
- maps should not carry stale portal/perf override fields;
- playable map scale contracts should remain explicit;
- ASCII directional ramps and velocity uniforms should exist.

Other checks are hand-written schemas:

- ids unique;
- names present;
- numeric fields finite;
- tier arrays non-empty;
- manifest wrappers match JSON.

Those should move into JSON schema or content-schema validation. Keep
`validation.cjs` for cross-file invariants and shader/config relationships, not
for every field on every manifest.

`tests/sim-scale.cjs`

Useful because it validates live server session profiles and snapshot labels.
But it duplicates some scale-profile relationship checks already in
`validation.cjs`. Keep the endpoint/session-start coverage; move static
monotonic relationship checks to a schema/content validator.

`tests/meta-flow.cjs`

This is the better current user-flow suite. It drives profile creation, home,
launch, rig purchase, Chronicle, and result-to-home continuation. Keep one
profile/home happy path here. Move pure sanitizer and view-model assertions
upstream into module tests.

`tests/physics.cjs`

Still useful, but it is too broad and too browser-dependent for the questions
it asks. "Ship moves," "well pulls," and "orbital currents exist" should be
backed by deterministic movement/field fixtures. Keep a small browser smoke
that proves local GPU flow is readable, then add pure/current parity tests for
the real math.

`tests/perf-probe.cjs`

Good diagnostic, correctly kept outside `npm test`. It should stay a probe.
If perf becomes a release gate, promote only a narrow budget check into a
dedicated lane and keep the richer JSON output as evidence.

## Low Value Or Stale Shape

`tests/coordinates.cjs`

This started as a visual/physics coordinate mismatch detector, but the current
test mostly proves the map is spread across quadrants and that a ship at a well
does not drift more than a very large threshold. That could miss the coordinate
bugs it claims to catch.

Replace it with:

- pure `coords.js` round-trip tests for world/screen/fluid UV;
- one render fixture that asserts well visual centroid and physics position
  agree in a deterministic one-well scene.

`tests/flow.cjs`

This is mostly historical. The project now has profile/home/meta flow, and the
old title-to-mapSelect assumptions overlap with `meta-flow.cjs`. Keep only the
pieces that are not covered elsewhere: death-to-continue/relaunch and
pause-exit-title-relaunch. Move it out of `full` if it stays timing-sensitive.

`tests/systems.cjs`

This is a mixed bag. A few checks still provide value, especially ability
presentation fixtures and rig progression exposure. But many assertions are
static or weak:

- star/comet/wreck names and types are content/schema checks;
- HUD DOM ids are better covered by a UI contract or screenshot fixture;
- CSS font/min-width checks are brittle and low-signal;
- "Audio engine initializes" only checks that `CONFIG.audio` exists.

Split this file. Keep ability presentation and profile progression. Move static
content shape checks upstream. Delete the fake audio check or replace it with a
real audio-engine API smoke.

`tests/inventory.cjs`

This file carries some important regressions, especially pickup, equip/swap,
consumable use, and delta-v ratio preservation. But it also has low-signal or
duplicated checks:

- "Item generation produces valid categories" mostly checks inventory starts
  sane, not item generation;
- scavenger spawn/position checks duplicate systems/remote concerns;
- combat pulse cooldown belongs in a combat model test;
- profile starts/upgrades duplicate systems;
- "Vault stores items and tracks EM after sell" only asserts cargo exists, not
  vault storage or EM.

Refactor it into a focused inventory model/browser integration suite:

- pickup adds cargo;
- cargo limit and empty drop;
- equip/load/use/swap;
- delta-v ratio preservation.

Move everything else to content schema, combat model, profile model, or delete.

`tests/probe-*.cjs` and probe PNGs

These are useful as manual diagnostics, not as suite members. Move them under a
clearly named `tools/probes/` or document them as manual probes so they do not
look like forgotten tests.

## Things Better Caught Upstream

| Current Check Type | Better Upstream Catch |
|--------------------|-----------------------|
| Manifest id/name/tier/effect fields | JSON schema or content schema runner |
| Client/server manifest data equality | Single JSON source plus wrapper import smoke |
| DOM element ids and weak CSS assertions | UI view-model contracts plus renderer/browser screenshots |
| Profile name sanitization | Pure sanitizer unit test |
| Run-result label formatting | Pure run-result view-model test |
| Inventory equip/drop/use mechanics | Pure `InventorySystem` model tests, with one browser integration smoke |
| Combat pulse cooldown | Pure combat model test |
| Coordinate transform safety | Pure `coords.js` round-trip and edge-case tests |
| Static map bounds | Map schema validation |
| Content flavor exists | Content schema validation |
| Renderer "does it look acceptable?" | Codex app browser review with screenshots, not a boolean |
| Old title/menu timing | One maintained real-flow test plus manual/Codex browser playtest |

## Gaps The Suite Does Not Cover Well Enough

1. Field parity.

   The suite does not yet compare local GPU/coarse flow, server authoritative
   coarse flow, and renderer field semantics. This is the biggest mechanics
   gap after the Three migration.

2. Remote input packaging.

   Server brake math is tested, and browser remote brake scalar is tested, but
   the client can still send a zero movement vector when braking without
   thrust. Add a test for facing/intent vector packaging.

3. Server-side slingshot.

   The suite has diagnostic slingshot probes, but no authoritative slingshot
   contract because the server does not own the mechanic yet.

4. Semantic renderer layers.

   Renderer tests prove nonblank output and Three graph shape. They do not yet
   prove surf lanes, hazard cues, signal corruption, or entity layers.

5. Test API contract.

   Many browser tests depend on `__TEST_API`, but there is no central test that
   validates the API surface itself. This makes individual suite failures noisier
   when a helper changes.

6. Lint/static code hygiene.

   Some tests are compensating for lack of lint/schema. A small static lane
   should catch obvious orphaned imports, invalid JSON data, and dead test API
   references earlier than browser tests.

## Recommended Reshape

### Fast Lane

Keep:

- content schema validation;
- behavioral item/signature/balance unit tests;
- smoke on Three;
- cheap pure math/model tests.

Remove from fast:

- broad manifest field-by-field hand checks once schema exists.

### Core Lane

Keep:

- smoke;
- focused browser checks for local render/gameplay API;
- fluid-window;
- inventory browser integration, after pruning;
- run-result view-model/browser bridge;
- player-brain, coarse-field, overload, wreck drift.

Add:

- field parity fixtures;
- deterministic movement integrator fixtures;
- `__TEST_API` contract check.

### Browser Lane

Keep:

- one local boot/play state check;
- keyboard/mouse input packaging;
- controller packaging;
- fluid-window;
- maybe one profile/home happy path.

Do not put broad content or CSS checks here.

### Authority Lane

Keep almost all of it. This lane is expensive because it is proving expensive
things. Add remote input packaging and, later, server slingshot.

### Visual Lane

Keep renderer fixtures. Add semantic layer assertions when those layers exist.
Use Codex app browser for subjective visual quality.

### Playtest Lane

Keep a very small number of scripted journeys:

- profile/home/launch;
- pause/exit/relaunch;
- death/continue/home;
- maybe extraction/continue once stable.

Everything else should become a Codex browser checklist with screenshots and
notes, not an increasingly brittle automation script.

## First Cleanup Pass I Would Do

1. Add a content-schema runner and move the generic manifest field checks out of
   `validation.cjs`.
2. Rewrite `coordinates.cjs` into pure coordinate round-trip tests plus one
   deterministic render fixture.
3. Prune `inventory.cjs` down to inventory behavior and delta-v equip behavior.
4. Split `systems.cjs` into ability presentation/progression tests and delete
   weak DOM/CSS/audio config checks.
5. Replace most of `flow.cjs` with one death/relaunch and one pause/relaunch
   journey, letting `meta-flow.cjs` own the modern profile/home path.
6. Add remote input packaging coverage for brake-only and facing-only intent.
7. Add field parity tests before tuning movement further.
8. Change the raw `tests/run-all.cjs` default renderer to Three, or require the
   renderer argument explicitly, so ad hoc runs do not silently fall back to
   legacy.

## Bottom Line

The suite is not "too big" so much as uneven. The high-value tests are the ones
guarding real contracts between systems: renderer graph, field/window scaling,
remote authority, process lifecycle, content generation behavior, and movement
math. The low-value tests are checking static shapes through an expensive
browser or asserting implementation trivia that schemas and view-model tests
could catch earlier.

The next suite rebuild should be upstream-first: schema for data, pure tests for
models, browser tests for browser-only behavior, authority tests for process
truth, and Codex browser for feel and visual judgment.
