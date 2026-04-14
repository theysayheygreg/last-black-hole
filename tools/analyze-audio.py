#!/usr/bin/env python3
"""Backward-compatible wrapper for the richer audio workbench."""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.audio_workbench.core import analyze_audio_file, generate_spectrogram


def main() -> int:
    parser = argparse.ArgumentParser(description="Analyze audio for Web Audio synthesis")
    parser.add_argument("file", help="Audio file to analyze (.wav, .mp3, .ogg, .flac, .m4a)")
    parser.add_argument("--spectrogram", "-s", action="store_true", help="Also generate a spectrogram image")
    parser.add_argument("--output", "-o", help="Spectrogram output path")
    parser.add_argument("--palette", default="lbh", help="Palette name to bias recipe generation")
    args = parser.parse_args()

    file_path = Path(args.file).expanduser().resolve()
    out_dir = file_path.parent / f"{file_path.stem}-analysis"
    result = analyze_audio_file(file_path, work_dir=out_dir / "work", palette_name=args.palette)
    print(json.dumps(asdict(result), indent=2))

    if args.spectrogram:
        output = Path(args.output).expanduser().resolve() if args.output else out_dir / "spectrogram.png"
        generate_spectrogram(out_dir / "work" / "normalized.wav", output)
        print(f"Spectrogram saved: {output}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
