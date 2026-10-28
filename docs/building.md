# Building from source

Build the Windows x64 application on Windows 10/11 with Node.js 24, Rust stable using the `x86_64-pc-windows-msvc` target, Visual Studio C++ Build Tools and the Windows SDK. PowerShell and Git are also required. Build tools, dependencies, NSIS and the WebView2 offline installer may require internet access on the build machine.

```powershell
npm ci
cargo fetch --manifest-path src-tauri/Cargo.toml --locked --target x86_64-pc-windows-msvc
powershell -NoProfile -File scripts/prepare-components.ps1
node scripts/license-notices.mjs
npm run check:version
npm run typecheck
npm run lint
npm test
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run build
npm run desktop:build
```

The installer is written to `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/auvora_1.0.0_x64-setup.exe`. The release configuration embeds the component executables, notices and WebView2 offline installer.

`prepare-components.ps1` downloads pinned yt-dlp, Deno and FFmpeg releases, verifies archive and executable SHA-256 values, and fails on mismatches. It does not use an arbitrary FFmpeg from PATH. Review both checksums and notices when updating components. Packaging preflight verifies the executable hashes again. Checksums pin bytes, not licensing rights or reproducible compiler output.

`license-notices.mjs` reads production npm packages and the Windows Cargo dependency graph. It generates notices and `docs/dependency-licenses.json`; review any missing notices before distribution. It does not inspect unrelated crates in the developer's cache.

For development use `npm run desktop:dev`. For a frontend-only preview use `npm run dev`. Run `npm run format` to format frontend source. The `lint` command checks formatting; TypeScript performs static type checks separately.

## Release process

Dependency checks: `npm audit --audit-level=moderate` and `cargo audit --file src-tauri/Cargo.lock` (install `cargo-audit` 0.22.2 with `cargo install cargo-audit --version 0.22.2 --locked`). They require network access to current advisory databases. An unreachable database is not a passing audit.

With Python 3.12 or later installed, run `python scripts/collect-mpl-sources.py` after resolving Cargo dependencies. It verifies and bundles exact MPL crate sources against Cargo.lock. The release workflow includes this archive; it does not replace corresponding-source review for FFmpeg or other bundled executables.

Run `node scripts/benchmark-persistence.mjs` with Node 24 to measure serialized checkpoint traffic using 10,000 synthetic tracks. This is not a process-memory benchmark. Use `scripts/measure-memory.ps1` while the native app is running to measure the complete process tree, and keep working set, private working set and committed private bytes distinct.

For memory acceptance, select one app instance with `-RootProcessId`, record `-Label` for idle, active playback, minimized playback and a large library, and repeat measurements over an extended session. The script compares bytes against 250,000,000 (250 decimal MB); MiB fields are display values only. A passing single sample is not sustained acceptance. Missing private-working-set counters are reported as null, not zero.

CI checks pushes to `main` and pull requests. The release workflow builds on a `v*` tag, verifies that its version matches npm, Cargo and Tauri metadata, and collects installer/checksum artifacts. It does not publish a GitHub Release automatically. The owner must review the artifacts, remaining checks and third-party source obligations before publishing.

The application version remains 1.0.0 for compatibility with existing development installations. It is not evidence that the first public release is stable. See [known limitations](limitations.md).
