from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import textwrap
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np

try:
    import librosa
except ImportError:  # pragma: no cover
    librosa = None

try:
    import soundfile as sf
except ImportError:  # pragma: no cover
    sf = None

DEFAULT_SR = 32000
DEFAULT_FFMPEG = shutil.which("ffmpeg") or "ffmpeg"


@dataclass
class AnalysisResult:
    source: str
    normalized_source: str
    sample_rate: int
    duration_s: float
    rms_mean: float
    peak_dbfs: float
    loudness_hint: str
    zero_crossing_rate: float
    onset_density_per_s: float
    loop_likelihood: float
    pitch: dict[str, Any]
    envelope: dict[str, Any]
    spectral: dict[str, Any]
    musical: dict[str, Any]
    classification: dict[str, Any]
    suggested_web_audio: dict[str, Any]
    recommended_targets: list[str]


PALETTES: dict[str, dict[str, Any]] = {
    "lbh": {
        "description": "lo-fi cosmic dread with chip-era discipline, dark analog grit, and sci-fi wrongness",
        "distortion": 0.42,
        "echo_mix": 0.18,
        "bit_depth": 10,
        "lowpass_hz": 6200,
        "prompt_tags": ["lofi", "distorted", "chip-adjacent", "sci-fi", "cosmic dread"],
    },
    "chip": {
        "description": "bright constrained chiptune language with punchy square waves and fast envelopes",
        "distortion": 0.18,
        "echo_mix": 0.08,
        "bit_depth": 8,
        "lowpass_hz": 8000,
        "prompt_tags": ["chiptune", "retro", "punchy", "square-wave"],
    },
    "scifi": {
        "description": "cold synthetic sci-fi design with eerie harmonics and unstable modulation",
        "distortion": 0.32,
        "echo_mix": 0.22,
        "bit_depth": 12,
        "lowpass_hz": 9000,
        "prompt_tags": ["sci-fi", "synthetic", "alien", "modulated"],
    },
    "lofi": {
        "description": "worn magnetic haze with softened highs, wow/flutter feeling, and rough edges",
        "distortion": 0.25,
        "echo_mix": 0.12,
        "bit_depth": 11,
        "lowpass_hz": 5200,
        "prompt_tags": ["lofi", "worn", "softened", "tape-ish"],
    },
}


def _require_audio_deps() -> None:
    missing = []
    if librosa is None:
        missing.append("librosa")
    if sf is None:
        missing.append("soundfile")
    if missing:
        raise RuntimeError(
            "Missing Python audio dependencies: "
            + ", ".join(missing)
            + ". Install with: uv pip install -r tools/audio-requirements.txt"
        )


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def slugify(text: str) -> str:
    out = []
    for ch in text.lower():
        if ch.isalnum():
            out.append(ch)
        elif ch in (" ", "-", "_", "."):
            out.append("-")
    slug = "".join(out).strip("-")
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug or "audio"


def _event_to_method_name(event_name: str) -> str:
    normalized = []
    previous_was_alnum = False
    for ch in event_name:
        if ch.isupper() and previous_was_alnum:
            normalized.append("-")
        if ch.isalnum():
            normalized.append(ch.lower())
            previous_was_alnum = True
        else:
            normalized.append("-")
            previous_was_alnum = False
    parts = [part for part in "".join(normalized).split("-") if part]
    if not parts:
        return "_playGeneratedEvent"
    return "_play" + "".join(part[:1].upper() + part[1:] for part in parts)


def dbfs_peak(y: np.ndarray) -> float:
    peak = float(np.max(np.abs(y))) if y.size else 0.0
    if peak <= 1e-8:
        return -120.0
    return round(20.0 * math.log10(peak), 2)


def loudness_hint_from_peak(peak_db: float) -> str:
    if peak_db > -1.0:
        return "hot"
    if peak_db > -6.0:
        return "present"
    if peak_db > -14.0:
        return "moderate"
    return "quiet"


