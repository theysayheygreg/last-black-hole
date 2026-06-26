# Design / Code Delta

This is the practical gap map between the accumulated design docs and the actual game code at the v0.2 snapshot.

## Summary

The strongest current alignment is in the pillars, movement direction, ASCII identity, server-authority boundary, content manifests, and test harness. The biggest drift is in older docs that still describe free thrust, raw WebGL/Pixi as an open renderer choice, client-only slingshot, speculative procedural generation, and future meta/progression systems as if they were already live.

## Delta By Area

| Area | Older Design Idea | Code Truth In v0.2 | Delta |
|------|-------------------|--------------------|-------|
| Product identity | Last Black Hole as the working title | User-facing runtime is Last Singularity; repo path still says `last-black-hole` | Update public/design references to Last Singularity; keep path as implementation detail |
| Tech stack | Raw WebGL or Pixi was still TBD | Vanilla JS ES modules, raw WebGL2 fluid/Composer, Three.js default renderer path, Electron packaging | Renderer choice is no longer open; Three is the forward path |
| Launch model | Browser-only play was a normal local mode | Product launch starts local authority; browser-only is `stack:sandbox` | Treat client-only as debug/sandbox only |
| Core loop | Prep/drop/scavenge/signal/extract/upgrade/repeat | Drop/scavenge/signal/extract/death/results/profile foundations exist; upgrade loop is partial | Finish upgrade purchase/write-back and make home loop feel intentional |
| Movement | Free thrust for v1, fuel later | Delta-v fuel, regen, fuel cells, reverse-thrust brake, speed cap, current coupling | Older free-thrust references are historical |
| Slingshot | Emergent gravity at first; later client-only explicit verb | Explicit anchor engagement with server-authoritative remote state | Docs should treat slingshot authority as shipped and tuning as next |
| Universe clock | Growth, portal evaporation, Hawking noise, viscosity degradation | Growth, portal expiry, signal/Inhibitor, wreck drift, events, overload timeScale exist; run-wide viscosity degradation is not the main pressure axis | Keep "universe as clock" but describe shipped pressure mechanisms exactly |
| Signal | Signal as consequence, Inhibitor threshold, fauna attraction, equipment tradeoffs | Signal zones, HUD, server signal, Inhibitor pressure, item coefficients and some signal effects exist | Signal is real; equipment/meta around signal is partial |
| Inhibitor | Three forms, corruption, control dread | Inhibitor state, form HUD, pressure, phantoms/haunts, run-end integration exist | Strong alignment; still needs playtest tuning and deeper visual/audio presence |
| Scavengers / AI players | Full adversarial AI players with personality and player-like toolkit | Server sim has rival/scavenger systems, player slots, personality/hull foundations, and remote-player rendering; full strategic AI personality depth is still partial | Keep adversarial layer, but do not overclaim human-like AI sophistication |
| Fauna / sentries | Drift jellies, signal moths, rift eels, sentries | Fauna and sentry snapshot/render paths exist; ecosystem is not yet the full catalog | Treat as partial ecology |
| Combat | Non-lethal interaction tools: force pulse, flare, tether, EMP | Force pulse and consumables shipped; signal flare/tether/EMP remain future | Avoid promising weapons; next combat work should be movement/signal interaction |
| Hull classes | Five hulls, rig tracks, abilities, no respec | Five hull manifests, PlayerBrain, ability state, several server ability behaviors, HUD presentation | Foundation is real; progression purchasing and ability polish are next |
| Inventory shape | Some docs assumed three artifact slots | Live contract is `8 cargo + 2 equipped + 2 consumable` | Three-slot design stays backlog until migrated across UI/profile/server |
| Loot economy | Time gates, wreck age value, tiered artifacts, value pressure | Shared item/balance manifests, tier gates, wreck aging, cargo sell/vault foundations | Strong alignment; needs content polish and run economy tuning |
| Procedural maps | Seeded map generator, entity catalog selection, megastructures | Static playable maps plus seeded signatures/content/echo foundations | Full procedural map generation is not shipped |
| Echoes | Chronicle wrecks, phantoms, scout drifts, Doppler echoes | Chronicle/echo wreck foundations and phantoms shipped; scout/Doppler deferred | v0.2 should focus chronicle wreck playtest before adding more echo types |
| Renderer | ASCII fluid, then raw WebGL/Composer, later Three plan | Composer/ASCII remains; Three is default scene substrate and shares the context | Move more entities/VFX/HUD toward Three, but preserve ASCII readability |
| Entity visuals | Older visual docs assumed clean vector/glyph overlays over the ASCII layer | Three currently projects many entities as primitive discs, rings, squares, and triangles | Treat those primitives as bridge markers; next pass is `docs/design/THREE-ENTITY-VISUALS.md`, `docs/design/THREE-SCENE-VISUAL-HIERARCHY.md`, and `docs/project/THREE-ENTITY-VISUAL-PASS-PLAN.md` |
| HUD/UI | NERV/EVA DOM HUD, dense warnings, degradation | DOM HUD and canvas/menu surfaces exist; design-token bridge started; some screen text remains canvas-specific | Consolidate UI primitives and reduce inline style drift |
| Audio | Drone, well harmonics, event sounds, Inhibitor takeover | Audio engine and audio toolkit exist; full score/dynamic mix remains incomplete | Audio is foundation, not final identity yet |
| Multiplayer | Stretch goal, later private remote play | Local authoritative sim/control plane, remote browser, host/join/leave/promotion all tested | Private/local multiplayer foundation exists; public hosted play does not |
| Scaling | Future multiplayer/server architecture | Session profiles, relevance gates, overload state, coarse field, caps | Strong architecture progress; still needs public-hosted ops decisions |
| Tests | Puppeteer-based harness in older docs | CDP browser driver, manifest lanes, renderer fixtures, authority gates | Older Puppeteer references are stale |

## Highest-Leverage Deltas To Close Next

1. **Playtest movement and slingshot as one system.** Numbers are first-pass; maps are not yet designed around chain routes.
2. **Make the meta-loop honest end to end.** Results, vault, run records, and profile shape exist; upgrade buying/write-back needs product polish.
3. **Give Three entities a real visual language.** Current Three scene is real,
   but many objects still read as primitive bridge markers. Use
   `docs/design/THREE-ENTITY-VISUALS.md`,
   `docs/design/THREE-SCENE-VISUAL-HIERARCHY.md`, and
   `docs/project/THREE-ENTITY-VISUAL-PASS-PLAN.md` to upgrade ships, wrecks,
   stars, comets/planetoids, portals, rivals, and ecology without moving
   gameplay truth into renderer objects. Preserve the black void, but require
   bright contrast affordances for gameplay reads. Prove matte + rim separation
   on the current primitives before replacing shapes, and decide the player
   ship surface through a Deck-scale sprite-card versus pixel-textured-mesh
   bake-off.
4. **Update public copy to match the playable game.** Do not promise public multiplayer, full procedural maps, or complete progression yet.
5. **Audit old docs before each feature.** Many older docs are still useful idea mines, but v0.2 work should start from this delta ledger.
