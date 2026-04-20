# Deploy to Steam Deck

This is the simple private-testing path for `Last Singularity`.

You do **not** need the Steamworks SDK just to get the current build onto a Steam Deck.

## What to use

Use the Linux desktop target first:

- `/Users/theysayheygreg/clawd/projects/last-black-hole/builds/v0.2.0/Last Singularity-linux-x64`

That is the cleanest Deck path because Steam Deck is really a Linux machine.

The Windows build is still a valid fallback through Proton:

- `/Users/theysayheygreg/clawd/projects/last-black-hole/builds/v0.2.0/Last Singularity-win32-x64`

## Fastest install path

The easiest real-world deployment path is:

1. Boot the Deck into Desktop Mode.
2. Copy the Linux build folder onto the Deck.
3. Add the executable as a non-Steam app.
4. Launch it from Steam and test controller behavior.

That is enough for private playtests.

## Copy options

### Option A: network copy

Best path if the Deck is on the same network:

- use `scp`, `rsync`, or an SMB share
- copy the whole `Last Singularity-linux-x64` folder to the Deck

This is the best future target for automation.

### Option B: USB drive or SD card

If you do not want to set up network copy:

- copy the folder to removable storage from the Mac
- plug that storage into the Deck
- move it into a normal user-accessible folder on the Deck

### Option C: Windows fallback

If the Linux build misbehaves, copy:

- `Last Singularity-win32-x64`

and add the `.exe` as a non-Steam app so Steam can run it with Proton.

## Add as a non-Steam app

On the Deck in Desktop Mode:

1. Open Steam.
2. Use **Games → Add a Non-Steam Game to My Library**.
3. Browse to the executable inside the copied folder.
4. Add it.
5. Return to Gaming Mode if you want to test the normal Deck surface.

Valve's docs confirm that Deck supports installing external apps and adding them from Desktop Mode:

- [Steam Deck FAQ](https://partner.steamgames.com/doc/steamdeck/faq)

## Controller expectations

Before calling a Deck build good, verify:

- the game is fully playable on controller
- the HUD is legible at handheld distance
- fullscreen behavior is sane
- suspend/resume does not immediately break the session

For Steam release quality later, Steam Input and Deck compatibility matter more:

- [Getting your game ready for Steam Deck](https://partner.steamgames.com/doc/steamdeck/recommendations)
- [Steam Input](https://partner.steamgames.com/documentation/controller_templates)

## About plugging the Deck into a Mac

Do not assume a Steam Deck plugged into a Mac by USB-C will show up like an iPhone or a mounted app target.

For this project, the safe assumption is:

- USB connection alone is **not** the deployment model
- network copy or removable storage is the real path
- later, if you enable SSH on the Deck, scripted deploy becomes straightforward

## Best next step

The next useful upgrade is not Steamworks.

It is a tiny deploy script that can push the Linux build to a known Deck hostname over SSH once the Deck is configured for it.
