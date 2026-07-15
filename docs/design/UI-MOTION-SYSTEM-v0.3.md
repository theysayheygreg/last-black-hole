# UI Motion System v0.3

Status: implementation contract for the v0.3 Ballpark line.

This document defines how UI changes state in time. It extends
`docs/design/UI-VISUAL-SYSTEM.md` and the helpers in `src/ui/motion.js`. It does
not assign ordinary UI motion to Three. Three VFX may answer authoritative
world beats; DOM/canvas UI owns focus, hierarchy, panels, text, commands, and
screen transitions.

## Motion Purpose

Motion has four allowed jobs:

1. Explain where focus or content moved.
2. Establish the order in which a decision should be read.
3. Confirm an input or authoritative outcome.
4. Bridge a real mode change without hiding state.

If movement does not perform one of those jobs, leave the element still. The
in-match HUD is stable by default because the world already moves.

## Authority And Event Boundary

- Input may animate local focus and pressed state immediately.
- A pending command may show pending state, but success waits for authoritative
  acknowledgement or snapshot state.
- Pickup, damage, death, extraction, signal escalation, ability activation, and
  rewards animate from protocol events or authoritative state changes.
- Animation completion never commits gameplay state.
- Pause is a local presentation cover. The world continues: authority, network
  health, snapshot intake, and covered event intake continue, and pause never
  auto-unpauses.
- Reconnecting, delayed, or rebased snapshots may settle presentation directly
  to the latest known state. Do not replay stale reward or danger fanfare.
- One event ID/stamp should produce one presentation beat. Deduplicate across
  snapshot and event paths.

## Ownership

| Concern | Owner |
|---|---|
| Focus shift, selected row, panel reveal, text reveal | DOM/canvas UI |
| Screen wipe and command transition | DOM/canvas UI |
| Input prompt and pending/confirmed state | DOM/canvas UI |
| Thrust, brake, pickup glint, portal sparks, release burst | Three VFX |
| Camera response and world lens effects | Renderer/VFX contract |
| Death, pickup, extraction, signal, ability truth | Authoritative sim |

UI may request a renderer-neutral VFX beat after receiving an approved event.
It may not inspect a Three object to decide whether the event occurred.

## Timing Vocabulary

Use seconds in code and documentation. The current default values remain the
baseline unless playtest evidence changes `CONFIG.ui.motion`.

| Token | Duration | Use |
|---|---:|---|
| `instant` | 0.00 | Required state under reduced motion; hard correction. |
| `press` | 0.08 | Button/key depression and release response. |
| `focus` | 0.16 | Selection marker and backing shift. |
| `row` | 0.20 | One repeated row entering or updating. |
| `panel` | 0.42 | Major panel/window reveal; current `panelDuration`. |
| `text` | 0.70 max | Optional type/walk-on for short flavor; current `textDuration`. |
| `wipe` | 0.34 | Mode transition obscuration and reveal. |
| `confirm` | 0.30 | Successful command or authoritative acknowledgement. |
| `warning` | 0.45 in, 1.50 min hold, 0.30 out | Non-life-critical warning. |
| `outcome` | 0.80-1.20 | Results headline and cause staging. |

Repeated rows use `rowStagger = 0.055` seconds. Cap total stagger at 0.33
seconds or six rows; reveal later rows together. A player must never wait for a
long list to finish animating before acting.

Use ease-out for arriving content, ease-in-out for focus movement and wipes,
and linear timing for progress tied to a real countdown. Avoid spring and
overshoot motion in operational UI.

## Spatial Vocabulary

- Panels reveal from their owning edge or expand from a stable corner frame.
- Focus travels only between the old and new selection. It does not orbit,
  bounce, or trace decorative paths.
- List rows move 4-12 CSS pixels or equivalent canvas units, never a large
  fraction of the panel.
- Primary commands may brighten and gain a short edge sweep; they do not scale
  enough to move neighboring layout.
- Directional wipes follow the navigation direction when one exists. Otherwise
  use the established horizontal dimensional tear.
- Text reveal is opacity or clipped progression. Required copy never scrambles.
- Layout dimensions are fixed before animation starts. Animation must not cause
  reflow, text wrapping changes, or hit-target movement.

## Choreography Rules

Each screen entry follows the same readable order:

1. Establish mode and backing.
2. Reveal screen identity and primary state.
3. Reveal the selected decision surface.
4. Reveal supporting rows with bounded stagger.
5. Enable the command accent.

The primary action is visible and actionable no later than 0.50 seconds after
screen entry. Supporting animation may continue without blocking input. Input
during an entry settles the affected element to its end state before moving
focus.

At most one major panel motion, one focus motion, and one transient accent may
compete in a region. In play, at most one non-critical UI cluster animates at a
time. Life-critical warnings preempt decorative and list motion.

## Interaction States

### Focus

