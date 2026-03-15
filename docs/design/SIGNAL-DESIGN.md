# Signal Design: The Core Risk/Reward System

> Signal is not a resource you spend. It's a consequence of playing the game.

---

## The Tarkov/Marathon Insight

In Tarkov, noise doesn't have an upside. Shooting a gun is loud — that's bad. But the ACTION of shooting has upside: you kill the enemy, you get their loot, you secure the area. The noise is a tax on doing valuable things, not a currency that buys capability.

This is how signal should work in Last Black Hole:

**Signal is the tax on ambition.**

Every action worth doing creates signal. The question is never "should I generate signal?" — it's "is the thing I'm doing worth the signal it costs?"

---

## What Generates Signal

| Action | Signal Level | Why You Do It Anyway |
|--------|-------------|---------------------|
| Thrusting | Low (continuous) | You have to move to play the game |
| Thrusting against current | Medium | Sometimes you need to go where the flow doesn't want you to go |
| Looting a wreck | Medium spike | The whole point of being here |
| Looting a core wreck | High spike | Best loot in the universe |
| Force pulse (if added) | High spike | Emergency escape or tactical play |
| Collision with fauna | Medium spike | Involuntary — you got sloppy |
| Extracting through portal | Low sustained | You're leaving — signal matters less now |

| Action | Signal Level | Why It's Interesting |
|--------|-------------|---------------------|
| Drifting with current | Near-zero | You're silent but you go where the flow takes you |
| Drifting in a wreck wake | Near-zero | Sheltered, but you're stuck near one spot |
| Hiding in an accretion disk | Near-zero (masked by well radiation) | You're invisible but in a death spiral |
| Coasting on a wave crest | Very low | Surfing is quiet — skill is rewarded with stealth |

**Key design principle:** Skilled movement (surfing, riding currents, using wreck wakes) is QUIET. Unskilled movement (fighting the current, brute-force thrusting) is LOUD. The game teaches you to surf by punishing you for not surfing.

---

## What Signal Does

Signal doesn't buy you anything. Signal attracts consequences.

### Signal Gradient (0-100%)

```
0-15%    GHOST
         Nobody knows you're here.
         Fauna ignore you.
         You're invisible.

15-35%   WHISPER
         Fauna begin orienting toward you.
         Nearby scavengers become aware of your general area.
         You're a blip.

35-55%   PRESENCE
         Fauna actively move toward you.
         Scavengers can track your position.
         Aggressive scavengers may engage.
         You're a signal source.

55-75%   BEACON
         Fauna swarm.
         All scavengers know exactly where you are.
         You can't sneak up on anything.
         You're broadcasting.

75-90%   FLARE
         Everything in the universe is aware of you.
         Scavengers either flee or attack — no more passive behavior.
         You're screaming.

90-100%  THRESHOLD
         The Inhibitor wakes.
         Irreversible.
         You are seen.
```

### Signal Decay

Signal decays naturally when you're not generating it:
- **Passive decay rate:** ~2-3% per second when drifting silently
- **Accelerated decay:** in wreck wakes or gravity well radiation shadows (masked)
- **No decay:** while actively thrusting or looting

This means signal is forgiving IF you have the discipline to go quiet. A spike from looting a wreck drops to safe levels in 5-10 seconds of drifting. But if you loot, then thrust, then loot, then thrust — it ratchets up without ever having time to decay.

---

## The Interesting Decisions

### 1. "Do I loot this wreck or keep moving?"
Looting spikes signal. But loot is why you're here. The wreck near the gravity well has better loot but it takes more signal to reach (fighting the current) and more to escape.

### 2. "Do I take the efficient route or the safe route?"
The efficient route goes against the current — loud. The safe route rides the current around — quiet but slow. Slow means portals are evaporating.

### 3. "Do I go for the core wreck?"
Core wrecks are near gravity wells. Getting there means fighting strong currents (high signal). Looting generates a big spike. Getting out means catching an outbound wave or burning massive thrust. The reward is the best loot. The cost is potentially waking the Inhibitor.

### 4. "The Inhibitor is awake. Do I run or hide?"
Running means thrusting — which means signal — which means the Inhibitor tracks you. Hiding means drifting — which means going wherever the fluid takes you, which might be TOWARD a gravity well. The safest move (silence) and the survivable move (escape to portal) are in direct tension.

### 5. "That scavenger is heading for my portal."
Do you race them (loud, fast) or drift toward a different portal (quiet, but is it still there)? In multiplayer: do you trust the other player to go for a different exit, or do you both sprint for the same one?

---

## Signal in Multiplayer (2-3 Players)

Signal is per-player but consequences are shared.

- Each player has their own signal level
- Fauna respond to the nearest high-signal source
- The Inhibitor threshold is based on **peak** player signal, not sum

**Why peak, not sum:** Sum would mean three quiet players are as dangerous as one loud player. That punishes coordinated play. Peak means one reckless player endangers everyone — which creates the social dynamic Greg wants. "Who's being noisy?" "Not me." "SOMEONE woke it."

**What this creates:**
- Coordinated stealth runs — everyone drifts in formation, loots systematically
- Designating a "scout" who goes loud while others stay quiet
- Blame and consequence when someone messes up
- The question of whether to extract early and leave your co-players in a universe that's getting more dangerous

---

## Signal as Game Feel

The HUD shows signal as a bar with color transitions:

```
[████████████░░░░░░░░] 58% — PRESENCE
```

But more importantly, signal should be FELT:

### Visual Feedback
- Your ship's thruster trail gets brighter/longer with higher signal
- At high signal: subtle glow/halo around your ship (you're a beacon)
- The ASCII characters near your ship shift toward warmer colors at high signal
- At threshold: your ship's character representation starts glitching

### Audio Feedback
- The signal choir from MUSIC.md — ethereal shimmer at low, claustrophobic at high
- At PRESENCE level: a subtle tonal shift in the ambient drone
- At BEACON level: the ambient takes on a warning character
- At FLARE level: you can hear yourself. Other players can hear you. Directional audio cue.

### Control Feedback
- No change. The ship always handles the same. Signal doesn't degrade your capability — that would double-punish. The universe responds to your signal, but your agency stays intact.

---

## What This Design Does NOT Do

- **Signal does not buy capability.** Forge suggested high signal → better scans, wider loot radius, etc. We're going a different direction: signal is ALWAYS a cost, never a resource. The upside comes from the ACTIONS that generate signal, not from the signal itself. This is cleaner and more intuitive.
- **Signal does not have a "sweet spot" to maintain.** It's not like you want to be at 40% for optimal play. You want to be as low as possible, always. The game is about how low you can stay while still doing the things you came to do.
- **Signal doesn't create loadout decisions.** No "signal dampening" upgrade that lets you be loud for free. That would collapse the core tension. (Maybe post-jam: dampening that slows signal RISE but doesn't prevent it.)

---

## Open Questions

1. **Exact signal values per action** — need playtesting. The percentages above are starting points.
2. **Signal decay curve** — linear? Exponential? Exponential feels better (fast initial decay, slow tail) but needs testing.
3. **Inhibitor threshold variance** — randomized per run (±10%)? Or fixed? Random adds uncertainty which is good for tension but bad for learning the system.
4. **Should you be able to see other players' signal levels?** Knowing who's being loud is useful for coordination but removes mystery. Maybe: you can hear them (directional audio scales with their signal) but can't see a number.
5. **Portal extraction signal** — should extracting be loud or quiet? Loud means you're committed and vulnerable. Quiet means extraction is "free" once you reach the portal. Loud is more interesting but might be frustrating.
