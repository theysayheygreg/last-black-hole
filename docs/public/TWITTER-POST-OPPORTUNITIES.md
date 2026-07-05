# Last Singularity Twitter Post Opportunities

Status: draft public-presence plan, reviewed with a Troubadorb-style copy pass
on 2026-06-27. Updated on 2026-07-04 with the current public update pack.

Guidance: post like you are reporting from the workbench, not announcing a product. Pair each post with a screenshot, GIF, short clip, or annotated still whenever possible.

## 2026-07-04 Public Update Pack

Use this when the recent devlog/task notes feel too internal. The story is not
"we added an adapter." The story is: Last Singularity is becoming more readable,
more playable, and more honest about what is real in the world.

### Discord Update

```text
Small Last Singularity update from the workbench:

The last few days have been less about adding "one more feature" and more about making the whole game easier to read.

The game is still built around black space and an ASCII spacetime ocean. That part is staying sacred. What is changing is everything riding on top of it: ships, wrecks, stars, portals, rivals, loot, and UI all need to punch through the visual noise without losing the vibe.

So the current pass has been about contrast, silhouettes, better title/menu screens, clearer button prompts, and Steam Deck readability. The Deck has been a really good forcing function: if a HUD line or prompt is too tiny there, it is probably too fragile everywhere.

Under the hood, I am also moving the sim toward one stricter source of truth for what exists in the run. In player terms: if a wreck can be looted, a portal can get you out, or a well can kill you, those facts should come from the same world model instead of a pile of older one-off checks.

Not a release announcement yet. Next big test is still the human one: does it feel good to fly, can I read a route, and does the universe feel like it is closing around me for reasons I understand?

But the game is starting to feel less like a jam prototype and more like something I can actually start showing.
```

### Short Discord Version

```text
Last Singularity workbench note:

This pass is about readability. The ASCII spacetime ocean stays the heart of the game, but ships, wrecks, portals, UI, and prompts all need to punch through the noise clearly enough for Steam Deck, couch play, and short clips.

Under the hood, the sim is also getting stricter about world truth: loot, extraction, slingshot input, and hazards are being pulled toward one authority path.

Still not a release announcement. The next question is the important one: does it feel good to fly?
```

### Twitter/X Singles

Each of these is meant to stand alone with a screenshot or short clip.

1. Last Singularity update: the current pass is about readability. The ASCII spacetime ocean stays the heart of the game, but ships, wrecks, portals, prompts, and UI all need to punch through the noise clearly enough to play from a couch or on Steam Deck.

2. The Steam Deck has become a useful design judge for Last Singularity. If the HUD is too tiny there, it is probably too fragile everywhere. Big text, clear prompts, strong contrast, fewer cute-but-illegible details.

3. The rule I keep coming back to: space is black, the void is scary, but the game still has to be readable. Dark atmosphere is not an excuse for squinting.

4. Last Singularity is not about flying through empty space. It is about reading a hostile ocean of spacetime: burn fuel, catch current, sling around anchors, steal from wrecks, and leave before the universe closes.

5. Recent dev work has been very unglamorous in the best way: making sure loot, portals, slingshots, and hazards all agree about what is actually happening in the run. Weird space game, stricter world truth.

6. The title screen is turning into an attract-mode loop: clean UI, a larger moving well, objects drifting through the scene, and little moments where the Inhibitor corrupts the surface instead of just "glitch text everywhere."

7. I want every object in Last Singularity to read before you need a label: player, threat, wreck, route anchor, anomaly, ecology. The ASCII fabric is noisy on purpose. The silhouettes have to be louder.

8. The next real test is not "did the build pass." It did. The question is: can I intentionally move, read a route, grab salvage, and understand why I escaped or died?

### Mini-Thread: What Changed This Week

```text
1/ Last Singularity update:

This week was about making the game easier to read.

Not simpler. Not brighter everywhere. More readable.

The core is still black space + ASCII spacetime fluid. The work is making ships, wrecks, portals, UI, and danger survive inside that noise.
```