def normalize_audio(input_path: Path, output_path: Path, ffmpeg_bin: str = DEFAULT_FFMPEG, sr: int = DEFAULT_SR) -> Path:
    ensure_dir(output_path.parent)
    cmd = [
        ffmpeg_bin,
        "-y",
        "-i",
        str(input_path),
        "-ac",
        "1",
        "-ar",
        str(sr),
        "-vn",
        "-af",
        "loudnorm=I=-16:TP=-1.5:LRA=11",
        str(output_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg normalization failed: {proc.stderr.strip() or proc.stdout.strip()}")
    return output_path


def _safe_mean(arr: np.ndarray) -> float:
    return float(np.mean(arr)) if arr.size else 0.0


def _nearest_note_name(hz: float | None) -> str | None:
    if not hz or hz <= 0:
        return None
    midi = round(69 + 12 * math.log2(hz / 440.0))
    names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    return f"{names[midi % 12]}{(midi // 12) - 1}"


def classify_sound(duration: float, hnr: float, centroid: float, attack: float, onset_density: float, zcr: float, pitch_conf: float) -> tuple[str, float, str]:
    candidates: list[tuple[str, float, str]] = []
    tonal = hnr > 2.2 and pitch_conf > 0.15
    noisy = hnr < 0.8 or zcr > 0.12
    if duration >= 3.0 and tonal:
        candidates.append(("drone", 0.82 + min(0.15, duration / 20.0), "Long sustained tonal body with low onset density."))
    if duration < 0.8 and attack < 0.06 and tonal:
        candidates.append(("ui_chirp", 0.76 + min(0.18, onset_density / 20.0), "Short bright tonal gesture with fast attack."))
    if duration < 1.2 and attack < 0.04 and noisy:
        candidates.append(("impact", 0.74 + min(0.16, centroid / 8000.0), "Short sharp transient with noisy or broadband content."))
    if duration >= 0.5 and duration < 3.0 and noisy and centroid > 1200:
        candidates.append(("whoosh", 0.71 + min(0.12, duration / 4.0), "Mid-length broadband gesture suited to motion or force."))
    if duration >= 2.0 and noisy:
        candidates.append(("texture", 0.68 + min(0.16, duration / 12.0), "Sustained noise-weighted texture or ambience."))
    if duration >= 2.5 and onset_density > 1.5:
        candidates.append(("music_loop", 0.66 + min(0.18, onset_density / 10.0), "Longer structured material with repeated onsets and musical center."))
    if not candidates:
        if tonal:
            candidates.append(("drone", 0.55, "Tonal content dominates even if the gesture is ambiguous."))
        else:
            candidates.append(("texture", 0.52, "Ambiguous reference defaults to texture/noise design."))
    candidates.sort(key=lambda item: item[1], reverse=True)
    return candidates[0]


def recommend_targets(primary_class: str) -> list[str]:
    if primary_class in {"ui_chirp", "impact", "whoosh", "texture"}:
        return ["web_audio_recipe", "sfx_preview", "sfx_prompt"]
    if primary_class == "drone":
        return ["web_audio_recipe", "sfx_preview", "music_prompt"]
    if primary_class == "music_loop":
        return ["music_prompt", "web_audio_recipe"]
    return ["web_audio_recipe", "sfx_prompt"]


def build_web_audio_recipe(primary_class: str, analysis: dict[str, Any], palette: dict[str, Any]) -> dict[str, Any]:
    pitch = analysis["pitch"]
    spectral = analysis["spectral"]
    env = analysis["envelope"]
    oscillator_type = "sine"
    if spectral["character"] == "tonal_rich":
        oscillator_type = "square"
    elif spectral["brightness"] == "bright":
        oscillator_type = "sawtooth"
    elif primary_class in {"impact", "whoosh", "texture"}:
        oscillator_type = "noise"

    if primary_class == "drone":
        layers = [
            {"type": "oscillator", "waveform": oscillator_type, "frequency_hz": pitch["mean_hz"] or 55.0, "gain": 0.45},
            {"type": "oscillator", "waveform": "sine", "frequency_hz": (pitch["mean_hz"] or 55.0) * 0.5, "gain": 0.3, "detune_cents": -4},
            {"type": "oscillator", "waveform": "triangle", "frequency_hz": (pitch["mean_hz"] or 55.0) * 1.5, "gain": 0.12, "detune_cents": 3},
        ]
    elif primary_class == "ui_chirp":
        layers = [
            {"type": "oscillator", "waveform": oscillator_type, "frequency_hz": pitch["start_hz"] or 440.0, "gain": 0.55, "end_frequency_hz": pitch["end_hz"] or (pitch["start_hz"] or 440.0) * 1.4},
            {"type": "oscillator", "waveform": "triangle", "frequency_hz": (pitch["start_hz"] or 440.0) * 2.0, "gain": 0.12},
        ]
    elif primary_class == "impact":
        layers = [
            {"type": "noise", "gain": 0.55, "filter_hz": spectral["rolloff_hz"] or 3500},
            {"type": "oscillator", "waveform": "sine", "frequency_hz": max(40.0, (pitch["start_hz"] or 220.0) * 0.5), "gain": 0.3, "end_frequency_hz": max(25.0, (pitch["end_hz"] or 110.0) * 0.7)},
        ]
    elif primary_class == "whoosh":
        layers = [
            {"type": "noise", "gain": 0.6, "filter_hz": spectral["rolloff_hz"] or 4800},
            {"type": "oscillator", "waveform": "triangle", "frequency_hz": pitch["start_hz"] or 180.0, "gain": 0.15, "end_frequency_hz": pitch["end_hz"] or 260.0},
        ]
    else:
        layers = [
            {"type": "noise", "gain": 0.5, "filter_hz": spectral["rolloff_hz"] or 5000},
            {"type": "oscillator", "waveform": oscillator_type, "frequency_hz": pitch["mean_hz"] or 160.0, "gain": 0.18},
        ]

    return {
        "engine": "web-audio",
        "palette": palette["description"],
        "class": primary_class,
        "layers": layers,
        "envelope": {
            "attack_s": env["attack_s"],
            "decay_s": env["decay_s"],
            "sustain_level": env["sustain_level"],
            "release_s": env["release_s"],
        },
        "effects": {
            "lowpass_hz": min(palette["lowpass_hz"], int((spectral["rolloff_hz"] or palette["lowpass_hz"]) * 1.1)),
            "distortion_amount": palette["distortion"],
            "echo_mix": palette["echo_mix"],
            "bit_depth": palette["bit_depth"],
        },
        "spatial": {
            "pan_strategy": "screen-relative",
            "distance_attenuation": "inverse-ish",
        },
        "design_intent": analysis["classification"]["reason"],
    }


def _sustain_level(rms: np.ndarray) -> float:
    if rms.size == 0:
        return 0.0
    peak = float(np.max(rms))
    if peak <= 1e-8:
        return 0.0
    tail = rms[len(rms) // 2 :]
    return float(np.clip(np.mean(tail) / peak, 0.0, 1.0)) if tail.size else 0.0


def analyze_audio_file(source_path: str | Path, *, work_dir: str | Path, ffmpeg_bin: str = DEFAULT_FFMPEG, palette_name: str = "lbh") -> AnalysisResult:
    _require_audio_deps()
    source_path = Path(source_path).expanduser().resolve()
    if not source_path.exists():
        raise FileNotFoundError(source_path)
    work_dir = ensure_dir(Path(work_dir))
    palette = PALETTES.get(palette_name, PALETTES["lbh"])
    normalized = work_dir / "normalized.wav"
    normalize_audio(source_path, normalized, ffmpeg_bin=ffmpeg_bin, sr=DEFAULT_SR)
    y, sr = librosa.load(str(normalized), sr=None, mono=True)
    duration = len(y) / sr if sr else 0.0

    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
    onset_frames = librosa.onset.onset_detect(y=y, sr=sr, units="frames", hop_length=512, backtrack=False)
    onset_density = len(onset_frames) / max(duration, 1e-6)
    zcr = float(np.mean(librosa.feature.zero_crossing_rate(y=y, frame_length=2048, hop_length=512)[0]))
    centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)[0]))
    rolloff = float(np.mean(librosa.feature.spectral_rolloff(y=y, sr=sr, roll_percent=0.90)[0]))
    bandwidth = float(np.mean(librosa.feature.spectral_bandwidth(y=y, sr=sr)[0]))
    contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
    contrast_mean = float(np.mean(contrast)) if contrast.size else 0.0
    harmonic, percussive = librosa.effects.hpss(y)
    harmonic_energy = float(np.sum(harmonic ** 2))
    percussive_energy = float(np.sum(percussive ** 2))
    hnr = harmonic_energy / (percussive_energy + 1e-10)

    f0, _, voiced_prob = librosa.pyin(y, fmin=librosa.note_to_hz("C1"), fmax=librosa.note_to_hz("C7"), sr=sr)
    f0_clean = f0[~np.isnan(f0)] if f0 is not None else np.array([])
    pitch_conf = float(np.mean(voiced_prob[~np.isnan(voiced_prob)])) if voiced_prob is not None and np.any(~np.isnan(voiced_prob)) else 0.0

    peak_frame = int(np.argmax(rms)) if rms.size else 0
    peak_time = peak_frame * 512 / sr if sr else 0.0
    max_rms = float(np.max(rms)) if rms.size else 0.0
    threshold_10 = max_rms * 0.1
    threshold_90 = max_rms * 0.9
    attack_start = next((i for i, v in enumerate(rms) if v > threshold_10), 0) if rms.size else 0
    attack_end = next((i for i, v in enumerate(rms) if v > threshold_90), peak_frame) if rms.size else 0
    attack_time = max(0.001, (attack_end - attack_start) * 512 / sr) if sr else 0.001
    post_peak = rms[peak_frame:] if rms.size else np.array([])
    decay_end = next((i for i, v in enumerate(post_peak) if v < threshold_10), len(post_peak) - 1) if post_peak.size else 0
    decay_time = decay_end * 512 / sr if sr else 0.0
    sustain_level = _sustain_level(rms)

    chroma = librosa.feature.chroma_cqt(y=y, sr=sr) if duration > 0 else np.zeros((12, 1))
    chroma_mean = np.mean(chroma, axis=1) if chroma.size else np.zeros(12)
    key_idx = int(np.argmax(chroma_mean)) if chroma_mean.size else 0
    key_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    estimated_key = key_names[key_idx]
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr, hop_length=512)
    tempo_value = float(np.atleast_1d(tempo)[0])

    tail_seconds = min(duration * 0.2, 0.5)
    head = y[: int(sr * tail_seconds)] if tail_seconds > 0 else y
    tail = y[-int(sr * tail_seconds) :] if tail_seconds > 0 else y
    if len(head) > 8 and len(tail) > 8:
        clip_len = min(len(head), len(tail))
        loop_likelihood = float(np.clip(np.corrcoef(head[:clip_len], tail[:clip_len])[0, 1], -1.0, 1.0))
    else:
        loop_likelihood = 0.0

    primary_class, confidence, reason = classify_sound(duration, hnr, centroid, attack_time, onset_density, zcr, pitch_conf)
    brightness = "bright" if centroid > 3200 else "medium" if centroid > 1500 else "dark"
    character = "tonal_clean" if hnr > 10 else "tonal_rich" if hnr > 2 else "mixed" if hnr > 0.6 else "noise"

    pitch_dict = {
        "start_hz": round(float(f0_clean[0]), 1) if f0_clean.size else None,
        "end_hz": round(float(f0_clean[-1]), 1) if f0_clean.size else None,
        "mean_hz": round(float(np.mean(f0_clean)), 1) if f0_clean.size else None,
        "note_name": _nearest_note_name(float(np.mean(f0_clean))) if f0_clean.size else None,
        "sweep": "rising" if f0_clean.size > 1 and f0_clean[-1] > f0_clean[0] * 1.08 else "falling" if f0_clean.size > 1 and f0_clean[-1] < f0_clean[0] * 0.92 else "steady",
        "voiced_confidence": round(pitch_conf, 3),
    }
    envelope_dict = {
        "attack_s": round(float(attack_time), 4),
        "decay_s": round(float(decay_time), 4),
        "peak_time_s": round(float(peak_time), 4),
        "sustain_level": round(float(sustain_level), 3),
        "release_s": round(float(max(0.05, duration - peak_time)), 4),
        "shape": "percussive" if attack_time < 0.03 else "plucked" if attack_time < 0.12 else "gradual",
    }
    spectral_dict = {
        "centroid_hz": round(centroid, 1),
        "rolloff_hz": round(rolloff, 1),
        "bandwidth_hz": round(bandwidth, 1),
        "brightness": brightness,
        "character": character,
        "harmonic_to_noise_ratio": round(hnr, 3),
        "spectral_contrast": round(contrast_mean, 3),
    }
    musical_dict = {
        "tempo_bpm": round(tempo_value, 1),
        "estimated_key": estimated_key,
        "onset_density_per_s": round(float(onset_density), 3),
        "loop_likelihood": round(loop_likelihood, 3),
    }
    classification_dict = {
        "primary": primary_class,
        "confidence": round(confidence, 3),
        "reason": reason,
    }
    suggested_web_audio = build_web_audio_recipe(
        primary_class,
        {
            "pitch": pitch_dict,
            "spectral": spectral_dict,
            "envelope": envelope_dict,
            "classification": classification_dict,
        },
        palette,
    )

    peak_db = dbfs_peak(y)
    return AnalysisResult(
        source=str(source_path),
        normalized_source=str(normalized),
        sample_rate=sr,
        duration_s=round(float(duration), 4),
        rms_mean=round(_safe_mean(rms), 6),
        peak_dbfs=peak_db,
        loudness_hint=loudness_hint_from_peak(peak_db),
        zero_crossing_rate=round(zcr, 6),
        onset_density_per_s=round(float(onset_density), 4),
        loop_likelihood=round(loop_likelihood, 4),
        pitch=pitch_dict,
        envelope=envelope_dict,
        spectral=spectral_dict,
        musical=musical_dict,
        classification=classification_dict,
        suggested_web_audio=suggested_web_audio,
        recommended_targets=recommend_targets(primary_class),
    )


