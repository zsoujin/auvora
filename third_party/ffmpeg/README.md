# auvora FFmpeg build

auvora builds and ships a minimal FFmpeg 8.1.1 toolchain from the pinned
upstream source archive in this directory. The archive is FFmpeg commit
`239f2c733de417201d7ad3b3b8b0d9b63285b2b1` and has SHA-256:

`ec0aa20fb9f6fd3692ffc04dc12ffa43cfffc4a479e388ccd7910ec6cfe188a2`

The build uses the Windows Media Foundation AAC/MP3 encoders, native FFmpeg
decoders, image artwork extraction, and file/pipe protocols only. It does not
link to Gyan's prebuilt binaries or to third-party codec libraries. The
Windows SDK/Media Foundation and MinGW runtime are toolchain dependencies;
their package versions are recorded in `toolchain-packages.txt`.

## Rebuild on Windows

1. Install MSYS2 and update it with `pacman -Syu`.
2. Install the packages listed in `toolchain-packages.txt`.
3. From the repository root, run:

```powershell
pwsh -File .\scripts\build-ffmpeg.ps1
```

The script verifies the source archive, extracts a clean tree, configures the
fixed feature set, builds static `ffmpeg.exe` and `ffprobe.exe`, and copies
them into `src-tauri/binaries/`.

FFmpeg is GPLv3. Keep `src-tauri/binaries/licenses/ffmpeg-GPL.txt` with every
distribution and retain this source archive and build script as the
corresponding source for the binaries produced by this configuration.
