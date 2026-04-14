# LBH Title Screen Audio Tenet

**Reference:** Weedpecker – "Nothingness"

## Core reading
The LBH title screen is not a menu. It is the thesis image of the whole project:
- one huge black hole
- the player held at a contemplative distance
- the sense that this thing is older than you and will outlast you

The title screen should therefore teach the game's entire emotional contract in miniature.

## Primary intent
The quieter, more subtle guitar notes are the player's first distance-read of the black hole.
They are not "lead guitar" in a rock-song sense. They are the small human thread in the presence of something cosmically older and larger.

Those small notes should gradually give way to the breakdown because that is the game's structure:
1. contemplation
2. attraction
3. submission to scale
4. the universe asserts its mass and process over the human observer

In plain language:
- the title begins as *watching*
- it becomes *falling under the field*

## What this means for the LBH audio engine

### 1. Title state should not use the gameplay bed unchanged
The current title handling in `src/audio.js` lowers the drone and mutes wells, but the title screen wants its own dramatic contour.

The title needs a **two-stage cue** inside the title context:
- **Stage A — distant observation**
- **Stage B — breakdown / gravitational inevitability**

### 2. Stage A: Distant observation
For the first ~20–40 seconds of title idle:
- very sparse upper notes or plucked synth approximations
- low machine/void bed barely present
- lots of air between phrases
- no obvious beat
- the black hole feels huge because the audio leaves room around it

Implementation bias:
- filtered triangle or narrow square/pluck voice
- low gain
- long silence between note groups
- minimal low-end modulation

### 3. Stage B: Breakdown / inevitability
After the observation window, the title should yield to a heavier field:
- low-end drone thickens
- harmonics get rougher
- subtle rhythmic pressure or repeated gravity pulse enters
- the title no longer feels like a static tableau; it feels like a system you are already inside

Implementation bias:
- bring in a sub or low sine/saw blend
- slight distortion / crusher amount increase
- introduce slow repeated pulse beneath the upper notes
- upper notes become less "melodic statement" and more swallowed fragments

### 4. The title cue should loop emotionally, not just musically
A good loop shape:
- sparse opening phrase
- drift and silence
- low-end arrival
- pressure / breakdown
- partial release back to watchfulness

This prevents the title from becoming either:
- a static ambient pad
- or a fully song-driven menu theme

### 5. The whole project should inherit this title grammar
The title screen is the model for LBH as a whole:
- small human signal against massive cosmic process
- beauty first arrives as thin detail
- then mass, pressure, and inevitability take over

That means the game's score at large should preserve this relation:
- delicate/high details are never the world itself
- they are always the fragile reading layer on top of the void
- the low-end field is the real sovereign force

## Concrete engine consequence
Future `title` context in `src/audio.js` should gain its own timer-aware modulation path, not just a static frequency/volume setting.

Suggested title-only parameters:
- `titleIntroDuration`
- `titleBreakdownDuration`
- `titlePluckVolume`
- `titleBedVolume`
- `titlePulseAmount`
- `titleDistortionRamp`

## Design summary
**The title screen should sound like staring too long at a black hole until the act of observation turns into surrender.**
