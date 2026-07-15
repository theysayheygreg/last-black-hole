# Wave Race 64 — Water/Wave Physics Research

> Research pass 2026-07-14 (Orrery, for the v0.3.1 design review S8).
> Reference for wave/fabric design. Confidence flags: [C] source-confirmed,
> [I] inference.

## 1. Wave representation

- [C] Water is a triangular polygon mesh (a few hundred triangles) whose
  vertices are displaced by equations — not a fluid sim, not a static
  heightfield. Verified in wireframe by DF Retro and MVG.
- [C] The mesh is only generated/simulated in a bubble around the player;
  beyond that, flat textured planes. Distant buoys visibly don't bob.
- [C] Waves are authored events, not emergent: scripted wave patterns
  trigger at course sections; two generator types identified —
  (a) a base sine ripple anchored to the camera frustum (ambient swell
  always around you), (b) fixed world-position generators producing
  larger waves on set timers.
- [C] Gigaleak headers (via MVG's published analysis): per-stage `init_c`,
  `move_c` (per-stage state machine driving generation per frame),
  `waving_c` (x/z, amplitude, frequency, transparency), `waving_big`
  (position, wavelength/height extents, mesh piece count, frequency
  time), `push_c_trig` (mesh emit).
- [C] Jetskis do NOT deform the water; spray/wake is sprites (Drake Lake
  proves it).
- [C/I] Decomp (LLONSIT/Wave-Race-64, `src/game/water_69D0.c`): 384×128
  grid of s16 height/state pairs on a triangular lattice (cell 64 units,
  wrap at 24576), clamped disturbance stamping, wave-front propagation
  across point lists. Labeling is inference on unlabeled code.
- [I] Architecture for a 2D top-down adaptation: sum of authored swell
  events sampled onto a local grid — parametric wave fronts + ambient
  sine trains, evaluated near the player. Cheap, deterministic, learnable.

## 2. Forces on the rider

- [C] The displaced mesh is collision geometry; buoyancy and wave slope
  genuinely drive the craft; floating props run the same buoyancy.
- [C] Stick = pitch/roll, not steering wheel.
- [C] Landing angle is the core interaction: hull parallel to the wave
  face → momentum transferred forward (speed kept); perpendicular →
  momentum converts downward, pushing under the surface (the "dive",
  itself a technique). Continuous transfer, not binary.
- [C] Airtime is pure speed loss (exponential decay to a floor); fast play
  hugs the water and pre-flattens the nose.
- [C] B-tap tech numbers: ~122 speed bobbing free vs ~127–128 held flat;
  long dive drops to ~109–110. Vertical excursion is a speed tax.
- [C] Chop between wave trains degrades control.
- [I] With/against/across a swell falls out of the landing-angle rule; no
  explicit "wave push" force vector documented — forces come from slope +
  buoyancy + impact-angle momentum transfer.

## 3. Readability

- [C] Wave trains on fixed timers at fixed places — terrain you memorize;
  speedrunners "miss the cycle."
- [C] Ambient swell is periodic and camera-anchored: constant rhythmic
  baseline; big waves are punctuation.
- [C] Props (buoys, logs) bob on the same surface function — incoming
  swell is read off props before it reaches you.
- [C] Per-course water identity (mirror-calm Drake Lake → choppy Marine
  Fortress) as course theming; conditions change within a race (Southern
  Island tide drops per lap, opening/closing routes).

## 4. Why it's the gold standard

- [C] Built outward from an SGI wave tech demo (Miyamoto); jet skis chosen
  because they showcase maneuvers in realistic water.
- [C] One surface function drives rendering, collision, buoyancy, and AI —
  what you see is exactly what you feel.
- [I] Scripted-but-physical is the key trick: authored events on timers
  give designers rhythm/difficulty control; real momentum physics on the
  surface gives players expressive skill. Deterministic enough to learn,
  dynamic enough to never repeat.

## LBH takeaways (applied in v0.3.1 S8)

Represent swell as authored parametric wave trains (direction, wavelength,
amplitude, period, spawn rule) sampled locally; core interaction = ship
velocity angle vs wave front (parallel carried / perpendicular cost /
across drift); constant low-amplitude ambient train for rhythm; telegraph
via props riding the same surface; evolve conditions across a run
(collapse retunes the sea = tide per lap).

## Sources

- MVG, "The Waves of Wave Race 64": youtube.com/watch?v=zS146vQYflw
- DF Retro water rendering: youtube.com/watch?v=V4MMlKhJfGI
- Decomp: github.com/LLONSIT/Wave-Race-64 (`src/game/water_69D0.c`)
- WR64 speedrun tutorials: controls youtube.com/watch?v=D39a597O_Mo,
  advanced youtube.com/watch?v=7BoC6BCtQKc, dive
  youtube.com/watch?v=8Vr3-F5tBlA; speedrun.com/wr64
- Wikipedia (development, Miyamoto quotes); Nintendo Life review;
  moegamer.net/2018/02/09/n64-essentials-wave-race-64