def _write_json(path: Path, data: Any) -> None:
    ensure_dir(path.parent)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def _write_text(path: Path, content: str) -> None:
    ensure_dir(path.parent)
    path.write_text(content.rstrip() + "\n", encoding="utf-8")


def generate_spectrogram(normalized_file: Path, output_path: Path) -> None:
    try:
        import matplotlib.pyplot as plt
        import librosa.display
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("matplotlib is required for spectrogram generation") from exc

    y, sr = librosa.load(str(normalized_file), sr=None, mono=True)
    fig, axes = plt.subplots(3, 1, figsize=(14, 9))
    S = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=128)
    librosa.display.specshow(librosa.power_to_db(S, ref=np.max), y_axis="mel", x_axis="time", ax=axes[0], sr=sr)
    axes[0].set_title("Mel Spectrogram")
    librosa.display.waveshow(y, sr=sr, ax=axes[1])
    axes[1].set_title("Waveform")
    chroma = librosa.feature.chroma_stft(y=y, sr=sr)
    librosa.display.specshow(chroma, y_axis="chroma", x_axis="time", ax=axes[2], sr=sr)
    axes[2].set_title("Chromagram")
    plt.tight_layout()
    ensure_dir(output_path.parent)
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close(fig)


def _adsr(total_len: int, sr: int, attack: float, decay: float, sustain_level: float, release: float) -> np.ndarray:
    if total_len <= 0:
        return np.zeros(0, dtype=np.float32)
    attack_n = max(1, int(sr * max(0.001, attack)))
    decay_n = max(1, int(sr * max(0.001, decay)))
    release_n = max(1, int(sr * max(0.001, release)))
    sustain_n = max(0, total_len - attack_n - decay_n - release_n)
    attack_curve = np.linspace(0.0, 1.0, attack_n, endpoint=False)
    decay_curve = np.linspace(1.0, sustain_level, decay_n, endpoint=False)
    sustain_curve = np.full(sustain_n, sustain_level)
    release_curve = np.linspace(sustain_level, 0.0, release_n, endpoint=True)
    env = np.concatenate([attack_curve, decay_curve, sustain_curve, release_curve])
    if env.size < total_len:
        env = np.pad(env, (0, total_len - env.size))
    return env[:total_len].astype(np.float32)


