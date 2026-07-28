#!/bin/sh
set -eu

PRODUCT="Last Singularity"
SLUG="last-singularity"
REPO="${LBH_REPO:-theysayheygreg/last-black-hole}"
TAG="${LBH_RELEASE_TAG:-nightly-latest}"
INSTALL_DIR="${LBH_INSTALL_DIR:-}"
NO_LAUNCHER=0
DRY_RUN=0
API_ROOT="${LBH_GITHUB_API:-https://api.github.com}"
DOWNLOAD_ROOT="${LBH_GITHUB_DOWNLOAD:-https://github.com}"

log() { printf '[Last Singularity] %s\n' "$*"; }
fail() { printf '[Last Singularity] error: %s\n' "$*" >&2; exit 1; }
run() {
  if [ "$DRY_RUN" = 1 ]; then
    printf '[Last Singularity] dry-run:'
    printf ' %s' "$@"
    printf '\n'
  else
    "$@"
  fi
}

usage() {
  cat <<'EOF'
Install the latest public Last Singularity weekly build.

Usage: install.sh [--version TAG] [--install-dir PATH] [--no-launcher] [--dry-run]
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) [ "$#" -ge 2 ] || fail "--version needs a release tag"; TAG="$2"; shift 2 ;;
    --install-dir) [ "$#" -ge 2 ] || fail "--install-dir needs a path"; INSTALL_DIR="$2"; shift 2 ;;
    --no-launcher) NO_LAUNCHER=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown option: $1" ;;
  esac
done

command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v unzip >/dev/null 2>&1 || fail "unzip is required"

kernel="${LBH_TEST_OS:-$(uname -s)}"
machine="${LBH_TEST_ARCH:-$(uname -m)}"
case "$machine" in
  x86_64|amd64) arch="x64" ;;
  arm64|aarch64) arch="arm64" ;;
  *) fail "unsupported architecture: $machine" ;;
esac

case "$kernel" in
  Darwin)
    platform="macOS"
    [ "$arch" = arm64 ] || fail "the current public macOS build supports Apple silicon (arm64) only"
    asset="last-singularity-mac-nightly.zip"
    [ -n "$INSTALL_DIR" ] || INSTALL_DIR="$HOME/Applications/$PRODUCT.app"
    ;;
  Linux)
    [ "$arch" = x64 ] || fail "the current public Linux build supports x64 only"
    if [ "${LBH_TEST_STEAMOS:-0}" = 1 ] || { [ -r /etc/os-release ] && grep -Eq '^ID="?steamos"?$' /etc/os-release; }; then
      platform="SteamOS"
      [ -n "$INSTALL_DIR" ] || INSTALL_DIR="$HOME/Games/$SLUG"
    else
      platform="Linux"
      [ -n "$INSTALL_DIR" ] || INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/$SLUG"
    fi
    asset="last-singularity-linux-nightly.zip"
    ;;
  *) fail "unsupported operating system: $kernel (Windows users should run scripts/install.ps1 in PowerShell)" ;;
esac

tmp="$(mktemp -d "${TMPDIR:-/tmp}/lbh-install.XXXXXX")"
cleanup() { [ ! -d "$tmp" ] || rm -rf "$tmp"; }
trap cleanup EXIT HUP INT TERM
release_json="$tmp/release.json"
api_url="$API_ROOT/repos/$REPO/releases/tags/$TAG"
curl -fsSL -H 'Accept: application/vnd.github+json' "$api_url" -o "$release_json" ||
  fail "could not resolve public GitHub Release '$TAG'"
grep -Eq '"draft":[[:space:]]*false' "$release_json" || fail "release '$TAG' is a draft"
grep -Eq "\"name\":[[:space:]]*\"$asset\"" "$release_json" ||
  fail "release '$TAG' has no $platform/$arch asset ($asset)"

