#!/usr/bin/env python3
"""
Analyze a reference audio file and output a structured JSON recipe
for recreating it in Web Audio synthesis.

Bridges the gap between "listen to this reference" and "write Web Audio code"
by extracting pitch, envelope, spectral character, and suggested synthesis params.

Usage:
  python3 tools/analyze-audio.py reference.wav
  python3 tools/analyze-audio.py reference.wav --spectrogram

Dependencies:
  pip install librosa numpy matplotlib
"""
import sys, json, argparse
import numpy as np

def analyze(path):
    import librosa

    y, sr = librosa.load(path, sr=None)
    duration = len(y) / sr

    # --- Pitch detection ---
    f0, voiced, _ = librosa.pyin(y, fmin=20, fmax=8000, sr=sr)
    f0_clean = f0[~np.isnan(f0)]

    # --- Spectral features ---
    spectral_centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))
    spectral_rolloff = float(np.mean(librosa.feature.spectral_rolloff(y=y, sr=sr)))

    # --- Envelope (RMS energy over time) ---
    rms = librosa.feature.rms(y=y)[0]
    hop = 512  # librosa default
    peak_frame = int(np.argmax(rms))
    peak_time = peak_frame * hop / sr

    # Attack time (10% to 90% of peak)
    max_rms = float(np.max(rms))
    t10 = max_rms * 0.1
    t90 = max_rms * 0.9
    attack_start = next((i for i, v in enumerate(rms) if v > t10), 0)
    attack_end = next((i for i, v in enumerate(rms) if v > t90), peak_frame)
    attack_time = max(0.001, (attack_end - attack_start) * hop / sr)

    # Decay time (peak to 10% after peak)
    post_peak = rms[peak_frame:]
    decay_end = next((i for i, v in enumerate(post_peak) if v < t10), len(post_peak) - 1)
    decay_time = decay_end * hop / sr

    # --- Harmonic vs noise ---
    harmonic, percussive = librosa.effects.hpss(y)
    h_energy = float(np.sum(harmonic**2))
    p_energy = float(np.sum(percussive**2))
    hnr = h_energy / (p_energy + 1e-10)

    # --- Classify ---
    if hnr > 10:
        character = 'tonal_clean'
    elif hnr > 2:
        character = 'tonal_rich'
    elif hnr > 0.5:
        character = 'mixed'
    else:
        character = 'noise'

    if spectral_centroid > 3000:
        brightness = 'bright'
    elif spectral_centroid > 1500:
        brightness = 'medium'
    else:
        brightness = 'dark'

    sweep = 'steady'
    if len(f0_clean) > 1:
        if f0_clean[-1] > f0_clean[0] * 1.1:
            sweep = 'rising'
        elif f0_clean[-1] < f0_clean[0] * 0.9:
            sweep = 'falling'

    # --- Build recipe ---
    recipe = {
        'file': path,
        'duration_s': round(duration, 3),
        'sample_rate': sr,
        'pitch': {
            'start_hz': round(float(f0_clean[0]), 1) if len(f0_clean) > 0 else None,
            'end_hz': round(float(f0_clean[-1]), 1) if len(f0_clean) > 0 else None,
            'mean_hz': round(float(np.mean(f0_clean)), 1) if len(f0_clean) > 0 else None,
            'sweep': sweep,
        },
        'envelope': {
            'attack_s': round(attack_time, 4),
            'decay_s': round(decay_time, 4),
            'peak_time_s': round(peak_time, 4),
            'total_duration_s': round(duration, 4),
            'shape': 'percussive' if attack_time < 0.02 else 'gradual',
        },
        'spectral': {
            'centroid_hz': round(spectral_centroid),
            'rolloff_hz': round(spectral_rolloff),
            'brightness': brightness,
            'character': character,
            'harmonic_to_noise_ratio': round(hnr, 2),
        },
        'suggested_web_audio': {
            'oscillator_type': (
                'sine' if character == 'tonal_clean'
                else 'square' if character == 'tonal_rich'
                else 'sawtooth' if brightness == 'bright' and character == 'mixed'
                else 'custom_noise'
            ),
            'duty_cycle': 0.5 if character == 'tonal_rich' else None,
            'filter_type': 'lowpass' if brightness != 'bright' else None,
            'filter_freq': round(spectral_rolloff) if brightness != 'bright' else None,
            'needs_noise_layer': character in ('mixed', 'noise'),
            'echo_suggested': duration > 0.3,
        },
    }

    return recipe

def make_spectrogram(path, output_path=None):
    import librosa, librosa.display
    import matplotlib.pyplot as plt

    y, sr = librosa.load(path, sr=None)

    fig, axes = plt.subplots(3, 1, figsize=(14, 10))

    # Mel spectrogram
    S = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=128)
    librosa.display.specshow(librosa.power_to_db(S, ref=np.max),
                             y_axis='mel', x_axis='time', ax=axes[0], sr=sr)
    axes[0].set_title('Mel Spectrogram (frequency content)')

    # Waveform
    librosa.display.waveshow(y, sr=sr, ax=axes[1])
    axes[1].set_title('Waveform (envelope shape)')

    # Chromagram (pitch content)
    chroma = librosa.feature.chroma_stft(y=y, sr=sr)
    librosa.display.specshow(chroma, y_axis='chroma', x_axis='time', ax=axes[2], sr=sr)
    axes[2].set_title('Chromagram (pitch content)')

    plt.tight_layout()

    if not output_path:
        output_path = path.rsplit('.', 1)[0] + '_analysis.png'
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    print(f'Spectrogram saved: {output_path}')
    return output_path

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Analyze audio for Web Audio synthesis')
    parser.add_argument('file', help='Audio file to analyze (.wav, .mp3, .ogg, .flac)')
    parser.add_argument('--spectrogram', '-s', action='store_true',
                        help='Also generate a spectrogram image')
    parser.add_argument('--output', '-o', help='Spectrogram output path')
    args = parser.parse_args()

    recipe = analyze(args.file)
    print(json.dumps(recipe, indent=2))

    if args.spectrogram:
        make_spectrogram(args.file, args.output)
