# Gravity Slingshot v2 — Mechanical Options and Recommendation

> The most dangerous thing in the universe should be the fastest highway.
> This doc explores how to get there.

---

## What This Doc Is

The existing SLINGSHOT.md proposes one approach: approach, catch zone, hold-to-orbit, release-to-exit, speed boost. That's a solid starting point but it's one pattern — essentially a rail grind mapped onto orbital mechanics. Before committing, we should understand the design space.

This doc lays out four distinct mechanical approaches, evaluates each against LBH's specific constraints (fluid sim, ASCII aesthetic, existing well physics, pillar priorities), and recommends one.

---

## What We Learned From Research

### The Pendulum Model (Spider-Man, Insomniac)

Insomniac built web-swinging on actual pendulum physics. The web attaches to a real point, the player swings through an arc, and **release timing determines exit trajectory**. Release at the bottom of the arc = maximum forward speed. Release early = vector shifts downward. Release late = vector shifts upward.

Key lessons for LBH:
- **The release point IS the skill expression.** The swing itself is largely automated — skill lives in when and where you let go.
- **Everything flows into the next move.** Insomniac obsessed over making swing → wall run → dive → swing feel like one continuous verb. Momentum conservation across state transitions is what makes it feel good.
- **The system lies about physics to protect feel.** Gravity doesn't pull you down at realistic rates during a swing. The arc is stretched to give the player more time to read it. "Fake the theorem, ship the feeling."

### The Slingshot Technique (Titanfall 2, Pathfinder)

Titanfall 2's grapple creates a tether to a fixed point. The slingshot technique emerged when players discovered they could **look away from the grapple point while being pulled**, converting linear pull into angular momentum. Jump at the right moment during the swing and the grapple disconnects, launching you with massive speed.

Pathfinder (Apex Legends) refined this: the grapple disconnects automatically after swinging to a 90-degree angle, preserving momentum. Cooldown scales with distance traveled — bigger slingshots cost more.

Key lessons for LBH:
- **The best slingshots feel like player discoveries, not prescribed moves.** Titanfall's slingshot wasn't designed — it emerged from physics. The skill ceiling comes from players learning to manipulate a simple system in complex ways.
- **Looking away from the anchor = angular momentum.** The player's facing direction during the tether determines whether they get pulled in linearly or swing in an arc. This is a deep, analog control.
- **Jump timing at the swing apex is the money moment.** The boost comes from releasing at peak angular velocity.

### The Tether Momentum Loop (Just Cause)

Just Cause uses grapple + parachute/wingsuit as a momentum engine. Grapple forward, open chute, gain height, wingsuit for speed, grapple again. The loop is **grapple → convert → grapple → convert**.

