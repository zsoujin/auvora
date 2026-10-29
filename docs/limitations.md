# Known limitations

auvora is being prepared for its first public release. The application version is 1.0.0 for compatibility with existing development installations; it does not establish stable-release status.

- Windows 10/11 x64 are the intended platforms. Installation, upgrade, uninstall and offline runtime setup still require acceptance testing on clean machines.
- Installers are unsigned and can trigger an unknown-publisher warning.
- The 250 MB target applies to the summed private working set of the application and its child processes. Total working set is reported separately because WebView2 shares memory across its process tree.
- Hardware media keys, cold startup and prolonged locked-session playback still require verification.
- Local audio playback depends on codec support in WebView2. Network shares and mapped network drives are not supported library paths.
- Downloads support single YouTube video links and depend on yt-dlp and source availability. Accounts, playlists and arbitrary websites are not supported download inputs.
- The in-app yt-dlp updater is disabled until an independently signed update manifest is available; downloader updates ship with reviewed auvora releases.
- Security review is incomplete. Passing automated tests or dependency-advisory checks does not establish that the application is fully audited.
- FFmpeg and FFprobe are now built from the pinned source/configuration in `third_party/ffmpeg/`. Review the recorded MSYS2 toolchain package sources and notices before public distribution. See [third-party components](../THIRD_PARTY_NOTICES.md).

See [installation](installation.md), [usage](usage.md) and [troubleshooting](troubleshooting.md) for the supported workflows.