compact_json="$(tr -d '\n\r ' < "$release_json")"
release_digest="$(
  printf '%s' "$compact_json" |
    sed "s/.*\"name\":\"$asset\"/SELECTED_ASSET/" |
    sed 's/"browser_download_url".*//' |
    sed -n 's/.*"digest":"sha256:\([0-9a-fA-F]*\)".*/\1/p'
)"
if [ "$platform" = macOS ] &&
   [ "$release_digest" = "6237361409141699047d0967d0d6f643df0db75f22f0aa17f59fb077aa1da941" ]; then
  fail "the current macOS release asset is broken; wait for nightly-latest to be republished"
fi

zip="$tmp/$asset"
asset_url="$DOWNLOAD_ROOT/$REPO/releases/download/$TAG/$asset"
log "Platform: $platform/$arch"
log "Version: $TAG"
log "Destination: $INSTALL_DIR"
if [ "$DRY_RUN" = 1 ]; then
  log "Would download $asset_url"
  exit 0
fi

curl -fL --silent --show-error "$asset_url" -o "$zip" || fail "download failed: $asset"

if [ -n "$release_digest" ]; then
  if command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "$zip" | awk '{print $1}')"
  elif command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$zip" | awk '{print $1}')"
  else
    fail "GitHub supplies an asset digest, but neither shasum nor sha256sum is available"
  fi
  [ "$actual" = "$release_digest" ] || fail "checksum mismatch for $asset"
  log "SHA-256 verified from GitHub Release metadata"
elif grep -Eq '"name":[[:space:]]*"SHA256SUMS"' "$release_json"; then
  sums="$tmp/SHA256SUMS"
  curl -fL --silent --show-error \
    "$DOWNLOAD_ROOT/$REPO/releases/download/$TAG/SHA256SUMS" -o "$sums" ||
    fail "release advertises SHA256SUMS but it could not be downloaded"
  expected="$(awk -v name="$asset" '$2 == name || $2 == "*" name { print $1; exit }' "$sums")"
  [ -n "$expected" ] || fail "SHA256SUMS has no entry for $asset"
  if command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "$zip" | awk '{print $1}')"
  elif command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$zip" | awk '{print $1}')"
  else
    fail "release supplies checksums, but neither shasum nor sha256sum is available"
  fi
  [ "$actual" = "$expected" ] || fail "checksum mismatch for $asset"
  log "SHA-256 verified"
else
  log "Release metadata does not publish a SHA-256 digest; continuing without verification"
fi

extract="$tmp/extract"
mkdir -p "$extract"
unzip -q "$zip" -d "$extract" || fail "could not unpack $asset"

parent="$(dirname "$INSTALL_DIR")"
new="${INSTALL_DIR}.new.$$"
previous="${INSTALL_DIR}.previous"
mkdir -p "$parent"
rm -rf "$new"

if [ "$platform" = macOS ]; then
  source_app="$extract/$PRODUCT.app"
  [ -d "$source_app" ] || fail "archive does not contain $PRODUCT.app"
  cp -R "$source_app" "$new"
else
  source_app="$extract/$PRODUCT-linux-x64"
  [ -d "$source_app" ] || fail "archive does not contain $PRODUCT-linux-x64"
  cp -R "$source_app" "$new"
  chmod +x "$new/$PRODUCT"
fi

rm -rf "$previous"
[ ! -e "$INSTALL_DIR" ] || mv "$INSTALL_DIR" "$previous"
if ! mv "$new" "$INSTALL_DIR"; then
  [ ! -e "$previous" ] || mv "$previous" "$INSTALL_DIR"
  fail "could not replace the existing install"
fi

if [ "$platform" = macOS ]; then
  log "Installed $PRODUCT.app"
  log "Launch: open \"$INSTALL_DIR\""
  log "This build is ad-hoc signed, not notarized. If macOS blocks it, Control-click the app and choose Open once."
  exit 0
fi

