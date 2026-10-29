# Bundled components

Run `scripts/prepare-components.ps1` from the repository root to download and verify pinned Windows x64 yt-dlp, Deno, FFmpeg and FFprobe executables. They are excluded from Git. Their versions and executable hashes are recorded in `versions.json`; packaging checks these hashes again.

Production uses the installed resource directory, except that a verified in-app yt-dlp update in the user's application data directory takes precedence. Debug builds can also use this source directory. Components are invoked directly with argument arrays, without a command shell.

FFmpeg and FFprobe are built from the pinned source and configuration in
`third_party/ffmpeg/`; they are not downloaded from Gyan or another binary
release. Run `scripts/build-ffmpeg.ps1` before packaging to reproduce them.

License notices are bundled from `licenses/`. They do not by themselves establish complete redistribution compliance; see `THIRD_PARTY_NOTICES.md` and `docs/limitations.md` at the repository root. WebView2's offline installer is included by Tauri.
