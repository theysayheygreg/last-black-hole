# Orrery Review: v0.3 Visual Clarity Milestone

> Reviewer: Orrery. Date: 2026-08-04. Reviewed HEAD: `709c2f34` (packet commit)
> on `codex/v0.3-ballpark-roadmap`; product checkpoint `fbfc5c42`; spatial
> ownership contract `82dce27c`. Read-only review; no source changed.

## Verdict

**ACCEPT WITH FIX-FORWARD** — with one hard evidence condition before the next
implementation wave is scoped.

The structural work is right. The coordinate unification (`5f278119`,
`fbfc5c42`) is exactly what this project needed: one owner in `src/coords.js`
with the sign conventions written down at the seam
(`fluidTextureOffsetForCameraMove`, `worldToGlobalFluidUV`,
`fluidWindowUVToGlobalFluidUV`), the double Y-flip removed in the display
shader with a comment explaining *why* the old form mirrored the field
(`src/render/shaders/fluid.glsl.js:317-320`), and contract tests
(`tests/coordinates.cjs`, `tests/coordinate-presentation-seams.cjs`) pinning
it. The three-layer grammar from `OPEN-DECISIONS.md` is genuinely implemented
in one shader with the locked A+C well treatment and B+C wave treatment
identifiable in code. That is design-complete architecture.

What is *not* proven is the thing this milestone is named for. The evidence
bundle contains **no post-fix frame in which a well and its fabric appear
together.** The two ordinary-play captures predate the final patches and have
no well in frame; the post-fix "alignment diagnostic"
(`current-coordinate-alignment.png`) is a nearly black frame containing one
dim rectangle and a `0.01 · drift` label. The central visual claim of the
milestone — the fabric converges on the well that causes it, and the well
reads as a scary magical landmark — currently rests on math contracts alone.
The math looks correct. But this packet asks me to judge art, and the decisive
image was never taken.

## v0.2 → Current → Recommended Next

- **v0.2:** gorgeous full-field ASCII weather. Everything moved, so nothing
  meant anything. Wells were small; texture was the star. Greg's misalignment
  captures (`greg-fabric-well-misalignment-a/b.png`) show the tail end of this
  era: rich glyph character (`0 ‡ = / #` families, luminance rhythm, red/blue
  temperature shifts) — genuinely beautiful, structurally illegible, and the
  field visibly detached from its well.
- **Current:** the grammar is correct and the field is honest, but the volume
  knob is set to *whisper*. In `current-shallows-start.png` and
  `current-well-approach.png` the fabric is a faint uniform speckle — I cannot
  point at a lane, a direction, or a calm region in either frame. Calm space
  won; the swell lost. The glyph richness of v0.2 is also mostly gone: marks
  are short uniform dashes without the character-set variety or luminance
  rhythm the old field had.
- **Recommended next:** keep the grammar, restore the presence. Raise lane
  luminance/contrast until one corridor is unmistakable in an ordinary frame,
  reintroduce v0.2's glyph variety and luminance rhythm *inside the corridor
  envelope only*, move lane hue off cyan, and let the well grow into the
  landmark the title screen already proved.

## Concept-by-Concept Assessment

### Flow lanes (`fabric-flow-lanes-concept-01.png`)

**Achieved:** the corridor geometry. The 08-03 completion doc's mask math is
sound — 1.5-unit spacing, 0.125 camera-relative half width, ~200px / 4.5 hull
widths per corridor, 50% calm period. Marks advance downstream; strength
lengthens marks rather than adding lanes. That is Panel A's density contract
plus Panel C's topology hooks, implemented as specified.

**Lost:** visibility. The concept's lanes are the brightest thing in the frame
after the well; in the current captures they are below the noise floor of the
starfield. Also lost: Panel B's tactile grain as *restrained interior
texture* — the current interior weave is so subdued it reads as compression
artifacts, not material.

**Largest delta:** contrast, not shape. This is an incomplete implementation,
not a wrong design. The knobs already exist: `channelPresence`'s
`mix(0.62, 1.0, laneStrength)` and the `laneSpeed / 0.22` strength
normalization (`fluid.glsl.js:339,471-473`), the additive weights at
`fluid.glsl.js:504-508`, and `laneColor`'s base luminance
(`fluid.glsl.js:491`).

### Well distortion (`fabric-well-distortion-concept-01.png`)