Key lessons for LBH:
- **Chaining matters more than individual slingshots.** The fun is in the flow state of repeated grapple-release-grapple, not in a single impressive maneuver.
- **Analog tether retraction** (Just Cause 3's trigger-controlled reel speed) gives the player fine control over momentum transfer. Gentle squeeze = slow pull. Hard yank = fast pull.
- **The grapple is a verb you use constantly**, not a special move. It's as fundamental as jumping.

### Rail Grinding (Sonic, Tony Hawk)

Rail grinding snaps you onto a path. Your control is: when to jump on, when to jump off, maybe some balance/trick input while riding. Speed is mostly inherited from your approach plus bonuses from tricks or crouching.

Key lessons for LBH:
- **Generous snap-to zones** make rails feel good. You don't need pixel-perfect alignment — being "in the neighborhood" plus pressing the right button is enough.
- **The rail is visible terrain.** You plan routes around rails. They're part of the map's navigational vocabulary.
- **Grinding is lower-skill than swinging.** That's not a knock — it means the floor is accessible and the ceiling comes from routing, not execution.

### Orbital Mechanics: Real and Faked

**Real gravity assists** work because a spacecraft enters a planet's sphere of influence, gets accelerated by the planet's gravity during approach, and then exits. The speed boost comes from the planet's own orbital velocity — you're stealing kinetic energy from a moving body. A 180-degree deflection gives maximum boost. The approach vector relative to the planet's motion determines whether you speed up or slow down.

**Outer Wilds** is the best game reference for "orbits that feel good." Key decisions:
- Gravity falls off **linearly**, not inverse-square. This prevents the "well of instant death" at close range and makes escape feel like a gradual pull rather than a sudden trap.
- Spheres of influence isolate gravitational effects — planets don't perturb each other's orbits, which would create chaos.
- The 22-minute time loop was partly a safety valve for simulation stability.
- **The autopilot exists because manual orbital mechanics are too hard for most players.** The game solved this by making it optional — skilled players can do manual approaches, but everyone can lock on.

**Gravity Rush** approached it differently: you don't orbit, you shift which direction "down" is and then fall. The "orbital" feeling comes from **choosing your gravity vector** and riding the resulting trajectory. No fall damage — they removed it because it killed the joy of falling.

Key lessons for LBH:
- **Real inverse-square gravity is too punishing for gameplay.** The existing well falloff of 1.5 is already a smart compromise.
- **The player needs to predict the arc.** Outer Wilds shows the projected trajectory on the map. LBH needs equivalent visual affordances — not a HUD overlay, but something readable in the ASCII.
- **Removing punishment for near-misses increases experimentation.** Gravity Rush removed fall damage. Our equivalent: a generous shoulder zone on wells that lets you graze without dying.

---

## The Four Approaches

### Approach A: Rail Orbit (Current SLINGSHOT.md Proposal)

**How it works:** Fly near a well → visible lane ring at fixed radius → press button to snap onto lane → hold to ride the circular arc → release to exit tangentially with speed boost.

**Entry:** Press E/X while within activation range of the lane. Ship snaps to nearest point on the ring.

**During:** Ship follows the circular lane path at increasing speed. Player cannot steer — they're on the rail.

**Exit:** Release button. Ship launches tangentially. Exit speed = entry speed + boost proportional to arc length. Cap at 180 degrees.

**Visual:** Visible ring around each well. Brightens when in range. Exit trajectory indicator rotates as you orbit. Trail color shifts during boost.

**Interaction with fluid sim:** The lane ignores the fluid. Ship is temporarily decoupled from the flow field while on the rail — it follows the geometric circle, not the fluid currents.

| Strength | Weakness |
|----------|----------|
| Very readable — the lane is always visible | Feels like a separate system bolted onto the fluid game |
| Low skill floor — press button, ride rail | Decoupling from the fluid violates Pillar 2 (Movement IS the Game — the fluid IS gameplay) |
| Predictable outcome — you know what you'll get | The snap-to breaks momentum feel. One frame you're surfing, next you're on a rail. |
| Easy to implement (geometric circle, no physics sim interaction) | Boring at high skill — the arc is always the same shape. No mastery curve past "hold longer." |
| Sonic/Tony Hawk precedent — proven fun | The exit trajectory is fully determined by the circle geometry. No analog control of where you go. |

**Skill ceiling:** Low-medium. The skill is routing (which well to slingshot, when to release for which direction). The execution is trivial — press and hold.

### Approach B: Physics Slingshot (Titanfall/Pathfinder Model)

**How it works:** Near a well, press button to create a gravitational tether at fixed radius. The well's real gravity pulls you inward, but the tether constrains you to a minimum orbit radius, converting infall acceleration into angular velocity. Your facing direction during the tether determines your swing arc. Release at any time — exit velocity is your current velocity vector.

**Entry:** Press E/X while within tether range. A tether line appears between ship and well center. The tether does NOT snap you to a fixed point — it constrains your minimum distance to the well (like a leash, not a rail).

**During:** The well's gravity still acts on you (it's the engine of the slingshot). The tether prevents you from falling closer than the tether radius. Your **approach velocity and angle** determine whether you orbit tightly or swing wide. If you had lateral velocity when you engaged, you swing. If you were heading straight in, you bounce off the tether radius and head back out. You can **thrust during the slingshot** to modify the arc.

**Exit:** Release button. Ship continues on its current velocity vector. No artificial boost — the boost IS the converted gravitational energy. Faster, closer approaches yield bigger speed gains naturally.