def _bitcrush(signal: np.ndarray, bits: int) -> np.ndarray:
    levels = max(2, 2 ** int(bits))
    return np.round(signal * levels) / levels


def _simple_lowpass(signal: np.ndarray, cutoff_hz: float, sr: int) -> np.ndarray:
    if cutoff_hz <= 0:
        return signal
    dt = 1.0 / sr
    rc = 1.0 / (2 * math.pi * cutoff_hz)
    alpha = dt / (rc + dt)
    out = np.zeros_like(signal)
    if signal.size == 0:
        return out
    out[0] = signal[0]
    for i in range(1, signal.size):
        out[i] = out[i - 1] + alpha * (signal[i] - out[i - 1])
    return out


def _distort(signal: np.ndarray, amount: float) -> np.ndarray:
    drive = 1.0 + amount * 8.0
    return np.tanh(signal * drive) / np.tanh(drive)


def _echo(signal: np.ndarray, sr: int, mix: float, delay_s: float = 0.12, feedback: float = 0.28) -> np.ndarray:
    delay_n = max(1, int(sr * delay_s))
    out = np.copy(signal)
    for i in range(delay_n, len(signal)):
        out[i] += out[i - delay_n] * feedback * mix
    dry = 1.0 - mix * 0.5
    return signal * dry + out * mix