```text
2/ The Steam Deck has been a useful judge.

If text is too small on Deck, it is probably too small. If a prompt only works on a keyboard, it is not good enough. If the HUD overlaps at 1280x800, the layout needs to be calmer.
```

```text
3/ The visual target is stronger silhouettes.

I want you to know at a glance: that is me, that is a rival, that is salvage, that is a route anchor, that is something wrong.

Labels can help. They cannot carry the game.
```

```text
4/ Under the hood, the sim is getting stricter.

Looting a wreck, escaping through a portal, and slingshot input should all flow through the authoritative run state. The player-facing result is fewer weird "why did that happen?" moments.
```

```text
5/ Not a release announcement yet.

The next test is the human one: does it feel good to fly, can I read a route, and does the universe feel like it is closing around me for reasons I understand?
```

### Mini-Thread: Movement Hook

```text
1/ In Last Singularity, movement is the game.

Thrust costs delta-v. Braking costs delta-v. The free motion comes from reading the spacetime fabric and letting the universe carry you.
```

```text
2/ The fantasy is not "hold forward through space."

It is: burn once, catch a current, sling around a star, drift into a wreck, decide if you have enough fuel and nerve to get home.
```

```text
3/ That means the map has to become readable route space.

Wells are threats, but also terrain. Stars and planetoids are anchors. Wrecks are temptation. Portals are exits that may not wait.
```

```text
4/ Current work is making the game better at showing those decisions clearly: bigger UI, stronger object silhouettes, better prompts, and stricter sim truth underneath.
```

### Plain-Language Translation Bank

Use this to turn internal notes into public copy.

| Internal note | Public wording |
|---------------|----------------|
| Ballpark-backed consequence adapter | The game is getting one stricter world model for loot, exits, and hazards. |
| Sim/client renderer split | The sim decides what happened; the renderer makes it readable. |
| Structural harness | Tests that catch broken world rules before I trust a playtest. |
| Queued slingshot edges | Quick slingshot taps should not vanish between sim updates. |
| Render-plan diagnostics | The renderer now reports what visual layers are actually running. |
| Event journal | The run keeps a clearer record of important moments. |
| Steam Deck compatibility pass | The UI has to survive real handheld play, not just my dev monitor. |
| Entity visual hierarchy | Every object needs a role, silhouette, and contrast plan. |

### What Not To Say Yet

- Do not call v0.3 release-ready.
- Do not promise public multiplayer.
- Do not say Steam Deck verified until Gaming Mode and controller play pass in hand.
- Do not sell final balance or final progression.
- Do not over-explain the architecture in the first post. Lead with the game surface.

## Cadence

- Wednesday dev note: one concrete system, tuning lesson, tech milestone, or design question.
- Screenshot Saturday: one visual-first post with a casual observation.
- Monthly review: keep what earns replies, saves, or useful questions; drop dead tags and weak formats.

## Hashtag Shape

Use 3-4 tags, not a pile.

- Core: `#gamedev`, `#indiedev`, `#indiegame`
- Recurring visual lane: `#ScreenshotSaturday`
- Specific swaps: `#roguelike`, `#spacegame`, `#SteamDeck`, `#WishlistWednesday`

## Something Weird And Spooky

1. Last Singularity is about flying through a universe that has already lost. The map does not count down; it rots around you. Wells grow. Portals wink out. The good exit becomes a bad idea.

2. The Inhibitor is not a fair boss. It is the moment the collapsing universe notices you. Not harder combat, exactly. More like the run suddenly changing key.

3. Signal is consequence, not mana. Every loud choice makes you easier to find. The universe teaches stealth by making subtlety feel like a survival instinct.

4. Wrecks are not loot boxes. They are dead civilizations caught in hostile current. I want them to read as evidence, terrain, and temptation all at once.

5. The game has a lot of things that are not quite enemies yet: phantoms, haunts, sentries, scavengers, fauna. The trick is fewer, sharper behaviors so the universe feels watched, not crowded.