On focus change, move the marker/backing over `focus`, raise contrast, and show
the appropriate input prompt immediately. The old selection dims as the new
one rises; there is no interval where both look primary.

### Press And Pending

Press feedback completes in `press`. If authority is required, keep the command
legible and add a restrained pending edge or label. Do not loop a large pulse.
On acknowledgement, play `confirm`. On rejection, restore focus and show the
sim-provided reason in a danger-backed message.

### Disabled

Disabled state is static, lower contrast, and still readable. It never pulses
to attract input. Explain why in adjacent text or on focus if the control can
receive focus.

### Destructive

Do not animate a destructive command red merely because it exists. It takes the
danger role when focused, then uses a separate confirmation state. Confirmation
motion is short and directional; cancellation restores the prior state without
fanfare.

## Screen Choreography

### Title

The world/fabric may already be moving. Settle the wordmark first, reveal the
first action by 0.35 seconds, then supporting commands. A slow CTA breathing
accent may begin only after entry settles. Title corruption is a glyph overlay
event; the clean wordmark remains underneath and readable.

### Profile Select

Reveal the profile list as one panel, then stagger visible profiles. Focus
movement is the main animation. Create/delete states replace the command zone
without moving the entire list. Delete confirmation suppresses idle accents.

### Home / Hangar

Navigation rail and selected workspace transition as a pair. The rail marker
moves over `focus`; workspace content crossfades or clips over `panel`. Resource
ledgers update numerically without re-entering. Ship display motion belongs to
the world/preview layer and must not delay menu interaction.

### Pre-Match / Map Select

Changing sector moves list focus immediately, then updates map marks and route
preview together. Facts and loadout rows may use bounded stagger. Launch
readiness appears from actual validation state. Holding launch may fill a
linear confirmation rail; it cannot complete before the command is valid.

### In-Match HUD

Persistent fuel, hull, signal, cargo, timer, exits, and ability surfaces do not
idle-bob, type on, or continuously pulse. Values interpolate only when that
improves reading and never lag authority materially.

- Pickup: one short value tick and local gold glint after the pickup event.
- Damage: one compact danger flash on the affected gauge; no full HUD shake.
- Signal threshold: one magenta edge emphasis at threshold crossing, not every
  frame above it.
- Exit change: update the exit cluster and use a brief role-colored edge sweep.
- Ability: press may show pending; cooldown and success begin from authoritative
  state.
- Warning: local backed panel first. Reserve center interruption for immediate
  death/extraction danger.

### Pause

The pause command panel becomes readable immediately over a local presentation
cover. `WORLD CONTINUES` is the remote-authority read: authority, network health,
snapshot intake, and covered event intake remain live, with no automatic
unpause. A short local dim may settle over `panel`; the dim is not a simulation
freeze. Abandon uses the separate destructive confirmation flow.

Pause and resume follow this contract:

- Entry neutralizes held and edge inputs exactly once, clears pending local
  action flags, and leaves the authority run untouched.
- While covered, presentation coalesces to the newest authority snapshot. It
  discards intermediate presentation beats while retaining only a terminal
  result eligible for the current authority run.
- A short resume (under `1500ms` away) follows the current phase normally.
- A long resume (`1500ms` or more) applies the newest authority truth
  atomically, settles the camera and fluid anchor, snaps presentation, and
  clears stale UI motion.
- Terminal, phase, and run changes route directly from current authority truth.
  Cached terminal events are exact-run scoped and cannot poison a later run.
- The local debug/sandbox freeze is a separate mode. It may freeze client
  simulation for debugging and must never be described as product authority
  pause behavior.

### Results

Freeze the authoritative outcome before theatrical motion begins. Stage outcome
headline, cause/consequence, accounting, then next actions. The first safe
continue action appears within 0.80 seconds. Item/accounting rows use bounded
stagger and can be skipped to settled state with input. Never count toward an
amount not present in the final authoritative result.

## UI And VFX Beat Pairing

Paired beats share an event but keep independent responsibilities:

| Event | UI response | Three response |
|---|---|---|
| Pickup confirmed | Cargo/value tick, concise label | World glint and inward particles. |
| Slingshot engage/release | Stable state icon or prompt | Anchor line and release burst. |
| Portal spawned/expiring | Exit cluster update and warning | Aperture sparks/state shift. |
| Extraction confirmed | Outcome transition begins | Portal/ship departure beat. |
| Death confirmed | Cause panel prepared | World collapse or impact beat. |
| Signal threshold | Gauge edge and warning | Approved fabric/anomaly accent. |

The UI response must remain understandable if Three VFX is disabled. The Three
response must not contain required text.

## Reduced Motion

Reduced motion activates when `CONFIG.ui.motion.enabled` is false,
`CONFIG.ui.motion.reduced` is true, or the platform preference requests it.
`src/ui/motion.js` is the resolution point.

In reduced motion:

