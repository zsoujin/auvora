# Architecture

auvora is a Windows desktop application with a React/TypeScript interface in a Tauri 2 WebView2 window. Rust handles native dialogs, persistence, filesystem access and download processes. There is no application server or account system.

| Location | Responsibility |
| --- | --- |
| `src/App.tsx` | Library views, player, playlists and download/queue panels |
| `src/model.ts` | Library data model, ordering, duration and queue operations |
| `src/storage.ts`, `src/saveQueue.ts`, `src/stateWriter.ts` | Native/browser persistence, serialized saves and position-only updates |
| `src/Popup.tsx`, `src/Timeline.tsx` | Menus, selects and seeking UI |
| `src-tauri/src/main.rs` | Tauri startup, SQLite setup, command registration and component lookup |
| `src-tauri/src/library.rs` | Import, file authorization, metadata, backup and restore |
| `src-tauri/src/downloads.rs` | URL validation, yt-dlp jobs, progress and updater |
| `src-tauri/src/process.rs`, `memory.rs` | Windows process and WebView2 resource handling |

Audio playback uses the WebView's audio element. FFprobe reads metadata; FFmpeg performs conversion. yt-dlp downloads supported video audio and uses Deno for its JavaScript runtime. They run as separate executables with argument arrays, without an intervening command shell.

## Local data

SQLite is stored under Tauri's application data directory, normally `%APPDATA%\app.personalaudio.desktop\library.sqlite3`. The database uses WAL mode and stores application state and download history. Cached artwork and an updated yt-dlp executable are under that data directory. Downloads default to `Music\auvora`; imported files remain in their original locations.

The legacy application identifier intentionally preserves existing installations' data. The product name, executable and public documentation use **auvora**.

Playback checkpoints send a track index, ID and position when the rest of the immutable snapshot is unchanged. SQLite verifies the ID at that index before updating the position. A mismatch falls back to a full validated snapshot. Writes share the same serialized queue, and failed writes do not advance its successful-snapshot baseline. Structural edits and backups retain full-state validation.

## Trust boundaries

The frontend calls registered Rust commands through Tauri IPC. The asset protocol begins with an empty scope and grants individual local files during library operations. The content security policy restricts remote frontend resources. User-selected files and restored backups are inputs, not executable configuration.

Download URLs are normalized to single YouTube video URLs. yt-dlp runs with configuration and plugin discovery disabled. Its updater downloads release information and verifies SHA-256 before replacement. Release-component integrity and license compliance are separate checks: a correct hash does not establish redistribution rights.

The browser preview uses browser storage and has limited native-file functionality. It is a development mode, not the Windows installation.
