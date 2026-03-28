# Depth Layers & Parallax

> Flying THROUGH space, not on top of it.

## The Problem

Everything currently renders on one flat plane. The ship, wrecks, stars, wells, fluid — all at the same Z depth. The game reads as a top-down 2D map. It should feel like peering down into a volume of space, with things above and below your ship.

## Reference: Hollow Knight

Hollow Knight creates extraordinary depth from a side-scrolling camera using 5-7 parallax layers:
- **Far background**: barely moves, sets atmosphere (distant walls, sky)
- **Mid background**: moves slowly, provides spatial context (columns, structures)
- **Game plane**: 1:1 camera tracking, where gameplay happens
- **Near foreground**: moves faster than camera, creates depth (hanging vines, fog)
- **Overlay foreground**: UI, particles, atmospheric effects

The parallax trick: layers closer to the "camera" scroll faster, layers further away scroll slower. Same camera movement, different scroll rates per layer.

## Reference: Gemini Pre-Vis

The early concept art showed an accretion disk wrapping around the black hole — part behind the ship, part in front. This single Z-sorting choice transforms the well from a flat circle into a 3D object the ship is diving through. The near side of the disk OCCLUDES the ship, creating the illusion of viewing from an angle even though the camera is perfectly top-down.

## Proposed Layer Stack

From deepest to shallowest (bottom to top of render order):

### Layer 0: Deep Space (parallax: 0.3×)
**What**: Sparse distant star field. Faint nebula color washes. Very slow movement.

**Why**: Establishes that there's infinite depth below the game plane. When the camera moves, this layer barely shifts — it's "far away." Creates the feeling of flying high above a vast plane of space.

**Rendering**: A separate canvas or shader pass with tiny dots (1-2px) at fixed positions, scrolled at 0.3× camera offset. Could also be a subtle color gradient that shifts based on position (blue in one quadrant, purple in another — hints at cosmic structure).

**Parallax**: `layerOffset = cameraOffset × 0.3`

### Layer 1: Fluid Sim + ASCII (parallax: 1.0×)
**What**: The existing fluid simulation and ASCII dithering. This is the "water surface" of space.

**Why**: The fluid IS the game plane. Everything interacts with it. No parallax offset — moves 1:1 with the camera.

**Rendering**: Unchanged — WebGL fluid sim → ASCII post-process → screen.

### Layer 2: Back Depth (parallax: 1.0×, but rendered BEFORE entities)
**What**: The back halves of objects that wrap around the Z axis:
- Accretion disk back-half (the side of the disk "below" the ship plane)
- Halo ring back arcs
- Star halo outer glow (dimmer, "further away")
- Gravitational lensing distortion behind wells

**Why**: This is the Gemini insight. When the accretion disk has a back half that renders behind the ship, the well becomes a 3D object. You're not flying over a circle — you're flying through a disk, and part of it is behind you.

**Rendering**: Canvas overlay, rendered before the entity layer. For accretion disks: draw the "far side" of the disk as a dimmer, slightly blurred arc behind where the ship layer will go. For halo rings: draw the back arc of the ellipse.

**The accretion disk back-half**: Take the well's ring position. Draw an arc from ~135° to ~315° (the "far side" relative to a tilted view) with reduced brightness (40% of normal). This creates asymmetry — one side of the well looks closer, one side looks further.

### Layer 3: Entity Plane (parallax: 1.0×)
**What**: All gameplay entities:
- Ship
- Scavengers
- Comets
- Wrecks
- Portals
- Stars (core + rays)
- Proximity labels
- Edge indicators

**Why**: This is where gameplay happens. Everything the player interacts with is at this depth.

**Rendering**: The existing overlay canvas render passes. No change except ordering — these now render AFTER Layer 2 and BEFORE Layer 4.

### Layer 4: Front Depth (parallax: 1.0×, rendered AFTER entities)
**What**: The front halves of objects that wrap over the ship:
- Accretion disk front-half (the near side of the disk, ABOVE the ship)
- Halo ring front arcs
- Well gravitational lensing overlay (subtle distortion/darkening near well center)
- Megastructure front elements

**Why**: This is the money shot. When you fly near a well, the near side of the accretion disk renders ON TOP of your ship. You feel like you're diving INTO the disk, not flying over it. The occlusion is the depth cue.

**Rendering**: Canvas overlay, rendered after all entities. For accretion disks: draw the "near side" arc from ~315° through 0° to ~135° at full brightness. This arc partially covers the ship when you're close.