6. Deep Field is the dread map: bigger, darker, less forgiving. It is where the systems stop being cute and ask if you can actually read the flow.

7. Portals do not wait for you. They arrive in waves, expire, and turn extraction into a spatial problem instead of a menu option.

8. The world tells time by getting worse. No giant countdown. Just thicker flow, growing wells, vanishing exits, and a ship running out of easy answers.

9. Echo wrecks are the progression idea I keep circling: a run leaves a scar, and sometimes that scar comes back as salvage, warning, or ghost story.

## Something Gameplay Specific

10. Movement is the game. Thrust costs delta-v, braking is reverse thrust, and currents are free if you can read them. Fighting the ocean works until you need fuel to get home.

11. Slingshotting is becoming a real verb: catch an anchor, build energy, release on a line, chain it if you are brave. The map starts turning into route puzzle space.

12. I want players to finish a run and know why one route was better than another. That is the target for the next movement pass.

13. Five hulls, five bad ideas: Drifter reads currents, Breacher burns loud, Resonant bends eddies, Shroud stays quiet, Hauler turns greed into mass.

14. The loop is simple: loadout, drop, read the flow, loot wrecks, manage signal, extract or die, then decide what changes for the next run.

15. Wrecks should shape routes, not just rewards. A good cluster can be cover, bait, detour, or the reason you die with a full hold.

16. Extraction pressure should live in the world. Portal over there. Bad current between you. Signal too high. Clean line home suddenly not clean.

17. The Shallows is onboarding and tuning. Expanse is route planning. Deep Field is scale and dread. Same game, different kinds of stress.

18. The design target: constant thrust works, but it is wasteful. The fun starts when coasting, catching current, and choosing the right burn all matter.

## Something Neat And Technical

19. The renderer is Three.js over an ASCII fluid fabric. The goal is not generic 3D space. It is making the weird easier to read and harder to look away from.

20. Three and the ASCII/Composer chain now share one WebGL2 context. The old per-frame canvas upload path is gone. Tiny victory, huge renderer sanity.

21. The sim owns run truth. The client owns input, rendering, HUD, audio, interpolation, and reconstruction. Gameplay truth does not live in the pretty meshes.

22. Last Singularity has a self-contained Steam Deck path now: Electron launches the renderer plus local control/sim processes over loopback. Not glamorous. Extremely satisfying.

23. The entity art pass is about readability: ship, threat, wreck, anchor, ecology, anomaly. If a Deck screenshot needs labels to explain the frame, the art failed.

24. Tiny objects have to survive inside a noisy ASCII ocean, so the visual stack uses contact mattes, rim shells, halos, trails, and state sparks.

25. The test harness is bigger than unit tests: renderer fixtures, authority tests, visual captures, browser-driver probes. Weird games need evidence, not vibes.

26. The architecture splits durable control-plane state from disposable run sim instances. Dry sentence, useful result: clean solo play, Deck builds, and a sane path toward multiplayer.

27. One design/tech rule I like: wells and the Inhibitor stay fabric-first. Ships, wrecks, portals, stars, and rivals become semantic Three objects. The ocean remains sovereign.

## Asset Pairing Notes

- Weird/spooky posts want moody clips: signal spikes, portal expiration, Inhibitor corruption, wreck fields, Deep Field, audio/reactive moments.
- Gameplay posts want readable before/after or route clips: thrust vs coast, slingshot chains, bad extraction line, full hold risk, hull comparison.
- Technical posts want proof screenshots: Deck-scale readability, renderer fixture outputs, Three layers, build/authority diagrams, side-by-side visual pass improvements.

## First Four To Ship

1. Screenshot Saturday: post #10 or #11 with a movement/slingshot clip.
2. Midweek dev note: post #20 with a renderer-side screenshot or short GIF.
3. Screenshot Saturday: post #4 with a wreck field image.
4. Midweek design note: post #2 or #8 with a strong Inhibitor/world-decay capture.
