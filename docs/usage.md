# Using auvora

## Library and playlists

Select **Import** to choose local audio files. Import keeps the originals in place. Use search, sorting and **Favorites** to find tracks. The track menu contains the favorite action and **Add to playlist**. Create a playlist from the sidebar or the track menu, then use its menu to rename or delete it. Removing a track from the library or a playlist is separate from deleting its file.

## Playback

Select a track or a playlist's play button. The player stays above the library. It provides play/pause, 15-second rewind, 30-second forward, seeking, volume and speed from 0.5× to 3×. Playback positions and settings are saved locally. Playback support depends on the file's codec and WebView2; a filename extension alone does not establish compatibility.

## Playing Next

Open **Playing Next** in the player. **Play Next** inserts a track at the front of the manual queue; **Add to Queue** puts it after other manual additions and before the automatic continuation of the current collection. Adding the same track again moves it instead of creating a duplicate.

Starting another collection retains manual additions. Reordering entries makes the reordered queue explicit, so its order survives collection changes. Play a queued entry directly, remove entries, or clear the queue without deleting audio. On narrow windows, the panel overlays the right side of the library. Close it with its close button or Escape.

## Downloads

Open **Downloads** above the library and paste an HTTPS link to a single supported YouTube video. Preview the metadata, choose MP3 or M4A and the target quality, then start the download. Source quality limits the result; conversion cannot restore missing detail. Closing the panel does not cancel a job. Failed or interrupted jobs can be retried.

Only download material you are authorized to download. Availability depends on the source and yt-dlp; some videos require access the application does not provide. General websites and full YouTube playlists are not supported input sources.

## Settings and backups

Settings contains theme, download folder, component versions, a yt-dlp update action and JSON backup/restore. Backups include metadata, local paths, playlists, queue and progress; they do **not** include audio. Copy audio separately. Backups and download histories can contain private filenames and URLs; do not attach them to public issues without reviewing their contents.

If a file has moved, use the track menu to relink it. Changing the download folder affects new downloads and does not move existing files. Local playback does not require an internet connection; downloading and component updates do.
