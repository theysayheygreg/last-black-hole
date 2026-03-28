# Signal System — Full Design Document

> The tax on ambition, the price of playing the game, and the slow ratchet toward doom.

This doc takes the principles from SIGNAL-DESIGN.md and turns them into buildable mechanics with concrete numbers, reference analysis, and decisions for Greg.

---

## What We Learned From Other Games

### EVE Online: Actions Create Signatures

EVE's detection model is the closest analog to what we want. Three things matter:

**1. Signature radius is intrinsic and modified by actions.** Every ship has a base signature radius — frigates are small (~30m), battleships are huge (~400m). But the killer mechanic is that *using your tools changes your visibility*. Activating a Microwarpdrive blooms your signature by 500%. You're 5x easier to lock, 5x easier to hit with missiles. The MWD gives you speed. Speed costs visibility. This is the exact pattern we want: thrust = fast = loud.

**2. Detection is layered and asymmetric.** D-scan is free, passive, 14 AU range — but it only tells you something's there, not where exactly. Combat probes narrow the position but *the probes themselves are visible on d-scan*, so scanning someone tells them they're being scanned. Every detection action creates a counter-detection opportunity. In wormhole space, there's no local chat — zero passive intel. You learn things by doing things, and doing things reveals you.

**3. Cloaking is binary but has hard tradeoffs.** Cloaked ships are invisible to everything. But: you can't interact with anything while cloaked (can't loot, can't warp to targets, can't shoot). Coming within 2km of any object decloaks you. And after decloaking, there's a targeting delay. So cloaking is "safe but useless" — you're invisible and impotent. This maps perfectly to our "drifting is quiet but you go where the flow takes you."

**What we steal:** The MWD signature bloom pattern maps 1:1 to thrust-signal coupling. The "actions create signatures" model is our core loop. The cloaking tradeoff (invisible but can't interact) maps to drifting (quiet but can't steer).

**What we skip:** EVE's probe triangulation system is an entire minigame. We don't need it — our "scanning" is just moving toward things and seeing them.

### Stellaris: Escalation Through Inevitability

**1. Crisis triggers are probability-shifted by player behavior.** The Prethoryn don't arrive on a timer. They arrive because the galaxy reached a state (end-game year, fleet power, etc.) and then a probability check fires every 5 years with increasing weight. The player's own progression makes the crisis more likely. Researching Jump Drive increases Unbidden weight. Having many synthetics increases Contingency weight. *Your success invites your doom.*

**2. Cloaking strength vs. detection strength is a clean numerical model.** Stellaris (First Contact DLC) uses a simple comparison: if starbase detection strength >= fleet cloaking strength, the fleet is revealed. Fleet cloaking is determined by the *weakest* ship — one loud ship compromises the whole fleet. Bigger ships are harder to cloak. Moving while cloaked imposes speed penalties. This creates composition decisions: an all-corvette cloaked fleet is fast and stealthy; adding one battleship makes everyone visible and slow.

**3. The Shroud / Horizon Signal pattern — horror through complicity.** The most powerful Stellaris narrative (the Horizon Signal) works because *the player chooses every step*. Each phase demands another sacrifice. By the final choice, you've paid so much that refusing feels like waste. The horror isn't external threat — it's your own sunk-cost fallacy made cosmic.

**What we steal:** Crisis probability shifting by player behavior = signal level shifting Inhibitor wake probability. The "weakest link" cloaking model informs multiplayer signal (peak player signal, not sum). The complicity pattern is already in SIGNAL-DESIGN.md — the Inhibitor wakes because of YOUR choices.

**What we skip:** Stellaris espionage (envoys, spy networks, intel levels) is a grand strategy system. Our intel model is simpler: you see what's in your viewport, you hear what's nearby, and the universe reacts to your signal.

### Alien: Isolation: The Alien Has Ears