- Panels, rows, focus, and required text render directly in their settled state.
- Screen transitions use a static contrast overlay or one short opacity change;
  no directional travel, tear, scale, or chromatic slip.
- CTA breathing, idle pulses, type-on, row stagger, screen shake, parallax UI,
  and decorative flicker stop.
- Threshold and confirmation events use stable color/backing/icon changes.
- World effects reduce particle count, trail persistence, flash area, and camera
  response while preserving actionable telegraphs.
- Time-critical countdowns remain linear and readable. Reduced motion never
  removes information or lengthens a required response.
- The selected action, danger state, outcome, and next input are visible in a
  still frame.

Reduced motion is not zero feedback. It replaces displacement and repetition
with decisive state changes and local contrast.

## Flash, Flicker, And Corruption

- No required UI flashes faster than three times per second.
- Avoid full-frame luminance flashes. Keep event accents local and brief.
- Never combine rapid flicker, large-area red, and screen shake.
- Corruption may affect frame edges, decorative glyph overlays, or short accent
  bands. Required labels, values, prompts, and the base wordmark remain clean.
- CRT scanlines and signal noise are presentation texture, not animation cues.
  They must remain subtle enough that small text and one-pixel rails are stable.

## Performance Rules

- Sample motion from time and immutable start/end state; do not accumulate
  frame-dependent offsets.
- Reuse the pure helpers in `src/ui/motion.js`. Add a helper only when multiple
  screens share a genuine motion pattern.
- Do not allocate gradients, paths, arrays, fonts, or temporary DOM nodes per
  frame for persistent motion.
- Keep animation on transform/opacity or equivalent cheap canvas parameters
  when possible. Avoid layout-triggering property changes.
- Pool transient UI notices and renderer VFX.
- Clamp elapsed time after tab suspension and settle expired animation instead
  of replaying a backlog.
- Animation must remain correct at variable refresh rates and at 30 fps stress.

## Input And Accessibility

- Hit targets and focus bounds are stable for the entire animation.
- Controller, keyboard, and pointer focus produce the same selected-state read.
- Input prompts update immediately when the active input device changes; they
  do not type on or wait for a transition.
- Deck/controller prompts use the shared graphical glyph descriptors from the
  UI prompt contract; raw keyboard labels are not a fallback on Deck surfaces.
- Audio feedback may reinforce a beat but cannot be the only confirmation.
- Color, motion, and sound each have a static visual counterpart.
- Motion never blocks navigation. A second input settles or skips entry motion
  before applying the requested action.
- Screen reader or DOM labels reflect the settled semantic state, not decorative
  intermediate glyphs.

## Anti-Patterns

- Animating every HUD value, border, icon, and background continuously.
- Delaying input until a panel or text reveal finishes.
- Using a looped pulse to represent pending authority.
- Starting reward, death, extraction, or ability-success motion from prediction.
- Replaying historical events after reconnect or snapshot rebase.
- Large panel slides that hide the selected action or cause text reflow.
- Spring overshoot, bounce, elastic scaling, or ornamental orbiting focus.
- Type-on for warnings, prompts, causes of death, or required instructions.
- Three-owned menu movement or UI-owned world particles.
- A reduced-motion mode that merely slows the same movement.

## Acceptance

Every new or revised motion sequence must satisfy all applicable checks:

- The initiating input or authoritative event is named.
- The sequence has one of the four allowed purposes.
- Ownership is correct: UI motion, Three VFX, and sim truth remain separate.
- Primary action appears by 0.50 seconds on normal screen entry.
- Motion can be interrupted, skipped, or settled without losing state.
- Focus bounds, hit targets, text wrapping, and layout do not move unexpectedly.
- Repeated-row delay is capped and long lists do not serialize indefinitely.
- Duplicate or rebased events do not replay one-shot feedback.
- Reduced-motion captures expose the same selection, danger, outcome, and next
  action in a still frame.
- Representative 60 fps and 30 fps captures finish at the same state and near
  the same wall-clock time.
- No sequence obscures the player, travel line, portal, or immediate hazard in
  representative gameplay.
- Flash/flicker remains local and within the stated frequency rule.
- `node tests/ui-motion.cjs`, temporal/timeline motion tests, `npm run test:ui`,
  and the relevant renderer/VFX tests pass.
- A short normal-motion clip, a reduced-motion still/clip, a Deck-scale frame,
  and a 25 percent couch proxy receive visual review.

## Platform References

- [MDN: View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)
  informs the snapshot/handoff vocabulary, but LBH does not delegate its
  continuously animated canvas state to that DOM API.
- [MDN: requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
  remains the single timing source for canvas UI and Three presentation.
- [MDN: prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
  defines the platform preference honored by `resolveMotionSettings()`.
- [web.dev: Animations and performance](https://web.dev/articles/animations-and-performance)
  supports the DOM rule that transient HUD movement uses compositor-friendly
  opacity and transforms rather than layout-changing dimensions.
