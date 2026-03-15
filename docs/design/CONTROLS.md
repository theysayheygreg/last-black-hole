# Controls & Input Design

> How the player's hands connect to the ship. Ship physics model, input schemes,
> and per-device affordance tuning.
>
> See MOVEMENT.md for the surfing metaphor, navigation affordances, and fabric interactions.

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

---

## Input-Dependent Affordance Tuning

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

## Ship Control Tuning Variables

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
| Mouse thrust dead zone | 30px from ship | Below this, no thrust (drift mode) |
| Mouse thrust ramp range | 30-200px | Distance over which thrust scales 0→100% |
| Mouse thrust curve power | 0.7 | Sub-linear so light thrust is accessible |
