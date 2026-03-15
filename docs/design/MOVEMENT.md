# Movement Design: Surfing, Controls, and the Fabric

> Movement is the game. This doc defines what surfing spacetime actually feels like,
> how controls afford skill expression, and how the fabric substrate creates the terrain.

---

## The Surfing Metaphor (Expanded)

The game uses water surfing as its primary physical metaphor, but the medium is spacetime — a fluid with properties water doesn't have. Understanding both the parallel and the divergence is key to making movement feel right.

### What Maps from Real Surfing

| Surfing Concept | LBH Equivalent | Why It Matters |
|-----------------|----------------|----------------|
| **Catching a wave** | Aligning with an outbound gravity pulse | The core skill moment — read the flow, position yourself, accelerate for free |
| **Riding the face** | Traversing along a wave crest perpendicular to flow direction | Sustained speed without thrust. The reward for good positioning. |
| **Getting caught inside** | Trapped between the well and an incoming wave | Punishment for bad positioning. The current pushes you toward the well. |
| **Duck diving** | Thrusting through a wave rather than riding it | Costs signal (thrust = noise) but maintains your line |
| **The lineup** | Positioning upstream of a gravity well at the right distance | Where experienced players wait for the next rideable pulse |
| **Wipeout** | Getting pulled into a gravity well or flung by turbulence | Loss of control, not loss of HP. The fluid dictates your trajectory. |
| **Reading the sets** | Observing wave timing and amplitude before committing | Information gathering through patience — drifting and watching is a skill |
| **The lull** | Quiet period between wave pulses | Safe window for repositioning, but also when portals might evaporate |
| **Rip current** | High-velocity channel between two wells | Fast travel but low control — you go where it goes |
| **Shore break** | Violent turbulence at the well's event horizon edge | Dangerous but resource-rich zone. Core wrecks live here. |

### What Diverges from Real Surfing

- **No gravity pulling you down.** In water, gravity is constant and the wave provides lateral force. In LBH, the wells provide the "gravity" and waves are radial pulses. The player has to internalize a different force model.
- **Waves are radial, not parallel.** Ocean waves approach from one direction. Gravity waves radiate outward from wells in all directions. This means surfing involves riding away from something, not toward shore.
- **Multiple wave sources.** Two wells create interference patterns — constructive (double amplitude) and destructive (dead zones). Reading interference is the advanced skill.
- **The medium changes.** Viscosity increases over time. Early surfing is fast and loose. Late surfing is heavy and committed. The same wave that was easy to catch at minute 2 is a slog at minute 8.

---

## Control Affordances: Magnetism, Forgiveness, and Stickiness

Good controls don't just translate input to output. They interpret player intent and help the player do what they meant to do. This is especially important in a fluid sim where the physics can feel slippery and unintuitive.

### The Mantling Principle

In modern platformers, "mantling" means the game helps you climb a ledge even if you didn't jump perfectly. The player's intent (get on that ledge) is clear, so the game assists. The assistance is invisible when it works and only noticeable when it's absent.

LBH needs equivalent affordances for fluid navigation. The player's intent is often clear — "ride that wave," "dodge that obstacle," "reach that wreck" — but the fluid makes precise execution difficult. The game should help without removing the skill requirement.

### Wave Magnetism

**Concept:** When the player is close to catching a wave (within a tunable threshold), the ship gets a subtle assist that helps lock onto the wave crest.

**Parameters to tune:**
- **Catch window** — how close (in velocity alignment and position) the player needs to be before the assist kicks in. Too wide = surfing feels automatic. Too narrow = surfing feels impossible.
- **Lock strength** — how much force the assist applies to keep the ship on the crest. Should feel like the wave "wants" to carry you, not like rails.
- **Break threshold** — how much cross-wave thrust breaks the lock. Deliberately leaving a wave should be easy. Accidentally falling off should be hard.
- **Visual feedback** — when the player catches a wave, something should change. Subtle screen effect, audio cue, or ship behavior that confirms "you're riding."

**Implementation approach:** Sample the fluid gradient at the ship's position. If the gradient is above a threshold (you're on a wave front) and the ship's velocity is roughly aligned with the wave direction, apply a small corrective force that steers the ship along the crest. Decay this force as the wave dissipates or the player thrusts away.

### Gravity Well Escape Assist

