# Audio Analysis Pipeline

> How to get reference audio into Claude's context for sound design iteration.

## The Problem

Claude can't listen to audio files. But sound design needs reference — "make the loot chime sound more like Chrono Trigger" requires understanding what Chrono Trigger's coin sound actually does technically.

## The Bridge: Audio → Structured Data → Claude

Three approaches, from zero-setup to full pipeline.

### Approach 1: Spectrograms (works today)

Claude can read images. A spectrogram shows frequency, timing, amplitude, and harmonic structure visually — enough to understand most sounds.

```bash
# Option A: sox (install via brew install sox)
sox reference.wav -n spectrogram -o reference.png

# Option B: ffmpeg + librosa (install via pip install librosa matplotlib)
python3 -c "
import librosa, librosa.display, matplotlib.pyplot as plt, sys
y, sr = librosa.load(sys.argv[1])
fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 8))
# Mel spectrogram (frequency content)
S = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=128)
librosa.display.specshow(librosa.power_to_db(S), y_axis='mel', x_axis='time', ax=ax1)
ax1.set_title('Mel Spectrogram')
# Waveform (envelope)
librosa.display.waveshow(y, sr=sr, ax=ax2)
ax2.set_title('Waveform')
plt.tight_layout()
plt.savefig(sys.argv[1].replace('.wav','.png').replace('.mp3','.png'), dpi=150)
print(f'Saved spectrogram')
" reference.wav
```

Send the .png to Claude. He can see:
- Pitch contour (horizontal lines = sustained notes, curves = sweeps)
- Harmonic structure (evenly spaced horizontal lines = clean tone, noise = filled blob)
- Envelope shape (attack/decay visible in brightness over time)
- Duration and timing
- Noise vs tonal content

### Approach 2: Structured Analysis (recommended)

A Python script that extracts key audio parameters and outputs JSON that Claude can directly translate to Web Audio code.

**Setup:**
```bash
pip install librosa numpy
```

**Script: `tools/analyze-audio.py`**
```python
#!/usr/bin/env python3
"""
Analyze a reference audio file and output a structured JSON recipe
for recreating it in Web Audio synthesis.

Usage: python3 tools/analyze-audio.py reference.wav
"""
import sys, json, numpy as np
import librosa

def analyze(path):
    y, sr = librosa.load(path, sr=None)
    duration = len(y) / sr

    # Pitch detection
    f0, voiced, _ = librosa.pyin(y, fmin=20, fmax=8000, sr=sr)
    f0_clean = f0[~np.isnan(f0)]

    # Spectral features
    spectral_centroid = np.mean(librosa.feature.spectral_centroid(y=y, sr=sr))
    spectral_rolloff = np.mean(librosa.feature.spectral_rolloff(y=y, sr=sr))

    # Envelope (RMS energy over time)
    rms = librosa.feature.rms(y=y)[0]
    peak_frame = np.argmax(rms)
    peak_time = peak_frame * 512 / sr  # hop_length=512 default

    # Attack time (10% to 90% of peak)
    threshold_10 = np.max(rms) * 0.1
    threshold_90 = np.max(rms) * 0.9
    attack_start = next((i for i, v in enumerate(rms) if v > threshold_10), 0)
    attack_end = next((i for i, v in enumerate(rms) if v > threshold_90), peak_frame)
    attack_time = (attack_end - attack_start) * 512 / sr

    # Decay time (peak to 10% after peak)
    post_peak = rms[peak_frame:]
    decay_end = next((i for i, v in enumerate(post_peak) if v < threshold_10), len(post_peak) - 1)
    decay_time = decay_end * 512 / sr

    # Harmonic vs noise
    harmonic, percussive = librosa.effects.hpss(y)
    hnr = np.sum(harmonic**2) / (np.sum(percussive**2) + 1e-10)

    # Zero crossing rate (high = noisy, low = tonal)
    zcr = np.mean(librosa.feature.zero_crossing_rate(y))

    # Classify waveform character
    if hnr > 10:
        character = 'tonal_clean'  # sine-like
    elif hnr > 2:
        character = 'tonal_rich'   # square/saw-like (harmonics present)
    elif hnr > 0.5:
        character = 'mixed'        # tone + noise
    else:
        character = 'noise'        # mostly noise

    # Classify spectral brightness
    if spectral_centroid > 3000:
        brightness = 'bright'
    elif spectral_centroid > 1500:
        brightness = 'medium'
    else:
        brightness = 'dark'

    recipe = {
        'file': path,
        'duration_s': round(duration, 3),
        'pitch': {
            'start_hz': round(float(f0_clean[0]), 1) if len(f0_clean) > 0 else None,
            'end_hz': round(float(f0_clean[-1]), 1) if len(f0_clean) > 0 else None,
            'mean_hz': round(float(np.mean(f0_clean)), 1) if len(f0_clean) > 0 else None,
            'sweep': 'rising' if len(f0_clean) > 1 and f0_clean[-1] > f0_clean[0] * 1.1
                     else 'falling' if len(f0_clean) > 1 and f0_clean[-1] < f0_clean[0] * 0.9
                     else 'steady',
        },
        'envelope': {
            'attack_s': round(max(0.001, attack_time), 4),
            'decay_s': round(decay_time, 4),
            'peak_time_s': round(peak_time, 4),
            'shape': 'percussive' if attack_time < 0.02 else 'gradual',
        },
        'spectral': {
            'centroid_hz': round(float(spectral_centroid), 0),
            'rolloff_hz': round(float(spectral_rolloff), 0),
            'brightness': brightness,
            'character': character,
            'harmonic_to_noise_ratio': round(float(hnr), 2),
        },
        'suggested_web_audio': {
            'oscillator_type': 'sine' if character == 'tonal_clean'
                              else 'square' if character == 'tonal_rich'
                              else 'sawtooth' if brightness == 'bright' and character == 'mixed'
                              else 'noise',
            'filter_type': 'lowpass' if brightness == 'dark' else None,
            'filter_freq': round(float(spectral_rolloff), 0) if brightness != 'bright' else None,
        },
    }

    return recipe

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python3 analyze-audio.py <audio-file>')
        sys.exit(1)

    result = analyze(sys.argv[1])
    print(json.dumps(result, indent=2))
```