**Achieved in code:** the locked A+C composite is legible in the shader —
orbital bend ramping with `currentWeight`, envelope compression through
gravity falloff, split/rejoin via `splitOffset`, `coreQuiet` darkening the
lethal neighborhood (`fluid.glsl.js:379-455`). Panel B's radial diagram is
correctly absent.

**Lost / unproven:** everything visible. No evidence frame shows it. And one
authored choice works *against* the landmark brief: the visible accretion band
is capped to a compact body-relative rim
(`visualRingOuter ≤ visualCoreRadius * 1.78`, `fluid.glsl.js:562-563`) and
the core floor is 4% of camera view (`fluid.glsl.js:552`) — roughly a 50px
body at 1280x800. The concept wells — and the title screen Greg named as the
emotional target — are not compact symmetric rings. Every panel gives the
well a **directional hot plume**: an asymmetric orange accretion stream
trailing off one side, which is what makes it read as angry and alive rather
than as a map icon. The build has no asymmetric element at all.

**Largest delta:** the missing directional plume plus overall scale. The
anti-halo cap was the right call against the old broad glow, but it
overcorrected into "contact dot."

### Event wave (`fabric-event-wave-concept-01.png`)

**Achieved in code:** front/behind material swell riding the lanes, sparse
angular crest, telegraph owned by the source well's tighten-and-brighten,
no detached ring primitive (`fluid.glsl.js:402-429,509-513,534-547`). The
rejections (sonar ring, intersection nodes) are honored.

**Unproven:** no capture of a wave exists in this packet. The shader also
still mixes the wave toward a green overlay color
(`fluid.glsl.js:493-495` — acknowledged in-code as interim). Green is
currently outside the locked color language entirely; when the dedicated wave
pass lands, the crest should live in the bone/amber "BREAK" family from the
08-01 review, not a third unclaimed hue.

**Largest delta:** unknowable without one forced Bench capture. Do not tune
this layer blind.

## Answers To The Packet Questions

**2. Fabric as terrain** — Not yet, on the evidence. Geometry: right. Width:
right (4.5 hull widths, verified in the mask fixture). Anchoring: right
(world-anchored filtering around `coarseUV`, camera motion moves only marks).
Contrast: wrong — sub-threshold in ordinary play. The fix is shader-knob
tuning, not architecture: raise `channelBand`/`laneSignal` weights and base
`laneColor` luminance until the corridor survives the starfield.

**3. Wells as landmarks** — see concept assessment. Larger dark body, one
directional plume, keep the compact rim discipline. The dark core "must win"
rule (`fluid.glsl.js:582-583`) is correct and should not be weakened.

**4. Movement affordance** — the ±20% carry cannot be visually confirmed
today because the lanes it should explain are invisible. Once lane presence
is raised, the existing downstream mark-speed mapping
(`markPhase`, `fluid.glsl.js:485`) is the right affordance channel. No new
mechanism needed.

**5. Entity hierarchy** — mostly sound at 1280x800: stars are unmistakable,
the player Noise ellipse reads well, ship speed labels are legible. Two
residual items: wreck classes and small enemy ships share a near-identical
faint silhouette at rest, and the fabric (once brightened) must not swallow
the smallest pickups — verify in the same capture pass. Not blocking.

**6. Truth alignment** — plausibly closed. The remaining risk surface is not
a conflicting center but *coverage*: the shader's well-uniform bridge
(`fluid.glsl.js:359-361,531-533`) re-derives global position from
camera-relative uniforms in two separate loops; both use the same expression
today, but this is exactly the duplicated-conversion pattern `82dce27c` now
bans. Fold it into one GLSL helper next time that file is touched. I found no
live contradiction.

**7. Texture recovery** — recover: glyph character variety (the `0 ‡ = /`
families), luminance rhythm along the lane, and temperature shifts near
danger — all *inside* the corridor envelope and well neighborhoods. Keep
retired: the full-field hash carpet, always-on seeded-sea shimmer, halos,
repeated gravity contours, anonymous rings. v0.2's beauty came from variety
and rhythm, not from coverage; put the variety where the grammar already
says material belongs.

**8. UI obstruction** — the containment pass held: all three frames are
bounded, hierarchy intact, map select is genuinely good. Two functional
defects worth fixing before the playtest: the death-results **RUN SUMMARY and
LEDGER rows render labels with no values** (`survival / noise max / noise
time / ecology / cause / residue` all empty in
`current-results-death.png`) — that screen is how a playtest learns from a
death, and right now it teaches nothing; and the loadout stat strip clips
under the hull portrait (`drift drag 85% /` truncated). Nothing else in the
UI blocks the movement/fabric playtest.