**Concept:** The edge of a gravity well's pull is the most frustrating zone — you're being pulled in but you can almost thrust out. Rather than a hard boundary, the well's pull should have a "soft shoulder" where the player gets subtle assistance if they're actively thrusting away.

**Parameters:**
- **Shoulder width** — the zone between "you're definitely falling in" and "you're definitely out." Should be wide enough that escape feels like a maneuver, not a binary.
- **Escape assist** — in the shoulder zone, if the player is thrusting away from the well, reduce the well's effective pull by a tunable percentage. This makes escape feel earned but possible.
- **Commitment point** — past a certain depth, no amount of thrust saves you. The game should make this visually and audibly clear before you cross it. This is the "shore break" zone.

### Wreck Approach Stickiness

**Concept:** Wrecks are navigation targets. When the player is approaching a wreck with clear intent (moving toward it), the ship should get subtle help with the final approach — especially since the fluid around wrecks may be turbulent.

**Parameters:**
- **Approach cone** — angular window where the assist applies. If the player is heading roughly toward the wreck, help. If they're tangentially passing, don't.
- **Deceleration assist** — as the player approaches loot range, gently reduce their speed so they don't overshoot. Should feel like the wreck's "wake" is slowing you down, which is also physically accurate.
- **Loot orbit** — if the player is circling near a wreck without thrusting away, keep them in loot range. The wreck's wake zone should be a natural resting point. This makes the "drift near a wreck and loot while watching for threats" play pattern feel good.

### Portal Alignment

**Concept:** Portals are the most important navigation targets. Missing a portal because the fluid pushed you past it should feel like a physics consequence, not a control failure.

**Parameters:**
- **Approach magnetism** — stronger than wreck stickiness. If you're heading for a portal, help you hit it.
- **Entry confirmation** — the moment of extraction should have a clear input window. Not "fly through the pixel" but "be in the zone and confirm."
- **Abort window** — if you're in the approach zone but change your mind, breaking away should be instant. No magnetism should trap you in an extraction you didn't want.

### Input Buffering and Timing Windows

**Concept:** When the player presses thrust at the right moment to catch a wave, "right moment" should have a generous interpretation.

**Parameters:**
- **Input buffer** — if the player taps thrust 100-200ms before a wave arrives, treat it as if they tapped it when the wave hit. This is the "coyote time" of surfing.
- **Late forgiveness** — if the player taps thrust 50-100ms after a wave crest passes, still give partial wave-catch benefit. The window is shorter because late reactions should be penalized more than early ones.
- **Thrust smoothing** — mouse-based thrust direction should have slight smoothing to prevent jitter. The ship should feel like it has inertia in its facing, not just its position.

### Near-Miss Correction

**Concept:** When the player barely misses a navigation target (wreck loot range, portal entry zone, wave crest), nudge them. Celeste does this with pixel-level corner correction — the player hits a corner and gets shifted 2-5px to clear it. Same principle, fluid context.

**Explore during tuning:**
- **Wreck near-miss** — if ship trajectory passes within N% of a wreck's loot radius without entering it, bend the path slightly inward. Only when the player is clearly heading *at* the wreck, not tangentially past it.
- **Portal near-miss** — same but stronger. Missing a portal because a current nudged you 10 pixels is a control failure, not a skill failure.
- **Wave near-miss** — if the player is *almost* aligned with a wave crest (just outside the catch window), apply a weaker version of the wave magnetism. Partial catch > total miss.
- **Kill radius grace** — if the ship barely clips a well's commitment point, give a 1-2 frame "are you sure?" where escape thrust is amplified. Not infinite — just enough to save a near-miss from becoming a death.

### Counter-Steer Damping

**Concept:** Racing games damp counter-steer to prevent snap oversteer. In LBH, when a player is escaping a well's pull and thrusting away, they tend to overcorrect — they fight the pull, overshoot, then oscillate back and forth. The game should damp this oscillation.

**Explore during tuning:**
- **Oscillation detection** — if the thrust vector has reversed direction 2+ times within N frames while near a well, the player is fighting the physics. Apply damping to smooth the escape trajectory.
- **Escape trajectory smoothing** — in the well's shoulder zone, blend the ship's thrust direction with the ideal escape vector by a small percentage. Makes escape feel like a clean arc, not a zigzag.
- This is related to **well escape assist** but specifically targets the *feel* of the escape maneuver, not just whether escape is possible.

### Beginner Drift Guard

