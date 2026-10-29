param(
    [string]$Msys2Root = 'C:\msys64',
    [int]$Jobs = 2
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$bash = Join-Path $Msys2Root 'usr\bin\bash.exe'
if (!(Test-Path -LiteralPath $bash)) { throw "MSYS2 bash not found: $bash" }
$repo = $root.Replace('\', '/').TrimEnd('/')
$env:FFMPEG_JOBS = "$Jobs"
$command = "export PATH=/mingw64/bin:`$PATH; cd '$repo/third_party/ffmpeg'; ./build.sh"
& $bash -lc $command
if ($LASTEXITCODE -ne 0) { throw "FFmpeg build failed with exit code $LASTEXITCODE" }
