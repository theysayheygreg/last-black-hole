# iPad / iOS Build Path

Last Singularity stays web-runtime-first on iPad. The iOS path is a wrapper around
the same `index-a.html` + `src/` runtime used by browser and desktop builds. It
does not port gameplay, the sim, or the renderer to native code.

## Current Recommendation

Use two iPad surfaces, in this order:

1. Safari Add to Home Screen for the lowest-friction controller playtest.
2. The native `WKWebView` wrapper when you need an installed app shell,
   simulator/device builds, or iOS lifecycle testing.

The native wrapper can be self-contained only in sandbox mode. Product-faithful
authority play still needs a separate Mac/mini sim server reachable over LAN or
Tailscale, because iOS does not run the current Node authority stack in-app.

## What Exists

- `ios/LastSingularity.xcodeproj` - thin SwiftUI iPad app shell.
- `ios/LastSingularity/WebGameView.swift` - full-screen `WKWebView` host.
- `ios/LastSingularity/WebAppSchemeHandler.swift` - serves the synced web bundle
  through the local `lbh://app/` scheme so ES modules and JSON assets load from
  one origin.
- `ios/Config/*.xcconfig` - bundle id, deployment target, team, and optional
  remote sim URL build settings.
- `scripts/ios-wrapper.cjs` - sync/build helper.

The generated web payload lives at `ios/LastSingularity/WebApp/` and is ignored
by git. Regenerate it instead of editing it.

## Commands

Sync the web runtime into the iOS wrapper:

```sh
npm run ios:sync -- --mode=release
```

Build for an iPad simulator:

```sh
npm run ios:build:sim -- --mode=release
```

The default simulator build uses `generic/platform=iOS Simulator`, which is a
compile gate and does not require a booted simulator. Choose a simulator
explicitly when you want a named runtime:

```sh
npm run ios:build:sim -- --mode=release --simulator="iPad Pro (11-inch) (M4)"
```

Open the project in Xcode:

```sh
npm run ios:open
```

The simulator build disables signing with `CODE_SIGNING_ALLOWED=NO`, so it
should build without an Apple Developer Team.

## Remote Authority Mode

The iOS app defaults to `?localSandbox=1` when no sim URL is configured. To test
against real authority, expose the sim server from a Mac/mini that the iPad can
reach:

```sh
LBH_SIM_HOST=0.0.0.0 npm run sim -- --host=0.0.0.0 --keep-alive=true
```

Then build the iOS wrapper with that sim URL:

```sh
npm run ios:build:sim -- --mode=release --sim-server=http://HOST_OR_TAILSCALE_IP:8787
```

For a physical iPad device build, use the same `--sim-server` value if the app
should join remote authority. Use the Mac's Tailscale IP or LAN IP rather than
`127.0.0.1`; on iPad, localhost means the iPad itself.

## Device Builds

Device builds require Apple signing. Set a team and, if needed, a machine-local
bundle id:

```sh
cp ios/Config/Local.example.xcconfig ios/Config/Local.xcconfig
```

Edit `ios/Config/Local.xcconfig`:

```xcconfig
LBH_DEVELOPMENT_TEAM = ABCDE12345
LBH_BUNDLE_IDENTIFIER = com.yourdomain.lastsingularity
LBH_SIM_SERVER_URL = http://100.x.y.z:8787
```

Then build:

```sh
npm run ios:build:device -- --mode=release --team=ABCDE12345
```

For first device install, opening the project in Xcode and selecting the iPad is
still the most practical route because Xcode can repair provisioning profiles
and show signing errors directly.

## What Works Now

- A synced static iPad web payload can be generated from the current source tree.
- The native iOS wrapper builds for simulator without signing once Xcode's
  matching iOS platform/runtime is installed.
- The wrapper launches the current web runtime in landscape and forces sandbox
  mode unless a remote sim URL is supplied.
- A remote-authority URL can be baked at build time through `LBH_SIM_SERVER_URL`
  / `--sim-server`.

## Blockers And Risks

- Physical iPad deployment is blocked until Greg/Codex supplies an Apple
  Developer Team and a valid signing identity/provisioning profile.
- The iOS app cannot embed the Node control plane or sim. Remote authority must
  run on another machine, or the app must use sandbox mode.
- Controller behavior depends on WebKit's Gamepad API behavior for the installed
  wrapper. That still needs real iPad hardware testing.
- WebGL2 and audio need a real device smoke pass before this becomes a trusted
  playtest lane.
- TestFlight/App Store output is intentionally not implemented yet.

## Troubleshooting

If `xcodebuild` reports that the iOS platform is not installed, or that
CoreSimulator is out of date, fix Xcode before debugging the project. In Xcode,
open Settings -> Components and install the matching iOS platform/runtime, then
rerun:

```sh
npm run ios:build:sim -- --mode=release
```

## Why This Shape

This keeps one gameplay runtime, one renderer, and one authority protocol. A
native Swift/Metal port remains a future product decision, not the first iPad
build step.