launcher="$INSTALL_DIR/run-last-singularity.sh"
if [ "$platform" = SteamOS ]; then
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
EXTRA_FLAGS=()
[ "${LBH_DECK_DISABLE_GPU:-0}" != 1 ] || EXTRA_FLAGS+=("--disable-gpu")
[ "${LBH_DECK_DISABLE_GPU_COMPOSITING:-0}" != 1 ] || EXTRA_FLAGS+=("--disable-gpu-compositing")
[ "${LBH_DECK_IN_PROCESS_GPU:-0}" != 1 ] || EXTRA_FLAGS+=("--in-process-gpu")
if [ -n "${LBH_DECK_EXTRA_FLAGS:-}" ]; then
  read -r -a USER_EXTRA_FLAGS <<< "$LBH_DECK_EXTRA_FLAGS"
  EXTRA_FLAGS+=("${USER_EXTRA_FLAGS[@]}")
fi
exec "./Last Singularity" --no-sandbox --disable-gpu-sandbox --ignore-gpu-blocklist --ozone-platform=x11 --enable-logging=stderr "${EXTRA_FLAGS[@]}" "$@" >>"$LOG_DIR/deck-launch.log" 2>&1
EOF
else
  cat > "$launcher" <<'EOF'
#!/bin/sh
set -eu
cd "$(dirname "$0")"
exec "./Last Singularity" "$@"
EOF
fi
chmod +x "$launcher"

if [ "$NO_LAUNCHER" = 0 ]; then
  applications="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  mkdir -p "$applications"
  desktop="$applications/$SLUG.desktop"
  cat > "$desktop" <<EOF
[Desktop Entry]
Type=Application
Name=$PRODUCT
Exec="$launcher"
Path=$INSTALL_DIR
Icon=$INSTALL_DIR/last-singularity-icon.png
Terminal=false
Categories=Game;
StartupNotify=false
EOF
  chmod +x "$desktop"

  if [ "$platform" = SteamOS ]; then
    cp "$desktop" "$INSTALL_DIR/$SLUG.desktop"
    deck_desktop="${XDG_DESKTOP_DIR:-$HOME/Desktop}"
    if [ -d "$deck_desktop" ]; then
      cp "$desktop" "$deck_desktop/$PRODUCT.desktop"
      chmod +x "$deck_desktop/$PRODUCT.desktop"
    fi
    helper="${LBH_STEAM_SHORTCUT_HELPER:-}"
    if [ -z "$helper" ]; then
      helper="$tmp/install-steam-shortcut.py"
      curl -fsSL "https://raw.githubusercontent.com/$REPO/main/scripts/install-steam-shortcut.py" -o "$helper" ||
        helper=""
    fi
    steam_closed=1
    if command -v pgrep >/dev/null 2>&1 &&
       { pgrep -u "$(id -u)" -x steam >/dev/null 2>&1 || pgrep -u "$(id -u)" -x steamwebhelper >/dev/null 2>&1; }; then
      log "Closing Steam before updating the Gaming Mode shortcut"
      command -v steam >/dev/null 2>&1 && steam -shutdown >/dev/null 2>&1 || true
      tries=0
      while [ "$tries" -lt 30 ] &&
        { pgrep -u "$(id -u)" -x steam >/dev/null 2>&1 || pgrep -u "$(id -u)" -x steamwebhelper >/dev/null 2>&1; }; do
        sleep 1
        tries=$((tries + 1))
      done
      if pgrep -u "$(id -u)" -x steam >/dev/null 2>&1 ||
         pgrep -u "$(id -u)" -x steamwebhelper >/dev/null 2>&1; then
        steam_closed=0
      fi
    fi
    if [ "$steam_closed" = 0 ]; then
      log "Steam did not exit; Gaming Mode shortcut was left unchanged"
    elif [ -n "$helper" ] && command -v python3 >/dev/null 2>&1; then
      python3 "$helper" "$launcher" "$INSTALL_DIR" "$desktop" "$INSTALL_DIR/last-singularity-icon.png" ||
        log "Steam shortcut was not changed; close Steam and rerun to register Gaming Mode"
    else
      log "Steam shortcut helper unavailable; Desktop Mode launcher was installed"
    fi
  fi
fi

log "Installed successfully"
log "Launch: \"$launcher\""
if [ -d "$previous" ]; then
  log "Previous app bits kept at $previous; player data remains in Electron's user-data directory"
fi
