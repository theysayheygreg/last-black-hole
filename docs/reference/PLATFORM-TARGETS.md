# Platform Targets

This is the blunt assessment for `Last Singularity` after the web jam build.

The game should stay web-first during the jam. After that, the first serious platform question is not "where can it run?" It is "which target gives us the most leverage without forcing a rewrite too early?"

## Recommendation

Do not treat a native SwiftUI + Metal port as the first post-jam product move.

That path is real, and it fits the game well long-term, but it is a rewrite, not a port. The shortest useful path is:

1. keep the web build as the gameplay source of truth
2. make controller support rock-solid there
3. ship the browser build to itch.io for fast private sharing
4. package it for desktop so it can be tested as a macOS `.app`, Windows `.exe`, and Linux desktop build
5. use that Linux/Windows desktop shape for Steam Deck testing
6. make iPad a native Apple-platform bench: SwiftUI shell first, Metal probe
   after the snapshot/input contract is ready
7. only then decide whether the game has earned a full native production renderer

## itch.io

### Why itch belongs in the plan

For this project, itch.io is not just a storefront. It is the fastest way to get a real playable build in front of friends without building account systems, hosting, or a launcher.

The official docs back that up:

- HTML5 uploads: [Uploading HTML5 games](https://itch.io/docs/creators/html5)
- page visibility and private sharing: [Access control](https://itch.io/docs/creators/access-control)
- project setup basics: [Your first itch.io page](https://itch.io/docs/creators/getting-started)

### What itch supports well

Itch will host an HTML5 build directly in the browser if you upload either:

- a ZIP with an `index.html` entry point
- or a single self-contained HTML file

For a normal jam web build, the ZIP route is the right one.

The docs also make the important constraints explicit:

- use relative paths, not absolute paths
- filenames are case-sensitive
- HTML5 projects are meant to stay reasonably small
- the default extracted-size limits are real enough that giant sloppy exports are a bad fit

That makes itch a good target for a tight browser game and a bad target for a bloated export.

### Private friend sharing

This is the useful part for `Last Singularity`.

Itch gives you two clean ways to keep the page semi-private:

- **Restricted** access for explicitly approved people
- **Public but unlisted in search and browse** if you just want a secret-ish shareable link

For quick friend playtests, public-but-unlisted is probably the best default. If you want tighter control, restricted access is there.

### What I would do

For the jam itself:

- make the web build itch-clean
- upload it as HTML5 ZIP
- use an unlisted page for friend testing
- only worry about broader packaging after the game is worth carrying forward

That gets you a live shareable build faster than any native port discussion.

## macOS

### What Apple gives you

Apple's official stack lines up with the game's needs:

- SwiftUI for app shell and interface: [Drawing and graphics](https://developer.apple.com/documentation/swiftui/drawing-and-graphics)
- Metal for rendering and compute-heavy work: [Metal](https://developer.apple.com/documentation/metal)
- Game Controller for pads, haptics, and controller discovery: [Supporting Game Controllers](https://developer.apple.com/documentation/gamecontroller/supporting-game-controllers)

That makes a native macOS build plausible for `Last Singularity`, especially because the game wants:

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

### Practical macOS packaging path

For friend playtests, the useful output is a `.app` bundle, not a renderer rewrite.

The clean path is:

- keep the game as the web runtime
- wrap it in a lightweight desktop shell
- export a macOS `.app`
- test fullscreen, controller support, startup friction, and save location

That is enough to get the game onto another Mac without forcing a native port decision too early.

### When the native macOS port makes sense

Do the SwiftUI + Metal version only if at least one of these becomes true:

- the web renderer is the clear performance ceiling
- controller and haptics need tighter native integration
- the game becomes commercial enough that native fit and polish matter
- you want Mac to be the flagship platform rather than just a supported one

## Windows

### What matters for Windows playtests

For Windows, the goal is not elegance. The goal is frictionless sharing.

You want:

- one package someone can launch without a browser ritual
- controller behavior that matches the web and macOS builds
- no second gameplay codepath

That makes Windows a good fit for the same thin-shell strategy as macOS.

### The simpler Windows path

Do not build a special Windows renderer.

Wrap the web build in a desktop shell and ship either:

- a portable `.exe`
- or a tiny installer that produces the same `.exe` app bundle

The important thing is that Windows stays on the same gameplay runtime as the browser build.

### What the Windows wrapper should prove

Before you call Windows "done enough" for playtests, it should prove:

- double-click launch works without manual setup
- controller support works the same way it does in the browser
- fullscreen and windowed behavior are both sane
- config/save locations are predictable
- packaging does not introduce obvious input lag or perf regressions

If that holds, you have a viable Windows playtest path without any native rewrite.

### Recommended desktop packaging strategy

Treat macOS and Windows as one packaging track:

- one web gameplay runtime
- one desktop shell strategy
- outputs for:
  - macOS `.app`
  - Windows `.exe`
  - Linux desktop build
  - Steam Deck testing through the same desktop build shape

That keeps the engineering honest. One game, multiple wrappers.

## Linux

### Why Linux matters

Linux is not just a nice extra here. It is the cleanest bridge to Steam Deck.

If you can run the same wrapped web build natively on Linux, you learn more than you do from a Windows-only Proton path.

### The simple Linux path

Use the same thin desktop shell strategy as macOS and Windows.

That gives you:

- one gameplay runtime
- one packaging model
- a native Linux build to test on desktop Linux or Steam Deck Desktop Mode

This is the right Deck-adjacent target to have before you start caring about Steam-specific plumbing.

## iPad

### What the first iPad target should be

Do not mistake the iPad path for a web-install convenience target.

The iPad target has the same strategic purpose as the Switch target: it is a
hardware and platform-competence bench. It should teach us SwiftUI, Metal,
iOS-specific controller behavior, audio, lifecycle, signing, performance, and
handheld readability.

The first useful iPad rung is still a controller-first local web app build:

- serve the build over HTTP
- open it in Safari on iPad
- use "Add to Home Screen"
- play with a controller, not touch-first UI

That gets a real iPad playtest surface quickly, but it is not the destination.

### Native iPad bench direction

The native lane should advance in deliberate rungs:

- `WKWebView` shell for SwiftUI lifecycle, signing, orientation, safe areas,
  controller behavior, WebKit limits, and remote-authority launch URLs.
- `MetalKit` bench view for clear/frame timing, controller telemetry, and a
  single moving marker.
- recorded-snapshot Metal renderer for ship, wells, wrecks, portal, coarse
  flow, and HUD-critical values.
- production native renderer only if the bench proves it should replace or
  supplement the Three/WebKit path.

Like Switch, iPad should not become a second game. Native renderer probes should
consume recorded or live authoritative snapshots before any gameplay logic is
ported.

### Current iPad implementation

The repo now has both early iPad lanes:

- `npm run build:ipad` stages the controller-first Safari/Add-to-Home-Screen web
  app.
- `npm run ios:build:sim` builds a thin native `WKWebView` shell around the same
  synced web runtime.

The native shell is the first bench rung, not the final SwiftUI/Metal port. It
can run the client-only sandbox by itself, or it can point at a Mac/mini sim
server with a `simServer` URL. Physical iPad installs remain blocked on Apple
signing and real device verification. See [iPad / iOS Build Path](IPAD-IOS-BUILD.md).

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
- test it on Steam Deck through the wrapper from Gaming Mode as a non-Steam app
- if it earns a Steam release, align with Steam Input and Deck compatibility expectations

That is the right order because it proves the feel before you commit to platform-specific engineering.

## Current pipeline update

The first deployment scripts now exist:

- `npm run deploy:deck` copies the Linux package to a Tailscale-visible Steam Deck.
- `npm run deck:gaming-mode` registers the deployed wrapper as a Steam non-Steam shortcut for Gaming Mode.
- `npm run deploy:itch` stages an itch-specific HTML5 artifact and pushes it with butler.
- `npm run deploy:steam` prepares SteamPipe depot content and VDF scripts.
- `.github/workflows/nightly-playables.yml` refreshes public playtest artifacts weekly when new commits exist.

The important build-target delta is documented in [Deployment Pipelines](DEPLOYMENT-PIPELINES.md):

- Deck should not use the raw web folder; it wants the Linux Electron package and handheld/controller checks.
- itch HTML5 should not depend on the Node authority stack; it uses a staged sandbox build unless we choose downloadable desktop channels.
- Steam should not ship the HTML5 artifact; it wants desktop depots with Steamworks launch/configuration work.

### Custom app loading and testing

For internal testing, the practical path is straightforward:

- run the build from Desktop Mode only for crash triage
- add the wrapper as a non-Steam game with `deck:gaming-mode`
- test controller behavior, UI scale, and performance on actual Deck hardware

That is enough to answer the early questions.

Do not overbuild deployment machinery before you know the game survives controller play.

### Controller support

Steam Deck is unforgiving about bad controller assumptions.

`Last Singularity` needs:

- full controller navigation from launch to quit
- readable HUD and text at handheld distance
- explicit glyph and prompt strategy
- Steam Input awareness if you ship on Steam

The most important early outcome is not "special Deck code." It is "the game is honestly controller-first."

## Switch 1

Switch 1 is not a direct extension of the current desktop package.

The current Electron/Three/Node runtime should be treated as a PC/web/Steam Deck
shape. A Switch 1 build would be a port or renderer probe, not another wrapper
target.

The practical research path is:

- keep Atmosphere/homebrew work private and experimental;
- use it only on prepared lab hardware, never as a public distribution plan;
- build an engine-neutral snapshot/input/content contract first;
- test a tiny renderer shell before porting any gameplay logic;
- keep the official Nintendo developer route as the only commercial answer.

See [Switch 1 / Atmosphere Feasibility](../project/SWITCH1-ATMOSPHERE-FEASIBILITY.md)
for the current recommendation.

## What I would do

After the jam:

First, make the browser build controller-clean and itch-clean.

Second, put it on itch.io for private friend sharing and fast iteration.

Third, make desktop packages and test them as a macOS `.app`, Windows `.exe`, and Linux desktop build.

Fourth, use the Linux and Windows builds for Steam Deck testing.

Fifth, use iPad as an Apple-platform bench: local install first, native shell
next, Metal snapshot probe after the shared contracts are ready.

Sixth, decide whether the game has earned a native renderer.

If it has, start with macOS native only if you want the game to become a long-term polished product. Otherwise keep the web runtime and spend your time on content, feel, and survival.

## Strong opinion

The first post-jam product target should be an itch-ready web build with strong controller support, followed by thin wrappers for macOS, Windows, Linux, and iPad bench work, not a full SwiftUI + Metal production rewrite.

That path teaches you more, faster, and it does not force you to reinvent the game before you know the game is worth carrying forward.
