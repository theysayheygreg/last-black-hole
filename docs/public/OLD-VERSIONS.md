# Old Versions

Last Singularity preserves one final known-good playable for every displaced
public major/minor line. These are historical builds, not the current release.
Each entry uses an immutable GitHub Release tag and a version-specific install,
launcher, log, save-data, and Steam shortcut identity so it can live beside the
current game.

## v0.2 — Authority, Three, and Deck Foundation

| Field | Preserved value |
|---|---|
| Source | `83953aa1f9f7cc7c39cfc2cd84610ee9a3dec104` |
| Build | `0.2.2.83953aa` |
| GitHub Release | `v0.2.2-final` |
| Linux executable SHA-256 | `b0d127772d2983a93771055a93b673d5fdd1726d6e47db8e269b204e665972d6` |
| Linux `app.asar` SHA-256 | `26aa6c59f498b5f8b7a376f435d389ab8c459852c102b6bca02adf7d8d6fd457` |
| Playtest archive SHA-256 | `6dfc0a0f35c400c877bc4fe12b42fc6699365b66c1e3a1468e4fb89d11042ac7` |

### Linux Or Steam Deck

Run this in a terminal. On Steam Deck, use Konsole in Desktop Mode:

```sh
curl -fsSL https://github.com/theysayheygreg/last-black-hole/releases/download/v0.2.2-final/install.sh | sh -s -- \
  --version v0.2.2-final \
  --name "Last Singularity v0.2" \
  --slug last-singularity-v02
```

This installs to `~/Games/last-singularity-v02` on Steam Deck and registers
**Last Singularity v0.2** separately from the current game.

### Windows x64

Run in PowerShell:

```powershell
$installer = [scriptblock]::Create((irm https://github.com/theysayheygreg/last-black-hole/releases/download/v0.2.2-final/install.ps1))
& $installer -Version v0.2.2-final -Name "Last Singularity v0.2" -Slug last-singularity-v02
```

### macOS Apple Silicon

Run in Terminal:

```sh
curl -fsSL https://github.com/theysayheygreg/last-black-hole/releases/download/v0.2.2-final/install.sh | sh -s -- \
  --version v0.2.2-final \
  --name "Last Singularity v0.2" \
  --slug last-singularity-v02
```

The macOS package is ad-hoc signed rather than notarized. Control-click the app
and choose **Open** once if Gatekeeper blocks the first launch.

## Archive Rules

- Historical release tags and their assets are immutable. Fixes create a new
  tag; they do not replace old bytes.
- Installers verify the GitHub asset SHA-256 when GitHub provides a digest, or
  use the release's `SHA256SUMS` asset.
- Historical installs never overwrite the current install or another preserved
  version.
- Add one section here before each public major/minor promotion. A long honest
  list is preferable to silently dropping playable history.
