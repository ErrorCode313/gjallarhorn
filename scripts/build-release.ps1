#requires -Version 5.1
<#
.SYNOPSIS
  Builds a Windows release ZIP of Gjallarhorn for non-developer users.

.DESCRIPTION
  Produces a self-contained folder containing:
    - portable node.exe (downloaded once, cached under build/cache)
    - the prebuilt packages (lib/ output from `npm run build`)
    - runtime node_modules (npm ci --omit=dev in a staging copy)
    - setup.bat / start.bat / README.txt from release-template/

  Output: dist/Gjallarhorn-win-x64/  (folder, not zipped)

.PARAMETER NodeVersion
  Portable Node.js version to bundle. Defaults to 18.20.4 (LTS).

.PARAMETER SkipBuild
  Skip the `npm run build` step. Use if you've already built locally.
#>
param(
    [string]$NodeVersion = "18.20.4",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$BuildDir = Join-Path $RepoRoot "build"
$CacheDir = Join-Path $BuildDir "cache"
$DistDir  = Join-Path $RepoRoot "dist"

$ReleaseName = "Gjallarhorn-win-x64"
$ReleaseDir  = Join-Path $DistDir $ReleaseName

Write-Host "==> Gjallarhorn release builder"
Write-Host "    Repo:   $RepoRoot"
Write-Host "    Node:   v$NodeVersion (portable)"
Write-Host "    Output: $ReleaseDir"
Write-Host ""

# --- 1. Build the project (TypeScript + webpack) ---
if (-not $SkipBuild) {
    Write-Host "==> Running npm run build..."
    Push-Location $RepoRoot
    try {
        & npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "==> Skipping build (--SkipBuild)"
}

# --- 2. Download portable Node into cache ---
$NodeZipName = "node-v$NodeVersion-win-x64.zip"
$NodeZipPath = Join-Path $CacheDir $NodeZipName
$NodeExtractDir = Join-Path $CacheDir "node-v$NodeVersion-win-x64"

New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null

if (-not (Test-Path $NodeZipPath)) {
    $NodeUrl = "https://nodejs.org/dist/v$NodeVersion/$NodeZipName"
    Write-Host "==> Downloading $NodeUrl"
    Invoke-WebRequest -Uri $NodeUrl -OutFile $NodeZipPath
} else {
    Write-Host "==> Using cached $NodeZipPath"
}

if (-not (Test-Path $NodeExtractDir)) {
    Write-Host "==> Extracting portable Node"
    Expand-Archive -Path $NodeZipPath -DestinationPath $CacheDir -Force
}

# --- 3. Clean + (re)create the release dir ---
Write-Host "==> Staging release in $ReleaseDir"
if (Test-Path $ReleaseDir) { Remove-Item $ReleaseDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null

# --- 4. Copy portable node ---
$NodeDestDir = Join-Path $ReleaseDir "node"
New-Item -ItemType Directory -Force -Path $NodeDestDir | Out-Null
Copy-Item (Join-Path $NodeExtractDir "node.exe") (Join-Path $NodeDestDir "node.exe")

# --- 5. Copy root package files (needed for workspace resolution) ---
Copy-Item (Join-Path $RepoRoot "package.json")      $ReleaseDir
Copy-Item (Join-Path $RepoRoot "package-lock.json") $ReleaseDir

# --- 6. Copy each workspace package (only what's needed at runtime) ---
$workspaces = @("cli", "core", "tokens")
foreach ($w in $workspaces) {
    $src = Join-Path $RepoRoot "packages\$w"
    $dst = Join-Path $ReleaseDir "packages\$w"
    New-Item -ItemType Directory -Force -Path $dst | Out-Null

    Copy-Item (Join-Path $src "package.json") $dst

    $libSrc = Join-Path $src "lib"
    if (Test-Path $libSrc) {
        Copy-Item $libSrc $dst -Recurse
    } else {
        throw "Expected built output at $libSrc - run without -SkipBuild first."
    }

    # core also ships the legends data files used at runtime
    if ($w -eq "core") {
        $dataSrc = Join-Path $src "data"
        if (Test-Path $dataSrc) { Copy-Item $dataSrc $dst -Recurse }
    }
}

# --- 7. Install production-only node_modules into the release ---
Write-Host "==> Installing runtime dependencies (this may take a minute)..."
Push-Location $ReleaseDir
try {
    & npm ci --omit=dev --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw "npm ci --omit=dev failed in staging" }
} finally {
    Pop-Location
}

# --- 8. Copy the user-facing scripts ---
$Template = Join-Path $RepoRoot "release-template"
Copy-Item (Join-Path $Template "setup.bat")  $ReleaseDir
Copy-Item (Join-Path $Template "start.bat")  $ReleaseDir
Copy-Item (Join-Path $Template "README.txt") $ReleaseDir

# --- 9. Make an empty output/ folder for the JSON files ---
New-Item -ItemType Directory -Force -Path (Join-Path $ReleaseDir "output") | Out-Null

# --- 10. Done ---
$sizeMB = [math]::Round(
    ((Get-ChildItem -Recurse $ReleaseDir | Measure-Object -Property Length -Sum).Sum / 1MB),
    1
)
Write-Host ""
Write-Host "==> Done. $ReleaseDir ($sizeMB MB on disk)"
Write-Host "    Inside this folder, double-click setup.bat, then start.bat."