def synth_preview(recipe: dict[str, Any], out_path: Path, palette: dict[str, Any], sr: int = DEFAULT_SR) -> Path:
    duration = max(0.2, float(recipe["envelope"]["attack_s"] + recipe["envelope"]["decay_s"] + recipe["envelope"]["release_s"]))
    if recipe["class"] in {"drone", "texture", "music_loop"}:
        duration = max(duration, 3.0)
    elif recipe["class"] == "whoosh":
        duration = max(duration, 1.2)

    total_len = int(sr * duration)
    t = np.arange(total_len, dtype=np.float32) / sr
    signal = np.zeros(total_len, dtype=np.float32)
    env = _adsr(total_len, sr, recipe["envelope"]["attack_s"], recipe["envelope"]["decay_s"], recipe["envelope"]["sustain_level"], recipe["envelope"]["release_s"])
    rng = np.random.default_rng(42)

    for layer in recipe["layers"]:
        gain = float(layer.get("gain", 0.2))
        if layer["type"] == "noise":
            white = rng.normal(0.0, 1.0, total_len).astype(np.float32)
            noise = _simple_lowpass(white, float(layer.get("filter_hz", palette["lowpass_hz"])), sr)
            signal += noise * gain * env
        elif layer["type"] == "oscillator":
            start_hz = float(layer.get("frequency_hz") or 220.0)
            end_hz = float(layer.get("end_frequency_hz") or start_hz)
            freq = np.linspace(start_hz, end_hz, total_len, dtype=np.float32)
            phase = 2 * np.pi * np.cumsum(freq) / sr
            waveform = layer.get("waveform", "sine")
            if waveform == "square":
                tone = np.sign(np.sin(phase))
            elif waveform == "triangle":
                tone = (2 / np.pi) * np.arcsin(np.sin(phase))
            elif waveform == "sawtooth":
                tone = 2.0 * ((phase / (2 * np.pi)) % 1.0) - 1.0
            else:
                tone = np.sin(phase)
            detune = float(layer.get("detune_cents", 0.0))
            if detune:
                tone *= 1.0 + 0.08 * np.sin(2 * np.pi * 0.5 * t + detune / 100.0)
            signal += tone.astype(np.float32) * gain * env

    signal = _simple_lowpass(signal, float(recipe["effects"]["lowpass_hz"]), sr)
    signal = _distort(signal, float(recipe["effects"]["distortion_amount"]))
    signal = _bitcrush(signal, int(recipe["effects"]["bit_depth"]))
    signal = _echo(signal, sr, float(recipe["effects"]["echo_mix"]))
    peak = np.max(np.abs(signal)) if signal.size else 0.0
    if peak > 1e-8:
        signal = signal / peak * 0.92
    ensure_dir(out_path.parent)
    sf.write(str(out_path), signal, sr)
    return out_path