**1. Multi-sense AI with decay.** The Alien has separate vision, hearing, and touch detection channels. Each has a severity rating AND a decay rate. The Alien doesn't have perfect memory — it forgets sensory readings over time. This means: make noise, hide, and if you're quiet long enough, the Alien loses you. But the decay isn't instant — there's a window of danger after every noise.

**2. Sound tells the story.** The game's audio design means the player tracks the Alien by ear — which door opened, how far away the footsteps are, which vent shaft it's in. Sound is both the threat indicator AND the detection mechanic. The player generates sound; the Alien generates sound. Both are reading each other's noise.

**What we steal:** Signal decay as a mechanic — your signal level fades when you're quiet, but not instantly. The decay window is where tension lives. Also: the player should be able to "hear" high-signal entities (scavengers, fauna) the same way the Alien hears the player. Signal is bidirectional.

### Metal Gear Solid: Phase-Based Alert States

**1. Graduated response, not binary detection.** MGS has four+ states: Normal → Alert → Evasion → Caution → Normal. Each has different enemy behavior. Alert: they know where you are and attack. Evasion: they lost you but know you're nearby. Caution: they're on edge but don't know your position. The transitions between these states are where the gameplay lives.

**2. Alert states decay but leave residue.** After an Alert, enemies don't just snap back to Normal. They go through Evasion (searching your last known position), then Caution (expanded patrol routes, faster reactions). The world remembers that something happened, even after the immediate threat passes.

**What we steal:** Our signal gradient (Ghost → Whisper → Presence → Beacon → Flare → Threshold) already mirrors this. But MGS teaches us that the *transitions* matter more than the states. The moment signal crosses from Whisper to Presence — that's when behavior changes. Those boundary crossings should be felt.

### Darkest Dungeon: The Torch Mechanic

**1. Light is a sliding risk/reward scale, not binary.** The torch depletes as you explore. Low light = more stress, harder enemies, higher surprise chance. But also: better loot, higher crit chance. The player can burn torches to raise light (safe but resource-costly) or play in darkness (dangerous but rewarding). There is no "correct" light level — it depends on your party, your supplies, and your risk tolerance.

**2. Depletion creates natural escalation.** Light drops by 6 points per new room explored, 1 per revisited room. The game gets progressively darker as you push deeper. The player's ambition (exploring more rooms) directly causes the danger (lower light). Sound familiar?

**What we skip for LBH:** Darkest Dungeon's torch mechanic creates a "sweet spot" where some players intentionally play dark for better loot. SIGNAL-DESIGN.md explicitly rejects this — signal is ALWAYS a cost, never a resource. We don't want players optimizing their signal level. We want them minimizing it while doing risky things anyway. The Darkest Dungeon model is instructive as a *contrast* — it shows what happens when your noise/visibility axis has upside on both ends, and that's specifically what we're avoiding.

---

## Signal Architecture

### The Signal Value

Each player (and each scavenger) has a **signal level**: a float from 0.0 to 1.0.

Signal is NOT a resource. It's a measurement — like a thermometer. You don't spend it. You don't want it. It goes up when you do things, and it goes down when you stop.

```
signalLevel: float [0.0 – 1.0]
```

### Signal Generation

Every action that generates signal adds to the current level. Generation values are per-second rates (for continuous actions) or instant spikes (for discrete actions).

| Action | Type | Signal Amount | Notes |
|--------|------|--------------|-------|
| Drifting with current | continuous | +0.000/s | Free. Silent. The reward for skill. |
| Coasting (no thrust, no current) | continuous | +0.001/s | Near-zero. Residual heat. |
| Thrusting with current | continuous | +0.005/s | Light thrust to accelerate along flow. |
| Thrusting against current | continuous | +0.015/s | Fighting the flow. EVE's MWD analog. |
| Thrusting in dead space | continuous | +0.010/s | No current assist, brute force. |
| Looting a wreck (T1) | spike | +0.06 | Standard wreck pickup. |
| Looting a wreck (T2) | spike | +0.10 | Better wreck, louder signal. |
| Looting a wreck (T3/core) | spike | +0.18 | The good stuff. Everyone hears this. |
| Force pulse | spike | +0.12 | Emergency tool, emergency cost. |
| Signal flare (launch) | spike | +0.04 | Small cost to deploy the decoy. |
| Collision with entity | spike | +0.08 | You got sloppy. |
| Extracting through portal | continuous | +0.003/s | Low — you're leaving. |
| Near gravity well (<0.3 wu) | continuous | +0.002/s | Well radiation masks some, adds some. |