**Concept:** Mario Kart's "Smart Steering" applies an invisible nudge to keep the kart on-track. For LBH beginners, we could apply a subtle auto-correction that prevents passive drift toward wells when the player clearly isn't trying to go there.

**Explore during tuning:**
- **Passive drift correction** — if the ship is drifting (no thrust) and moving toward a well, apply a tiny perpendicular force that curves the drift path into an orbit rather than a collision. Experienced players won't notice because they're always thrusting. Beginners survive their first 30 seconds.
- **Skill gate** — this assist could weaken as the player demonstrates wave-catching or intentional well approaches. Or it could be a setting. Or it could just be the well's escape assist tuned generously enough.
- **Risk:** if this is too strong, the wells lose their dread. The well should always *feel* dangerous even if beginners don't die in the first 10 seconds.

### Visual Affordances for Invisible Assists

**Concept:** Every invisible assist should have a visible cue so the player learns the system, not just benefits from it. (Ref: Skate's grind sparks, AC's white scratches on ledges, stealth games' awareness meters.)

**Explore during tuning:**
- **Wave catch zone** — when the player enters the catch window, the ASCII characters in the wave crest could brighten or shift to denser glyphs (`#` → `@`). The player learns to read "bright = rideable."
- **Well danger gradient** — ASCII density increases near the commitment point. `·` in safe zone → `:` in shoulder → `#` near commitment → `█` inside. The terrain itself communicates the stakes.
- **Assist-active indicator** — when any magnetism/stickiness assist is active, a subtle visual change on the ship (trail color? glyph change?) confirms "the game is helping you." This teaches the player what good positioning looks like.
- **This ties directly to Pillar 1 (Art Is Product)** — the visual language isn't decorative, it's functional.

---

## Ship Control Model

The ship isn't just a point that reads fluid velocity. It's a physical object with mass, facing, and thrust — and how those parameters are tuned determines whether movement feels like piloting, skating, or fighting.

### Turn Speed and Curves

**Concept:** The ship's facing (where it points / where thrust goes) shouldn't snap to the mouse. It should rotate toward the mouse aim point with tunable speed, and that speed should depend on *how far* the aim point is from current facing.

**Parameters to explore:**
- **Turn rate** — degrees per second the ship can rotate. Starting point: ~180°/s (half rotation per second). Too fast = twitchy. Too slow = unresponsive.
- **Turn speed curve** — nonlinear response. Small aim offsets (nudging) should produce slow, precise rotation. Large aim offsets (reversing direction) should ramp faster. This gives the player fine control AND quick reversals.
  - **Curve shape:** quadratic or cubic ease-in. `turnSpeed = baseTurnRate * pow(aimOffset / maxOffset, curvePower)` where curvePower 1.5-2.5.
  - **Dead zone** — below ~5° offset, no rotation at all. Prevents jitter when the mouse is near the ship's facing.
- **Turn rate vs. speed** — turning could be faster at low speed and slower at high speed (like a car). This rewards slowing down before maneuvers and makes high-speed surfing feel committed.

### Ship Mass and Inertia

**Concept:** The ship has mass. Mass affects how quickly it accelerates, decelerates, and how much the fluid can push it around.

**Parameters to explore:**
- **Mass** — affects acceleration (`a = F / mass`). Heavier ship = slower response to thrust, but also less buffeted by small currents. Lighter ship = responsive but thrown around by turbulence.
- **Acceleration curve** — thrust could ramp up over time rather than being instant. Tap thrust = small burst. Hold thrust = builds to full force over 200-500ms. This creates a difference between "nudge" and "burn."
- **Deceleration / drag** — how quickly the ship loses its own momentum when not thrusting. Low drag = ice-skating feel (momentum carries). High drag = responsive stops. Starting point: low drag when in-current, higher drag when fighting the flow.
- **Fluid coupling as mass interaction** — heavier ships could have lower fluid coupling (they resist currents more). Lighter ships get carried more. This could be a progression axis: start light and wild, upgrade to heavier and controlled.

### Gravity Response

**Concept:** The ship's relationship with gravity wells isn't just "wells pull, ship thrusts away." There's a richer physics vocabulary.

**Parameters to explore:**
- **Gravitational acceleration** — should the ship accelerate toward wells like real gravity (`F = G*m/r²`), or use a gentler falloff? Real inverse-square creates very sharp pull near the well. A softer curve (`1/r` or `1/r^1.5`) might feel better for gameplay.
- **Terminal velocity near wells** — cap the infall speed so players always have *some* reaction time near wells, even at close range. Without this, the inverse-square pull creates instant death at close range.
- **Tidal effects** — at advanced play, the ship could feel differential gravity: the side closer to the well is pulled harder than the far side. This creates a rotational torque that makes close approaches physically destabilizing. (May be too complex for jam — note for post-jam.)
- **Slingshot mechanics** — deliberately approaching a well and using its pull to gain speed before thrusting tangentially. The physics should support this naturally, but the tuning determines whether it's viable or suicidal. The well escape assist's shoulder width directly controls slingshot viability.

### Thrust Model

**Concept:** How thrust translates to force.

**Parameters to explore:**
- **Thrust modes** — continuous (hold to thrust) vs. burst (tap for impulse). Current design is continuous, but a secondary burst/dodge could be a skill tool.
  - **Burst/dodge** — a short, high-force impulse on a cooldown. The "duck dive" verb from the surfing metaphor. Costs extra signal.
- **Thrust direction** — always forward (toward mouse/stick)? Or could the player thrust in a direction while facing another? (Probably too complex for jam. Forward-only is clean.)
- **Thrust feedback into fluid** — the ship's thrust creates a wake in the fluid. How strong? Strong enough to see in the ASCII? Strong enough for other players to read? This is also a signal mechanic tie-in.
- **Reverse thrust** — can the player brake actively, or only by thrusting in the opposite direction? Active brake (holding a key/trigger to decelerate) is more forgiving. Requiring 180° turn to slow down rewards skill.

---

## Input Schemes: Mouse vs. Controller

The input device fundamentally changes what's possible. Mouse gives precision aiming. Controller gives analog thrust and haptic feedback. Both are valid — but they produce different games. **This may warrant a parallel experiment alongside the physics experiment** (Pillar 6).

### Mouse + Keyboard (Primary, Jam Default)

The mouse is precise but binary — clicks are on or off. The design challenge is creating analog-feeling control from digital inputs.

#### What the mouse does

Three models to explore, in order of preference:

**Model 1: Mouse = aim, distance = thrust intensity** (RECOMMENDED START)
- Ship facing rotates toward cursor
- Thrust intensity scales with cursor distance from ship: close = nudge, far = burn
- Left click = thrust on/off (or always-on, with distance doing the modulation)
- **Why this works:** gives us analog thrust from a mouse without extra keys. The spatial relationship between cursor and ship becomes the core skill input.
- **Distance curve:** needs a dead zone near the ship (no thrust below ~30px), ramp zone (30-200px), and a clamp (>200px = full thrust). Probably quadratic: `thrustPct = clamp(pow((dist - deadZone) / rampRange, 0.7), 0, 1)`
- **Risk:** requires the player to manage cursor position AND direction simultaneously. Could feel like patting your head and rubbing your stomach. Needs playtesting.

**Model 2: Mouse = aim, click = binary thrust**
- Ship facing rotates toward cursor. Click to thrust at full power in that direction.
- Simple. Clean. But no nudge/burn distinction — the fluid has to do all the analog work.
- Thrust ramp time (200ms) partially compensates: tap = weak, hold = strong. But that's temporal, not spatial.
- **This is the safe fallback** if Model 1 feels bad.

**Model 3: Mouse = velocity target (drag magnet)**
- Ship moves toward cursor like dragging through fluid. No explicit thrust.
- Intuitive for casual players. But removes "fighting the current" as a skill — the ship auto-corrects.
- **Probably wrong for LBH** but worth 20 minutes of testing to confirm.

#### Keyboard bindings

| Key | Action | Notes |
|-----|--------|-------|
| Mouse move | Aim / set thrust direction | Always active |
| Left click | Thrust (or toggle, test both) | Hold to thrust, release to drift |
| Right click | Burst/dodge (stretch goal) | The "duck dive" — high impulse, cooldown, extra signal |
| Scroll wheel | Zoom (if we have zoom) | Or camera distance |
| Space | Brake / active deceleration | Alternative to 180° turn. More forgiving. Test whether this is needed. |
| Shift | Signal flare (L2+) | Non-lethal tool, stretch goal |
| Tab | Inventory / scanner (L1+) | Pause-less overlay |

#### Mouse-specific affordances
- **Cursor trail** — show a faint line from ship to cursor. In the ASCII aesthetic this could be a dotted line of dim characters. Gives the player feedback on their thrust vector.
- **Cursor at ship** — when the cursor is very close to the ship (dead zone), hide the cursor or change it to indicate "drift mode." Player learns: cursor close = not thrusting.
- **Edge-of-screen behavior** — if the cursor is near the screen edge, the ship should still respond correctly. Consider locking the cursor to the game window during play.

### DualSense Controller (PS5)

The DualSense has analog sticks, analog triggers, adaptive trigger resistance, HD haptics, a speaker, a gyroscope, and a touchpad. This is a *radically* different input surface. It could make LBH feel like a different (better?) game.

#### Core mapping

| Input | Action | Why This Mapping |
|-------|--------|-----------------|
| **Left stick** | Ship facing direction | Analog tilt = natural turn speed curves. Slight tilt = nudge. Full deflection = hard turn. The hardware IS the turn speed curve — no software curve needed. |
| **Right trigger (R2)** | Thrust intensity | 0-255 analog range. Light squeeze = nudge. Full pull = burn. This is the variable we're faking with mouse distance or thrust ramp. The trigger just *is* analog thrust. |
| **Left trigger (L2)** | Brake / active decel | Analog braking. Light squeeze = gentle slowdown. Full pull = hard stop. Removes the "do we need a brake key?" question. |
| **Right stick** | Camera / look-ahead | Push to pan the view in a direction. See what's coming without changing ship facing. Could be critical for "reading the sets" (wave observation). |
| **X / Cross** | Burst/dodge (duck dive) | Digital button for the impulse verb. Short cooldown. |
| **Circle** | Interact / loot | When near a wreck. Could also be "confirm extraction" at portals. |
| **Triangle** | Scanner / signal flare (L2+) | Stretch goal verbs. |
| **D-pad** | Quick inventory / HUD toggles (L1+) | Not needed for L0. |
| **Touchpad press** | Map / overview (L4+) | Full-field view for reading wave patterns. |

#### Adaptive triggers (the killer feature)

The DualSense can programmatically change trigger resistance. This is **physical feedback about game state**:

| Game State | R2 (Thrust) Feel | L2 (Brake) Feel |
|------------|-------------------|-----------------|
| Open space, no current | Normal, light | Light |
| Riding a wave | Very light — the wave carries you, thrust is easy | Light |
| Fighting a current | Heavy, resistant — you feel the current pushing back | Normal |
| Near a gravity well | Progressive resistance — gets heavier as you go deeper | Heavy — braking near a well is fighting gravity |
| In the well's shoulder (escape zone) | Very heavy — every newton of thrust is earned | Very heavy |
| Past commitment point | Trigger locks up / goes dead — thrust won't save you | Dead |
| Catching a wave (magnetism active) | Subtle "click" into a groove — the trigger finds a notch | N/A |

**Implementation:** The Gamepad API has limited haptic support, but the DualSense can be accessed via WebHID or platform-specific APIs. For the jam, basic vibration via Gamepad API may be all we get. Full adaptive trigger support could be a post-jam feature — but the *design* should account for it now.

#### HD haptics

The DualSense's haptic motor can produce nuanced vibrations, not just rumble:

- **Wave crests** — rhythmic pulse that matches wave frequency. You feel the waves before you see them.
- **Gravity pull** — low-frequency vibration that intensifies near wells. Constant, directional, unsettling.
- **Wave catch lock-in** — a satisfying short "thunk" when magnetism engages. Confirms you're riding.
- **Turbulence** — irregular, jittery vibration in chaotic flow zones.
- **Inhibitor presence** — wrong. A buzz that doesn't match any natural pattern. Gets into your hands.
- **Thrust wake** — subtle vibration proportional to thrust output. You feel your own engine.

#### Why this might be the better input method

The DualSense gives us **three things mouse doesn't have:**

1. **True analog thrust.** Mouse fakes it with distance or ramp time. The trigger IS analog. The nudge/burn distinction is built into the hardware.
2. **Physical feedback.** Adaptive triggers make the fluid state physical. Fighting a current *feels* heavy. Riding a wave *feels* effortless. This is Pillar 2 (Movement Is the Game) expressed through the player's hands.
3. **Simultaneous aim + thrust modulation.** Left stick aims while right trigger modulates power. Mouse requires managing cursor position for both. Controller separates the concerns onto different fingers.

**The tradeoff:** mouse aim is more precise. In a game where precise positioning matters (threading between two wells, catching a narrow wave window), mouse might win. But LBH has magnetism and forgiveness affordances *specifically because* precision shouldn't be the skill gate — reading the flow and positioning are.

#### The parallel experiment

Could run mouse vs. controller as a parallel test alongside the physics experiment Monday night. But this is lower priority — the physics must work first. Better approach:

1. Monday night: physics experiments (mouse only, simpler)
2. Tuesday/Wednesday: once physics is locked, add Gamepad API support
3. Test both inputs against the winning physics. The affordance tuning may need separate values per input method.

### Input-Dependent Affordance Tuning

Some affordances should be tuned differently per input device:

| Affordance | Mouse | Controller | Why |
|-----------|-------|------------|-----|
| Wave catch window | ±15° | ±20° | Stick aim is less precise than mouse |
| Turn speed curve | Software quadratic | Hardware (stick tilt) | Controller doesn't need the software curve |
| Thrust ramp time | 200ms (faking analog) | 0ms (trigger IS analog) | Don't double-smooth the trigger |
| Well escape damping | 30% | 20% | Stick gives smoother input, less oscillation naturally |
| Wreck approach cone | 30° | 35° | Slightly more generous for stick aim |
| Input buffer (wave catch) | 150ms/75ms | 120ms/60ms | Trigger gives continuous signal, less need for buffering |

---

## The Fabric: Anomalies and Substrate Interactions

The fluid sim is the terrain. Everything that affects the fluid affects movement. This section defines how different phenomena interact with the fabric and therefore with the surfing verbs.

### Gravity Wells (The Primary Terrain)

Wells are the mountains and valleys of the fluid landscape. They create:
- **Inflow** — constant pull toward the center. Stronger near the well.
- **Orbital currents** — fluid circling the well creates lateral flow. Can be ridden.
- **Outbound pulses** — periodic force injection creates waves radiating outward. THE surfable feature.
- **Interference** — two wells create patterns where their waves reinforce or cancel.

**Movement interaction:**
- Near a well: strong current, low control, high speed. Good surfers use this. Bad surfers get pulled in.
- Between wells: interference creates unpredictable patches. Advanced navigation terrain.
- Far from wells: calm, controllable, boring. No currents to ride. You have to thrust (and generate signal).

### Wrecks (Terrain Obstacles That Create Shelter)

Wrecks should affect the fluid. Even crude implementation does a lot:
- **Lee zone** — reduced flow on the downstream side. A natural shelter.
- **Vortex shedding** — wreck edges create small eddies. Turbulent but navigable.
- **Wake** — a cone of disturbed flow behind the wreck. Noisy (masks your signal?) but unstable.

**Movement interaction:**
- Approaching from upstream: the wreck blocks flow, creating a calm approach zone. Natural looting position.
- Approaching from downstream: you fight vortices. Harder approach, but you arrive in the wake (sheltered from signal detection?).
- Using wrecks as terrain: chain lee zones to move silently through a wreck field. Advanced stealth play.

### Merger Events (Terrain Earthquakes)

When two wells get close enough, they merge. The merger creates a massive wave burst — a one-time event that reshapes the entire flow field.

**Movement interaction:**
- **The pulse** — a huge outbound wave. If you're positioned right, it's the best ride of the run. If you're caught wrong, it flings you into another well.
- **The aftermath** — the merged well is much stronger. All nearby flow patterns change. Routes that worked before the merger may not work after.
- **Advance warning** — the flow should show the merger coming (wells orbiting each other, increasing amplitude) so players can position for the pulse or flee.

### Cosmic Signatures (Per-Run Terrain Modifiers)

Each run has a dominant environmental character that changes how the fabric behaves:

| Signature | Fabric Effect | Movement Impact |
|-----------|--------------|-----------------|
| **Tidal** | Long, slow, predictable wave pulses | Surfing-focused. Patient play rewarded. Routes are readable. |
| **Turbulent** | Chaotic flow, frequent small pulses, no steady pattern | Reactive play. Can't plan routes. Moment-to-moment decisions. |
| **Viscous** | Thick fluid from the start, all movement sluggish | Momentum is precious. Commit to directions. Course corrections are expensive. |
| **Sparse** | Low background density, sharp wave fronts, empty between | Clear surfing moments separated by dead calm. Binary: on a wave or drifting. |
| **Dense** | High background density, turbulent, lots of minor flows | Always something to ride but hard to pick the right wave. Noisy. |
| **Decaying** | Starts fast, viscosity ramps aggressively | Opening minutes are a sprint. Late game is survival. Run strategy inverts. |

### Future Anomaly Types (Post-Jam Terrain Features)

Ideas for fabric-level anomalies that create new movement verbs:

- **Rift currents** — permanent high-velocity channels between two points. Fast travel but you can't stop or steer. Commit and go.
- **Density pockets** — localized high-viscosity zones. Ships entering slow down dramatically. Natural traps or ambush points.
- **Resonance fields** — zones where the fluid oscillates at a fixed frequency. Ships that match the frequency (through rhythmic thrust) move freely. Ships that don't get shaken apart.
- **Null zones** — patches where the fluid is completely still. No currents, no waves, no assistance. Pure thrust-only movement. Expensive in signal but safe from flow hazards.
- **Feedback loops** — zones where the fluid amplifies small disturbances. Your thrust creates waves that come back larger. Moving through one is increasingly chaotic.

---

## Skill Progression: What Players Learn

### Beginner
- Thrust to move. Release to drift.
- Fluid has currents that push you.
- Wells pull you in. Don't get too close.
- Get to the portal before they disappear.

### Intermediate
- Ride waves for free speed. Stop fighting currents.
- Use wreck wakes as shelter.
- Time your looting between wave pulses.
- Read the flow to plan routes.

### Advanced
- Position for wave catches. Wait in the lineup.
- Use well slingshots — let the pull accelerate you, then catch an outbound wave at the right moment.
- Chain wreck lee zones for silent traversal.
- Read interference patterns to find fast lanes.
- Time merger pulses for massive speed boosts.

### Expert
- Surf the shore break — loot core wrecks near wells by riding inbound, looting, catching the next outbound pulse.
- Manipulate flow by using force pulse to create custom waves.
- Navigate purely by drift in viscous late-game conditions.
- Read other players' (or scavengers') wakes to track them without signal.