def build_markdown_brief(analysis: AnalysisResult, palette_name: str) -> str:
    return textwrap.dedent(
        f"""
        # Audio Workbench Brief

        - **Source:** `{analysis.source}`
        - **Class:** `{analysis.classification['primary']}` ({analysis.classification['confidence']})
        - **Palette:** `{palette_name}`
        - **Duration:** {analysis.duration_s:.3f}s
        - **Peak:** {analysis.peak_dbfs} dBFS ({analysis.loudness_hint})
        - **Primary route:** {', '.join(analysis.recommended_targets)}

        ## Emotional Read

        - **Current tune:** {analysis.classification['reason']}
        - **Pitch behavior:** {analysis.pitch['sweep']} around {analysis.pitch['mean_hz'] or 'unvoiced'} Hz
        - **Envelope:** {analysis.envelope['shape']} attack {analysis.envelope['attack_s']}s, decay {analysis.envelope['decay_s']}s
        - **Spectral profile:** {analysis.spectral['brightness']} / {analysis.spectral['character']}, centroid {analysis.spectral['centroid_hz']} Hz
        - **Musical center:** {analysis.musical['estimated_key']} @ ~{analysis.musical['tempo_bpm']} BPM

        ## Recommendation

        Use this reference primarily as a **{analysis.classification['primary']}** template. Translate its motif into Web Audio parameters first, then use the generated SFX/music prompt card if you want a rendered asset rather than only an engine patch.
        """
    ).strip() + "\n"


