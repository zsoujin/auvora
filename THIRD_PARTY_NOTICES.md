# Third-party components

The auvora application license does not replace the licenses of its dependencies or bundled executables. The installed `licenses` directory contains collected notices. `src-tauri/binaries/versions.json` identifies the bundled executable hashes; `docs/dependency-licenses.json` inventories the resolved application dependencies.

| Component | Role | Licensing notes |
| --- | --- | --- |
| React | Interface | MIT |
| Tauri and dialog plugin | Desktop host and dialogs | MIT OR Apache-2.0; retain relevant notices |
| Lucide | Interface icons | ISC; see packaged notice |
| Rust dependencies | Native application | Per-package licenses in the generated inventory, including MPL-2.0 components |
| yt-dlp 2026.10.21 | Download executable | Project source is Unlicense; the packaged executable includes separately licensed components listed in `yt-dlp-third-party.txt` |
| Deno 2.9.8 | JavaScript runtime for yt-dlp | MIT plus third-party components; review notices against the exact release |
| FFmpeg / FFprobe 8.1.1 | Media conversion and metadata | Self-built GPLv3 binaries from the pinned FFmpeg source and configuration in `third_party/ffmpeg/` |
| Microsoft WebView2 | Rendering and playback | Microsoft runtime redistribution terms; installed by Tauri's offline runtime installer |

FFmpeg is invoked as a separate process. Its GPL terms still apply to distribution of those executable files. The exact source archive, build script and configuration are included in `third_party/ffmpeg/`; preserve that directory with every binary distribution. The MSYS2 packages listed in `toolchain-packages.txt` are build-time inputs and are not bundled in the installer; their SPDX metadata and project URLs are recorded there for source and notice review. See [FFmpeg licensing](https://ffmpeg.org/legal.html) and the bundled GPL text.

The logo was supplied by Akniyet Manas, who confirmed authorship and permission to distribute it under MIT. System fonts are referenced by name, not bundled. Screenshots must use non-personal sample content.

Local license and notice metadata has been collected for all 321 resolved application dependencies, and exact sources for five MPL-covered crates are bundled separately. Review of the external executable distributions remains in progress. See [known limitations](docs/limitations.md); the presence of notice files is not a claim that all redistribution requirements have been satisfied.
