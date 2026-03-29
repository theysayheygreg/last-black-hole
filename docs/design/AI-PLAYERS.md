# AI Players — The Adversarial Layer

> Solo is 1 human + 3-7 AI. Multiplayer replaces AI slots with humans. The game is always 4-8 players.

## Why AI Players, Not Smarter Scavengers

The existing scavenger system (782 lines) runs a stripped-down game loop: pick wreck → fly to wreck → loot → pick portal → extract. It's a script with physics. The decision space is three booleans: which wreck, which portal, am I near a well?

AI players run the FULL decision space:
- Signal management (thrust vs. drift, when the noise is worth it)
- Inventory triage (which items to keep, what to drop for better loot)
- Extraction timing (leave now with 4 items or stay for the vault wreck near the well?)
- Threat assessment (Inhibitor pressure, nearby players, active hazards)
- Engagement decisions (contest a wreck, steal a portal, pulse someone into a well)
- Consumable timing (when to pulse, when to flare, when to tether)

A scavenger taking a portal is a timer ticking down. An AI player taking a portal after weighing risk, reading the board, and deciding this was the right moment — that's adversarial. That's the extraction game.

## Architecture: Where AI Players Live

### Server-Side, Same as Scavengers

Codex's architecture already handles this. The server (`sim-runtime.js`) runs a 15 Hz tick loop that owns all entity physics and decisions. Scavengers already tick server-side at 0.8s decision intervals.

AI players live in the same tick loop. They're a new entity type in the server's world state — `runtime.mapState.aiPlayers[]` — with the same physics pipeline as human players but a decision system instead of network input.

```
sim-runtime.js tick loop (15 Hz)
├── tickPlayers()        ← human input from POST /input
├── tickAIPlayers()      ← AI decision system (NEW)
├── tickScavengers()     ← existing simple AI (active tier)
├── tickWells()
├── tickPortals()
├── tickWrecks()
└── ...
```

### Snapshot Transmission

AI players appear in the snapshot as player entries with an `isAI: true` flag:

```javascript
snapshot.players = [
  { clientId: 'human-1', name: 'Greg', isAI: false, wx, wy, vx, vy, cargo, ... },
  { clientId: 'ai-1', name: 'The Prospector', isAI: true, wx, wy, vx, vy, cargo, ... },
  { clientId: 'ai-2', name: 'Redline', isAI: true, wx, wy, vx, vy, cargo, ... },
  { clientId: 'ai-3', name: 'Duskwalker', isAI: true, wx, wy, vx, vy, cargo, ... },
];
```

The client renders AI players identically to human players. Same ship triangle, same thrust trail, same signal glow. You can't tell from looking. (In multiplayer, you literally can't tell who's human and who's AI. That's the point.)

### Multiplayer Slot Replacement

The server initializes N player slots (4-8, configured per map). On session start:
1. All slots are AI by default
2. As humans `POST /join`, they replace AI slots
3. If a human disconnects, their slot reverts to AI (optional — could also leave empty)
4. The game always has the configured number of active players

This means solo play isn't "single player mode" — it's multiplayer with all AI opponents. The experience scales naturally as real players join.

## The Player Entity: What AI Must Replicate

From the codebase, a "player" is:

**Physics state** (from Ship class):
- Position: `wx, wy` (world-space, toroidal 0-3)
- Velocity: `vx, vy` (world-units/sec)
- Facing: angle in radians
- Thrust intensity: 0-1 (analog, same as gamepad trigger)
- Brake intensity: 0-1

**Physics forces** (applied per tick):
- Thrust acceleration in facing direction
- Fluid coupling (lerp toward local flow velocity)
- Well gravity (inverse power falloff)
- Drag (base + brake)
- Toroidal wrapping

**Inventory** (from InventorySystem):
- 8 cargo slots
- 2 equipped slots (persistent artifacts)
- 2 consumable slots (hotbar)
- Drop queue, use queue

**Actions** (from input + combat):
- Thrust (direction + intensity)
- Brake
- Force pulse (radial push, cooldown)
- Use consumable (slot 1 or 2)
- Drop cargo item
- Equip/load from cargo

**What the AI must output each decision tick:**
```javascript
{
  facing: radians,          // where to point
  thrustIntensity: 0-1,     // how hard to thrust
  brakeIntensity: 0-1,      // how hard to brake
  pulse: boolean,           // fire force pulse this tick?
  useConsumable: null|0|1,  // use hotbar item?
  dropCargo: null|slotIndex,// drop an item?
}
```

That's it. The AI's entire output is the same shape as the input system's output. Everything else — physics, collision, extraction, death — is handled by the server tick loop identically for human and AI players.

## Decision Architecture

### The Three Timescales