**Visual:** Tether line from ship to well (thin, maybe a faint dotted line in the ASCII). No visible lane needed — the well's accretion disk and kill radius ARE the visual affordance. Brighter thrust trail during high-speed arcs.

**Interaction with fluid sim:** Fully integrated. The ship still reads fluid velocity. The well's orbital currents HELP you during a slingshot (they're already rotating in the right direction). The tether is just a constraint, not a replacement for physics.

| Strength | Weakness |
|----------|----------|
| Deeply integrated with existing physics — doesn't feel bolted on | Higher skill floor — you need to understand approach angles |
| High skill ceiling — approach angle, speed, thrust during orbit all matter | Less predictable for new players |
| The fluid sim orbital currents become gameplay (they help your slingshot) | Harder to implement (constraint physics on top of fluid coupling) |
| Natural risk/reward — closer tether radius = more speed but closer to kill zone | No visible "lane" means new players might not discover slingshots exist |
| Thrust during slingshot creates rich decision-making | The arc shape varies per attempt — harder to create visual affordances |
| Chaining slingshots has a high ceiling (exit velocity of one feeds into next) | |

**Skill ceiling:** High. Approach angle, entry speed, tether timing, thrust during orbit, release timing all contribute. A perfect slingshot requires reading the fluid, choosing an approach vector, and timing the release — which maps directly to Pillar 2 (Movement Is the Game).

### Approach C: Gravity Lane Surfing (Hybrid)

**How it works:** Wells project visible "gravity lanes" — orbital current channels where the fluid velocity is highest. These aren't geometric circles — they're natural features of the fluid sim, made visible. Near a lane, press button to engage wave magnetism specifically tuned for the lane: the ship locks into the current and rides it with enhanced coupling. Release to exit with the current's velocity plus a small boost.

**Entry:** Press E/X while in a gravity lane (detected by local fluid velocity being above a threshold AND roughly tangential to the well). The ship's fluid coupling ramps up to near-1.0, locking it into the current.

**During:** The ship rides the orbital current. It follows the fluid, not a geometric path — so the "lane" moves, warps, and interacts with other wells' interference patterns. Speed gain comes from the fluid's orbital velocity, which is already higher closer to the well. The player can thrust to fight or assist the current. Holding the button maintains enhanced coupling.

**Exit:** Release button. Fluid coupling returns to normal. Ship has whatever velocity the current gave it, plus a small flat boost (the "wave catch" equivalent for orbital riding). Thrust to aim your exit — your exit trajectory isn't locked to a tangent.

**Visual:** The gravity lanes are already partially visible as the orbital flow patterns in the ASCII substrate. Enhancement: when in slingshot range, the accretion flow lines could brighten or shift to denser glyphs. The "catch" visual from MOVEMENT.md (brighter characters when magnetism is active) applies here.

**Interaction with fluid sim:** Fully native. This approach doesn't add new physics — it amplifies existing physics. The orbital currents already exist. The "slingshot" is surfing them with a magnetism boost. If two wells' orbital lanes interfere, the slingshot path warps — emergent complexity from existing systems.

| Strength | Weakness |
|----------|----------|
| Fully native to the fluid sim — no separate physics system | The "lane" isn't as readable as a geometric ring |
| Scales naturally with well size and mass | Harder to guarantee a specific speed boost |
| Interference between wells creates emergent advanced routes | The feel might be too close to "just surfing harder" — not distinctive enough as a verb |
| Complements wave surfing rather than replacing it | Without a clear visual lane, discoverability suffers |
| Low implementation cost — reuses existing magnetism affordances | The orbital currents might not be fast enough to feel like a slingshot |
| Thrust during ride means continuous decision-making | |

**Skill ceiling:** Medium-high. Reading the orbital patterns is the skill. Timing entry and exit in the current. Using thrust to maintain position in the fastest part of the flow. But it might not feel mechanically distinct from wave surfing.

### Approach D: Charge-and-Release (Mario Kart Drift Model)

