# Known limitations

auvora is being prepared for its first public release. The application version is 1.0.0 for compatibility with existing development installations; it does not establish stable-release status.

- Windows 10/11 x64 are the intended platforms. Installation, upgrade, uninstall and offline runtime setup still require acceptance testing on clean machines.
- Installers are unsigned and can trigger an unknown-publisher warning.
- The 250 MB target for the summed working set of the application and its child processes has not been met. Private working set is a different metric.
- Hardware media keys, cold startup and prolonged locked-session playback still require verification.
- Local audio playback depends on codec support in WebView2. Network shares and mapped network drives are not supported library paths.
- Downloads support single YouTube video links and depend on yt-dlp and source availability. Accounts, playlists and arbitrary websites are not supported download inputs.
- Security review is incomplete. Passing automated tests or dependency-advisory checks does not establish that the application is fully audited.
- Redistribution review of bundled external executables remains incomplete. In particular, the exact corresponding sources and build materials for the FFmpeg full build and its included libraries must accompany distribution as required. See [third-party components](../THIRD_PARTY_NOTICES.md).

See [installation](installation.md), [usage](usage.md) and [troubleshooting](troubleshooting.md) for the supported workflows.
