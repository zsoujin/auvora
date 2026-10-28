$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = Split-Path $PSScriptRoot -Parent
$bin = Join-Path $root 'src-tauri/binaries'
$manifest = Get-Content (Join-Path $bin 'versions.json') -Raw | ConvertFrom-Json
$cache = Join-Path $root 'release/component-cache'
New-Item -ItemType Directory -Path $cache -Force | Out-Null
function Assert-Hash([string]$Path, [string]$Expected) {
    if ($Expected -notmatch '^[a-f0-9]{64}$') { throw 'A pinned SHA-256 is required' }
    if ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -ne $Expected) { throw "Checksum mismatch: $Path" }
}
function Fetch([string]$Url, [string]$Name, [string]$Hash) {
    $path = Join-Path $cache $Name
    if (!(Test-Path -LiteralPath $path)) { Invoke-WebRequest -Uri $Url -OutFile $path }
    Assert-Hash $path $Hash
    return $path
}
$yt = Fetch 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.21/yt-dlp.exe' 'yt-dlp.exe' $manifest.files.'yt-dlp.exe'
$deno = Fetch 'https://github.com/denoland/deno/releases/download/v2.9.8/deno-x86_64-pc-windows-msvc.zip' 'deno-2.9.8.zip' 'cba84b26e0df5ae7f74fc66b86a95b866872a86292ebd84fa1e959927edd93bf'
$ffmpeg = Fetch 'https://github.com/GyanD/codexffmpeg/releases/download/8.1.1/ffmpeg-8.1.1-full_build.zip' 'ffmpeg-8.1.1.zip' '49b28c5f16addd40239a66949973458769b7056fb7752c30ac0d53389d09a552'
Expand-Archive -LiteralPath $deno -DestinationPath (Join-Path $cache 'deno') -Force
Expand-Archive -LiteralPath $ffmpeg -DestinationPath (Join-Path $cache 'ffmpeg') -Force
$sources = @{
    'yt-dlp.exe' = $yt
    'deno.exe' = Join-Path $cache 'deno/deno.exe'
    'ffmpeg.exe' = Join-Path $cache 'ffmpeg/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe'
    'ffprobe.exe' = Join-Path $cache 'ffmpeg/ffmpeg-8.1.1-full_build/bin/ffprobe.exe'
}
foreach ($name in $sources.Keys) { Assert-Hash $sources[$name] $manifest.files.$name }
foreach ($name in $sources.Keys) { Copy-Item -LiteralPath $sources[$name] -Destination (Join-Path $bin $name) -Force }
Write-Output 'Pinned components verified. Review committed notices when updating versions.'
