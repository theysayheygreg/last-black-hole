# Platform Targets

This is the blunt assessment for `Last Black Hole` after the web jam build.

The game should stay web-first during the jam. After that, the first serious platform question is not "where can it run?" It is "which target gives us the most leverage without forcing a rewrite too early?"

## Recommendation

Do not treat a native SwiftUI + Metal port as the first post-jam move.

That path is real, and it fits the game well long-term, but it is a rewrite, not a port. The shortest useful path is:

1. keep the web build as the gameplay source of truth
2. make controller support rock-solid there
3. package it for desktop so it can be tested on macOS and Steam Deck
4. only then decide whether the game has earned a full native renderer

## macOS

### What Apple gives you

Apple's official stack lines up with the game's needs:

- SwiftUI for app shell and interface: [Drawing and graphics](https://developer.apple.com/documentation/swiftui/drawing-and-graphics)
- Metal for rendering and compute-heavy work: [Metal](https://developer.apple.com/documentation/metal)
- Game Controller for pads, haptics, and controller discovery: [Supporting Game Controllers](https://developer.apple.com/documentation/gamecontroller/supporting-game-controllers)

That makes a native macOS build plausible for `Last Black Hole`, especially because the game wants:

- GPU-driven fluid and post-process work
- strong fullscreen presentation
- controller support
- a custom HUD and render pipeline

### What a native macOS port really means

If you go native, the real shape is:

- SwiftUI app shell for menus, settings, launch, and overlays
- Metal renderer for the game view
- Game Controller input layer for DualSense/Xbox/pads

That is clean. It is also a real rewrite of the runtime path.

The fluid sim, ASCII pass, and likely parts of the control feel would all need to be rebuilt in Metal rather than just wrapped.

### The simpler macOS path

The simplest post-jam move is not a rewrite. It is a shell:

- package the web build in a desktop app shell
- verify fullscreen, input, save path, and performance on macOS
- use that to learn whether the game deserves a native pass

That buys you real macOS playtesting with almost no design churn.

### When the native macOS port makes sense

Do the SwiftUI + Metal version only if at least one of these becomes true:

- the web renderer is the clear performance ceiling
- controller and haptics need tighter native integration
- the game becomes commercial enough that native fit and polish matter
- you want Mac to be the flagship platform rather than just a supported one

## Steam Deck

### What Valve cares about

Valve's official Steam Deck developer docs are here:

- [Steam Deck](https://partner.steamgames.com/doc/steamdeck)
- [Steam Input](https://partner.steamgames.com/doc/features/steam_controller)

The important practical points are:

- Deck is a SteamOS/Linux target first
- Proton compatibility matters if you ship a Windows build
- controller-first input matters
- Deck compatibility and verification are their own review surface

So the question is not just "does it launch?" The question is "does it feel like a Deck game?"

### The simplest Deck path

The simplest Deck path is not a bespoke native Deck build.

It is:

- package the game as a desktop app
- make the game fully playable on controller
- test it on Steam Deck in Desktop Mode and as a non-Steam app
- if it earns a Steam release, align with Steam Input and Deck compatibility expectations

That is the right order because it proves the feel before you commit to platform-specific engineering.

### Custom app loading and testing

For internal testing, the practical path is straightforward:

- run the build in Desktop Mode
- add it as a non-Steam game if needed
- test controller behavior, UI scale, and performance on actual Deck hardware

That is enough to answer the early questions.

Do not overbuild deployment machinery before you know the game survives controller play.

### Controller support

Steam Deck is unforgiving about bad controller assumptions.

`Last Black Hole` needs:

- full controller navigation from launch to quit
- readable HUD and text at handheld distance
- explicit glyph and prompt strategy
- Steam Input awareness if you ship on Steam

The most important early outcome is not "special Deck code." It is "the game is honestly controller-first."

## What I would do

After the jam:

First, make the browser build controller-clean.

Second, make a desktop package and test it on macOS and Steam Deck.

Third, decide whether the game has earned a native renderer.

If it has, start with macOS native only if you want the game to become a long-term polished product. Otherwise keep the web runtime and spend your time on content, feel, and survival.

## Strong opinion

The first post-jam target should be a desktop-wrapped web build with strong controller support, not a SwiftUI + Metal rewrite.

That path teaches you more, faster, and it does not force you to reinvent the game before you know the game is worth carrying forward.
