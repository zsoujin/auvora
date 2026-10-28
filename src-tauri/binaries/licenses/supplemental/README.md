# Supplemental license provenance

These files supply notices omitted from the corresponding crates.io package archives. The revisions come from each package's `.cargo_vcs_info.json`.

- `alloc-stdlib.txt`: dropbox/rust-alloc-no-stdlib, commit 0a81fd6928ea3b33c8cd484aa4575d50ffb98012, root LICENSE; alloc-stdlib 0.3.0.
- `tauri-plugin-MIT.txt` and `tauri-plugin-APACHE.txt`: tauri-apps/tauri, commit 59b63ab500da9859f12d8888c3298bc29bba0b92, root LICENSE-MIT and LICENSE-APACHE-2.0; tauri-plugin 2.7.2.
- `webview2-com.txt`: wravery/webview2-rs, commit edc2caf886175ccaebe86078c9cfe1ae2a187328, root LICENSE; webview2-com and webview2-com-sys 0.39.1.
- `webview2-com-macros.txt`: wravery/webview2-rs, commit dffa41a8a46d3f5565eefbff2de57d38d399f158, root LICENSE; webview2-com-macros 0.8.1.

`MPL-2.0.txt` is the standard Mozilla Public License 2.0 text supplied by cssparser 0.37.0. It also supplies the license referenced in selectors 0.38.0 source headers. `scripts/collect-mpl-sources.py` collects the five exact MPL crate archives, checks their Cargo.lock hashes, and prepares a separate source archive for release review. This does not cover FFmpeg or other external executables.