**Thrust signal scales with opposition.** The core insight from EVE's MWD: the expensive action isn't moving — it's moving *against the environment*. We calculate thrust-signal based on the dot product between thrust direction and fluid velocity:

```javascript
// Pseudocode for thrust signal calculation
const flowAtShip = flowField.sample(ship.wx, ship.wy);
const thrustDir = normalize(ship.thrustVector);
const flowAlignment = dot(thrustDir, normalize(flowAtShip));
// flowAlignment: +1.0 = with current, -1.0 = against current

const thrustMagnitude = length(ship.thrustVector);
if (thrustMagnitude < 0.01) {
    // not thrusting — no signal from movement
    thrustSignal = 0;
} else {
    // Base signal from thrusting at all
    const baseSignal = 0.005;
    // Opposition multiplier: 1.0 when neutral, up to 3.0 against current
    const oppositionMult = 1.0 + max(0, -flowAlignment) * 2.0;
    // Magnitude multiplier: harder thrust = louder
    const magMult = clamp(thrustMagnitude / maxThrust, 0.3, 1.0);
    thrustSignal = baseSignal * oppositionMult * magMult;
}
```

This means: surfing with the current at full speed = 0.005/s (quiet). Thrusting hard against the current = 0.015/s (loud). Skilled pilots who read the flow are rewarded with stealth. This is the game teaching you to surf.

### Signal Decay

Signal decays when you're not generating it. The decay rate depends on context:

| Context | Decay Rate | Time to drop from 0.5 → 0.15 |
|---------|-----------|-------------------------------|
| Drifting in open space | -0.025/s | ~14 seconds |
| Drifting in wreck wake | -0.040/s | ~9 seconds |
| Inside accretion disk shadow | -0.050/s | ~7 seconds |
| Actively thrusting | -0.000/s | Never (generation offsets) |
| Actively looting | -0.000/s | Never (paused during loot) |

Decay is **linear**, not exponential. Reasoning: exponential decay (fast initial drop, long tail) would let you spike high and recover quickly. Linear decay means a big spike takes proportionally longer to recover from. A spike to 0.6 takes twice as long to recover as a spike to 0.3. This punishes recklessness proportionally.

**Wreck wake masking:** Wreck debris fields create a "shadow" that accelerates signal decay. This gives the player a reason to linger near wrecks after looting — the same debris that held the loot now helps you hide. From EVE: using the environment for cover.

**Accretion disk masking:** Being inside a gravity well's accretion disk provides the fastest decay — the well's own radiation masks your signal. But you're in a death spiral. The best hiding spot is the most dangerous place. This is the core tension.

### Signal Thresholds and Universe Response

The universe doesn't respond to signal linearly. It responds at thresholds — crossing a boundary triggers behavioral changes. From Metal Gear: the transitions matter more than the states.

```
0.00 – 0.15    GHOST        ░░░░░░░░░░░░░░░░░░░░
0.15 – 0.35    WHISPER      ████░░░░░░░░░░░░░░░░
0.35 – 0.55    PRESENCE     █████████░░░░░░░░░░░
0.55 – 0.75    BEACON       ██████████████░░░░░░
0.75 – 0.90    FLARE        ████████████████████
0.90 – 1.00    THRESHOLD    ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  ← Inhibitor wakes
```

**GHOST (0.00–0.15):**
- Fauna ignore you completely
- Scavengers have no awareness of you
- You are invisible to everything
- The game is quiet and you're in control

