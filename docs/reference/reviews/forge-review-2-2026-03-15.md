# Forge Review #2 — 2026-03-15

## Verdict

The plan is much better than it was yesterday. It is more deliberate, the testing story is stronger, and the team has actually responded to the earlier review instead of just arguing with it.

The remaining danger is not that the game is underdesigned. The danger is that Monday night is still trying to prove too many foundations at once.

The good news is that this is now fixable with discipline rather than redesign.

## Showstoppers

### 1. Monday night is still overloaded

You have five things fighting for the same ten-hour window:
- N1a single-sim prototype
- N1b dual-solver prototype
- N3 ASCII pass
- N2 dev panel
- N0 test harness

That is too much if you expect all five to land well.

The parallel experiment itself is fine. The problem is trying to fully support the experiment, the visual identity, the tuning infrastructure, and the automated harness in the same first night.

If two strong agents are running, the likely failure mode is not "nothing works." The likely failure mode is "everything exists, but nothing is settled enough to judge cleanly Tuesday morning."

### 2. The dual-solver experiment still needs a kill rule

"Run it twice" is a good pillar. It is not a blank check.

Right now the plan says compare Tuesday morning and pick a winner. That is good. But it does not state the kill rule strongly enough.

If the dual-solver build is not clearly better in feel by Tuesday morning, kill it immediately.

Not "keep it around as an option." Not "merge the good bits." Kill it.

The jam cannot afford architectural sentimentalism.

### 3. Signal still does not have a defined upside contingency

You recognized the risk correctly, but the current answer is still "we’ll see Wednesday." That is too late unless the pivot is already designed.

A contingency that only exists as a thought is not a contingency. It needs to be specified now so Wednesday can become implementation instead of debate.

## Risks

### 1. The dev panel may balloon

The dev panel is the right call. I agree with making it mandatory early. But it is at risk of becoming a mini-editor when what you really need Monday is just live tuning.

The first version should be blunt and ugly. Sliders, toggles, copy config, reset. That is enough.

Presets, localStorage management, fancy grouping, and polished UI are all second-pass luxuries.

### 2. The test harness may be slightly overbuilt for day one

The idea is right. I agree with the philosophy: Greg should spend time judging feel, not checking whether the page loads.

But 690 lines of testing infrastructure is only worth it if it stays thin and focused. If it starts becoming an engine of its own, you lose the margin you are trying to create.

Smoke tests and a few physics checks are enough Monday. The full stack should grow only when the game has something worth guarding.

### 3. Control affordances may stack into mush

Individually, the assists are thoughtful. Together, they may blur the game’s physical honesty.

Wave magnetism, well shoulder assist, near-miss correction, counter-steer damping, beginner drift guard — that is a lot of invisible hands on the wheel.

The risk is not "too easy." The risk is that the player cannot form a clear mental model of why the ship moved the way it did.

### 4. "Art Is Product" can be misread as "polish first"

The ASCII layer belongs early. I agree.

But the reason it belongs early is not polish. It belongs early because it changes readability, movement perception, and the whole feel of the game. That distinction matters.

If the team starts treating every visual flourish as "product," Monday and Tuesday will get buried.

## Opportunities

### 1. The dev panel can become the center of the whole week

This is the smartest new addition.

If you keep it lean, it becomes the shared language between Greg, Orrery, Orb, and the implementation agents. It turns feel into numbers quickly. That is exactly what a jam team needs.

### 2. The test API is worth it if it stays narrow

I do not think `window.__TEST_API` is a problem as long as it stays a thin inspection/mutation seam. It should not become a second engine API.

Put it behind a `DEBUG` or `TESTING` guard if that is easy. If not, keep it tiny and move on.

### 3. The controls docs are now detailed enough to prevent random tuning thrash

That is good. It means Monday tuning can be intentional instead of vibes-only. But you should still treat half the assist values as provisional until someone actually touches the build.

## Recommendations

### Recommendation 1: Monday night priority ranking

If the team can only finish three of the five Monday-night tasks, the ranking should be:

1. **N1a — single-sim prototype**
2. **N2 — dev panel**
3. **N3 — ASCII pass**

After that:
4. **N0 — smoke + minimal physics tests**
5. **N1b — dual-solver experiment**

That is my order for one reason: Tuesday morning must produce a build that Greg can actually judge.

A surfable single-sim build with live tuning and the real visual language is more valuable than a clever dual-solver prototype with no margin around it.