## Findings (max five, prioritized)

1. **`blocker` — The milestone's decisive image does not exist.** No post-fix
   frame shows fabric and a well together; the alignment diagnostic is a
   near-black frame. Contract: the packet's own evidence rule ("observations,
   not claims"). Intended visible change: none — this is evidence work.
   Deciding observation: **one 10-second 1280x800 ordinary-Shallows capture
   at current HEAD approaching a well.** If lanes visibly bend around the
   well and converge on its body, findings 2–4 become pure tuning; if not,
   nothing else in this memo should be acted on first.

2. **`fix-forward` — Lane presence is below the read threshold.** Knobs:
   `channelPresence`, `channelBand`, `laneSignal` weights and `laneColor`
   luminance, `src/render/shaders/fluid.glsl.js:471-508`. Intended change: in
   an ordinary frame, one corridor is unmistakably the brightest structure
   after wells/stars, while calm regions stay near-black. Deciding
   observation: Greg points at a still and states the flow direction without
   a debug overlay.

3. **`Greg decision` — Fabric lanes sit in the cyan band reserved for
   route/extraction.** `laneColor` base/strong values
   (`fluid.glsl.js:491-492`) are cyan-blue; the locked color language
   (`OPEN-DECISIONS.md` — Color Language) makes cyan mean route/extraction
   exclusively. The concepts author lanes in blue-violet. Recommendation:
   shift lane hue toward blue-violet, keep cyan for exfil/route only, and
   place the future wave crest in bone/amber. Deciding observation: a frame
   containing an exfil aperture plus strong current — the two must be
   instantly distinguishable by hue alone.

4. **`fix-forward` — The well lacks its landmark body and directional
   plume.** Knobs: `visualCoreRadius` floor (`0.040`, `fluid.glsl.js:552`),
   ring caps (`:562-563`), plus one new asymmetric accretion term keyed to
   `orbitalDir`. Intended change: an in-match well at Shallows scale reads as
   a scary magical *place* — larger dark body, one hot trailing plume, rim
   discipline retained. Deciding observation: side-by-side of the in-match
   well against the title screen; Greg judges whether it is the same
   creature.

5. **`fix-forward` — Death results screen renders empty telemetry.** RUN
   SUMMARY and LEDGER labels have no values in
   `current-results-death.png`. Owner: results presentation (results/death
   screen builder). Intended change: every listed row shows its value or the
   row is dropped. Deciding observation: one death capture where survival
   time, noise max/time, ecology, cause, and residue all display real
   numbers. (Fold the loadout stat-strip clipping into the same pass.)

## Smallest Coherent Next Wave

1. Capture first (finding 1) — zero code.
2. One shader-tuning commit: lane presence + lane hue shift + glyph/rhythm
   recovery inside the envelope (findings 2, 3, 7). All in
   `fluid.glsl.js` display constants; no new uniforms, no sim change.
3. One well-presentation commit: body scale floor + directional plume
   (finding 4).
4. One UI commit: results values + loadout clip (finding 5).
5. Re-capture the same seed and route for direct before/after comparison,
   then hand Greg the checklist below.

Each step is independently revertible and none touches authority truth.

## Greg Review Checklist (next playable)

- **Motion:** flying cross-current, do the marks stay nailed to the world
  while only the material animates? Any sliding = reopen finding 1's seam.
- **Terrain:** can you name the flow direction anywhere on screen within one
  second, without the HUD?
- **Well threat:** approaching the well, do you feel the pull *before* the
  HUD tells you — and does the body scare you the way the title screen does?
- **Deck scale:** at 1280x800 handheld distance, are lane, well rim, exfil
  cyan, and Inhibitor magenta four instantly distinct reads?
- **Interaction confidence:** fly deliberately at a pickup and an exfil at
  speed — does contact land where your eyes say it should? (This is the
  acceptance test for the body-aware contact work in `4f966abe..fbfc5c42`.)

## Honest Limits

I judged stills, code, and contracts — not motion, not feel. The two
ordinary-play frames predate the final coordinate patches, so my contrast
findings could be marginally stale; finding 1's capture settles that too.
Nothing in this review reopens the locked grammar, carry cap, wave impulse,
or concept composites. Human play owns final acceptance.