---

## Tuning Variables (Starting Points)

These are all day-one tunables. Expect to change them hourly during Monday playtesting.

### Affordances

| Variable | Starting Value | What It Affects |
|----------|---------------|-----------------|
| Wave magnetism catch window | ±15 degrees, ±20% velocity match | How easy it is to catch a wave |
| Wave magnetism lock strength | 10% of wave force | How much the wave holds you |
| Well escape shoulder width | 20% of pull radius | How forgiving the well edge is |
| Wreck approach cone | 30 degrees | How much the game helps you reach wrecks |
| Wreck near-miss radius | 120% of loot radius | How much the game corrects near-misses |
| Portal near-miss radius | 150% of entry radius | Stronger correction than wrecks |
| Input buffer (wave catch) | 150ms before, 75ms after | Timing forgiveness for wave riding |
| Deceleration near wrecks | 30% speed reduction in loot range | How much the game slows you for looting |
| Counter-steer damping | 30% blend toward ideal escape vector | How much the game smooths well escapes |
| Beginner drift guard | TBD (may cut — risk of removing dread) | Perpendicular nudge force near wells when drifting |

### Ship Controls

| Variable | Starting Value | What It Affects |
|----------|---------------|-----------------|
| Ship mass | TBD (1.0 as baseline, scale from there) | Acceleration response, fluid buffeting |
| Thrust force | TBD (relative to well pull at mid-range) | How fast you can fight the current |
| Thrust ramp time | 200ms to full force | Tap = nudge, hold = burn. Acceleration feel. |
| Turn rate (base) | 180°/s | How fast the ship rotates toward aim |
| Turn speed curve power | 2.0 (quadratic ease-in) | Nudge precision vs. fast reversal |
| Turn dead zone | 5° | Prevents jitter near current facing |
| Turn rate speed scaling | 0.7× at max speed | Committed feel at high speed |
| Fluid coupling | 0.8 (ship velocity = 80% fluid + 20% own) | How much the flow carries you |
| Ship drag (in-current) | Low (TBD) | Momentum carry when riding flow |
| Ship drag (against-current) | Higher (TBD) | Resistance when fighting flow |
| Thrust smoothing | 50ms lerp on facing | How quickly the ship changes direction |
| Gravity falloff power | 2.0 (inverse square) | How sharp the pull curve is near wells |
| Terminal infall speed | TBD (cap so player always has reaction time) | Prevents instant death at close range |
| Burst/dodge impulse | TBD (stretch goal — may cut) | The "duck dive" verb. High force, short, cooldown. |