**Transparency**: The front depth layer needs partial transparency so you can still see your ship. ~60-70% opacity on the accretion disk front-half. Enough to occlude, not enough to lose the ship.

### Layer 5: Atmospheric (parallax: 1.2×)
**What**: Near-camera particles and effects:
- Dust motes drifting slowly (tiny bright dots, 1-2px)
- Gas wisps (very faint, slow-moving color patches)
- Speed lines when moving fast
- Well proximity distortion (screen-edge warping)

**Why**: Creates the feeling of passing THROUGH a medium, not over a vacuum. The slight parallax offset (1.2×) means these particles move slightly faster than the game plane — they're "closer to the camera" than the ship. Subliminal depth cue.

**Rendering**: Small canvas overlay with a handful of particles (10-20 max). Scroll at 1.2× camera offset. Fade opacity based on proximity to wells and stars (more particles in denser regions).

### Layer 6: UI (no parallax)
**What**: HUD, menus, warnings, inventory. Fixed to screen.

**Rendering**: Existing HUD system. No change.

## Implementation Approach

### Cheap Version (canvas-only, no shader changes)

Split the existing overlay canvas render into three passes:

```javascript
// Pass 1: Back depth (before entities)
renderBackDepth(ctx, camX, camY, wellSystem, megastructures);

// Pass 2: Entities (existing code)
renderEntities(ctx, camX, camY, ...);  // ship, wrecks, stars, etc.

// Pass 3: Front depth (after entities)
renderFrontDepth(ctx, camX, camY, wellSystem, megastructures);

// Pass 4: Atmospheric particles
renderAtmospheric(ctx, camX, camY, shipSpeed);
```

The deep space layer (0) can be a separate small canvas behind the WebGL canvas, or baked into the display shader as a subtle star field.

### The Accretion Disk Split

Currently the display shader renders the full accretion ring. To split it into back/front halves:

**Option A: Shader-only** (cleanest). The display shader already draws the ring analytically. Add a uniform `u_splitPhase` that controls which angular range to draw. Render the shader twice — once for back half (u_splitPhase = 0, draws 135°-315°), once for front half (u_splitPhase = 1, draws 315°-135°). The entity canvas renders between the two shader passes.

**Option B: Canvas-only** (simpler, lower quality). Draw additional arc overlays on the canvas that approximate the accretion disk's near side. Less precise than the shader but avoids multi-pass shader complexity.

**Option C: Hybrid**. Shader renders the full ring as now (Layer 1). Canvas draws a semi-transparent colored arc on Layer 4 (front depth) that approximates the near-side disk. The shader ring shows through underneath, the canvas arc adds the occlusion layer on top. This is the "good enough" approach.

Recommendation: **Option C for v1.** Add a canvas-rendered front-half arc per well on Layer 4. If it looks good, upgrade to Option A later.

### Parallax for Deep Space

The deep space layer scrolls at 0.3× camera offset:

```javascript
const deepOffsetX = camX * 0.3;
const deepOffsetY = camY * 0.3;
// Draw star field with this offset
```

For a 1200px screen, moving the camera 1 world-unit shifts the deep layer by 0.3× = 360px (vs 1200px for the game plane). The difference reads as depth.

### Atmospheric Particles