**How it works:** When near a well, press and hold button. The well's gravity accelerates you during the hold (you're deliberately letting the well pull you). A charge meter builds based on gravitational acceleration received. Release the button to get a boost proportional to the charge — directed along your current velocity vector (not necessarily away from the well).

**Entry:** Press E/X within charge range of a well. No snap, no tether, no lane change. You keep flying normally. The well's pull on you still applies (and you're close, so it's strong). A charge indicator appears.

**During:** The charge builds from gravitational acceleration. The longer you stay close and the stronger the pull, the faster it charges. You're flying freely — thrust, steer, ride the currents. But the well is pulling you in the whole time. The skill is: absorb as much gravity as possible without dying. High risk, high charge.

**Exit:** Release button (or the charge hits max). A burst of speed in your current facing direction. The boost is proportional to charge accumulated. Releasing at low charge = weak boost. Releasing at max charge = massive boost. The boost overrides your current velocity for a brief window (like Mario Kart's drift boost snap).

**Visual:** Charge indicator on or near the ship — could be ship glow intensity, trail brightness, or a simple ring that fills. The well's ASCII characters could pulse in sync with your charge rate. Screen edges might vignette as charge builds (danger = close to well = charging fast).

**Interaction with fluid sim:** Fully compatible. The ship stays in the fluid the whole time. Gravity pull is already implemented. The charge mechanic is purely additive — it reads gravitational acceleration and converts it to a stored boost.

| Strength | Weakness |
|----------|----------|
| Simplest implementation — no new physics, just a meter | The verb is "fly near a well and hold a button" which isn't kinesthetically exciting |
| Works with all existing physics — no decoupling | Doesn't create the satisfying arc that "slingshot" implies |
| Clear risk/reward — charge time = danger time | Less visually dramatic than a swing or orbit |
| Accessible — new players understand "hold button, get boost" | No directional control — the boost goes where you're pointing, not where the well flung you |
| Signal interaction is natural — charging near a well is noisy and dangerous | Could feel like a checkpoint rather than a maneuver |
| Can be combined with any other approach as an additional layer | The "gravitational slingshot" fantasy isn't fulfilled — you're not swinging AROUND anything |

**Skill ceiling:** Medium. The skill is risk management (how long to stay near the well) and trajectory planning (where to point before releasing). Missing the arc-swinging fantasy.

---

## Comparison Matrix

| Criterion | A: Rail Orbit | B: Physics Slingshot | C: Lane Surfing | D: Charge-and-Release |
|-----------|:---:|:---:|:---:|:---:|
| **Fluid sim integration** | Low (decoupled) | High | Native | Compatible |
| **Pillar 2 alignment** (Movement Is the Game) | Medium | High | High | Medium |
| **Skill floor** (easy to start) | Very low | Medium | Medium | Low |
| **Skill ceiling** (mastery depth) | Low-medium | High | Medium-high | Medium |
| **Visual readability** | High (geometric ring) | Medium (tether line) | Medium-low | Low-medium |
| **Slingshot fantasy fulfillment** | High (you orbit!) | High (you swing!) | Medium (you surf faster) | Low (you charge up) |
| **Implementation complexity** | Medium | High | Low | Low |
| **Interaction with wave surfing** | Separate verb | Complementary | Extension of surfing | Separate verb |
| **Chain potential** (slingshot → slingshot) | Medium | High | Medium | Low |
| **Risk/reward clarity** | Clear (closer well = faster, but kill radius) | Clear (closer tether = faster) | Moderate (faster current zones are closer) | Clear (longer charge = more danger) |
| **Distinctiveness as a verb** | High | High | Low (feels like surfing+) | Medium |

---

## Recommendation: Approach B (Physics Slingshot) with Visual Affordances from A

The physics slingshot is the right mechanical core because it's the only approach that makes the fluid sim more relevant, not less. Rail orbiting (A) decouples you from the fluid. Lane surfing (C) isn't distinctive enough. Charge-and-release (D) doesn't deliver the slingshot fantasy.

But Approach B's biggest weakness is discoverability. New players won't know slingshots exist without a visible affordance. So steal from A: render a visual lane at tether radius that shows where the orbital current is strongest. This lane is **informational, not mechanical** — it doesn't snap you onto a rail. It says "here's where interesting things happen if you engage the tether."

### The Recommended Design: Tethered Slingshot

**What the player sees (always):**
- A faint orbital lane ring around each well at tether radius. Part of the accretion disk visual vocabulary — denser/brighter ASCII characters at that distance. Not a HUD element — a feature of the spacetime fabric.
- The lane shows the **direction of orbital flow** (which way the current spins).

**What the player does:**

1. **Approach.** Fly toward a well. You can see the orbital lane.
2. **Enter range.** When within tether activation distance, a visual cue: the lane brightens at the nearest point, or the ship's trail shifts color.
3. **Press E/X.** Tether engages. A constraint prevents the ship from going closer than tether radius to the well center. Visually: a faint line between ship and well (or a glow on the ship indicating tether active).
4. **Swing.** The well's gravity is still pulling you. The orbital currents are still flowing. The tether converts infall energy into angular velocity. Your approach angle and speed determine the arc shape. You CAN thrust during this to tighten or widen the arc.
5. **Release E/X.** Tether drops. Ship continues on current velocity vector. No artificial boost multiplier — the speed gain IS the physics. The well accelerated you; the tether kept you from falling in; the result is you're going fast on a tangential trajectory.
6. **Ride the exit.** Post-release, you're going fast. The fluid sim applies drag over time. Use the speed to reach the next well, wreck, or portal.

**Risk profile:**
- Tether radius must be > kill radius (obviously). The gap between them is the margin of error.
- Bigger wells have bigger kill radii, but also stronger gravity = faster slingshots. The most dangerous wells are the fastest highways. (Preserved from v1.)
- If you cancel the tether while heading inward (bad timing), you're in the well's pull with no safety net. The tether WAS your safety net.
- Thrusting inward during a tether tightens the orbit radius... toward the kill zone. High risk, high speed.

**Stars:**
- Stars push outward, so you can't slingshot them the same way.
- Instead: a star "slingshot" is a deflection. Tether to a star, the outward push + tether creates a trajectory bend. Smaller speed gain, but useful for course correction. Like a billiard bank shot.

### CONFIG values (starting points)

```javascript
slingshot: {
  // Tether engagement
  activationRange: 0.12,         // world-units: how close to tether radius to allow engagement
  tetherRadiusMult: 2.5,         // tether radius = well.killRadius * this
  tetherRadiusMin: 0.08,         // world-units: minimum tether radius regardless of well size

  // Tether physics
  tetherStiffness: 12.0,         // spring constant for tether constraint (higher = harder boundary)
  tetherDamping: 0.3,            // damping on the constraint to prevent oscillation
  gravityBoostDuringTether: 1.0, // multiplier on well gravity while tethered (1.0 = unchanged, >1 = amplified)

  // Exit behavior
  exitBoostFlat: 0.05,           // world-units/s added to exit speed (small reward for engaging)
  exitBoostMassMult: 0.1,        // additional exit boost per unit well mass
  maxExitSpeed: 3.0,             // world-units/s cap to prevent absurd speeds
  boostDecayRate: 0.92,          // per-frame multiplier on speed above normal max (gradual return to terminal)

  // Star slingshot (deflection mode)
  starTetherRadiusMult: 1.8,     // stars have tighter tether range (less dangerous)
  starDeflectionBoost: 0.03,     // smaller flat boost for star deflections

  // Visual
  laneVisualIntensity: 0.6,      // brightness multiplier for orbital lane ring
  tetherLineOpacity: 0.4,        // visual tether line during engagement
  exitIndicator: true,           // show exit trajectory arrow during tether
}
```

### Why This Over the Rail Orbit

The rail orbit (current SLINGSHOT.md) would work. It's proven fun in Sonic and Tony Hawk. But LBH isn't a rail game — it's a fluid game. The core fantasy is **surfing spacetime**, not **grinding rails in space**.

The physics slingshot:
- Makes the existing orbital currents gameplay-relevant (Approach A ignores them)
- Creates a high skill ceiling from a simple mechanic (Titanfall's slingshot was emergent from basic tether physics)
- Rewards players who read the fluid (approach angle matters, current direction matters)
- Chains naturally (exit velocity of one slingshot feeds into the next approach)
- Doesn't need a separate physics system — it's a constraint on top of existing gravity

The risk: it's harder to learn. The rail orbit is immediately obvious. The physics slingshot requires understanding approach angles. The mitigation: the visual lane ring teaches players where to engage, and the tether itself provides a safety floor (you won't die as long as you keep the tether active).

### Implementation Approach

**Phase 1 (prototype, ~2-3 hours):**
1. Tether constraint: when button held and in range, apply a radial spring force that prevents ship from going closer than `tetherRadius` to well center. `if (dist < tetherRadius) force = tetherStiffness * (tetherRadius - dist)` pointing outward.
2. Visual: render tether line on overlay canvas. Render exit trajectory arrow (velocity vector extended forward).
3. Audio: rising pitch tone proportional to angular velocity during tether. Snap sound on release.

**Phase 2 (feel tuning):**
4. Tune tetherRadiusMult against kill radius. The gap needs to feel safe but thrilling.
5. Tune stiffness. Too soft = you drift into the kill zone. Too hard = you bounce off unnaturally.
6. Add the visual lane ring at tether radius distance.
7. Playtest: can Greg chain two wells? Does the exit speed feel earned?

**Phase 3 (polish):**
8. Ship trail brightens during high-speed tethered arcs.
9. Accretion disk visual intensifies at the orbital lane distance.
10. Scavenger AI: vulture-type scavengers use slingshots (creates "they can do THAT?" moments).
11. Signal interaction: slingshot is loud (close to well = high thrust signal). Skill reduces noise (shorter arcs = less time near well).

---

## Interaction with Existing Systems

| System | Interaction |
|--------|------------|
| **Fluid sim** | Ship stays coupled to fluid during tether. Orbital currents assist the swing. Tether is additive constraint, not replacement. |
| **Wells (gravity)** | Well gravity is the ENGINE of the slingshot. Tether prevents it from killing you. Stronger wells = faster slingshots. |
| **Stars** | Deflection mode. Outward push + tether = trajectory bend. Smaller boost, good for course correction. |
| **Wave rings** | A wave ring passing during a slingshot could give a massive speed kick (wave push + orbital velocity + tether constraint = turbo). Advanced combo. |
| **Force pulse** | Firing pulse during tether = emergency abort. Breaks tether AND pushes you outward. Costs cooldown but saves your life. |
| **Signal** | Slingshot is inherently noisy — you're close to a well, probably thrusting. Short, fast slingshots are quieter than long orbits. Skill expression through brevity. |
| **Scavengers** | AI can use slingshots. Vulture archetype especially — they lurk near wells and use slingshots to chase. |
| **Viscosity (late game)** | As fluid thickens, slingshots become MORE valuable — they're the only way to maintain high speed. Creates a "highways of the dying universe" dynamic. |

---

## Open Questions (Need Greg's Call)

1. **Should the tether prevent inward drift absolutely, or just resist it?** Hard constraint (you literally cannot go past tether radius) is safer but less physical. Spring constraint (strong outward force at tether radius, but you CAN push through with thrust) is riskier and more expressive. Recommend: hard constraint for v1, soften later if it feels too safe.

2. **Can you shorten the tether during a slingshot?** Holding thrust toward the well could reel in the tether (like Just Cause's analog retraction), decreasing orbit radius and increasing angular velocity. Very high skill, very high risk. Recommend: yes, but post-prototype. Get the base slingshot feeling good first.

3. **Slingshot + tether (grapple) combo?** The future tether verb (grapple to a planetoid) could chain with slingshot — tether to planetoid, release, immediately slingshot the nearby well. Recommend: design for this but don't implement until both verbs exist independently.

4. **How does the slingshot feel when the fluid sim orbital currents are weak?** If the well's orbital strength is low (CONFIG.wells.orbitalStrength), the slingshot might feel underpowered because there's less angular momentum from the fluid. Recommend: the tether constraint itself generates the arc from gravity alone — fluid currents are bonus, not required.

5. **Maximum orbit time?** Should there be a cap on how long you can stay tethered? The rail orbit caps boost at 180 degrees. The physics slingshot doesn't have a natural cap — you could orbit indefinitely. Recommend: no hard cap on time, but speed gain diminishes after the first full orbit (angular velocity approaches terminal for that radius). The well's kill radius is the natural governor — you can orbit forever, but you're not gaining more speed after the first 360 degrees.

---

## Rejected Alternatives

**Auto-orbit on proximity (no button press):** Violates the "explicit player action" principle. Accidentally getting captured by a well's orbit would be infuriating. Every reference game (Spider-Man, Titanfall, Sonic) requires a deliberate input. The well should pull you, but the slingshot should be your choice.

**Pure realistic orbital mechanics (KSP-style):** Too hard. KSP requires calculating burn vectors. LBH needs "fly near, press button, swing, release." The tether abstracts away the hardest part (not falling in) while preserving the satisfying part (the arc and the speed).

**Slingshot as a pickup/consumable:** Breaks the movement-as-core-verb pillar. The slingshot should be available whenever there's a well. No consumable gate.

**Automatic exit trajectory (always tangential):** Removes skill expression. The player should control their exit by choosing when and where to release, not have the game pick the optimal exit.

---

## References

Research sources consulted:
- [Spider-Man Swinging is Physics and Momentum Based (Game Rant)](https://gamerant.com/spider-man-game-web-swing/)
- [How Insomniac Perfected Web-Swinging (PlayStation LifeStyle)](https://www.playstationlifestyle.net/2018/09/05/marvels-spiderman-ps4-web-swinging-perfection-broken-down-by-insomniac-team/)
- [Making Insomniac's Spider-Man Do What a Spider Can (Game Developer)](https://www.gamedeveloper.com/design/making-insomniac-s-i-spider-man-i-do-what-a-spider-can)
- [Pendulum Web-Swinging in Spider-Man (Critical Hit)](https://www.criticalhit.net/gaming/youre-pendulum-youre-web-swinging-insomniacs-spider-man/)
- [Slingshot — Titanfall Wiki](https://titanfall.fandom.com/wiki/Slingshot)
- [Grapple — Titanfall Wiki](https://titanfall.fandom.com/wiki/Grapple)
- [Pathfinder Grapple Guide (The Gamer)](https://www.thegamer.com/apex-legends-pathfinder-grapple-guide/)
- [Pathfinder — Apex Legends Wiki](https://apexlegends.fandom.com/wiki/Pathfinder)
- [Just Cause 4's Moddable Grappling Hook (PC Gamer)](https://www.pcgamer.com/just-cause-4s-new-moddable-grappling-hook-makes-it-the-smartest-just-cause-yet/)
- [Grinding — Sonic Wiki](https://sonic.fandom.com/wiki/Grinding)
- [Gravity Assist — Wikipedia](https://en.wikipedia.org/wiki/Gravity_assist)
- [NASA Gravity Assist Primer](https://science.nasa.gov/learn/basics-of-space-flight/primer/)
- [Orbital Mechanics of Gravitational Slingshots (academic paper)](https://symbolaris.com/course/fcps16/projects/amoran.pdf)
- [An Astrophysicist Measures the Physics of Outer Wilds](https://www.thephysicsmill.com/2024/09/20/an-astrophysicist-attempts-to-measure-the-physics-of-outer-wilds/)
- [Push and Pull: Physics in Outer Wilds (Giant Bomb)](https://www.giantbomb.com/profile/gamer_152/blog/push-and-pull-physics-in-outer-wilds/264418/)
- [Gravity Rush — Wikipedia](https://en.wikipedia.org/wiki/Gravity_Rush)
- [Discovering Gravitation in Gravity Rush (Super Jump Magazine)](https://www.superjumpmagazine.com/discovering-gravitation-in-gravity-rush/)
