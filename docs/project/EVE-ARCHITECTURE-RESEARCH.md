# EVE Online Architecture Research for LBH

## Scope

This is a focused read on what CCP has publicly said about EVE Online's server/client architecture, especially the parts that matter for LBH:

- authoritative simulation under extreme load
- player-state packaging and handoff (`Brain in a Box`)
- deliberate load shedding (`Time Dilation`)
- node/system allocation concepts
- what likely transfers cleanly to LBH versus what does not

One important caveat: CCP's **public** explanations of Tranquility's core runtime are uneven and somewhat old. The best primary sources on the core sim are mostly from 2011–2016. More recent public material is stronger on adjacent infrastructure like ESI caching than on the live combat runtime itself. So this report separates:

- **directly stated by CCP / official docs**
- **inference for LBH**

## What CCP has stated publicly

### 1. EVE treats overload as a fairness problem, not just a speed problem

CCP Veritas's original Time Dilation writeup is the cleanest statement of the model. He describes the server as a scheduler running tasklets, and the real failure mode under overload is not merely low FPS or general slowness — it is **unfairness** and unpredictable processing delay. Time Dilation slows the in-game clock so the server can keep processing in the correct order instead of dropping behind chaotically.

Relevant official sources:
- [Introducing Time Dilation (TiDi)](https://www.eveonline.com/news/view/introducing-time-dilation-tidi)
- [Time Dilation – How’s That Going?](https://www.eveonline.com/news/view/time-dilation-hows-that-going)

The follow-up is more concrete. CCP reported fights with more than 1,300 pilots where TiDi kept module response time under about one second for most of the action. The key idea is not "simulate less and hope." It is **slow the shared clock so causality remains coherent**.

### 2. One solar system lives on one node, and that constraint is structural

The 2014 CSM minutes are blunt about the architecture limits. CCP said:

- one system goes on one node
- the software is single-threaded
- adding hardware does not linearly solve the problem
- big-fight performance has to be attacked from multiple sides

Relevant official source:
- [CSM8 Winter Minutes 2014 PDF](https://cdn1.eveonline.com/community/csm/CSM8WinterMinutes2014v2.pdf)

This matters because it means EVE's scaling story is not "split one fight across many machines in real time." The unit of authority stays coarse. They improve performance inside that authority boundary, reinforce important systems, and deliberately degrade time when needed.

### 3. `Brain in a Box` was a CPU-for-RAM trade that moved expensive player-state work out of hot transitions

The same CSM minutes and the 2016 summit minutes give the most useful public description of `Brain in a Box`.

What CCP stated officially:
- it was intended to reduce load from transitions like docking, being killed, or jumping
- after deployment, CPU per user dropped substantially
- it was explicitly a **trade of CPU for RAM**
- CCP considered that a deliberate trade because RAM was easier for them to scale than CPU for this use case

Relevant official sources:
- [CSM8 Winter Minutes 2014 PDF](https://cdn1.eveonline.com/community/csm/CSM8WinterMinutes2014v2.pdf)
- [CSMX Summit Two 2016 PDF](https://cdn1.eveonline.com/community/csm/Meetings/summit/CSM10-S2.pdf)
- [Mass test for Brain in a Box](https://www.eveonline.com/news/view/mass-test-on-singularity-october-1st)

The public official wording does not fully expose the implementation. But the architecture intent is clear: **precompute and cache a player's expensive derived state so node-local session changes stop doing that whole job synchronously every time**.

That is the useful conceptual reading of the “brain” idea.

### 4. CCP also attacks load by moving systems between nodes and by using predictive/preemptive ops

The 2016 summit minutes mention:
- automated mechanisms reallocating systems between nodes based on average load
- special node allocation for important areas
- the difficulty of changing node allocations once the cluster is running

Relevant official source:
- [CSMX Summit Two 2016 PDF](https://cdn1.eveonline.com/community/csm/Meetings/summit/CSM10-S2.pdf)

This is less about game logic and more about operations. But conceptually it matters: **placement and assignment policy is part of architecture**, not just code.

### 5. CCP's newer public infra work still shows the same pattern: event-driven invalidation over polling guesses

A much newer official source, though for ESI rather than the combat runtime, shows the same architectural instinct. In 2026 the ESI team moved skill-related cache invalidation from time-based expiry to event-driven invalidation and reported hit-rate moving from ~1% to over 90%.

Relevant official source:
- [Smarter caching: when events drive invalidation](https://developers.eveonline.com/blog/smarter-caching-when-events-drive-invalidation)

This is not evidence about Tranquility's combat scheduler directly. But it does show a continuing CCP bias toward:
- precomputation
- cached derived state
- invalidation on real events instead of blind refresh cadence

That maps well to the LBH server/client boundary you are building.

## What this means conceptually

EVE's public architecture story is not “client prediction solves scale.” It is closer to this:

1. **The server is absolutely authoritative.**
2. **The unit of authority is coarse and stable** (a solar system on a node).
3. **Expensive derived player state should be boxed, cached, and handed around**, not recomputed opportunistically in hot paths.
4. **When overload happens, slow the shared simulation honestly** instead of letting the system become unfair.
5. **Use ops-level placement and reinforcement** as part of the design.
6. **Use event-driven invalidation and dirtying** instead of polling/rebuilding blindly.

That is the actual transfer value for LBH.

## What transfers cleanly to LBH

### A. Treat one LBH run as the coarse authority unit

This is already the right direction.

For LBH, the equivalent of "one solar system on one node" is:
- **one run instance on one sim authority**

Do not try to shard one live run across multiple sim processes yet. Keep one run = one authority process. That matches your current architecture and keeps reasoning sane.

### B. Build a real `PlayerBrain` / derived-state package

This is the single most useful EVE-inspired idea for LBH.

Right now LBH still has a lot of player truth spread across:
- inventory/loadout
- active item effects
- movement modifiers
- signal/visibility later
- combat state
- server-owned run state

You should formalize a server-side `PlayerBrain` or `PlayerRuntimeState` that contains:
- base ship stats
- resolved loadout modifiers
- active consumable/effect modifiers
- current mobility coefficients
- current visibility/signal coefficients
- current combat coefficients
- any cached derived movement/combat values used every tick

Then update that brain only when dirty:
- equip change
- consumable use
- upgrade change
- status change
- signal state change
- spawn/death/escape

That is the LBH version of `Brain in a Box`.

The benefit is the same one CCP was chasing:
- less hot-path recomputation
- cleaner authority handoff
- smaller tick logic
- easier replication because snapshot code reads one already-resolved player object

### C. Prefer event streams over “client figures it out” logic

LBH already has the beginnings of this. Keep pushing.

EVE's newer ESI work reinforces the principle: if something changed because of an event, invalidate on the event. Do not let clients or caches guess.

For LBH, that means:
- emit explicit events for inventory/loadout/effect dirtiness
- emit explicit world events for portal waves, collapses, scavenger death drops, etc.
- let the client react to those, rather than trying to infer everything from raw snapshots

Snapshots should carry truth. Events should carry meaning.

### D. Add explicit degradation policy instead of accidental lag

This is the second major EVE lesson.

Right now LBH is starting to scale by:
- reducing clock rates
- gating relevance
- adding AI budgets
- adding per-player force budgets

That is good. But eventually you need a **declared degradation ladder**.

For example, at the run authority level:
1. full fidelity
2. reduced background update cadence
3. reduced AI breadth
4. reduced force-source sampling
5. reduced snapshot frequency
6. if still overloaded, slow the shared sim clock for the whole run

That last step is basically LBH's version of TiDi.

I am not saying you need visible TiDi now. I am saying you should decide whether your final overload behavior is:
- silent approximation drift, or
- honest run-wide slowdown

EVE's answer is the second one. For a multiplayer-first LBH, that is probably the right long-term answer too.

### E. Separate authority placement/ops policy from game code

EVE's node allocation story is a reminder that some scale decisions are operational, not just algorithmic.

For LBH this means later you should have explicit control over:
- where a run instance is hosted
- whether a run is “reinforced” or high-priority
- what player cap and fidelity budget it launches with
- whether it is solo, PvP, or test mode

That control plane should not be hidden inside the gameplay loop.

## What does **not** transfer cleanly

### 1. Do not overlearn from EVE's single-threaded node model

EVE's public story includes a lot of constraints from legacy Stackless Python and their historical architecture. LBH should learn from the **conceptual boundaries**, not blindly copy the implementation style.

The lesson is not “single-thread the sim forever.”
The lesson is “one run should have one clear authority boundary.”

### 2. Do not build huge client-side prediction systems too early

The public EVE material is not really a story about twitchy prediction. It is much more about authoritative coherence, load shaping, and fairness.

LBH is closer to that than to a shooter.

For now you should keep:
- local rendering responsiveness
- minimal reconciliation smoothing
- maybe light input buffering/interpolation

But do not build a giant speculative client simulation if the real scaling problem is still on the server side.

### 3. Do not assume 4,000-player solutions matter directly to 4–8-player LBH

The useful transfer is conceptual, not numerical. LBH does not need EVE's absolute scale tricks. It needs:
- coarse authority boundaries
- boxed player state
- explicit degradation policy
- event-driven invalidation
- stable control plane

## Concrete LBH recommendations

### Recommendation 1: add a formal `PlayerBrain`

This is the next high-value architecture step.

I would implement a server-side object or module that resolves and caches:
- mobility multipliers
- well-pull modifiers
- pulse/disruption modifiers
- visibility/signal modifiers
- cargo/equipment-derived stats
- any future faction/class modifiers

And I would dirty/rebuild it only on state-change events.

### Recommendation 2: add a run-level overload state machine

Give the sim server an explicit performance state:
- `normal`
- `throttled`
- `degraded`
- `dilated` or equivalent

Then bind concrete actions to those states. Right now the code is moving toward this informally. Make it real.

### Recommendation 3: distinguish snapshot truth from transition truth

Snapshots are fine for steady-state. But the most expensive and most fragile moments are transitions.

For LBH that means you should pay special attention to:
- player join
- host handoff
- death
- extraction
- item use that changes derived stats
- inventory/loadout mutations

Those are the LBH equivalents of EVE's session changes.

### Recommendation 4: precompute coarse flow/hazard summaries for big maps

You already noted the fidelity mismatch.

For larger maps, the authoritative server probably should not simulate the full high-detail force sum as the source of truth. Instead it should own a **coarser gameplay field**:
- local well influence summaries
- coarse current vectors / surf lanes
- hazard bands / extraction bands
- event-driven disturbances

The client can still build richer visual drama locally.

This is probably the most important next scale step after the work already done.

### Recommendation 5: treat 4–8 player support as a budgeted mode, not a default assumption

EVE's public docs repeatedly imply that scale comes from a combination of architecture, operations, and design constraints.

For LBH, define profiles explicitly:
- `solo+AI`
- `4-player pvp`
- `8-player stress`

Each should have:
- max entity counts
- AI budgets
- snapshot cadence
- force-source budgets
- expected map sizes

That gives you a real operating envelope.

## Suggested LBH roadmap from this research

1. **PlayerBrain / derived-state boxing**
   - formalize derived player runtime state
   - dirty/invalidate on real events

2. **Run overload state machine**
   - make degradation policy explicit
   - reserve “honest slowdown” as the last rung

3. **Coarse authoritative flow field**
   - stop tying large-map gameplay truth to high-detail sums everywhere

4. **Session profiles**
   - define 1-player, 4-player, and 8-player budgets as first-class launch modes

5. **Ops/control-plane reinforcement**
   - explicit host/priority/fidelity profile selection for a run

## Bottom line

The most useful EVE lessons for LBH are not about copying their exact infrastructure.

They are these:

- keep authority coarse and stable
- precompute and cache expensive derived player state
- separate transition costs from steady-state costs
- use event-driven invalidation instead of blind recomputation
- degrade honestly under overload instead of becoming unfair by accident

If I had to compress it to one sentence for LBH:

**Build one authoritative run process, give every player a boxed derived runtime state, and make overload a declared mode instead of an accidental failure.**

## Sources

Primary sources used:
- [Introducing Time Dilation (TiDi)](https://www.eveonline.com/news/view/introducing-time-dilation-tidi)
- [Time Dilation – How’s That Going?](https://www.eveonline.com/news/view/time-dilation-hows-that-going)
- [Mass test for Brain in a Box](https://www.eveonline.com/news/view/mass-test-on-singularity-october-1st)
- [CSM8 Winter Minutes 2014 PDF](https://cdn1.eveonline.com/community/csm/CSM8WinterMinutes2014v2.pdf)
- [CSMX Summit Two 2016 PDF](https://cdn1.eveonline.com/community/csm/Meetings/summit/CSM10-S2.pdf)
- [Smarter caching: when events drive invalidation](https://developers.eveonline.com/blog/smarter-caching-when-events-drive-invalidation)
- [Your Client, Made Gooder](https://www.eveonline.com/news/view/your-client-made-gooder)