10-20 tiny particles, each with:
- World position (fixed, doesn't move)
- Size: 1-2px
- Brightness: 0.1-0.3 opacity
- Scroll rate: 1.2×

```javascript
// Pre-generate particles at init
const dustMotes = Array.from({length: 15}, () => ({
  wx: Math.random() * WORLD_SCALE,
  wy: Math.random() * WORLD_SCALE,
  size: 1 + Math.random(),
  alpha: 0.1 + Math.random() * 0.2,
}));

// Render with 1.2× parallax
for (const mote of dustMotes) {
  const parallaxCamX = camX * 1.2;
  const parallaxCamY = camY * 1.2;
  const [sx, sy] = worldToScreen(mote.wx, mote.wy, parallaxCamX, parallaxCamY, w, h);
  ctx.fillStyle = `rgba(200, 210, 230, ${mote.alpha})`;
  ctx.fillRect(sx, sy, mote.size, mote.size);
}
```

The 1.2× offset means dust drifts slightly in the opposite direction of camera movement — a subliminal "closer than the game plane" cue.

## What Changes About Existing Rendering

### Current render order:
1. WebGL: fluid sim → ASCII shader → screen
2. Canvas: wave rings → stars → wrecks → portals → comets → scavengers → ship → effects → labels → HUD

### New render order:
1. Deep space canvas (parallax 0.3×) ← NEW
2. WebGL: fluid sim → ASCII shader → screen
3. Canvas Layer 2: back depth arcs ← NEW
4. Canvas Layer 3: wave rings → stars → wrecks → portals → comets → scavengers → ship → effects → labels
5. Canvas Layer 4: front depth arcs ← NEW
6. Canvas Layer 5: atmospheric particles ← NEW
7. Canvas Layer 6: HUD (unchanged)

Layers 2-5 all render on the existing overlay canvas — just in different passes within the render loop. No new canvases needed (though a separate deep space canvas behind the WebGL canvas would be cleaner for Layer 0).

## Visual Moments This Creates

**Flying near a well**: The accretion disk's near-side arc renders over your ship. You see the swirling ASCII pattern ABOVE you. It feels like diving into a gravity well, not flying over a circle.

**Passing through a halo ring**: The ring arc flips from behind you to in front of you as you cross the ring plane. A clear "I just passed through something" moment.

**High-speed travel**: Dust motes streak past faster than the game plane (1.2× parallax). Speed lines join them during thrust. Feels like punching through a medium.

**Approaching from distance**: The deep space star field barely moves while the game plane scrolls past. Creates a sense of vast distance being covered.

**Near a star**: The star's outer halo could render on Layer 2 (behind entities), while the core renders on Layer 3 (entity plane). The ship flies "between" the halo and the core. Stars feel like volumetric objects, not flat circles.

## Performance Considerations

- Deep space layer: 20-30 tiny dots, negligible cost
- Back/front depth arcs: 1-2 arc draws per visible well, ~same cost as existing overlays
- Atmospheric particles: 15-20 fillRect calls, negligible
- Total new cost: <1% of frame budget

The expensive part is the fluid sim and ASCII shader. Depth layers are all canvas draws — essentially free.

## Decisions (2026-03-28)

1. **Tilt direction**: Random axial tilt per well (~15-30° from vertical, random angle). Each well looks like it's viewed from a slightly different perspective. Creates visual variety without any camera changes.

2. **Depth-based brightness**: Yes, but conservative — the game is already dark and we struggle with contrast. Back-depth at 60% (not 40%), front-depth at 85% (not full brightness). Don't dim gameplay entities — only depth-layer decorative elements.

3. **Speed lines**: Yes on ship movement. Appear when speed exceeds a threshold. Not fluid-coupled (too complex for the visual payoff).

4. **Audio depth**: Yes — sounds from back-depth (behind game plane) get a subtle low-pass filter. Future-safe spatial feature even if not all sounds use it initially. Can always disable if it muddies the mix.

## The Split-Circle Cheat

The cheapest way to fake Z-sorting: **draw the bottom half of an object before entities, the top half after.** No camera tilt math needed.

Example for a well's black hole core:
```
// Layer 2 (back depth): bottom half of core circle
ctx.beginPath();
ctx.arc(sx, sy, coreRadius, 0, Math.PI);  // bottom semicircle
ctx.fill();

// ... render ship, entities ...

// Layer 4 (front depth): top half of core circle
ctx.beginPath();
ctx.arc(sx, sy, coreRadius, Math.PI, Math.PI * 2);  // top semicircle
ctx.fill();
```

The ship flies "between" the two halves. The well looks like a 3D object the ship is passing through, not a flat circle on the same plane.

For the accretion disk: same trick. Bottom arc renders behind entities (dimmer), top arc renders in front (brighter, semi-transparent). With a random tilt angle per well, rotate the split line:

```
const tiltAngle = well.tiltAngle;  // random 15-30° offset from vertical
// Back half: tiltAngle to tiltAngle + PI
// Front half: tiltAngle + PI to tiltAngle + 2*PI
```

This is essentially free — two extra arc draws per visible well per frame. The visual payoff is enormous relative to the cost.

### What Gets Split

| Object | Back half (Layer 2) | Front half (Layer 4) |
|--------|--------------------|--------------------|
| Well core (black circle) | Bottom semicircle, full opacity | Top semicircle, full opacity |
| Accretion disk | Far arc, 60% brightness | Near arc, 85% brightness, 70% alpha |
| Halo ring | Back arc of ellipse | Front arc of ellipse |
| Star halo | Outer glow, dimmer | (none — stars don't occlude) |
| Beacon beam | (none) | Beam renders on top when passing over ship |

### What Doesn't Get Split

Everything at the entity plane stays flat: ship, scavengers, comets, wrecks, portals. These are all at "flight altitude." Only large cosmic objects that the ship conceptually flies through get the split treatment.
