param(
  [string]$Version = "v1.0",
  [string]$FfmpegPath = "",
  [string]$OutRoot = ""
)

$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$parentDir = Split-Path -Parent $projectDir
$targetRoot = if ($OutRoot -and $OutRoot.Trim() -ne "") { $OutRoot } else { $parentDir }
$outDir = Join-Path $targetRoot ("AudioServer_" + $Version)

Write-Host "== Build mic_sender.exe =="
py -m PyInstaller (Join-Path $projectDir "mic_sender.spec")

Write-Host "== Build server.exe =="
if (-not (Test-Path (Join-Path $projectDir "node_modules"))) {
  Write-Host "node_modules not found. Running npm install..."
  npm install
}
npx pkg (Join-Path $projectDir "server.js") `
  --targets node18-win-x64 `
  --output (Join-Path $projectDir "server.exe") `
  --assets "public/**/*" `
  --assets "media/**/*"

Write-Host "== Assemble release folder =="
if (Test-Path $outDir) {
  Remove-Item -Recurse -Force $outDir
}
New-Item -ItemType Directory -Path $outDir | Out-Null

Copy-Item (Join-Path $projectDir "server.exe") $outDir
Copy-Item (Join-Path $projectDir "dist\\mic_sender.exe") $outDir
Copy-Item (Join-Path $projectDir "public") (Join-Path $outDir "public") -Recurse
Copy-Item (Join-Path $projectDir "media") (Join-Path $outDir "media") -Recurse

if ($FfmpegPath -and (Test-Path $FfmpegPath)) {
  Copy-Item $FfmpegPath (Join-Path $outDir "ffmpeg.exe")
} else {
  Write-Host "ffmpeg.exe not copied (set -FfmpegPath to your ffmpeg.exe)."
}

Write-Host "Done. Output: $outDir"
