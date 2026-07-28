#!/usr/bin/env python3
"""Upsert only Last Singularity in Steam's non-Steam shortcuts."""

import binascii
import os
import shutil
import struct
import sys
import tempfile
from pathlib import Path

NAME = "Last Singularity"
T_OBJECT, T_STRING, T_INT, T_UINT64, T_END = 0, 1, 2, 7, 8


class UInt64(int):
    pass


def cstring(value):
    return str(value).encode("utf-8") + b"\0"


def read_cstring(data, offset):
    end = data.find(b"\0", offset)
    if end < 0:
        raise ValueError("unterminated VDF string")
    return data[offset:end].decode("utf-8", "replace"), end + 1


def parse_object(data, offset):
    result = {}
    while offset < len(data):
        kind = data[offset]
        offset += 1
        if kind == T_END:
            return result, offset
        key, offset = read_cstring(data, offset)
        if kind == T_OBJECT:
            result[key], offset = parse_object(data, offset)
        elif kind == T_STRING:
            result[key], offset = read_cstring(data, offset)
        elif kind == T_INT:
            result[key] = struct.unpack_from("<I", data, offset)[0]
            offset += 4
        elif kind == T_UINT64:
            result[key] = UInt64(struct.unpack_from("<Q", data, offset)[0])
            offset += 8
        else:
            raise ValueError(f"unsupported VDF type {kind}")
    raise ValueError("unterminated VDF object")


def parse(data):
    if not data:
        return {}
    if data[0] != T_OBJECT:
        raise ValueError("invalid shortcuts.vdf root")
    name, offset = read_cstring(data, 1)
    if name != "shortcuts":
        raise ValueError("unexpected shortcuts.vdf root")
    value, _ = parse_object(data, offset)
    return value


def encode_value(key, value):
    if isinstance(value, dict):
        return bytes([T_OBJECT]) + cstring(key) + encode_object(value)
    if isinstance(value, UInt64):
        return bytes([T_UINT64]) + cstring(key) + struct.pack("<Q", value)
    if isinstance(value, int):
        return bytes([T_INT]) + cstring(key) + struct.pack("<I", value & 0xFFFFFFFF)
    return bytes([T_STRING]) + cstring(key) + cstring(value)


def encode_object(value):
    numeric = sorted((key for key in value if str(key).isdigit()), key=int)
    named = [key for key in value if not str(key).isdigit()]
    return b"".join(encode_value(key, value[key]) for key in numeric + named) + bytes([T_END])


def encode(shortcuts):
    return bytes([T_OBJECT]) + cstring("shortcuts") + encode_object(shortcuts) + bytes([T_END])


def appid(exe):
    return (binascii.crc32((exe + NAME).encode()) | 0x80000000) & 0xFFFFFFFF


def upsert(path, launcher, install_dir, desktop, icon):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        shutil.copy2(path, path.with_suffix(".vdf.lbh-backup"))
    shortcuts = parse(path.read_bytes() if path.exists() else b"")
    exe = f'"{launcher}"'
    key = next(
        (
            key
            for key, item in shortcuts.items()
            if isinstance(item, dict)
            and (
                item.get("AppName") == NAME
                or str(item.get("Exe", "")).strip('"') == str(launcher)
                or item.get("ShortcutPath") == str(desktop)
            )
        ),
        None,
    )
    if key is None:
        keys = [int(item) for item in shortcuts if str(item).isdigit()]
        key = str(max(keys) + 1 if keys else 0)
    existing = shortcuts.get(key, {}) if isinstance(shortcuts.get(key), dict) else {}
    existing.update(
        {
            "appid": appid(exe),
            "AppName": NAME,
            "Exe": exe,
            "StartDir": f'"{install_dir}"',
            "icon": str(icon) if icon.exists() else "",
            "ShortcutPath": str(desktop),
            "LaunchOptions": "",
            "IsHidden": 0,
            "AllowDesktopConfig": 1,
            "AllowOverlay": 1,
            "OpenVR": 0,
            "Devkit": 0,
            "DevkitGameID": "",
            "LastPlayTime": 0,
            "FlatpakAppID": "",
            "tags": {"0": NAME, "1": "Deck Playtest"},
        }
    )
    shortcuts[key] = existing
    payload = encode(shortcuts)
    handle, temporary = tempfile.mkstemp(prefix="shortcuts.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    if len(sys.argv) != 5:
        raise SystemExit("usage: install-steam-shortcut.py LAUNCHER INSTALL_DIR DESKTOP ICON")
    launcher, install_dir, desktop, icon = map(lambda value: Path(value).expanduser(), sys.argv[1:])
    userdata = Path.home() / ".steam/steam/userdata"
    explicit = os.environ.get("LBH_STEAM_USER_ID", "").strip()
    candidates = sorted(path for path in userdata.glob("*") if path.name.isdigit())
    if explicit:
        candidates = [userdata / explicit]
    if not candidates:
        raise SystemExit("Steam userdata folder not found")
    existing_match = []
    for candidate in candidates:
        path = candidate / "config/shortcuts.vdf"
        if not path.exists():
            continue
        try:
            shortcuts = parse(path.read_bytes())
            if any(
                isinstance(item, dict)
                and (
                    item.get("AppName") == NAME
                    or str(item.get("Exe", "")).strip('"') == str(launcher)
                )
                for item in shortcuts.values()
            ):
                existing_match.append(candidate)
        except (OSError, ValueError):
            continue
    target = (
        existing_match[0]
        if existing_match
        else max(candidates, key=lambda item: (item / "config").stat().st_mtime if (item / "config").exists() else item.stat().st_mtime)
    )
    path = target / "config/shortcuts.vdf"
    upsert(path, launcher, install_dir, desktop, icon)
    print(f"[Last Singularity] Steam shortcut updated: {path}")


if __name__ == "__main__":
    main()