**Example output:**
```json
{
  "file": "chrono-trigger-coin.wav",
  "duration_s": 0.245,
  "pitch": {
    "start_hz": 523.3,
    "end_hz": 784.0,
    "mean_hz": 653.6,
    "sweep": "rising"
  },
  "envelope": {
    "attack_s": 0.012,
    "decay_s": 0.198,
    "peak_time_s": 0.015,
    "shape": "percussive"
  },
  "spectral": {
    "centroid_hz": 2100,
    "rolloff_hz": 4500,
    "brightness": "medium",
    "character": "tonal_rich",
    "harmonic_to_noise_ratio": 5.2
  },
  "suggested_web_audio": {
    "oscillator_type": "square",
    "filter_type": "lowpass",
    "filter_freq": 4500
  }
}
```

Claude reads this and writes:
```javascript
_playLootChime(now, vol, pan) {
  const osc = this._createSquare(0.25);
  osc.frequency.setValueAtTime(523, now);        // from pitch.start_hz
  osc.frequency.linearRampToValueAtTime(784, now + 0.2); // sweep to end_hz
  // ... envelope from attack/decay ...
}
```

### Approach 3: MCP Server (full agent loop)

Build an MCP server that gives Claude direct access to audio tools during a conversation.

**Tools the server would expose:**

```typescript
// Analyze a reference audio file
analyze_audio(path: string) → AudioRecipe (JSON)

// Generate a spectrogram image Claude can see
spectrogram(path: string) → image/png

// Render Web Audio params to a .wav for A/B comparison
render_preview(recipe: WebAudioParams) → path to .wav

// Compare two audio files (reference vs synthesis)
compare_audio(reference: string, synthesis: string) → DiffReport

// Extract a short clip from a longer file
extract_clip(path: string, start_s: number, end_s: number) → path to .wav
```

**The workflow becomes:**
1. Greg: "make the loot sound more like this" + drops a .wav
2. Claude calls `analyze_audio(reference.wav)` → gets structured recipe
3. Claude calls `spectrogram(reference.wav)` → sees the frequency content
4. Claude adjusts `_playLootChime()` parameters to match
5. Claude calls `render_preview(new_params)` → generates a .wav
6. Claude calls `compare_audio(reference.wav, preview.wav)` → sees the spectral diff
7. Claude iterates until `compare_audio` shows convergence
8. Greg listens to the preview, gives feedback, Claude adjusts

**Implementation:** The MCP server is ~200 lines of Python using librosa + soundfile. It runs locally alongside Claude Code. Setup:

```bash
pip install librosa soundfile matplotlib numpy mcp
```

The server definition would go in Claude Code's MCP config:
```json
{
  "mcpServers": {
    "audio": {
      "command": "python3",
      "args": ["tools/audio-mcp-server.py"]
    }
  }
}
```

## When to Use What

| Scenario | Approach |
|----------|----------|
| Quick reference ("sounds like X") | Describe it in words — fastest |
| Specific sound to match | Spectrogram image (Approach 1) |
| Precise parameter matching | Structured analysis (Approach 2) |
| Iterative sound design session | MCP server (Approach 3) |
| Music composition | Approach 3 + MIDI output tools |

## Dependencies

```bash
# For Approach 1 (spectrograms only)
pip install librosa matplotlib

# For Approach 2 (analysis script)
pip install librosa numpy

# For Approach 3 (MCP server)
pip install librosa soundfile matplotlib numpy mcp

# Alternative: sox for quick spectrograms without Python
brew install sox
```

## Future Extensions

- **MIDI output**: analyze a reference track's melody and output MIDI that Claude can arrange
- **Instrument matching**: classify reference sounds into SNES instrument categories (pulse, triangle, noise, sample)
- **Batch analysis**: analyze an entire game's SFX folder and output a style guide
- **A/B testing harness**: play reference and synthesis side by side in the browser
- **Web Audio graph visualization**: render the audio node graph as a diagram Claude can inspect