def build_prompt_cards(analysis: AnalysisResult, palette: dict[str, Any]) -> dict[str, str]:
    cls = analysis.classification["primary"]
    musical = analysis.musical
    pitch = analysis.pitch
    spectral = analysis.spectral
    env = analysis.envelope

    sfx = textwrap.dedent(
        f"""
        Create a {cls} sound effect inspired by the provided reference.
        Preserve the envelope logic: {env['shape']} attack ({env['attack_s']}s), decay ({env['decay_s']}s), release ({env['release_s']}s).
        Spectral target: {spectral['brightness']} tone, {spectral['character']} body, centroid around {spectral['centroid_hz']} Hz.
        Pitch target: {pitch['sweep']} contour centered near {pitch['mean_hz'] or 'unpitched'} Hz.
        Palette: {palette['description']}.
        Tags: {', '.join(palette['prompt_tags'])}.
        Avoid glossy orchestral polish; keep grit, constraint, and playable feedback clarity.
        """
    ).strip() + "\n"

    music = textwrap.dedent(
        f"""
        Compose or generate a short cue using the reference as structural inspiration, not as a copy.
        Desired identity: {palette['description']}.
        Tonal center: {musical['estimated_key']}; rough tempo: {musical['tempo_bpm']} BPM.
        Motif logic: preserve the reference's {pitch['sweep']} contour and {env['shape']} phrasing, but expand it into a game-usable cue.
        Instrumentation bias: chip-adjacent synths, degraded leads, dark pads, thin noise percussion, unstable sci-fi harmonics.
        Avoid generic trailer sludge and overproduced cinematic drums.
        """
    ).strip() + "\n"

    return {"sfx": sfx, "music": music}


def build_audio_js_ui_chirp_stub(analysis: AnalysisResult, event_name: str, method_name: str | None = None) -> str:
    recipe = analysis.suggested_web_audio
    layers = recipe.get("layers", [])
    primary = next((layer for layer in layers if layer.get("type") == "oscillator"), None)
    secondary = next((layer for layer in layers[1:] if layer.get("type") == "oscillator"), None)
    method_name = method_name or _event_to_method_name(event_name)
    waveform = (primary or {}).get("waveform", "square")
    start_hz = float((primary or {}).get("frequency_hz") or analysis.pitch.get("start_hz") or analysis.pitch.get("mean_hz") or 660.0)
    end_hz = float((primary or {}).get("end_frequency_hz") or analysis.pitch.get("end_hz") or start_hz * 1.35)
    overtone_hz = float((secondary or {}).get("frequency_hz") or start_hz * 2.0)
    overtone_wave = (secondary or {}).get("waveform", "triangle")
    attack_s = float(recipe["envelope"].get("attack_s", 0.01))
    decay_s = float(recipe["envelope"].get("decay_s", 0.12))
    release_s = float(recipe["envelope"].get("release_s", 0.08))
    sustain_level = float(recipe["envelope"].get("sustain_level", 0.0))
    stop_s = max(0.12, attack_s + decay_s + release_s)
    primary_gain = float((primary or {}).get("gain", 0.45))
    overtone_gain = float((secondary or {}).get("gain", 0.12))
    filter_hz = int(recipe["effects"].get("lowpass_hz", 8000))
    class_reason = analysis.classification.get("reason", "Short bright tonal gesture with fast attack.")

    return textwrap.dedent(
        f"""
        // src/audio.js starter stub generated by the audio workbench.
        // Reference class: {analysis.classification['primary']} ({analysis.classification['confidence']})
        // Why this shape: {class_reason}
        // Add this case near the other event routes in playEvent():
        // case '{event_name}': this.{method_name}(now, vol, pan); break;

        {method_name}(now, vol, pan = 0) {{
          const osc = this.ctx.createOscillator();
          osc.type = '{waveform}';
          osc.frequency.setValueAtTime({start_hz:.1f}, now);
          osc.frequency.linearRampToValueAtTime({end_hz:.1f}, now + {max(0.01, attack_s + decay_s):.3f});

          const overtone = this.ctx.createOscillator();
          overtone.type = '{overtone_wave}';
          overtone.frequency.setValueAtTime({overtone_hz:.1f}, now);

          const filter = this.ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = {filter_hz};
          filter.Q.value = 0.7;

          const voice = this._createVoice(pan);
          const overtoneGain = this.ctx.createGain();
          overtoneGain.gain.value = {overtone_gain:.3f};

          osc.connect(filter);
          filter.connect(voice.gain);
          overtone.connect(overtoneGain);
          overtoneGain.connect(filter);

          voice.gain.gain.setValueAtTime(0.0001, now);
          voice.gain.gain.linearRampToValueAtTime(vol * {primary_gain:.3f}, now + {max(0.005, attack_s):.3f});
          voice.gain.gain.linearRampToValueAtTime(vol * {max(0.001, primary_gain * sustain_level):.3f}, now + {max(0.01, attack_s + decay_s):.3f});
          voice.gain.gain.exponentialRampToValueAtTime(0.001, now + {stop_s:.3f});

          osc.start(now);
          overtone.start(now);
          osc.stop(now + {stop_s + 0.03:.3f});
          overtone.stop(now + {stop_s + 0.03:.3f});
        }}
        """
    ).strip() + "\n"


