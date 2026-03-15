# Gemini Pre-Vis & Key Art Prompts

> Prompts for Gemini image generation. Goal: concept art for the visual direction, key art for the jam submission page, and pre-visualization of specific game moments.

---

## Visual Direction Reference

Before generating: the game renders through an ASCII dithering shader. The world is colored ASCII characters on a black background. Think colored terminal art meets fluid dynamics. NOT pixel art, NOT retro 8-bit. Closer to a data visualization that happens to be beautiful.

Key colors:
- Deep void: dark blue-purple (#000033)
- Warm radiation near black holes: amber/red-orange
- Portals: cyan-green (#58F2A5)
- Inhibitor: magenta/wrong-pink (#FF2D7B)
- HUD: NERV/EVA inspired — green nominal, orange warning, red critical on navy/black

---

## Key Art (Jam Submission Hero Image)

### Prompt 1: The Surfer and the Singularity
```
A lone spacecraft surfing a gravity wave toward a massive black hole,
rendered entirely in colored ASCII characters on a pure black background.
The black hole is a void in the center — an absence of characters —
surrounded by dense rings of orange and red ASCII symbols (@ # % $)
that thin to sparse blue dots (. : ;) in the outer void. The spacecraft
is a small bright white chevron leaving a trail of disturbed characters
in its wake. Gravity waves ripple outward from the black hole as
concentric rings of character density. A faint green portal glows in
the distance as cyan-green characters. The overall mood is cosmic dread
mixed with the thrill of velocity. Hard sci-fi aesthetic, not fantasy.
No text overlays. Widescreen 16:9 composition.
```

### Prompt 2: The Extraction (Victory Moment)
```
An ASCII art scene showing a spacecraft entering a glowing portal in
deep space. The portal is a swirling vortex of bright cyan-green ASCII
characters (@ # * +) forming a circular pattern, pulling surrounding
characters inward. Behind the spacecraft, multiple black holes are
visible as dark voids with amber-red character rings, and the space
between them is chaotic with dense churning ASCII symbols showing
turbulent fluid flow. The spacecraft trails collected artifacts as
small golden character clusters. One massive black hole dominates the
background, its pull distorting all nearby characters toward it.
The contrast between the green salvation of the portal and the red
destruction behind creates the tension. Rendered as colored ASCII
characters on black. Hard sci-fi, no fantasy elements. 16:9.
```

### Prompt 3: The Inhibitor Wakes
```
A dark scene rendered in ASCII characters where reality is breaking.
The majority of the screen is normal space — blue-purple sparse ASCII
dots and flowing teal current characters. But from one edge, something
WRONG is entering: bright magenta-pink glitch characters that don't
belong — Unicode symbols, mathematical notation, characters from wrong
alphabets — advancing in a straight line that ignores the flow patterns
of normal space. Where the wrongness touches normal space, characters
corrupt and flicker. A small white spacecraft is fleeing, its wake
visible as disturbed characters. HUD elements in the corners (green
geometric panels in NERV/EVA style) are beginning to glitch and show
corrupted readings. Pure dread. ASCII characters on black background.
Hard sci-fi horror aesthetic. 16:9.
```

---

## Pre-Visualization (Game Moments)

### Prompt 4: Early Run — Exploration
```
Top-down view of a small region of space rendered as colored ASCII
characters on black. A calm scene: sparse blue-purple dot characters
(. : ;) fill most of the space, with gentle flowing patterns suggesting
currents (- ~ = characters in teal). Two gravity wells are visible as
circular regions where characters get denser and warmer-colored toward
amber centers, with dark voids at their cores. Between the wells,
several wreck objects appear as dense gold-amber character clusters
in rectangular shapes ([####] patterns). A few green portal symbols
pulse at the edges. One small white triangle spacecraft navigates
between the wrecks. The feeling is peaceful but foreboding — the
universe is dying slowly. No HUD elements in this image. 16:9.
```

### Prompt 5: Late Run — Chaos
```
Same top-down ASCII character rendering but late in a run. The black
holes have grown massive — their amber-red character rings now dominate
half the screen, with the dark voids at their centers much larger.
The space between is filled with dense, turbulent characters showing
chaotic fluid flow — characters are thick (# @ % X) and the colors
are hot amber and red. Only one portal remains, flickering between
cyan-green and dim gray as it dies. Multiple entity shapes are visible:
small diamond-shaped scavenger ships in yellow-green, organic amorphous
fauna shapes in pale blue, and the player's white triangle desperately
navigating toward the dying portal. Wave interference patterns create
visible rings of character density propagating across the space.
Everything is louder, denser, more dangerous. ASCII on black. 16:9.
```

### Prompt 6: The HUD (UI Reference)
```
A game UI mockup in the style of Neon Genesis Evangelion's NERV
computer interfaces. Black background. In the four corners, clean
geometric panels with thin borders: top-left shows a horizontal
bar meter in green transitioning to orange labeled "SIGNAL",
top-right shows portal status with small circle icons, bottom-left
shows hull integrity as a green bar, bottom-right shows an inventory
count. The center of the screen would be the game (leave it as
dark blue-black void with faint ASCII characters). Across the
center-bottom, a warning banner reads "PORTAL EVAPORATING" in
bold uppercase orange text with slight scan-line effects.
The overall feel is militaristic sci-fi command interface —
sparse, functional, slightly unsettling. Green (#58F2A5) for
nominal values, orange (#F0903A) for warnings. Monospace font
for data, bold serif for warnings. Subtle hexagonal accent
shapes. CRT scan line effect over everything. 16:9.
```

---

## Character/Entity Concepts

### Prompt 7: Ship Designs
```
A reference sheet showing 6 spacecraft designs for a hard sci-fi game,
drawn as simple geometric silhouettes suitable for rendering at very
small sizes (16-32 pixels). Each ship is a variation on a
chevron/triangle/arrow shape. They should be recognizable as different
ships even at tiny scale. Clean white outlines on black background.
Designs should suggest: 1) fast scout, 2) heavy hauler, 3) stealth
runner, 4) balanced explorer, 5) armored tank, 6) fragile speedster.
Minimalist hard sci-fi aesthetic, not ornate. Think Homeworld or
FTL ship silhouettes. Reference sheet layout with labels.
```

### Prompt 8: The Inhibitor
```
Concept art for an extradimensional entity that doesn't belong in
normal space. It should look WRONG — like a rendering error, a
corruption in reality. Rendered as ASCII/text characters but using
characters that don't belong: mathematical symbols, Unicode from
wrong alphabets, zalgo-style stacked diacrittics, characters that
overlap and intersect impossibly. The color is bright magenta-pink
(#FF2D7B) against black. The shape is vaguely geometric but unstable —
edges flicker between states. It moves in a straight line, ignoring
the curves and flows of normal space around it. Surrounding normal
ASCII characters are corrupted and distorted in its proximity.
The feeling should be existential dread — not a monster, but a
mathematical inevitability. Hard sci-fi horror. Black background.
```

---

## Usage Notes

- Generate at highest available resolution
- Request 16:9 aspect ratio for all game scenes (matches browser viewport)
- The ASCII character aesthetic is critical — these should NOT look like smooth rendered 3D or pixel art
- Color palette must be dark/moody — no bright backgrounds, no white space
- If Gemini struggles with "ASCII characters as a rendering medium," try: "text art" or "colored monospace characters on black terminal background" or "data visualization aesthetic"
- For the HUD prompt, reference "Evangelion NERV interface" or "sci-fi command center UI" as Gemini likely has strong associations with these