AI decisions happen at three frequencies. This is important for both realism and performance.

**Reactive (every tick, 15 Hz):** Steering and immediate responses.
- Adjust facing toward current navigation target
- Brake if approaching well kill zone
- Fire pulse if about to die (emergency)
- These are simple: dot products, distance checks, threshold comparisons

**Tactical (every 0.5-1.0s):** Target selection and short-term plans.
- Which wreck to pursue?
- Which portal to target?
- Should I contest or avoid that other player?
- Am I in danger? Should I change plan?
- This is the main decision loop. Runs at 1-2 Hz.

**Strategic (every 3-5s):** Run-level assessment.
- How much loot do I have? Is it enough to extract?
- How much time is left? (Portal schedule, Inhibitor pressure)
- What's the risk profile of the board? (Well proximity, player positions, active threats)
- Should I shift from looting to extracting?
- This is slow evaluation. Runs at 0.2-0.3 Hz.

### Decision System Structure

```
AIPlayerController
│
├── Perception (what do I know?)
│   ├── nearbyEntities(range)     // wrecks, portals, players, active threats
│   ├── flowFieldSample(pos)      // fluid velocity at a point
│   ├── signalEstimate(player)    // guess another player's signal from trail
│   ├── inhibitorThreat()         // current Inhibitor form + distance
│   └── boardState()              // portal count, wreck count, time remaining
│
├── Evaluation (what should I want?)
│   ├── scoreWreck(wreck)         // value vs. risk vs. distance
│   ├── scorePortal(portal)       // safety vs. competition vs. lifespan
│   ├── scoreThreat(entity)       // danger vs. avoidability
│   ├── scoreEngagement(player)   // contest vs. avoid vs. follow
│   └── scoreExtraction()         // should I leave now?
│
├── Planning (what's my plan?)
│   ├── currentGoal               // LOOT, EXTRACT, EVADE, CONTEST, WAIT
│   ├── currentTarget             // specific wreck, portal, or player
│   ├── planHorizon               // how far ahead am I thinking (seconds)
│   └── reassess()                // should I change plans?
│
├── Navigation (how do I get there?)
│   ├── plotRoute(target)         // waypoints considering flow + hazards
│   ├── currentWaypoint           // immediate steering target
│   ├── useCurrents(target)       // can I ride flow toward this?
│   └── avoidZones()              // well kill zones, active threats, players
│
├── Engagement (how do I interact?)
│   ├── shouldContest(target)     // is this wreck/portal worth fighting for?
│   ├── shouldPulse()             // will a pulse help right now?
│   ├── shouldFlare()             // will a decoy help right now?
│   └── disengageThreshold()      // when to abandon a contest
│
└── Output
    ├── facing: radians
    ├── thrustIntensity: 0-1
    ├── brakeIntensity: 0-1
    ├── pulse: boolean
    ├── useConsumable: null|0|1
    └── dropCargo: null|slotIndex
```

### Perception: What AI Can See

AI players see the same information a human player can observe. No map hacks. No hidden state access.

