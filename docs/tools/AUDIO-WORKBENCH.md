# Audio Workbench

> Reference in, structured analysis and usable audio out.

## What this ships

The workbench turns a reference clip into:

- normalized analysis source
- `analysis.json` with pitch / envelope / spectral / routing data
- `web_audio_recipe.json` for procedural implementation
- `brief.md` for design review / agent context
- `prompt-sfx.txt` and `prompt-music.txt` for external generators
- `preview.wav` — a locally rendered approximation biased to the chosen palette
- `audio_js_stub.js` — optional starter method + switch-case snippet for `src/audio.js` (`ui_chirp` references for now)
- optional `spectrogram.png`

This is the first real bench for LBH-style audio work: lo-fi, distorted, chip-adjacent, sci-fi, mutable.

It can also emit a **starter `src/audio.js` event stub** for a `ui_chirp`-type reference, so the bench now hands you not just analysis but the first cut of implementation text.

## Install

From the repo root:

```bash
uv venv .venv
. .venv/bin/activate
uv pip install -r tools/audio-requirements.txt
```

Requirements:
- Python 3.9+
- `ffmpeg`

## Usage

### Full workbench pass

```bash
python3 tools/audio_workbench.py /path/to/reference.wav --palette lbh --spectrogram
```

Generate a `src/audio.js` starter stub for a chirp-like event:

```bash
python3 tools/audio_workbench.py /path/to/reference.wav --palette chip --audio-js-event menuMoveRef
```

Outputs land beside the reference by default in:

```text
<reference-stem>-audio-workbench/
```

### Palette choices

- `lbh` — default cosmic dread / chip-era grit / sci-fi wrongness
- `chip` — brighter retro language
- `scifi` — colder modulated synthetic tone
- `lofi` — softer worn-down haze

### Compatibility mode

The older analyzer still works:

```bash
python3 tools/analyze-audio.py /path/to/reference.wav --spectrogram
```

## Recommended workflow

1. Drop a reference clip in.
2. Run the workbench.
3. Read `brief.md` and `analysis.json`.
4. Use `web_audio_recipe.json` for in-engine design.
5. Listen to `preview.wav` for a quick local sketch.
6. Feed `prompt-sfx.txt` or `prompt-music.txt` into heavier generation backends when needed.

## Why this shape

LBH should not be trapped inside its current SNES-style implementation, but it **should** preserve its logic:
- sound as feedback
- grit over polish
- mutable identity
- procedural-first where possible

The workbench therefore outputs **recipes and rendered previews**, not just prompts.

## Future sockets

Next good extensions:
- CLAP / embedding similarity search
- stem separation for reference decomposition
- AudioCraft / MusicGen / AudioGen backend adapters
- A/B compare (`reference` vs `preview`) and delta report
- MCP wrapper for direct tool calls from agent sessions
