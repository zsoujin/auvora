use crate::*;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Track {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub path: String,
    pub duration: f64,
    pub size: u64,
    pub added: u64,
    pub position: f64,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub artwork: Option<String>,
    #[serde(default)]
    pub fingerprint: Option<String>,
}
pub fn empty_library() -> serde_json::Value {
    serde_json::json!({"version":1,"tracks":[],"playlists":[],"queue":[],"history":[],"current":null,"mode":"normal","repeat":"off","volume":0.8,"speed":1,"theme":"dark"})
}
pub fn validate_library(v: &serde_json::Value) -> Result<()> {
    if v["version"] != 1 {
        return Err("Unsupported library version".into());
    }
    let tracks = v["tracks"].as_array().ok_or("Missing tracks")?;
    let mut ids = HashSet::new();
    for item in tracks {
        let t: Track = serde_json::from_value(item.clone()).map_err(err)?;
        if !ids.insert(t.id)
            || !t.duration.is_finite()
            || !t.position.is_finite()
            || t.duration < 0.
            || t.position < 0.
        {
            return Err("Invalid track".into());
        }
    }
    for p in v["playlists"].as_array().ok_or("Missing playlists")? {
        if !p["id"].is_string() || !p["name"].is_string() {
            return Err("Invalid playlist".into());
        }
        for id in p["tracks"].as_array().ok_or("Invalid playlist")? {
            if !ids.contains(id.as_str().ok_or("Invalid ID")?) {
                return Err("Playlist refers to a missing track".into());
            }
        }
    }
    for q in v["queue"].as_array().ok_or("Missing queue")? {
        if !ids.contains(q["track"].as_str().unwrap_or(""))
            || !q["id"].is_string()
            || !["manual", "playlist"].contains(&q["source"].as_str().unwrap_or(""))
        {
            return Err("Invalid queue".into());
        }
    }
    for id in v["history"].as_array().ok_or("Missing history")? {
        if !ids.contains(id.as_str().unwrap_or("")) {
            return Err("Invalid history".into());
        }
    }
    if !v["current"].is_null() && !ids.contains(v["current"].as_str().unwrap_or("")) {
        return Err("Invalid current track".into());
    }
    if !["normal", "reverse", "shuffle"].contains(&v["mode"].as_str().unwrap_or(""))
        || !["off", "one", "all"].contains(&v["repeat"].as_str().unwrap_or(""))
        || !["dark", "light", "system"].contains(&v["theme"].as_str().unwrap_or(""))
        || !v["speed"]
            .as_f64()
            .map(|n| (0.5..=3.).contains(&n))
            .unwrap_or(false)
        || !v["volume"]
            .as_f64()
            .map(|n| (0.0..=1.).contains(&n))
            .unwrap_or(false)
    {
        return Err("Invalid settings".into());
    }
    Ok(())
}
pub fn current_library(db: &Connection) -> Result<serde_json::Value> {
    let raw: Option<String> = db
        .query_row("SELECT value FROM state WHERE key='library'", [], |r| {
            r.get(0)
        })
        .optional()
        .map_err(err)?;
    match raw {
        Some(raw) => serde_json::from_str(&raw).map_err(err),
        None => Ok(empty_library()),
    }
}
pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path.parent().ok_or("No parent folder")?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(err)?;
    temp.write_all(bytes).map_err(err)?;
    temp.as_file().sync_all().map_err(err)?;
    temp.persist(path).map_err(err)?;
    Ok(())
}
pub fn audio_path(path: &Path) -> bool {
    path.extension()
        .and_then(|s| s.to_str())
        .map(|s| {
            [
                "mp3", "m4a", "aac", "wav", "flac", "ogg", "opus", "webm", "mp4", "aiff",
            ]
            .contains(&s.to_lowercase().as_str())
        })
        .unwrap_or(false)
}
pub fn permit(app: &tauri::AppHandle, path: &Path) -> Result<PathBuf> {
    require_local_path(path)?;
    let path = path.canonicalize().map_err(err)?;
    require_local_path(&path)?;
    if !path.is_file() || !audio_path(&path) {
        return Err("Unsupported audio file".into());
    }
    app.asset_protocol_scope().allow_file(&path).map_err(err)?;
    app.state::<Store>()
        .allowed
        .lock()
        .map_err(err)?
        .insert(path.clone());
    Ok(path)
}
pub fn checked(app: &tauri::AppHandle, path: &str) -> Result<PathBuf> {
    require_local_path(Path::new(path))?;
    let p = PathBuf::from(path).canonicalize().map_err(err)?;
    if !app
        .state::<Store>()
        .allowed
        .lock()
        .map_err(err)?
        .contains(&p)
    {
        return Err("File access denied".into());
    }
    Ok(p)
}
pub fn artwork_dir(app: &tauri::AppHandle) -> Result<PathBuf> {
    let dir = app.path().app_data_dir().map_err(err)?.join("artwork");
    fs::create_dir_all(&dir).map_err(err)?;
    Ok(dir)
}
fn authorize_artwork(app: &tauri::AppHandle, path: &str) {
    if require_local_path(Path::new(path)).is_err() {
        return;
    }
    if let Ok(p) = PathBuf::from(path).canonicalize() {
        if let Ok(root) = artwork_dir(app).and_then(|r| r.canonicalize().map_err(err)) {
            if p.starts_with(root) && p.is_file() {
                let _ = app.asset_protocol_scope().allow_file(p);
            }
        }
    }
}
// Restored metadata must not initiate SMB authentication through UNC or mapped drives.
fn local_drive(path: &Path) -> Result<u8> {
    use std::path::{Component, Prefix};
    let mut components = path.components();
    let drive = match components.next() {
        Some(Component::Prefix(prefix)) => match prefix.kind() {
            Prefix::Disk(drive) | Prefix::VerbatimDisk(drive) => drive,
            _ => {
                return Err(
                    "Network and device paths are not supported. Choose a local audio file.".into(),
                )
            }
        },
        _ => return Err("Choose an absolute local file path".into()),
    };
    if !matches!(components.next(), Some(Component::RootDir)) {
        return Err("Choose an absolute local file path".into());
    }
    Ok(drive)
}
fn require_local_path(path: &Path) -> Result<()> {
    let drive = local_drive(path)?;
    #[cfg(windows)]
    {
        use windows_sys::Win32::Storage::FileSystem::GetDriveTypeW;
        let root = [drive as u16, b':' as u16, b'\\' as u16, 0];
        let kind = unsafe { GetDriveTypeW(root.as_ptr()) };
        // Accept removable, fixed, optical and RAM drives; reject remote/unknown roots.
        if !matches!(kind, 2 | 3 | 5 | 6) {
            return Err("Network drives are not supported. Choose a local audio file.".into());
        }
    }
    #[cfg(not(windows))]
    let _ = drive;
    Ok(())
}
pub fn hash_file(path: &Path) -> Result<String> {
    let mut file = fs::File::open(path).map_err(err)?;
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        let n = file.read(&mut buffer).map_err(err)?;
        if n == 0 {
            break;
        }
        hash.update(&buffer[..n]);
    }
    Ok(format!("{:x}", hash.finalize()))
}
pub async fn probe(app: &tauri::AppHandle, path: &Path) -> Result<Track> {
    let metadata = fs::metadata(path).map_err(err)?;
    let mut t = Track {
        id: uuid::Uuid::new_v4().to_string(),
        title: path
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .into(),
        artist: "Unknown artist".into(),
        path: path.to_string_lossy().into(),
        duration: 0.,
        size: metadata.len(),
        added: now(),
        position: 0.,
        source: None,
        artwork: None,
        fingerprint: None,
    };
    let mut cmd = command(binary(app, "ffprobe.exe")?);
    cmd.args([
        "-v",
        "error",
        "-show_format",
        "-show_streams",
        "-of",
        "json",
    ])
    .arg(path);
    let output = tokio::time::timeout(std::time::Duration::from_secs(30), cmd.output())
        .await
        .map_err(err)?
        .map_err(err)?;
    if !output.status.success() {
        return Err(format!(
            "Could not read {}: {}",
            path.display(),
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    let info: serde_json::Value = serde_json::from_slice(&output.stdout).map_err(err)?;
    let streams = info["streams"].as_array().ok_or("No audio streams found")?;
    if !streams.iter().any(|v| v["codec_type"] == "audio") {
        return Err("File contains no audio".into());
    }
    t.duration = info["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .filter(|v| v.is_finite() && *v >= 0.)
        .unwrap_or(0.);
    if let Some(tags) = info["format"]["tags"].as_object() {
        for (k, v) in tags {
            if let Some(v) = v.as_str() {
                match k.to_lowercase().as_str() {
                    "title" => t.title = v.into(),
                    "artist" | "album_artist" => t.artist = v.into(),
                    _ => (),
                }
            }
        }
    }
    let p = path.to_path_buf();
    t.fingerprint = Some(
        tauri::async_runtime::spawn_blocking(move || hash_file(&p))
            .await
            .map_err(err)??,
    );
    if streams
        .iter()
        .any(|v| v["codec_type"] == "video" && v["disposition"]["attached_pic"] == 1)
    {
        let art = artwork_dir(app)?.join(format!("{}.jpg", t.id));
        let mut cmd = command(binary(app, "ffmpeg.exe")?);
        cmd.args(["-nostdin", "-v", "error", "-i"])
            .arg(path)
            .args([
                "-map",
                "0:v:0",
                "-frames:v",
                "1",
                "-vf",
                "scale=320:-1",
                "-y",
            ])
            .arg(&art);
        if let Ok(Ok(o)) =
            tokio::time::timeout(std::time::Duration::from_secs(30), cmd.output()).await
        {
            if o.status.success() {
                app.asset_protocol_scope().allow_file(&art).map_err(err)?;
                t.artwork = Some(art.to_string_lossy().into());
            }
        }
    }
    Ok(t)
}
#[tauri::command]
pub fn load_state(app: tauri::AppHandle) -> Result<String> {
    let mut v = {
        let state = app.state::<Store>();
        let db = state.db.lock().map_err(err)?;
        let mut v = current_library(&db)?;
        let mut stmt = db
            .prepare("SELECT payload FROM downloads WHERE consumed=0 AND status='completed'")
            .map_err(err)?;
        let pending = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        for raw in pending {
            let task: crate::downloads::Progress = serde_json::from_str(&raw).map_err(err)?;
            if let Some(t) = task.track {
                let tracks = v["tracks"].as_array_mut().ok_or("Missing tracks")?;
                if !tracks.iter().any(|x| x["id"] == t.id) {
                    tracks.push(serde_json::to_value(&t).map_err(err)?);
                }
                if let Some(playlists) = v["playlists"].as_array_mut() {
                    for p in playlists {
                        if p["id"] == task.playlist {
                            let ids = p["tracks"].as_array_mut().ok_or("Invalid playlist")?;
                            if !ids.iter().any(|id| id == &t.id) {
                                ids.push(t.id.clone().into());
                            }
                        }
                    }
                }
            }
        }
        v
    };
    validate_library(&v)?;
    for t in v["tracks"].as_array_mut().unwrap() {
        if let Some(path) = t["path"].as_str() {
            let _ = permit(&app, Path::new(path));
        }
        if let Some(path) = t["artwork"].as_str() {
            authorize_artwork(&app, path);
        }
    }
    serde_json::to_string(&v).map_err(err)
}
#[tauri::command]
pub fn save_state(app: tauri::AppHandle, json: String) -> Result<()> {
    if json.len() > 50_000_000 {
        return Err("Library exceeds the size limit".into());
    }
    let v: serde_json::Value = serde_json::from_str(&json).map_err(err)?;
    validate_library(&v)?;
    let state = app.state::<Store>();
    let mut db = state.db.lock().map_err(err)?;
    let tx = db.transaction().map_err(err)?;
    tx.execute("INSERT INTO state(key,value) VALUES('library',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[&json]).map_err(err)?;
    tx.execute("UPDATE downloads SET consumed=1 WHERE consumed=0 AND status='completed' AND json_extract(payload,'$.track.id') IN (SELECT json_extract(value,'$.id') FROM json_each(?1,'$.tracks'))",[&json]).map_err(err)?;
    tx.commit().map_err(err)
}
#[tauri::command]
pub fn save_position(
    app: tauri::AppHandle,
    index: usize,
    id: String,
    position: f64,
) -> Result<bool> {
    let state = app.state::<Store>();
    let db = state.db.lock().map_err(err)?;
    update_position(&db, index, &id, position)
}
fn update_position(db: &Connection, index: usize, id: &str, position: f64) -> Result<bool> {
    if !position.is_finite() || position < 0.0 {
        return Err("Invalid playback position".into());
    }
    // Guard against a stale index after an import, reorder or removal. The caller
    // falls back to its full validated snapshot when the guard does not match.
    let position_path = format!("$.tracks[{index}].position");
    let id_path = format!("$.tracks[{index}].id");
    db.execute(
        "UPDATE state SET value=json_set(value,?1,?2) WHERE key='library' AND json_extract(value,?3)=?4",
        rusqlite::params![position_path, position, id_path, id],
    ).map(|count| count == 1).map_err(err)
}
#[tauri::command]
pub async fn import_audio(app: tauri::AppHandle) -> Result<Vec<Track>> {
    let files = rfd::AsyncFileDialog::new()
        .add_filter(
            "Audio",
            &[
                "mp3", "m4a", "aac", "wav", "flac", "ogg", "opus", "webm", "mp4", "aiff",
            ],
        )
        .pick_files()
        .await;
    let mut tracks = Vec::new();
    if let Some(files) = files {
        for f in files {
            let path = permit(&app, f.path())?;
            match probe(&app, &path).await {
                Ok(t) => tracks.push(t),
                Err(e) => {
                    let _ = app.emit("import-warning", e);
                }
            }
        }
    }
    Ok(tracks)
}
#[tauri::command]
pub async fn relink_audio(app: tauri::AppHandle) -> Result<Option<Track>> {
    if let Some(f) = rfd::AsyncFileDialog::new()
        .add_filter(
            "Audio",
            &[
                "mp3", "m4a", "aac", "wav", "flac", "ogg", "opus", "webm", "mp4", "aiff",
            ],
        )
        .pick_file()
        .await
    {
        let p = permit(&app, f.path())?;
        Ok(Some(probe(&app, &p).await?))
    } else {
        Ok(None)
    }
}
#[tauri::command]
pub fn authorize_tracks(app: tauri::AppHandle, paths: Vec<String>) -> Result<()> {
    for p in paths {
        if audio_path(Path::new(&p)) {
            let _ = permit(&app, Path::new(&p));
        } else {
            authorize_artwork(&app, &p);
        }
    }
    Ok(())
}
#[tauri::command]
pub fn get_folder(app: tauri::AppHandle) -> Result<String> {
    let saved: Option<String> = app
        .state::<Store>()
        .db
        .lock()
        .map_err(err)?
        .query_row("SELECT value FROM state WHERE key='folder'", [], |r| {
            r.get(0)
        })
        .optional()
        .map_err(err)?;
    Ok(saved.unwrap_or(
        app.path()
            .audio_dir()
            .map_err(err)?
            .join("auvora")
            .to_string_lossy()
            .into(),
    ))
}
#[tauri::command]
pub async fn choose_folder(app: tauri::AppHandle) -> Result<Option<String>> {
    if let Some(f) = rfd::AsyncFileDialog::new().pick_folder().await {
        let p = f
            .path()
            .canonicalize()
            .map_err(err)?
            .to_string_lossy()
            .into_owned();
        require_local_path(Path::new(&p))?;
        app.state::<Store>().db.lock().map_err(err)?.execute("INSERT INTO state(key,value) VALUES('folder',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[&p]).map_err(err)?;
        Ok(Some(p))
    } else {
        Ok(None)
    }
}
#[tauri::command]
pub fn reveal_audio(app: tauri::AppHandle, path: String) -> Result<()> {
    let p = checked(&app, &path)?;
    std::process::Command::new("explorer.exe")
        .arg(format!("/select,{}", p.display()))
        .spawn()
        .map_err(err)?;
    Ok(())
}
#[tauri::command]
pub fn delete_audio(app: tauri::AppHandle, path: String) -> Result<()> {
    let p = checked(&app, &path)?;
    fs::remove_file(&p).map_err(err)?;
    app.state::<Store>().allowed.lock().map_err(err)?.remove(&p);
    Ok(())
}
#[tauri::command]
pub fn write_backup(path: String, json: String) -> Result<()> {
    if Path::new(&path).extension().and_then(|v| v.to_str()) != Some("json") {
        return Err("Choose a .json file".into());
    }
    let v: serde_json::Value = serde_json::from_str(&json).map_err(err)?;
    validate_library(&v)?;
    atomic_write(Path::new(&path), json.as_bytes())
}
#[tauri::command]
pub fn read_backup(path: String) -> Result<String> {
    let p = Path::new(&path);
    if p.extension().and_then(|v| v.to_str()) != Some("json")
        || fs::metadata(p).map_err(err)?.len() > 50_000_000
    {
        return Err("Invalid backup".into());
    }
    let raw = fs::read_to_string(p).map_err(err)?;
    let v: serde_json::Value = serde_json::from_str(&raw).map_err(err)?;
    validate_library(&v)?;
    Ok(raw)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn position_update_preserves_metadata_and_rejects_stale_index() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE state(key TEXT PRIMARY KEY,value TEXT NOT NULL)")
            .unwrap();
        let original = serde_json::json!({"tracks":[{"id":"a","position":0,"favorite":true},{"id":"b","position":4}],"queue":[{"track":"b"}]}).to_string();
        db.execute("INSERT INTO state VALUES('library',?1)", [&original])
            .unwrap();
        assert!(update_position(&db, 0, "a", 12.5).unwrap());
        assert!(!update_position(&db, 0, "b", 99.0).unwrap());
        assert!(!update_position(&db, 99, "a", 99.0).unwrap());
        assert!(update_position(&db, 0, "a", -1.0).is_err());
        assert!(update_position(&db, 0, "a", f64::NAN).is_err());
        let mut expected: serde_json::Value = serde_json::from_str(&original).unwrap();
        expected["tracks"][0]["position"] = serde_json::json!(12.5);
        assert_eq!(current_library(&db).unwrap(), expected);
        assert!(update_position(&db, 0, "a", 0.0).unwrap());
        assert_eq!(current_library(&db).unwrap()["tracks"][0]["position"], 0.0);
    }
    #[cfg(windows)]
    #[test]
    fn backup_paths_reject_network_device_and_relative_forms() {
        for path in [
            r"\\server\share\track.mp3",
            r"\\?\UNC\server\share\track.mp3",
            r"\\.\pipe\audio.mp3",
            r"//server/share/track.mp3",
            r"C:track.mp3",
            r"\track.mp3",
            "track.mp3",
        ] {
            assert!(local_drive(Path::new(path)).is_err(), "{path}");
        }
        for path in [
            r"C:\Music\track.mp3",
            r"\\?\C:\Music\track.mp3",
            "C:/Music/track.mp3",
        ] {
            assert_eq!(local_drive(Path::new(path)).unwrap(), b'C');
        }
    }
    #[test]
    fn rejects_invalid_snapshot() {
        let mut v = empty_library();
        assert!(validate_library(&v).is_ok());
        v["current"] = "missing".into();
        assert!(validate_library(&v).is_err());
    }
    #[test]
    fn backup_replaces_atomically() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("backup.json");
        atomic_write(&p, b"old").unwrap();
        atomic_write(&p, b"new").unwrap();
        assert_eq!(fs::read(p).unwrap(), b"new");
    }
}