**Always visible:**
- All wells (position, approximate mass from visual size)
- All portals (position, type, whether they're warning/critical)
- All wrecks within a radius (same as player sensor range, affected by sensor upgrade)
- All other players within a radius (ship visible, thrust trail visible)
- Own inventory, own signal level
- Flow field at own position and nearby sample points

**Observable but imprecise:**
- Other players' approximate signal level (from trail brightness/length — the visual cues decision)
- Wreck tier (from visual appearance — larger wrecks are higher tier, but exact loot is unknown until pickup)
- Active threat positions and behavior (sentries, wasps, etc.)
- Inhibitor state (form visible, but exact pressure is hidden)

**Hidden:**
- Other players' exact signal number
- Other players' cargo contents
- Other players' exact destination/intent
- Inhibitor threshold (hidden parameter — AI must infer from observed behavior)
- Wreck loot tables (AI doesn't know what's inside until it picks up)

This constraint is critical. The AI must infer and estimate, not read game state directly. This makes AI behavior look human — they make the same mistakes a player would make from incomplete information.

### Implementation Note: Perception Cheating Budget

Pure information-limited AI is expensive to implement perfectly. Pragmatic approach: give AI access to server state but add **noise and delay** to simulate imperfect perception.

```javascript
// AI can read wreck positions from server state (cheap)
// but adds noise to estimated value
estimatedValue(wreck) {
  const trueValue = wreck.loot.reduce((s, i) => s + i.value, 0);
  // ±30% noise, biased by distance (farther = less accurate)
  const noise = 1.0 + (rng() - 0.5) * 0.6 * (dist / maxSensorRange);
  return trueValue * noise;
}

// AI can see other players but with 0.5-1.0s position delay
// (simulates reaction time)
lastKnownPosition(player) {
  // Updated every 0.5-1.0s, not every tick
  return this.playerPositionCache[player.id];  // stale by design
}
```

This is cheaper than building a full perception pipeline, and the noise/delay creates naturalistic "mistakes" that make AI feel human. The AI occasionally misjudges a wreck's value, reacts late to a player's course change, or misreads the board. These mistakes are features, not bugs.

## Navigation: Current-Aware Movement

This is where AI players feel smart or feel like bots. The difference is fluid awareness.

### Dumb Navigation (what scavengers do now)
```
target = wreck position
facing = atan2(target.y - my.y, target.x - my.x)
thrust = 1.0
```
This works but looks robotic. The ship beelines through currents, fights the flow, generates tons of signal, and never surfs. No human plays like this.

### Smart Navigation (what AI players should do)

**Step 1: Sample the flow field.**
At decision time, sample fluid velocity at current position and at 4-8 points between here and target. Build a rough picture of the current field.

```javascript
// Sample flow at N points along the line to target
const samples = [];
for (let i = 0; i <= 6; i++) {
  const t = i / 6;
  const sx = lerp(my.wx, target.wx, t);
  const sy = lerp(my.wy, target.wy, t);
  samples.push(flowField.sample(sx, sy));
}
```

**Step 2: Evaluate current alignment.**
For each sample point, check: does the current flow toward my target? The dot product of flow velocity with the direction-to-target tells you.

```javascript
const toTarget = normalize(target - my.pos);
const alignment = dot(flowVel, toTarget);
// alignment > 0: current helps
// alignment < 0: current fights
// alignment ≈ 0: current is perpendicular
```

**Step 3: Route via favorable currents.**
If the direct path fights the current but a curved path rides it, take the curved path. This is the core surfing behavior.

In practice: instead of steering directly at the target, steer toward the nearest point where the current flows TOWARD the target. Then let the current carry you.

```javascript
// If current opposes, look for a lateral offset where flow helps
if (alignment < -0.2) {
  // Try offset positions perpendicular to the direct path
  const perp = { x: -toTarget.y, y: toTarget.x };
  const leftFlow = flowField.sample(my.wx + perp.x * 0.1, my.wy + perp.y * 0.1);
  const rightFlow = flowField.sample(my.wx - perp.x * 0.1, my.wy - perp.y * 0.1);
  const leftAlign = dot(leftFlow, toTarget);
  const rightAlign = dot(rightFlow, toTarget);

  // Steer toward the side with better alignment
  if (leftAlign > rightAlign && leftAlign > alignment) {
    steerTarget = { x: my.wx + perp.x * 0.15, y: my.wy + perp.y * 0.15 };
  } else if (rightAlign > alignment) {
    steerTarget = { x: my.wx - perp.x * 0.15, y: my.wy - perp.y * 0.15 };
  }
}
```

**Step 4: Modulate thrust intensity based on current.**
When the current is carrying you toward the target, reduce thrust. When fighting the current or in dead space, increase thrust. This is signal management.

```javascript
// Current alignment → thrust intensity
if (alignment > 0.5) {
  // Strong favorable current — coast
  thrustIntensity = personality.coastThrust;  // 0.0-0.2
} else if (alignment > 0.0) {
  // Weak favorable — light thrust to maintain
  thrustIntensity = personality.cruiseThrust;  // 0.2-0.5
} else {
  // Opposing or dead — thrust hard if target is high priority
  thrustIntensity = targetPriority * personality.maxThrust;  // 0.5-1.0
}
```

**Step 5: Toroidal awareness.**
The world wraps. Sometimes the shortest path to a target crosses the map boundary. AI must check both the direct and wrapped distances and take the shorter one.

```javascript
// Toroidal shortest path
let dx = target.wx - my.wx;
let dy = target.wy - my.wy;
if (dx > worldScale / 2) dx -= worldScale;
if (dx < -worldScale / 2) dx += worldScale;
if (dy > worldScale / 2) dy -= worldScale;
if (dy < -worldScale / 2) dy += worldScale;
```

### Navigation Quality by Personality

Not all AI players navigate equally well. This is a key personality differentiator.

| Personality | Flow Samples | Current Riding | Signal Discipline |
|-------------|-------------|----------------|-------------------|
| Prospector | 6 points | Good — prioritizes current-aligned routes | High — reduces thrust when possible |
| Raider | 3 points | Poor — often beelines through currents | Low — values speed over stealth |
| Vulture | 4 points | Moderate — follows other players' flow trails | Moderate — loud when striking, quiet when stalking |
| Ghost | 8 points | Excellent — almost never fights current | Very high — drifts more than thrusts |
| Desperado | 4 points | Moderate — good when calm, sloppy when rushed | Drops late-game — panics and beelines |

The number of flow samples directly affects route quality. More samples = smoother, more current-aware paths. Fewer samples = more direct, more robotic, louder.

## Evaluation: Scoring the Board

Every tactical decision (0.5-1.0s) re-scores the board. The AI picks the highest-scoring action.

### Wreck Scoring

```javascript
scoreWreck(wreck, personality) {
  if (wreck.looted) return -Infinity;

  const dist = toroidalDist(my.pos, wreck.pos);
  const estimatedValue = estimateWreckValue(wreck);  // noisy estimate from visual
  const wellDanger = nearestWellDanger(wreck.pos);    // 0-1, how close to a well
  const currentHelp = flowAlignmentTo(wreck.pos);     // -1 to 1, does current help?
  const competition = nearestPlayerDist(wreck.pos);   // is someone else heading there?
  const activeThreat = activeThreatNear(wreck.pos);   // sentries, eels, etc.

  let score = estimatedValue;

  // Distance penalty (personality-weighted)
  score -= dist * personality.distancePenalty;  // Prospector: high, Raider: low

  // Danger penalty
  score -= wellDanger * personality.dangerPenalty;  // Ghost: very high, Desperado: very low

  // Current bonus (signal-aware personalities value this more)
  score += currentHelp * personality.currentBonus;

  // Competition penalty (Vulture LIKES competition — follows others)
  score -= competition * personality.competitionPenalty;  // Vulture: negative penalty = bonus

  // Active threat penalty
  score -= activeThreat * personality.threatPenalty;

  return score;
}
```

### Portal Scoring

```javascript
scorePortal(portal, personality) {
  if (!portal.alive) return -Infinity;

  const dist = toroidalDist(my.pos, portal.pos);
  const timeLeft = portal.timeLeft(runTime);
  const type = portal.type;  // standard, unstable, rift
  const competition = playersHeadingToward(portal);  // count
  const blocked = isInhibitorBlocking(portal);       // Vessel nearby?

  let score = 100;  // base desire to extract

  // Can I reach it in time?
  const travelTime = estimateTravelTime(dist, currentHelp);
  if (travelTime > timeLeft - 3) score -= 200;  // probably can't make it

  // Portal type preference
  if (type === 'rift') score += 20;      // big capture radius, easier
  if (type === 'unstable') score -= 15;  // unreliable

  // Competition (more players heading there = harder)
  score -= competition * 30;

  // Inhibitor blocking
  if (blocked) score -= 500;  // don't go here

  // Cargo value amplifies extraction desire
  score += getCargoValue() * personality.extractionGreed;

  // Time pressure amplifies
  if (activePortalCount <= 2) score += 50;

  return score;
}
```

### Extraction Decision (Strategic)

The critical question: should I leave or should I stay?

```javascript
shouldExtract(personality) {
  const cargoValue = getCargoValue();
  const cargoCount = getCargoCount();
  const portalsRemaining = activePortalCount;
  const inhibitorForm = getInhibitorForm();
  const bestPortalScore = Math.max(...portals.map(p => scorePortal(p)));
  const bestWreckScore = Math.max(...wrecks.map(w => scoreWreck(w)));
  const runTimeRemaining = estimatedRunTime();

  // Personality extraction thresholds
  const minCargoToExtract = personality.minCargoValue;
  const panicPortalCount = personality.panicPortalCount;

  // Hard triggers (override personality)
  if (inhibitorForm >= 3) return true;           // Vessel is out — LEAVE
  if (portalsRemaining <= 1) return true;         // Last portal — LEAVE
  if (runTimeRemaining < 15) return true;         // Almost out of time — LEAVE

  // Soft triggers (personality-weighted)
  if (cargoValue >= minCargoToExtract && bestPortalScore > 30) return true;
  if (portalsRemaining <= panicPortalCount) return true;
  if (inhibitorForm >= 2 && cargoCount >= 3) return true;

  // Opportunity cost: is the best remaining wreck worth the risk?
  if (bestWreckScore < personality.minimumWreckScore) return true;  // nothing worth staying for

  return false;
}
```

### Engagement Decision

When another player is near the same target:

```javascript
shouldContest(otherPlayer, target, personality) {
  const myDist = toroidalDist(my.pos, target.pos);
  const theirDist = toroidalDist(otherPlayer.pos, target.pos);
  const iCloser = myDist < theirDist;
  const theirSignal = estimateSignal(otherPlayer);  // from visual cues
  const myPulseCooldown = combat.playerCooldown;

  // Can I beat them there?
  const arrivalAdvantage = theirDist - myDist;

  // Personality willingness to fight
  const aggression = personality.aggression;  // 0-1

  // Score engagement
  let contestScore = 0;
  contestScore += arrivalAdvantage * 10;        // distance advantage
  contestScore += (iCloser ? 20 : -20);         // binary closer bonus
  contestScore -= theirSignal * 30;             // loud players are dangerous (they're active)
  contestScore += aggression * 40;               // personality push
  if (myPulseCooldown <= 0) contestScore += 15;  // I have pulse ready

  // Vulture special: LIKES following other players
  if (personality.type === 'vulture') {
    contestScore += 30;  // always more willing to engage
  }

  // Ghost special: almost never contests
  if (personality.type === 'ghost') {
    contestScore -= 50;  // find another wreck
  }

  return contestScore > personality.contestThreshold;
}
```

## Personalities: The Catalog Within

Each personality is a weight table. Same decision code, different numbers. The decision system is personality-agnostic — it just reads weights.

### Weight Tables

```javascript
const PERSONALITIES = {
  prospector: {
    name: 'Prospector',
    description: 'Efficient, risk-averse, extracts early with modest haul',

    // Navigation
    flowSamples: 6,
    coastThrust: 0.05,      // barely thrust when current helps
    cruiseThrust: 0.3,
    maxThrust: 0.7,          // rarely full throttle

    // Wreck evaluation
    distancePenalty: 40,     // strongly prefers nearby wrecks
    dangerPenalty: 60,       // avoids wells
    currentBonus: 30,        // values current-aligned wrecks
    competitionPenalty: 25,  // avoids contested wrecks
    threatPenalty: 35,       // avoids active threats

    // Extraction
    minCargoValue: 150,      // extracts with modest haul
    panicPortalCount: 3,     // starts panicking early
    extractionGreed: 0.5,    // cargo value moderately boosts extract desire
    minimumWreckScore: 20,   // low bar = leaves when pickings get slim

    // Engagement
    aggression: 0.15,        // almost never contests
    contestThreshold: 40,    // high bar to engage

    // Signal
    signalTolerance: 0.45,   // starts worrying at PRESENCE

    // Strategic
    lootTargetRange: [3, 5], // aims for 3-5 items before extracting
    riskHorizon: 30,         // thinks 30 seconds ahead
  },

  raider: {
    name: 'Raider',
    description: 'Aggressive, targets high-value wrecks, willing to fight the current',

    flowSamples: 3,
    coastThrust: 0.2,
    cruiseThrust: 0.6,
    maxThrust: 1.0,          // full throttle when competing

    distancePenalty: 15,     // will travel far for good wrecks
    dangerPenalty: 20,       // tolerates well proximity
    currentBonus: 10,        // doesn't care much about current alignment
    competitionPenalty: 5,   // barely cares if contested
    threatPenalty: 15,       // pushes through active threats

    minCargoValue: 350,      // wants a big haul
    panicPortalCount: 2,     // only panics when 1 portal left
    extractionGreed: 0.8,    // cargo value strongly boosts extract desire
    minimumWreckScore: 40,   // high bar = stays hunting longer

    aggression: 0.75,        // frequently contests
    contestThreshold: 10,    // low bar to engage

    signalTolerance: 0.70,   // comfortable into BEACON

    lootTargetRange: [5, 8],
    riskHorizon: 15,         // short-term thinker
  },

  vulture: {
    name: 'Vulture',
    description: 'Reactive, follows other players, strikes after they do the hard work',

    flowSamples: 4,
    coastThrust: 0.1,
    cruiseThrust: 0.35,
    maxThrust: 0.9,          // bursts when striking

    distancePenalty: 20,
    dangerPenalty: 35,
    currentBonus: 15,
    competitionPenalty: -15,  // NEGATIVE = prefers contested targets (follows others)
    threatPenalty: 10,        // lets others trigger threats first

    minCargoValue: 200,
    panicPortalCount: 2,
    extractionGreed: 0.6,
    minimumWreckScore: 15,

    aggression: 0.6,
    contestThreshold: 5,     // very willing to contest AFTER others clear the way

    signalTolerance: 0.55,

    lootTargetRange: [3, 6],
    riskHorizon: 20,

    // Vulture-specific: following behavior
    followDistance: 0.4,      // wu — trail distance when shadowing
    followDuration: 15,       // seconds before giving up and doing own thing
    strikeTrigger: 0.15,     // wu — close enough to swoop on a wreck they cleared
  },

  ghost: {
    name: 'Ghost',
    description: 'Stealth-focused, barely thrusts, takes what the current offers',

    flowSamples: 8,
    coastThrust: 0.0,        // pure drift when current helps
    cruiseThrust: 0.15,
    maxThrust: 0.5,          // never full throttle

    distancePenalty: 50,     // ONLY pursues very nearby targets
    dangerPenalty: 80,       // extremely well-averse
    currentBonus: 50,        // heavily values current-aligned targets
    competitionPenalty: 40,  // avoids all competition
    threatPenalty: 60,       // avoids all active threats

    minCargoValue: 80,       // extracts with almost anything
    panicPortalCount: 3,
    extractionGreed: 0.3,
    minimumWreckScore: 5,    // extracts when nothing is easy

    aggression: 0.05,        // almost never engages
    contestThreshold: 80,    // effectively never contests

    signalTolerance: 0.25,   // worries at WHISPER

    lootTargetRange: [2, 4],
    riskHorizon: 45,         // long-term thinker, patient
  },

  desperado: {
    name: 'Desperado',
    description: 'Late-extract daredevil, stays too long, bets everything on one last run',

    flowSamples: 4,
    coastThrust: 0.15,
    cruiseThrust: 0.5,
    maxThrust: 1.0,

    distancePenalty: 10,     // will cross the map
    dangerPenalty: 10,       // barely afraid of wells
    currentBonus: 15,
    competitionPenalty: 15,
    threatPenalty: 10,

    minCargoValue: 500,      // wants a MASSIVE haul
    panicPortalCount: 1,     // only panics at the absolute last portal
    extractionGreed: 1.0,    // cargo value is everything
    minimumWreckScore: 60,   // keeps hunting even when it's dangerous

    aggression: 0.5,
    contestThreshold: 20,

    signalTolerance: 0.80,   // comfortable deep into FLARE

    lootTargetRange: [6, 8],
    riskHorizon: 8,          // barely looks ahead — lives in the moment

    // Desperado-specific: panic mode
    panicThrustMult: 1.5,    // when finally extracting, FULL SEND
    panicFlowSamples: 2,     // stops reading currents in panic
  },
};
```

### Personality Tells

Players should be able to identify AI personalities from observable behavior:

| Personality | Thrust Trail | Route Shape | Signal Level | Timing |
|-------------|-------------|-------------|-------------|--------|
| Prospector | Short, intermittent | Smooth curves along currents | Low-moderate | Extracts mid-run |
| Raider | Long, bright, constant | Straight lines through currents | High | Extracts late or dies |
| Vulture | Quiet, then sudden bursts | Follows other ships at distance | Spiky — quiet then loud | Extracts after others loot |
| Ghost | Almost invisible | Matches current flow exactly | Very low | Extracts early, small haul |
| Desperado | Moderate, then frantic | Efficient early, erratic late | Rises steadily | Extracts at the last second or dies |

A veteran player sees a faint trail shadowing them and thinks "Vulture." Sees a ship blasting straight at a vault wreck near a well and thinks "Raider or Desperado." Sees nothing for 2 minutes and then a small ship slips into a portal with 3 items and thinks "Ghost was here the whole time." These reads are part of the game.

## Engagement: Non-Lethal Competition

From COMBAT.md: no lethal weapons. AI players compete through:

### Portal Racing
Both heading for the same portal. The faster ship (or the one with better current alignment) gets there first. Portal is consumed. Loser needs a new plan.

AI engagement logic: if another player is heading for the same portal and I'm behind, do I:
- Speed up (costs signal, might still lose)?
- Divert to another portal (safer but longer)?
- Pulse them away from the portal and take it?

### Wreck Competition
Both heading for the same wreck. First to arrive starts looting. Partial loot means both can get some.

AI logic: if someone is already at the wreck:
- Raider: pulse them away, grab what's left
- Vulture: wait nearby, grab scraps after they leave
- Ghost: find a different wreck
- Prospector: check if there's an uncontested wreck nearby

### Force Pulse Shoving
The pulse doesn't damage — it MOVES. Tactical uses:
- Shove a player into a well's gravity field (potential kill, but indirect)
- Shove a player away from a wreck/portal you want
- Shove active threats (sentries) into a player's path
- Emergency escape when someone is too close

AI pulse decision: `shouldPulse()` considers:
- Will this pulse move them into danger?
- Will this pulse clear my path to a target?
- Am I on cooldown?
- Signal cost of pulsing (+0.12) — is it worth the noise?

### Signal Flare Misdirection
Deploy a decoy that draws active threats and Inhibitor attention. Advanced tactic: drop a flare near another player to attract threats to THEM.

AI flare decision: only Vulture and Desperado personalities use flares offensively. Others use flares defensively (draw threats away from self).

## Run Arc: How an AI Player's Game Unfolds

A typical AI Raider run:

```
0:00  — Spawn at map edge. Scan board. Identify 3 high-value wrecks.
0:15  — Ride current toward nearest high-value wreck. Moderate thrust.
0:40  — Arrive at wreck. Loot 3 items (salvage, component, artifact).
0:55  — Signal at WHISPER. Spot another wreck 0.5 wu away, against current.
1:00  — Decide: wreck is T2, worth it. Thrust against current. Signal spikes.
1:30  — Arrive. Loot 2 more items. Signal at PRESENCE. Ambient blooms thickening.
1:45  — Strategic check: 5 items, 3 portals active, no Inhibitor. Keep going.
2:00  — Spot a vault wreck near a well. Very high value. Sentries patrolling.
2:10  — Approach. Sentry lunges. Pulse it away. Signal spikes to BEACON.
2:15  — Loot vault wreck: rare artifact, 2 uncommon salvage. 8 items total.
2:30  — Strategic check: 8 items, good haul. But cargo nearly full. 2 portals left.
2:35  — Drop lowest-value item to make room for potential upgrades.
2:40  — Head for nearest portal. Another player heading there too.
2:50  — Contest decision: I'm closer, I have pulse. Race.
3:00  — Arrive at portal first. Extract. 7 items, ~400 value. Good run.
```

A typical AI Ghost run:

```
0:00  — Spawn. Drift with current. No thrust. Read the flow.
0:30  — Current carries me past a T1 wreck. Pick up 2 items silently.
1:00  — Signal: barely WHISPER. Blooms thin. Nobody notices me.
1:30  — Current bends toward a well. Gentle thrust to avoid. +0.01 signal.
2:00  — Find another wreck on the current path. 1 item. 3 total.
2:30  — Portal nearby. No competition. Extract now?
         Strategic check: cargo value only 90. But 3 portals still active.
         Ghost personality: minCargoValue is 80. 90 > 80. Extract.
2:40  — Drift into portal. Extract. 3 items, 90 value. Survival is the win.
```

## Identity: Names and Presentation

AI players need names that feel like real handles, not bot labels.

### Name Generation

Each personality has a naming pool that reflects their character:

**Prospectors:** practical, professional
- "Steady Hand", "Long Haul", "Iron Keel", "Patient Run", "Clearwater"

**Raiders:** aggressive, bold
- "Redline", "Breach Point", "Hammer Down", "No Quarter", "Firestorm"

**Vultures:** ominous, patient
- "Duskwalker", "Still Water", "Afterglow", "Lastlight", "Echo"

**Ghosts:** barely there
- "—" (em dash), "...", "Nil", "0", "Whisper"

**Desperados:** reckless, flashy
- "Double Down", "All In", "Last Call", "One More", "Jackpot"

Ghost names are intentionally cryptic — a player named "..." extracting with 2 items reinforces the personality's minimal presence.

### Events Log

AI player actions appear in the events log the same as player actions would:

```
Redline looted Derelict Kappa-7
Duskwalker is heading for EXIT-A
... extracted with 2 items
Double Down entered the accretion zone
Steady Hand looted Vault of the Ascending Chorus
```

These events give human players information to act on. "Redline is looting near well #3" means "that area is contested." "... extracted" means "I didn't even know they were here."

## Performance Budget

### Server-Side (sim-runtime.js)

AI decision tick: 1-2 Hz per AI player (0.5-1.0s intervals, staggered).

Per decision tick:
- Flow field sampling: 3-8 samples × `flowField.sample()` — each sample is a texture readback or cached value
- Entity distance calculations: ~20 (wrecks + portals + players) × toroidal distance
- Score evaluation: 20 `scoreWreck()` + 5 `scorePortal()` + 3 `scoreEngagement()` calls
- Navigation route: 4-8 flow samples for path planning

Total per AI decision tick: ~100 distance calcs + ~30 score evals + ~8 flow samples.
At 3 AI × 2 Hz = 6 decision ticks/second. Negligible compared to physics tick cost.

### Client-Side

Zero. AI players render as ship triangles + trails. Same as human players. The client doesn't know or care that they're AI.

### Flow Field Access

The big question: can the server-side AI sample the flow field?

**Option A: Server runs a low-res flow sim.** Full GPU sim is client-side only. Server could run a simplified 32×32 or 64×64 CPU-based flow approximation for AI navigation. Cheaper but less accurate.

**Option B: Bake flow field snapshots.** Every N seconds, the client uploads a flow field snapshot that the server caches. AI reads from the cached snapshot. Adds network traffic but preserves accuracy.

**Option C: Analytical flow model.** No flow sim on the server. Instead, compute flow analytically from well positions: `flow ≈ tangential_component(gravity_vector) × orbital_strength`. This gives a rough "which way does the current flow here?" without simulating anything. Good enough for AI navigation — they don't need exact velocity, just direction.

**Recommendation: Option C for v1.** Analytical flow from well positions is free (no GPU, no upload, no sim), runs on the server trivially, and gives AI enough information to make current-aware decisions. Upgrade to A or B later if AI navigation quality needs it.

```javascript
// Analytical flow estimate from well positions
function estimateFlow(wx, wy, wells) {
  let fx = 0, fy = 0;
  for (const well of wells) {
    let dx = well.wx - wx, dy = well.wy - wy;
    // toroidal
    if (dx > worldScale/2) dx -= worldScale;
    if (dx < -worldScale/2) dx += worldScale;
    if (dy > worldScale/2) dy -= worldScale;
    if (dy < -worldScale/2) dy += worldScale;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < 0.001) continue;
    const strength = well.mass / Math.pow(dist, 1.5);
    // tangential component (perpendicular to radial, in orbital direction)
    const tx = -dy / dist * well.orbitalDir;
    const ty = dx / dist * well.orbitalDir;
    fx += tx * strength * 0.3;  // scale to approximate real flow magnitude
    fy += ty * strength * 0.3;
  }
  return { x: fx, y: fy };
}
```

## Build Order

### Phase 1: Foundation (~300 lines)
1. **AIPlayer class** — wraps Ship instance + personality weights + decision state
2. **Server integration** — `tickAIPlayers()` in sim-runtime.js, spawn at run start
3. **Snapshot inclusion** — AI players in `snapshot.players[]` with `isAI: true`
4. **Client rendering** — render AI ships identically to human ships (already works if they're in players array)
5. **Verify:** 3 AI ships visible on map, moving with physics, extractable

### Phase 2: Basic Decisions (~200 lines)
6. **Perception** — entity scanning within sensor range, toroidal distance
7. **Wreck scoring** — pick best wreck, navigate toward it, loot on arrival
8. **Portal scoring** — pick best portal, navigate toward it, extract on arrival
9. **Extraction decision** — leave when cargo threshold met or portals running out
10. **Verify:** AI players loot wrecks and extract through portals, feel like basic opponents

### Phase 3: Navigation Intelligence (~150 lines)
11. **Analytical flow model** — `estimateFlow()` from well positions
12. **Current-aware routing** — steer toward favorable currents, modulate thrust
13. **Well avoidance** — brake/reroute when approaching kill zone
14. **Verify:** AI ships surf currents visibly, generate less signal when riding flow

### Phase 4: Engagement (~150 lines)
15. **Player awareness** — track other player positions (with delay/noise)
16. **Contest decisions** — engage or avoid based on personality
17. **Pulse usage** — tactical force pulse (shove from wreck, shove toward well)
18. **Portal racing** — accelerate when competing for same portal
19. **Verify:** AI players interact with human player — contests at wrecks, portal races

### Phase 5: Personality Differentiation (~100 lines)
20. **Weight table implementation** — all 5 personality types with distinct weights
21. **Name generation** — personality-appropriate callsigns
22. **Events log integration** — AI actions visible in game events
23. **Observable tells** — thrust trail intensity/length varies by personality
24. **Verify:** each personality plays visibly differently, identifiable from behavior

### Phase 6: Advanced Behaviors (~200 lines)
25. **Inventory management** — drop low-value items for better loot
26. **Consumable usage** — signal flare deployment, tether usage
27. **Vulture following** — shadow other players, swoop after they clear threats
28. **Desperado panic** — late-game behavioral shift (worse navigation, higher thrust)
29. **Inhibitor response** — flee behavior, route changes, extraction urgency
30. **Verify:** AI players feel like real opponents with distinct stories

### Total Estimated: ~1100 lines

Broken across:
- `scripts/ai-player.js` — AIPlayerController class, personalities, decision logic (~700 lines)
- `scripts/sim-runtime.js` — tickAIPlayers() integration, spawn logic (+150 lines)
- `scripts/sim-protocol.js` — snapshot schema updates (+20 lines)
- `src/main.js` — client-side rendering of AI players (+30 lines)

## What This Doesn't Cover

- **AI learning / adaptation** — AI doesn't learn from past runs or adjust to player skill. Personality weights are fixed. Adaptive AI is a future consideration.
- **AI communication** — AI players don't talk (no chat, no emotes). Their behavior IS their communication.
- **Squad AI** — AI players are solo. Coordinated AI teams are a multiplayer feature.
- **AI loadout from meta-game** — AI players get a generated loadout per personality, not from a profile system. Meta-game progression is human-only for now.
- **AI cheating detection** — in multiplayer, distinguishing human from AI isn't a concern (they're on the same team / same server). Anti-cheat is a separate problem.
- **Difficulty scaling** — AI personalities don't adjust to player skill. The mix of personalities per seed IS the difficulty variance. A game with 2 Raiders and a Desperado is harder than one with 2 Ghosts and a Prospector.
