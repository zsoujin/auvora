# Changelog

## Unreleased

- Prepare the existing Windows audio player for its first public release.
- Document local import, supported downloads, playlists, favorites, playback queue, saved positions and backup/restore.
- Prepare contributor guidance, dependency notices and automated build checks.
- Build FFmpeg and FFprobe from the pinned source archive with a recorded MSYS2 toolchain.
- Ship yt-dlp updates only with reviewed auvora releases; remove the unsigned in-app updater path.
- Define the 250 MB acceptance target against summed private working set across the application process tree.
- Save playback position without repeatedly serializing the entire library; retain full validated saves for structural edits and recovery.
- Load off-screen cover images lazily and preload only audio metadata before playback.

No public stable release is asserted by this entry. The application currently reports version 1.0.0; see [known limitations](docs/limitations.md).
