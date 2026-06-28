#!/usr/bin/env bash
set -euo pipefail

PRODUCT_NAME="Last Singularity"
PRODUCT_SLUG="last-singularity"
REPO="${LBH_REPO:-theysayheygreg/last-black-hole}"
RELEASE_TAG="${LBH_RELEASE_TAG:-nightly-latest}"
ASSET_NAME="${LBH_DECK_ASSET:-last-singularity-linux-nightly.zip}"
BUILD_URL="${LBH_DECK_BUILD_URL:-https://github.com/${REPO}/releases/download/${RELEASE_TAG}/${ASSET_NAME}}"
INSTALL_DIR="${LBH_INSTALL_DIR:-$HOME/Games/last-singularity}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/last-singularity"
APPLICATIONS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
DESKTOP_DIR="${XDG_DESKTOP_DIR:-$HOME/Desktop}"
DESKTOP_ENTRY_NAME="last-singularity.desktop"

log() {
  printf '[Last Singularity] %s\n' "$*"
}

warn() {
  printf '[Last Singularity] warning: %s\n' "$*" >&2
}

fail() {
  printf '[Last Singularity] error: %s\n' "$*" >&2
  exit 1
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

cleanup() {
  if [ -n "${TMP_DIR:-}" ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
  fi
}
trap cleanup EXIT

write_launcher() {
  local launcher="$1"
  cat > "$launcher" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export LBH_DECK=1
export ELECTRON_ENABLE_LOGGING="${ELECTRON_ENABLE_LOGGING:-1}"
LOG_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/last-singularity"
mkdir -p "$LOG_DIR"
for name in deck-launch electron; do
  if [ -f "$LOG_DIR/$name.log" ]; then
    mv "$LOG_DIR/$name.log" "$LOG_DIR/$name.previous.log"
  fi
done
export ELECTRON_LOG_FILE="$LOG_DIR/electron.log"
export LBH_DECK_LOG_DIR="$LOG_DIR"
EXTRA_FLAGS=()
if [ "${LBH_DECK_DISABLE_GPU:-0}" = "1" ]; then
  EXTRA_FLAGS+=("--disable-gpu")
fi
if [ "${LBH_DECK_DISABLE_GPU_COMPOSITING:-0}" = "1" ]; then
  EXTRA_FLAGS+=("--disable-gpu-compositing")
fi
if [ "${LBH_DECK_IN_PROCESS_GPU:-0}" = "1" ]; then
  EXTRA_FLAGS+=("--in-process-gpu")
fi
if [ -n "${LBH_DECK_EXTRA_FLAGS:-}" ]; then
  read -r -a USER_EXTRA_FLAGS <<< "$LBH_DECK_EXTRA_FLAGS"
  EXTRA_FLAGS+=("${USER_EXTRA_FLAGS[@]}")
fi
exec "./Last Singularity" --no-sandbox --disable-gpu-sandbox --ignore-gpu-blocklist --ozone-platform=x11 --enable-logging=stderr "${EXTRA_FLAGS[@]}" "$@" >> "$LOG_DIR/deck-launch.log" 2>&1
EOF
  chmod +x "$launcher"
}

write_desktop_entry() {
  local entry="$1"
  local launcher="$2"
  cat > "$entry" <<EOF
[Desktop Entry]
Type=Application
Name=${PRODUCT_NAME}
Comment=${PRODUCT_NAME} Steam Deck playtest build
Exec=${launcher}
Path=${INSTALL_DIR}
Icon=${INSTALL_DIR}/last-singularity-icon.png
Terminal=false
Categories=Game;
StartupNotify=false
StartupWMClass=${PRODUCT_NAME}
EOF
  chmod +x "$entry"
}

download_build() {
  local zip_path="$1"
  log "Downloading ${PRODUCT_NAME} Deck build..."
  log "$BUILD_URL"
  curl -fL --progress-bar "$BUILD_URL" -o "$zip_path"
}

find_app_root() {
  local extract_dir="$1"
  local executable
  executable="$(find "$extract_dir" -type f -name "$PRODUCT_NAME" -perm -u+x | head -n 1 || true)"
  if [ -z "$executable" ]; then
    executable="$(find "$extract_dir" -type f -name "$PRODUCT_NAME" | head -n 1 || true)"
  fi
  [ -n "$executable" ] || fail "download did not contain a ${PRODUCT_NAME} Linux executable"
  dirname "$executable"
}

install_files() {
  local app_root="$1"
  local new_dir="${INSTALL_DIR}.new.$$"
  local previous_dir="${INSTALL_DIR}.previous"

  rm -rf "$new_dir"
  mkdir -p "$new_dir"
  cp -a "$app_root"/. "$new_dir"/
  write_launcher "$new_dir/run-last-singularity.sh"
  chmod +x "$new_dir/$PRODUCT_NAME" || true

  mkdir -p "$(dirname "$INSTALL_DIR")" "$STATE_DIR"
  rm -rf "$previous_dir"
  if [ -d "$INSTALL_DIR" ]; then
    mv "$INSTALL_DIR" "$previous_dir"
  fi
  mv "$new_dir" "$INSTALL_DIR"

  write_desktop_entry "$INSTALL_DIR/$DESKTOP_ENTRY_NAME" "$INSTALL_DIR/run-last-singularity.sh"
  mkdir -p "$APPLICATIONS_DIR" "$DESKTOP_DIR"
  cp "$INSTALL_DIR/$DESKTOP_ENTRY_NAME" "$APPLICATIONS_DIR/$DESKTOP_ENTRY_NAME"
  cp "$INSTALL_DIR/$DESKTOP_ENTRY_NAME" "$DESKTOP_DIR/$PRODUCT_NAME.desktop"
  chmod +x "$APPLICATIONS_DIR/$DESKTOP_ENTRY_NAME" "$DESKTOP_DIR/$PRODUCT_NAME.desktop"

  log "Installed to $INSTALL_DIR"
  if [ -d "$previous_dir" ]; then
    log "Previous install kept at $previous_dir"
  fi
}

shutdown_steam_if_needed() {
  if ! pgrep -u "$USER" -x steam >/dev/null 2>&1 && ! pgrep -u "$USER" -x steamwebhelper >/dev/null 2>&1; then
    return 0
  fi

  log "Closing Steam so the Gaming Mode shortcut can be registered safely..."
  if command -v steam >/dev/null 2>&1; then
    steam -shutdown >/dev/null 2>&1 || true
  fi

  for _ in $(seq 1 30); do
    if ! pgrep -u "$USER" -x steam >/dev/null 2>&1 && ! pgrep -u "$USER" -x steamwebhelper >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  return 1
}

install_steam_shortcut() {
  if [ "${LBH_SKIP_STEAM_SHORTCUT:-0}" = "1" ]; then
    warn "skipping Steam shortcut because LBH_SKIP_STEAM_SHORTCUT=1"
    return 0
  fi

  if ! command -v python3 >/dev/null 2>&1; then
    warn "python3 not found; Desktop Mode launcher installed, but Gaming Mode shortcut was not written"
    return 0
  fi

  local userdata_root="$HOME/.steam/steam/userdata"
  if [ ! -d "$userdata_root" ]; then
    warn "Steam userdata folder not found; Desktop Mode launcher installed, but Gaming Mode shortcut was not written"
    return 0
  fi

  if ! shutdown_steam_if_needed; then
    warn "Steam did not exit cleanly; Desktop Mode launcher installed, but Gaming Mode shortcut was not written"
    warn "Close Steam manually and rerun with LBH_SKIP_DOWNLOAD=1 $0"
    return 0
  fi

  python3 - "$userdata_root" "$INSTALL_DIR/run-last-singularity.sh" "$INSTALL_DIR" "$INSTALL_DIR/$DESKTOP_ENTRY_NAME" "$INSTALL_DIR/last-singularity-icon.png" <<'PY'
import binascii
import os
import struct
import sys
from pathlib import Path

PRODUCT_NAME = "Last Singularity"

userdata_root = Path(sys.argv[1]).expanduser()
launcher = Path(sys.argv[2]).expanduser()
install_dir = Path(sys.argv[3]).expanduser()
desktop_entry = Path(sys.argv[4]).expanduser()
icon_path = Path(sys.argv[5]).expanduser()

TYPE_OBJECT = 0x00
TYPE_STRING = 0x01
TYPE_INT32 = 0x02
TYPE_UINT64 = 0x07
TYPE_END = 0x08


def read_cstring(data, offset):
    end = data.find(b"\x00", offset)
    if end < 0:
        raise ValueError("unterminated VDF string")
    return data[offset:end].decode("utf-8", "replace"), end + 1


def parse_object(data, offset):
    obj = {}
    while offset < len(data):
        field_type = data[offset]
        offset += 1
        if field_type == TYPE_END:
            return obj, offset
        key, offset = read_cstring(data, offset)
        if field_type == TYPE_OBJECT:
            obj[key], offset = parse_object(data, offset)
        elif field_type == TYPE_STRING:
            obj[key], offset = read_cstring(data, offset)
        elif field_type == TYPE_INT32:
            obj[key] = struct.unpack_from("<I", data, offset)[0]
            offset += 4
        elif field_type == TYPE_UINT64:
            obj[key] = struct.unpack_from("<Q", data, offset)[0]
            offset += 8
        else:
            raise ValueError(f"unsupported VDF field type {field_type} for {key}")
    raise ValueError("unterminated VDF object")


def parse_shortcuts(data):
    if not data:
        return {"shortcuts": {}}
    if data[0] != TYPE_OBJECT:
        raise ValueError("shortcuts.vdf root is not an object")
    root_name, offset = read_cstring(data, 1)
    if root_name != "shortcuts":
        raise ValueError(f"unexpected shortcuts.vdf root {root_name!r}")
    root, _ = parse_object(data, offset)
    return {"shortcuts": root}


def cstring(value):
    return str(value).encode("utf-8") + b"\x00"


def sorted_keys(obj):
    keys = list(obj.keys())
    numeric = sorted([key for key in keys if str(key).isdigit()], key=lambda key: int(key))
    named = [key for key in keys if not str(key).isdigit()]
    return numeric + named


def encode_value(key, value):
    if isinstance(value, dict):
        return bytes([TYPE_OBJECT]) + cstring(key) + encode_object(value)
    if isinstance(value, int):
        return bytes([TYPE_INT32]) + cstring(key) + struct.pack("<I", value & 0xFFFFFFFF)
    return bytes([TYPE_STRING]) + cstring(key) + cstring(value)


def encode_object(obj):
    body = b"".join(encode_value(key, obj[key]) for key in sorted_keys(obj))
    return body + bytes([TYPE_END])


def write_shortcuts(root):
    return bytes([TYPE_OBJECT]) + cstring("shortcuts") + encode_object(root.get("shortcuts", {})) + bytes([TYPE_END])


def shortcut_appid(exe, name):
    return (binascii.crc32((exe + name).encode("utf-8")) | 0x80000000) & 0xFFFFFFFF


def select_shortcuts_paths():
    explicit = os.environ.get("LBH_STEAM_USER_ID", "").strip()
    all_users = os.environ.get("LBH_ALL_STEAM_USERS", "1").strip().lower() not in ("0", "false", "no")
    if explicit and explicit.lower() != "all":
        return [userdata_root / explicit / "config" / "shortcuts.vdf"]

    dirs = sorted([path for path in userdata_root.iterdir() if path.is_dir() and path.name.isdigit()])
    if not dirs:
        raise RuntimeError(f"no Steam userdata directories under {userdata_root}")
    if explicit.lower() == "all" or all_users or len(dirs) > 1:
        return [path / "config" / "shortcuts.vdf" for path in dirs]
    with_shortcuts = [path for path in dirs if (path / "config" / "shortcuts.vdf").exists()]
    if len(with_shortcuts) == 1:
        return [with_shortcuts[0] / "config" / "shortcuts.vdf"]
    if len(dirs) == 1:
        return [dirs[0] / "config" / "shortcuts.vdf"]
    candidates = sorted(dirs, key=lambda path: (path / "config").stat().st_mtime if (path / "config").exists() else path.stat().st_mtime, reverse=True)
    return [candidates[0] / "config" / "shortcuts.vdf"]


def upsert(root):
    exe = f'"{launcher}"'
    entry = {
        "appid": shortcut_appid(exe, PRODUCT_NAME),
        "AppName": PRODUCT_NAME,
        "Exe": exe,
        "StartDir": f'"{install_dir}"',
        "icon": str(icon_path) if icon_path.exists() else "",
        "ShortcutPath": str(desktop_entry),
        "LaunchOptions": "",
        "IsHidden": 0,
        "AllowDesktopConfig": 1,
        "AllowOverlay": 1,
        "OpenVR": 0,
        "Devkit": 0,
        "DevkitGameID": "",
        "LastPlayTime": 0,
        "FlatpakAppID": "",
        "tags": {"0": PRODUCT_NAME, "1": "Deck Playtest"},
    }
    shortcuts = root.setdefault("shortcuts", {})
    key = None
    for candidate, item in shortcuts.items():
        if not isinstance(item, dict):
            continue
        item_exe = str(item.get("Exe", "")).strip('"')
        if item.get("AppName") == PRODUCT_NAME or item_exe == str(launcher) or item.get("ShortcutPath") == str(desktop_entry):
            key = candidate
            break
    if key is None:
        numeric = [int(candidate) for candidate in shortcuts if str(candidate).isdigit()]
        key = str(max(numeric) + 1 if numeric else 0)
    existing = shortcuts.get(key, {})
    if not isinstance(existing, dict):
        existing = {}
    existing.update(entry)
    shortcuts[key] = existing
    return key, entry["appid"]


for shortcuts_path in select_shortcuts_paths():
    shortcuts_path.parent.mkdir(parents=True, exist_ok=True)
    data = shortcuts_path.read_bytes() if shortcuts_path.exists() else b""
    root = parse_shortcuts(data)
    key, appid = upsert(root)
    backup = None
    if data:
        backup = shortcuts_path.with_name(shortcuts_path.name + ".lbh-backup-" + __import__("datetime").datetime.now().strftime("%Y%m%d%H%M%S"))
        backup.write_bytes(data)
    tmp = shortcuts_path.with_name(shortcuts_path.name + ".lbh-tmp")
    tmp.write_bytes(write_shortcuts(root))
    tmp.replace(shortcuts_path)
    shortcuts_path.chmod(0o600)
    print(f"Steam shortcut installed: {shortcuts_path} key={key} appid={appid}")
    if backup:
        print(f"Backup: {backup}")
PY
}

main() {
  need_command curl
  need_command unzip
  need_command find

  if [ "$(uname -m)" != "x86_64" ]; then
    warn "this installer is built for Steam Deck / x86_64 Linux"
  fi

  TMP_DIR="$(mktemp -d)"
  local zip_path="$TMP_DIR/${ASSET_NAME}"
  local extract_dir="$TMP_DIR/extract"
  mkdir -p "$extract_dir"

  if [ "${LBH_SKIP_DOWNLOAD:-0}" = "1" ]; then
    [ -n "${LBH_LOCAL_ZIP:-}" ] || fail "LBH_SKIP_DOWNLOAD=1 requires LBH_LOCAL_ZIP=/path/to/build.zip"
    zip_path="$LBH_LOCAL_ZIP"
  else
    download_build "$zip_path"
  fi

  log "Extracting build..."
  unzip -q "$zip_path" -d "$extract_dir"
  local app_root
  app_root="$(find_app_root "$extract_dir")"
  install_files "$app_root"
  install_steam_shortcut

  log "Done."
  log "Desktop Mode: launch $DESKTOP_DIR/$PRODUCT_NAME.desktop"
  log "Gaming Mode: restart Steam or return to Gaming Mode, then launch $PRODUCT_NAME from Library -> Non-Steam."
  log "Logs: $STATE_DIR/deck-launch.log"
}

main "$@"