**WHISPER (0.15–0.35):**
- Fauna within 0.5 world-units begin orienting toward you (slow turn, not approach)
- Drifter scavengers become aware of your general area (they might drift toward you if current helps)
- Vulture scavengers: no change yet
- Audio: faint tonal shift in ambient drone. Barely perceptible.

**PRESENCE (0.35–0.55):**
- Fauna within 1.0 world-units actively move toward you
- Drifter scavengers avoid your area (flee behavior)
- Vulture scavengers can track your position — they'll compete for wrecks/portals near you
- Audio: ambient drone takes a warning character. Low harmonic added.
- Visual: ship thruster trail becomes slightly brighter

**BEACON (0.55–0.75):**
- Fauna swarm from across the map. All fauna orient to you.
- All scavengers know your position. Drifters flee aggressively. Vultures engage directly.
- Cannot approach wrecks without fauna interference
- Audio: the signal choir from MUSIC.md. Ethereal becomes claustrophobic.
- Visual: subtle glow/halo around ship. Trail is bright and long.

**FLARE (0.75–0.90):**
- Everything in the universe is aware of you
- Scavengers either flee the map or attack — no passive behavior remains
- Fauna swarm density increases (more spawn)
- Audio: you can hear yourself. The ship hums. Directional audio cue for multiplayer.
- Visual: ASCII characters near ship shift toward warmer colors. You're a heat source.

**THRESHOLD (0.90–1.00):**
- The Inhibitor wakes. See Inhibitor section below.
- Irreversible for the remainder of the run.
- Visual: ship character representation begins glitching.
- Audio: everything changes. See MUSIC.md.

---

## The Inhibitor

### What It Is

