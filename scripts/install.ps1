[CmdletBinding()]
param(
  [string]$Version = $(if ($env:LBH_RELEASE_TAG) { $env:LBH_RELEASE_TAG } else { "nightly-latest" }),
  [string]$Name = $(if ($env:LBH_DISPLAY_NAME) { $env:LBH_DISPLAY_NAME } else { "Last Singularity" }),
  [string]$Slug = "last-singularity",
  [string]$InstallDir = $env:LBH_INSTALL_DIR,
  [switch]$NoLauncher,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$repo = if ($env:LBH_REPO) { $env:LBH_REPO } else { "theysayheygreg/last-black-hole" }
$apiRoot = if ($env:LBH_GITHUB_API) { $env:LBH_GITHUB_API } else { "https://api.github.com" }
$downloadRoot = if ($env:LBH_GITHUB_DOWNLOAD) { $env:LBH_GITHUB_DOWNLOAD } else { "https://github.com" }
$asset = "last-singularity-win-nightly.zip"

if ([string]::IsNullOrWhiteSpace($Name)) { throw "Name cannot be empty." }
if ($Name -match "[\r\n]") { throw "Name must be a single line." }
if ($Slug -notmatch "^[a-z0-9]+(?:-[a-z0-9]+)*$") {
  throw "Slug must use lowercase letters, numbers, and internal hyphens."
}
if ([string]::IsNullOrWhiteSpace($InstallDir)) {
  $folder = if ($Slug -eq "last-singularity") { "Last Singularity" } else { $Slug }
  $InstallDir = Join-Path $env:LOCALAPPDATA "Programs\$folder"
}

$windowsArch = [Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
if ($windowsArch -ne "X64") {
  throw "Unsupported Windows architecture '$windowsArch'; the current public build requires x64 Windows."
}

$release = Invoke-RestMethod -Headers @{ Accept = "application/vnd.github+json" } -Uri "$apiRoot/repos/$repo/releases/tags/$Version"
if ($release.draft) { throw "Release '$Version' is a draft." }
$selectedAsset = $release.assets | Where-Object { $_.name -eq $asset } | Select-Object -First 1
if (-not $selectedAsset) { throw "Release '$Version' has no Windows x64 asset ($asset)." }

Write-Host "[Last Singularity] Platform: Windows/x64"
Write-Host "[Last Singularity] Version: $Version"
Write-Host "[Last Singularity] Name: $Name"
Write-Host "[Last Singularity] Destination: $InstallDir"
$assetUrl = "$downloadRoot/$repo/releases/download/$Version/$asset"
if ($DryRun) {
  Write-Host "[Last Singularity] Would download $assetUrl"
  exit 0
}

$temp = Join-Path ([IO.Path]::GetTempPath()) ("lbh-install-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $temp | Out-Null
try {
  $zip = Join-Path $temp $asset
  Invoke-WebRequest -UseBasicParsing -Uri $assetUrl -OutFile $zip

  if ($selectedAsset.digest -match "^sha256:([0-9a-fA-F]{64})$") {
    $expected = $Matches[1].ToLowerInvariant()
    $actual = (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { throw "Checksum mismatch for $asset." }
    Write-Host "[Last Singularity] SHA-256 verified from GitHub Release metadata"
  } elseif ($release.assets.name -contains "SHA256SUMS") {
    $sums = Join-Path $temp "SHA256SUMS"
    Invoke-WebRequest -UseBasicParsing -Uri "$downloadRoot/$repo/releases/download/$Version/SHA256SUMS" -OutFile $sums
    $line = Get-Content $sums | Where-Object { $_ -match "\s\*?$([regex]::Escape($asset))$" } | Select-Object -First 1
    if (-not $line) { throw "SHA256SUMS has no entry for $asset." }
    $expected = ($line -split "\s+")[0].ToLowerInvariant()
    $actual = (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { throw "Checksum mismatch for $asset." }
    Write-Host "[Last Singularity] SHA-256 verified"
  } else {
    throw "Release '$Version' has no verifiable SHA-256 metadata."
  }

  $extract = Join-Path $temp "extract"
  Expand-Archive -Path $zip -DestinationPath $extract
  $source = Join-Path $extract "Last Singularity-win32-x64"
  if (-not (Test-Path (Join-Path $source "Last Singularity.exe"))) { throw "Archive does not contain the Windows app." }

  $new = "$InstallDir.new.$PID"
  $previous = "$InstallDir.previous"
  if (Test-Path $new) { Remove-Item -Recurse -Force $new }
  New-Item -ItemType Directory -Path (Split-Path $InstallDir -Parent) -Force | Out-Null
  Copy-Item -Recurse $source $new
  if (Test-Path $previous) { Remove-Item -Recurse -Force $previous }
  if (Test-Path $InstallDir) { Move-Item $InstallDir $previous }
  try {
    Move-Item $new $InstallDir
  } catch {
    if (Test-Path $previous) { Move-Item $previous $InstallDir }
    throw
  }

  $exe = Join-Path $InstallDir "Last Singularity.exe"
  if (-not $NoLauncher) {
    $startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
    New-Item -ItemType Directory -Path $startMenu -Force | Out-Null
    $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $startMenu "$Name.lnk"))
    if ($Slug -eq "last-singularity") {
      $shortcut.TargetPath = $exe
    } else {
      $launcher = Join-Path $InstallDir "run-last-singularity.cmd"
      "@echo off`r`nstart `"`" `"%~dp0Last Singularity.exe`" --user-data-dir=`"%APPDATA%\$Slug`" %*`r`n" |
        Set-Content -Encoding ASCII $launcher
      $shortcut.TargetPath = $launcher
    }
    $shortcut.WorkingDirectory = $InstallDir
    $shortcut.Save()
  }

  Write-Host "[Last Singularity] Installed successfully"
  Write-Host "[Last Singularity] Launch: `"$exe`""
  Write-Host "[Last Singularity] This unsigned build may show Microsoft Defender SmartScreen; choose More info > Run anyway only if you trust this GitHub Release."
} finally {
  if (Test-Path $temp) { Remove-Item -Recurse -Force $temp }
}
