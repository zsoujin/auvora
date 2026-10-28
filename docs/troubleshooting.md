# Troubleshooting

| Problem | What to check |
| --- | --- |
| Windows warns about the installer | Current builds are unsigned. Verify the GitHub release and SHA-256; see [installation](installation.md). |
| A track cannot be played | Confirm the file still exists, relink it from the track menu, and check that its codec is supported by WebView2. |
| A download fails | Check connectivity and the single-video URL. Retry, or update yt-dlp in Settings. Restricted or removed videos may remain unavailable. |
| Missing component error | Reinstall the complete installer. Do not copy unrelated executables into its directory. |
| A backup restores an empty or missing file | JSON backups contain metadata and paths, not audio. Restore audio separately and relink moved files. |
| Downloads use the old folder | The folder setting applies to new jobs; existing files are not moved. |
| Memory usage exceeds 250 MB | This target has not been met for summed process working set. WebView2 and download processes contribute separately. See [known limitations](limitations.md). |

When reporting a bug, include auvora and Windows versions, the exact steps, expected and actual results, and a redacted screenshot or error. Remove personal paths, URLs, library contents and account information. Do not post a complete library database or backup publicly.