If two agents are available, yes, let one pursue N1b. But if time collapses, N1b is the first thing I would let degrade or die.

### Recommendation 2: Tuesday fallback if both prototypes feel wrong

The fallback should be explicit.

If both prototypes feel wrong Tuesday morning:
- choose the simpler one anyway, which is almost certainly Approach A
- cut all new feature work for the day
- spend Tuesday only on movement tuning, wave readability, and well danger
- do not proceed to Layer 1 until the movement fantasy is alive

A game jam can survive a lost day. It cannot survive building five layers on top of bad movement.

### Recommendation 3: Signal contingency spec

If signal-as-tax fails Wednesday, the simplest upside mechanic is:

**High signal briefly improves wreck detection and loot reach.**

Concrete spec:
- above 50% signal, nearby unrevealed wrecks get a faint highlight pulse
- above 70% signal, loot pickup radius increases by 20-30%
- above 85% signal, portal direction certainty improves or nearest unstable portal pulses brighter

That gives signal a clear upside without inventing a whole second economy. It stays in-theme: you are louder, so the universe notices you more — but you also notice more back.

If you want an even simpler version, use only one of those:

**Signal increases loot pickup radius.**

That is ugly, but it is fast to implement and easy to understand.

### Recommendation 4: Keep the dev panel, but cut it to the bone on Monday

The mandatory Monday version should include only:
- the central physics sliders
- ASCII cell size / color controls
- show/hide debug overlays
- copy config
- reset

I would cut presets and localStorage on Monday unless they come almost free.

### Recommendation 5: Keep the test harness, but ship the thin slice first

Monday only needs:
- page loads
- no JS errors
- FPS above floor
- ship moves on thrust
- ship drifts when thrust stops
- well pull exists

That is enough.

Do not build the whole testing cathedral Monday night.

### Recommendation 6: Start with binary thrust if distance-thrust is not instantly legible

My gut says distance-modulated thrust is interesting, but it also risks adding complexity before the player understands the physics.

So the practical rule should be:
- if Model 1 feels obvious in the first 5 minutes, keep it
- if it feels confusing, fall back to binary thrust immediately and revisit modulation later

Do not die on the hill of the fancier mouse model.

### Recommendation 7: Cut DualSense ambition hard

For the jam, basic controller input is fine if it comes for free. Adaptive triggers and haptics are not jam-critical. They are post-jam candy.

Do not spend real jam hours there unless everything core is already working.

## Control Affordance Read

### Wave magnetism

The numbers sound plausible, but I would start weaker than the current emotional temptation suggests.

A ±15° catch window with 10% lock strength is fine as a starting point. The critical thing is that the player should still feel like they caught the wave, not that the game snapped them onto it.

### Well escape assist

A soft shoulder is fine. A strong shoulder will ruin the dread.

I would keep this subtle and visible. If the player is being helped, they should be able to sense the band where the help exists.

### Near-miss correction

This is useful for portals and probably too generous for everything else. I would keep portal help stronger than wreck help. That supports the extraction fantasy without making the world feel sticky.

### Counter-steer damping

Viable, but dangerous. This is the sort of assist that can make motion feel "mysteriously mushy" if overdone. Start conservative.

### Turn speed curve

This sounds directionally correct. The risk is not the curve itself. The risk is stacking it with too many other invisible assists.

### Beginner drift guard

I would cut this first if the ship starts feeling over-managed.

It is a kindness feature, but it is not central. The well shoulder already buys you some grace.

## One thing to cut now

If I get to cut exactly one planned thing to buy margin, I cut:

**the Monday-night requirement that both prototypes plus the dev panel plus the ASCII pass plus the test harness all land as peer goals.**

More concretely: I demote the dual-solver prototype from "must complete" to "parallel experiment only if margin exists."

That is the cleanest margin buy in the whole plan.

## What may bite you Wednesday

Two things.

First, the game may feel visually impressive but physically ambiguous. The ASCII layer could make current direction and wave shape harder to read than the smooth fluid does. If that happens, you need stronger directional cues or cleaner ship/wave contrast, not just prettier characters.

Second, signal may still teach players to act timidly. If Wednesday’s playtest says "the optimal move is to do less," you should pivot immediately to the upside contingency and not waste time philosophizing about it.

## Final call

The plan is now strong enough to start.

But the winning version of this week is still the same as yesterday:
make one physically legible, visually striking, terrifyingly pressured game loop work before you chase completeness.

If the team remembers that, the current roadmap can survive.
