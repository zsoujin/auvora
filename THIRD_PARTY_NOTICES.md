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
| FFmpeg / FFprobe 8.1.1 full build | Media conversion and metadata | Gyan Windows static GPLv3 build; includes additional libraries and corresponding source obligations |
| Microsoft WebView2 | Rendering and playback | Microsoft runtime redistribution terms; installed by Tauri's offline runtime installer |

FFmpeg is invoked as a separate process. Its GPL terms still apply to distribution of those executable files. Before publishing an installer, provide the required corresponding source, configuration and included-library material for the exact binaries; do not assume a link to FFmpeg's main repository fulfills all obligations. See [FFmpeg licensing](https://ffmpeg.org/legal.html), the [build provider](https://www.gyan.dev/ffmpeg/builds/) and the bundled `ffmpeg-build.txt` and GPL text.

The logo was supplied by Akniyet Manas, who confirmed authorship and permission to distribute it under MIT. System fonts are referenced by name, not bundled. Screenshots must use non-personal sample content.

Local license and notice metadata has been collected for all 321 resolved application dependencies, and exact sources for five MPL-covered crates are bundled separately. Review of the external executable distributions remains in progress. See [known limitations](docs/limitations.md); the presence of notice files is not a claim that all redistribution requirements have been satisfied.
