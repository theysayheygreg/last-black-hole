# v0.3 Player-Facing Text Inventory

> Mechanical execution table for the Troubadorb sweep. “Keep” means wording is already truthful and in voice; it is still covered by the glossary and voice guide. Owner is Troubadorb unless noted otherwise.

## `src/content/*.data.json`

| Surface / strings | Decision | Wave | Notes |
|---|---|---|---|
| `items.data.json` 67 catalog names | Keep | content | Stable ids and icon bindings remain untouched. Existing names are short and front-loaded at Deck icon scale. |
| `items.data.json` internal-affinity item names | Keep internal | content | Content can retain internal definitions; no UI sweep may expose their hull affinity. |
| `hulls.data.json` Drifter / Breacher names | Keep | content | Public roster only. |
| `hulls.data.json` public rig names and focus labels | Retune | content | Use terse route/salvage language; do not change rig ids or mechanics. |
| `hulls.data.json` Resonant / Shroud / Hauler names and rigs | Keep internal | content | Required for fixtures/AI only; do not expose through UI. |
| `signatures.data.json` names, flavor, mechanical lines | Retune | content | Make pressure factual, avoid loot/casino language, preserve actual modifiers. |
| `session-profiles.data.json` ids and performance fields | Keep | content | Technical configuration; no player-facing prose. |
| `balance.data.json` labels/values | Keep | content | Economy authority is outside this lane. |

## `src/main.js`

| Surface / representative string set | Decision | Wave | Notes |
|---|---|---|---|
| Title: `LAST SINGULARITY` | Keep | UI | Product name is correct. |
| Title taglines: `out of a dying universe`; `surf the currents. escape the void.` | Retune | UI | Replace generic copy with factual route language. |
| Profile flow: `SELECT PILOT`, empty/new/delete/confirm prompts | Keep | UI | Functional instrument language; no lore needed. |
| Home: `DROP WINDOW READY`, `choose a route, spend the fuel, steal from the dark`, no-profile and ledger labels | Retune | UI | Remove triumphal/theft framing while retaining route and resource truth. |
| Loadout/vault/rig/Chronicle labels and empty states | Keep | UI | Operational, truthful, roster filtered upstream. |
| Map briefing: seed, signature, wells, salvage, route/order, launch/reroll | Keep | UI | Seeded authority facts; signature content receives the content pass. |
| Loading: `dropping in` | Retune | UI | Use a calmer instrument report. |
| Playing: cargo-full warning and extraction interaction label | Retune | UI | Preserve trigger and input; make action explicit. |
| Pause: `PAUSED`, return/exit labels | Keep | UI | Standard controls, no pressure language needed. |
| Developer/version/error strings | Keep internal | UI | Do not polish transport errors into public claims. |

## `src/hud.js`

| Surface / string set | Decision | Wave | Notes |
|---|---|---|---|
| Route objective: aperture/route open/closed/final inbound | Keep | UI | Matches authoritative residence-plus-confirm extraction. |
| Collapse/wave/growth event labels | Retune | UI | Prefer aperture terminology over wormhole and use concise telemetry. |
| Interaction defaults and ability details | Keep | UI | Mechanics-owned wording; no trigger changes. Internal hull branches stay unreachable through public roster enforcement. |
| Inventory labels, signal/hull/fuel panels, warnings | Keep | UI | Functional existing terms; only mechanical string changes if a listed warning is retuned. |
| Inhibitor forms and corruption | Keep | corruption | Form names are canonical; bounded text damage remains mandatory. |

## `src/run-results.js`

| Surface / string set | Decision | Wave | Notes |
|---|---|---|---|
| `EXTRACTED`, `COLLAPSED`, death causes | Keep | UI | Accurate authoritative outcomes. |
| `-- cycle ended --` | Retune | UI | Lowercase telemetry and no decorative framing. |
| Success/failure supporting copy | Retune | UI | Remove anthropomorphic universe language and celebratory extraction. |
| Run summary, ledger, cargo, notable, empty telemetry | Keep | UI | Existing labels accurately describe result payload. |
| Continue actions | Retune | UI | “review manifest” / “return home” describes the next real state. |

## `src/text-corruption.js`

| Surface | Decision | Wave | Notes |
|---|---|---|---|
| Combining mark pools, strip-before-reapply, caps | Keep | corruption | Safety contract; no change. |
| `DEFAULT_GLITCH_GLYPHS` | Retune | corruption | Favor damaged instrument notation over decorative math noise; preserve deterministic bounded replacements and tests. |

## Gates

- No player-facing `Last Black Hole`.
- No player-facing `Resonant`, `Shroud`, or `Hauler`.
- No semantic player-facing `gold`; use `amber` for value/salvage.
- UI edits are text-only: no sim, authority, renderer, audio, coordinate, or timing changes.