def run_workbench(args: argparse.Namespace) -> dict[str, str]:
    palette_name = args.palette if args.palette in PALETTES else "lbh"
    palette = PALETTES[palette_name]
    source = Path(args.input).expanduser().resolve()
    slug = slugify(source.stem)
    output_root = Path(args.output_dir).expanduser().resolve() if args.output_dir else source.parent / f"{slug}-audio-workbench"
    ensure_dir(output_root)

    analysis = analyze_audio_file(source, work_dir=output_root / "work", ffmpeg_bin=args.ffmpeg_bin, palette_name=palette_name)
    analysis_dict = asdict(analysis)
    _write_json(output_root / "analysis.json", analysis_dict)
    _write_json(output_root / "web_audio_recipe.json", analysis.suggested_web_audio)
    _write_text(output_root / "brief.md", build_markdown_brief(analysis, palette_name))

    prompts = build_prompt_cards(analysis, palette)
    _write_text(output_root / "prompt-sfx.txt", prompts["sfx"])
    _write_text(output_root / "prompt-music.txt", prompts["music"])
    synth_preview(analysis.suggested_web_audio, output_root / "preview.wav", palette, sr=analysis.sample_rate)

    if args.audio_js_event:
        if analysis.classification["primary"] != "ui_chirp":
            raise RuntimeError(
                "audio.js stub generation currently supports ui_chirp references only. "
                f"This reference classified as {analysis.classification['primary']}."
            )
        stub = build_audio_js_ui_chirp_stub(analysis, args.audio_js_event, args.audio_js_method)
        _write_text(output_root / "audio_js_stub.js", stub)

    outputs = {
        "analysis_json": str((output_root / "analysis.json").resolve()),
        "web_audio_recipe": str((output_root / "web_audio_recipe.json").resolve()),
        "brief": str((output_root / "brief.md").resolve()),
        "prompt_sfx": str((output_root / "prompt-sfx.txt").resolve()),
        "prompt_music": str((output_root / "prompt-music.txt").resolve()),
        "preview_wav": str((output_root / "preview.wav").resolve()),
        "normalized_source": str((output_root / "work" / "normalized.wav").resolve()),
    }

    if args.audio_js_event:
        outputs["audio_js_stub"] = str((output_root / "audio_js_stub.js").resolve())

    if args.spectrogram:
        spectrogram_path = output_root / "spectrogram.png"
        generate_spectrogram(output_root / "work" / "normalized.wav", spectrogram_path)
        outputs["spectrogram"] = str(spectrogram_path.resolve())

    _write_json(output_root / "manifest.json", outputs)
    outputs["manifest"] = str((output_root / "manifest.json").resolve())
    return outputs


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Reference-driven audio workbench for Last Black Hole and adjacent projects.")
    parser.add_argument("input", help="Input audio reference file (.wav/.mp3/.ogg/.flac/.m4a)")
    parser.add_argument("--output-dir", help="Directory to write outputs into")
    parser.add_argument("--palette", default="lbh", choices=sorted(PALETTES.keys()), help="Sonic palette to bias recipe + preview rendering")
    parser.add_argument("--spectrogram", action="store_true", help="Also render a spectrogram image")
    parser.add_argument("--ffmpeg-bin", default=DEFAULT_FFMPEG, help="Path to ffmpeg binary")
    parser.add_argument("--audio-js-event", help="Generate a starter src/audio.js event stub for this event name (currently for ui_chirp references)")
    parser.add_argument("--audio-js-method", help="Override the generated src/audio.js method name for the starter stub")
    return parser