The Inhibitor is not a boss fight. It is an environmental state change. When the Inhibitor wakes, the universe becomes fundamentally different — not harder, *different*. (Stellaris design pattern: each crisis changes the game's fundamental rules.)

From Stellaris's Fallen Empires: a dormant powerful entity is more threatening than an active one. The pre-threshold Inhibitor is felt as a presence. The dread comes from knowing it's there and choosing not to wake it.

From the Horizon Signal: horror through complicity. Every signal spike was a choice. The Inhibitor didn't attack you. You summoned it.

### Wake Mechanics

**OPTION A: Hard Threshold**
The Inhibitor wakes when signal hits 0.90. Period. Deterministic. The player knows exactly where the line is.

*Pros:* Clear. Learnable. Players can ride the edge intentionally. Creates "how close can I get?" tension.
*Cons:* Binary. Once you learn the number, it becomes a solved constraint rather than a felt threat. Removes uncertainty.

**OPTION B: Probability Ramp**
Above 0.75 (FLARE), each tick has an increasing probability of waking the Inhibitor. At 0.75 it's ~1%/second. At 0.90 it's ~10%/second. At 1.0 it's guaranteed.

```javascript
if (signalLevel > 0.75) {
    const excess = (signalLevel - 0.75) / 0.25; // 0.0 at 0.75, 1.0 at 1.0
    const wakeChance = 0.01 + excess * excess * 0.09; // 1% to 10% per second
    if (Math.random() < wakeChance * dt) {
        wakeInhibitor();
    }
}
```

*Pros:* Uncertain. You might get lucky at 0.85. You might get unlucky at 0.76. Creates genuine dread because you can't calculate the safe edge. Matches Stellaris's probability-shifted-by-behavior model.
*Cons:* Can feel unfair. "I was barely in FLARE and it woke!" Harder to learn.

**OPTION C: Threshold + Variance (Recommended)**
The Inhibitor has a wake threshold that's randomized per run: somewhere between 0.82 and 0.98. The player doesn't know the exact value. Hitting the threshold is deterministic (no RNG per-tick), but you don't know where the threshold is.

```javascript
// Set at run start
inhibitorThreshold = 0.82 + Math.random() * 0.16; // [0.82, 0.98]
```

*Pros:* Deterministic (no per-tick RNG complaints), but uncertain (you don't know the line). Learnable pattern (it's somewhere in the FLARE zone), but each run is different. Creates the EVE wormhole feeling: the rules are consistent but the parameters are hidden.
*Cons:* A lucky run might let you hit 0.97 with no consequence. A cruel run might wake at 0.82. Variance range needs tuning.

**Greg's call needed:** A, B, or C?

### Inhibitor Behavior Once Awake

The Inhibitor is not a ship. It's a physics distortion. When it wakes:

1. **Signal decay stops.** Your signal level is now frozen or rises slowly. The safety valve is gone. (From Stellaris: irreversible commitment.)

2. **A gravity anomaly appears.** Not at a fixed position — it manifests near the highest-signal entity and drifts toward them. It's a moving well that doesn't obey normal physics. It doesn't have an accretion disk. It's *wrong*.

3. **The fluid distorts around it.** Flow patterns become chaotic near the Inhibitor. Predictable currents become turbulent. Surfing becomes harder — your skills are degraded by the environment, not by a stat penalty. (Pillar: control feedback stays the same. The universe changes, not your ship.)

4. **It hunts by signal.** The Inhibitor drifts toward the highest-signal source. If you go quiet (stop thrusting), it slows and wanders. If you thrust (to escape), it locks on. The safest move (silence) and the survivable move (flee to portal) are in direct tension.

5. **Proximity kills.** Close enough and you're pulled in like any gravity well. But faster. No accretion disk to ride. No wave to surf. Just pull.

### Inhibitor Drift Speed

| Player State | Inhibitor Drift Speed | Meaning |
|-------------|----------------------|---------|
| Drifting (silent) | 0.02 wu/s | Slow wander. You have time. |
| Light thrust | 0.05 wu/s | Following you. Steady. |
| Heavy thrust | 0.10 wu/s | Closing in. You're leading it to yourself. |
| FLARE+ signal | 0.15 wu/s | Locked on. You need a portal NOW. |

The Inhibitor should feel like it's *considering* you when you're quiet, and *hunting* you when you're loud. The transition between those two modes is the dread.

---

## Signal Equipment

SIGNAL-DESIGN.md says: "No signal dampening upgrade that lets you be loud for free. That would collapse the core tension."

Agreed. But equipment CAN change the *shape* of signal generation without removing it. The distinction: equipment changes HOW signal accumulates, not WHETHER it accumulates.

**OPTION A: No Signal Equipment (Purist)**
Signal generation rates are fixed. The only way to reduce signal is skill (better surfing, more efficient routes). Equipment affects loot, speed, capacity — never signal.

*Pros:* Clean. Signal is always the same system. No build optimization around it. Every player's signal tells the same story.
*Cons:* No progression lever for the signal system. Players can't get "better at being stealthy" through upgrades, only through skill. (This might be a *pro*, depending on design philosophy.)

**OPTION B: Signal Shaping Equipment (Recommended)**
Equipment doesn't reduce signal generation. It changes the shape:

| Equipment | Effect | Signal Impact |
|-----------|--------|--------------|
| **Dampened Thrusters** | Thrust signal ramps up slower (delay before full rate) | First 0.5s of thrust at 50% signal rate. Rewards short bursts. |
| **Signal Sink** | Passive signal decay is 30% faster | Doesn't reduce generation. Reduces linger time. |
| **Resonant Hull** | Loot spikes are 40% smaller, but thrust signal is 20% higher | Trade movement noise for action noise. Changes playstyle. |
| **Wake Cloak** | Wreck wake masking radius is doubled | More hiding spots, same base signal. |
| **Harmonic Damper** | Signal threshold zones are shifted up by 0.05 | WHISPER starts at 0.20 instead of 0.15. More headroom per zone. Not a free pass. |

*Pros:* Creates loadout decisions without invalidating the core loop. "I'm building for burst-and-hide" vs "I'm building for sustained low-signal." Progression feels meaningful without collapsing the tension.
*Cons:* Balance complexity. Risk of an optimal loadout emerging that makes signal trivial.

**OPTION C: Signal Equipment with Costs**
Same as Option B, but each signal-reducing equipment has a non-signal downside:

| Equipment | Signal Benefit | Cost |
|-----------|---------------|------|
| **Dampened Thrusters** | Slower signal ramp | 15% less max thrust |
| **Signal Sink** | Faster decay | Uses a cargo slot (less loot capacity) |
| **Resonant Hull** | Smaller loot spikes | Higher thrust signal |
| **Wake Cloak** | Bigger hide zones | Passive signal +0.002/s (the cloak itself hums) |

*Pros:* Every signal benefit has a gameplay cost. No free optimization. From EVE: the MWD gives speed but costs visibility. Every module is a tradeoff.
*Cons:* More numbers to balance. More complex decision space.

**Greg's call needed:** A, B, or C? (My recommendation: C. The EVE pattern of "every tool has a signature cost" is proven and creates the richest decision space.)

---

## Signal Flare (Decoy System)

The signal flare from COMBAT.md becomes more concrete with the signal system in place:

**Deploy:** Shift key. Launches a signal decoy in the ship's facing direction.

**Behavior:**
- The flare drifts with the fluid (it's an object in the sim)
- It has its own signal level, starting at the player's current signal + 0.10
- It decays at half the normal rate (it's "louder" and "stickier" than a real ship)
- Duration: 8–10 seconds
- One active at a time

**AI response:**
- Fauna treat it as a signal source (orient/approach)
- Scavengers treat it as a signal source (vultures may investigate)
- The Inhibitor treats it as a signal source IF its signal exceeds the player's current signal

**The interesting decision:** Deploying a flare costs +0.04 signal. If you're at 0.50 and deploy, you spike to 0.54. The flare appears at 0.60. Now the flare is louder than you — but you're louder than you were. If you go silent immediately, the flare draws attention while your signal decays. If you keep thrusting, you might overtake the flare and become the louder target again.

**Against the Inhibitor:** The flare buys you time, not safety. The Inhibitor drifts toward the highest signal. If the flare is louder, it drifts toward the flare. But the flare is temporary. When it expires, the Inhibitor reorients to you — and it's now closer to wherever the flare drifted, which might be closer to you or farther depending on the currents. Reading the flow matters for flare deployment too.

---

## Multiplayer Signal (2-3 Players)

Signal is per-player. Consequences are shared.

**Inhibitor trigger:** Based on **peak** player signal, not sum. Why: sum punishes coordination. Three quiet players would be as dangerous as one loud player. Peak means one reckless player endangers everyone. Creates social dynamics: "who's being noisy?"

**Can you see other players' signal?**

**OPTION A: No.** You can hear them (directional audio scales with their signal) but can't see a number. Creates mystery and trust dynamics.

**OPTION B: Yes, as a vague indicator.** Their ship glow/trail reveals approximate signal level. You can tell who's at GHOST vs BEACON, but not precise numbers.

**OPTION C: Yes, exact number on HUD.** Full coordination information. Removes mystery but enables strategic play.

**My recommendation:** B. The visual cues (glow, trail brightness) already communicate signal state per the HUD feedback design. Let those visuals do the work in multiplayer too. You can see a glowing, long-trailed ship across the map and know they're loud without needing a number.

---

## HUD Implementation

The signal display needs to satisfy two constraints:
1. Pillar 4 (Universe Is the Clock): the environment should communicate signal, not just the HUD
2. Pillar 5 (Dread Over Difficulty): the display should create tension, not just inform

### HUD Element

A thin bar in the corner with color transitions and a zone label:

```
SIGNAL ██████████░░░░░░░░░░ PRESENCE
```

Color shifts: teal (GHOST) → blue (WHISPER) → amber (PRESENCE) → orange (BEACON) → red (FLARE) → glitching white (THRESHOLD).

The zone name only changes when you cross a boundary. Crossing a boundary could flash briefly.

### Environmental Feedback (More Important Than HUD)

| Signal Zone | Ship Visual | Fluid Visual | Audio |
|-------------|------------|-------------|-------|
| GHOST | Normal. Dim trail. | Normal | Calm ambient |
| WHISPER | Trail slightly longer | — | Faint tonal shift |
| PRESENCE | Trail brighter, longer | — | Low harmonic added to drone |
| BEACON | Glow/halo around ship | Warm color tint near ship | Signal choir begins |
| FLARE | Bright glow, long trail | ASCII chars near ship warm-shift | Choir builds, ship hums |
| THRESHOLD | Ship glitches | Fluid distortion (Inhibitor) | Everything changes |

The player should be able to mute the HUD and still know their approximate signal level from the ship's visual state. That's the test.

---

## CONFIG Section

```javascript
signal: {
    // Generation rates (per second for continuous, instant for spikes)
    thrustBaseRate: 0.005,          // signal/s at neutral flow alignment
    thrustOppositionMult: 2.0,      // max multiplier when thrusting against current
    lootSpikeT1: 0.06,
    lootSpikeT2: 0.10,
    lootSpikeT3: 0.18,
    pulseSpikeRate: 0.12,
    flareLaunchSpike: 0.04,
    collisionSpike: 0.08,
    extractionRate: 0.003,          // signal/s during portal extraction
    wellProximityRate: 0.002,       // signal/s when within wellProximityDist
    wellProximityDist: 0.30,        // world-units
    coastRate: 0.001,               // signal/s when stationary, no current

    // Decay rates (per second, subtracted from signal)
    decayBase: 0.025,               // open space drift
    decayWreckWake: 0.040,          // in wreck debris field
    decayAccretionShadow: 0.050,    // inside accretion disk
    decayDuringThrust: 0.000,       // no decay while thrusting
    decayDuringLoot: 0.000,         // no decay while looting

    // Thresholds
    ghostMax: 0.15,
    whisperMax: 0.35,
    presenceMax: 0.55,
    beaconMax: 0.75,
    flareMax: 0.90,
    // Above flareMax = THRESHOLD zone

    // Inhibitor
    inhibitorThresholdMin: 0.82,    // randomized per run [min, max]
    inhibitorThresholdMax: 0.98,
    inhibitorDriftSilent: 0.02,     // wu/s when player is quiet
    inhibitorDriftLight: 0.05,      // wu/s when player is lightly thrusting
    inhibitorDriftHeavy: 0.10,      // wu/s when player is thrusting hard
    inhibitorDriftFlare: 0.15,      // wu/s when player is in FLARE+
    inhibitorKillRadius: 0.08,      // world-units, instant death

    // Signal flare
    flareSignalBonus: 0.10,         // added to player's signal when flare spawns
    flareDecayMult: 0.5,            // flare decays at half normal rate
    flareDuration: 9.0,             // seconds
    flareMaxActive: 1,              // only one at a time

    // Multiplayer
    inhibitorUsePeakSignal: true,   // peak vs sum for Inhibitor trigger
}
```

---

## Implementation Sketch

### SignalSystem class

```
SignalSystem
├── update(dt, ship, flowField, wells, wrecks)
│   ├── calculateGeneration(ship, flowField)
│   ├── calculateDecay(ship, wells, wrecks)
│   ├── applyDelta(dt)
│   ├── checkThresholdCrossings()
│   └── updateInhibitor(dt)
├── getSignalLevel() → float
├── getSignalZone() → string
├── isInhibitorAwake() → bool
├── getInhibitorPosition() → {x, y} | null
└── CONFIG reference
```

**Dependencies:** flowField (for thrust-signal calculation), wells (for proximity and accretion shadow), wrecks (for wake masking), ship (for position, thrust vector).

**Integration points:**
- `scavengers.js`: reads player signal zone to adjust behavior
- `fauna.js` (future): reads player signal for attraction
- `hud.js`: reads signal level and zone for display
- `ship.js`: reports thrust vector and position
- `audio.js`: reads signal zone for audio layer mixing

Estimated size: ~200–250 lines for core signal. ~150 lines for Inhibitor entity. ~50 lines for flare.

---

## Open Decisions Summary

| Decision | Options | Recommendation | Status |
|----------|---------|---------------|--------|
| Inhibitor wake mechanic | A: Hard threshold / B: Probability ramp / C: Threshold + variance | C | **Decided: C** (2026-03-28) |
| Signal equipment | A: None / B: Shaping / C: Shaping with costs | C | **Decided: C** (2026-03-28) |
| Multiplayer signal visibility | A: Hidden / B: Visual cues / C: Exact numbers | B | **Decided: B** (2026-03-28). Note: requires fabric-layer per-entity glow — same surface as Inhibitor rendering |
| Signal decay curve | Linear (implemented above) / Exponential | Linear | Decided (rationale above) |
| Portal extraction signal | Low continuous (0.003/s, implemented above) | Low | Decided |
| Inhibitor drift model | Signal-proportional (implemented above) | As designed | Open to tuning |
| Signal flare interaction with Inhibitor | Flare draws Inhibitor if louder than player | As designed | Open to tuning |

---

## What This Document Does NOT Cover

- **Signal in the meta loop** — how between-run upgrades interact with signal. Deferred to progression design.
- **Signal in missions** — whether missions create signal objectives ("reach BEACON and survive for 10 seconds"). Deferred.
- **NPC faction signal** — whether NPC factions have their own signal models. Deferred.
- **Audio implementation details** — signal-responsive audio layers are specified in MUSIC.md.
- **Exact fauna behavior** — fauna response to signal thresholds needs its own design doc once fauna are specced.

---

## References

Research sources that informed this design:

**EVE Online:**
- [Directional Scanning — EVE University Wiki](https://wiki.eveuniversity.org/Directional_scanning)
- [Probe Scanning — EVE University Wiki](https://wiki.eveuniversity.org/Probe_scanning)
- [Signature Radius — EVE University Wiki](https://wiki.eveuniversity.org/Signature_radius)
- [Cloaking — EVE University Wiki](https://wiki.eveuniversity.org/Cloaking)
- [Living in Wormhole Space — EVE University Wiki](https://wiki.eveuniversity.org/Living_in_Wormhole_Space)
- [Propulsion Equipment — EVE University Wiki](https://wiki.eveuniversity.org/Propulsion_equipment)

**Stellaris:**
- [Intelligence — Stellaris Wiki](https://stellaris.paradoxwikis.com/Intelligence)
- [How to Use Cloaking — Game Rant](https://gamerant.com/stellaris-how-to-use-cloaking/)
- [Stellaris Dev Diary #289 — Hide and Seek](https://forum.paradoxplaza.com/forum/threads/stellaris-dev-diary-289-hide-and-seek.1571051/)
- [Intel and Infiltration in Stellaris Nemesis — Solar Cross Games](https://solarcrossgames.co.uk/stellaris/intel-and-infiltration-in-stellaris-nemesis/)
- [Stellaris: First Contact Cloaking Tech — CBR](https://www.cbr.com/stellaris-first-contact-cloaking-tech-paradox/)

**Stealth/Signal Design:**
- [Revisiting the AI of Alien: Isolation — Gamedeveloper](https://www.gamedeveloper.com/design/revisiting-the-ai-of-alien-isolation)
- [Seeing with your ears — the audio of Alien: Isolation — PC Gamer](https://www.pcgamer.com/the-audio-of-alien-isolation/)
- [Enemy Status — Metal Gear Wiki](https://metalgear.fandom.com/wiki/Enemy_status)
- [Light Meter — Darkest Dungeon Wiki](https://darkestdungeon.wiki.gg/wiki/Light_Meter)
- [The 4 Required Elements of Stealth Game Design — Gamedeveloper](https://www.gamedeveloper.com/design/the-4-required-elements-of-stealth-game-design)
- [Stealth Game Design — Game Design Skills](https://gamedesignskills.com/game-design/stealth/)
