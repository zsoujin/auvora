use crate::library::{atomic_write, get_folder, permit, probe, Track};
use crate::*;
use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use tokio::io::{AsyncBufReadExt, BufReader};

#[derive(Clone, Serialize, Deserialize)]
pub struct Progress {
    pub id: String,
    pub url: String,
    pub status: String,
    pub progress: f64,
    pub detail: String,
    pub format: String,
    pub quality: String,
    pub playlist: String,
    pub track: Option<Track>,
    pub created: u64,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Preview {
    pub url: String,
    pub title: String,
    pub artist: String,
    pub duration: f64,
    pub artwork: Option<String>,
}
pub fn normalize_url(raw: &str) -> Result<String> {
    let u = url::Url::parse(raw).map_err(err)?;
    if u.scheme() != "https"
        || !u.username().is_empty()
        || u.password().is_some()
        || u.port().is_some()
    {
        return Err("Enter an HTTPS YouTube URL".into());
    }
    let host = u.host_str().unwrap_or("");
    let id = if host == "youtu.be" {
        u.path().trim_matches('/').to_owned()
    } else if ["youtube.com", "www.youtube.com", "m.youtube.com"].contains(&host) {
        if u.path() == "/watch" {
            u.query_pairs()
                .find(|(k, _)| k == "v")
                .map(|(_, v)| v.into_owned())
                .unwrap_or_default()
        } else {
            let parts: Vec<_> = u.path().trim_matches('/').split('/').collect();
            if parts.len() == 2 && ["shorts", "live", "embed"].contains(&parts[0]) {
                parts[1].into()
            } else {
                String::new()
            }
        }
    } else {
        return Err("Unsupported source".into());
    };
    if id.len() != 11
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Err("Enter a URL for a single YouTube video".into());
    }
    Ok(format!("https://www.youtube.com/watch?v={id}"))
}
fn emit(app: &tauri::AppHandle, p: &Progress) -> Result<()> {
    let json = serde_json::to_string(p).map_err(err)?;
    app.state::<Store>().db.lock().map_err(err)?.execute("INSERT INTO downloads(id,status,payload,consumed) VALUES(?1,?2,?3,0) ON CONFLICT(id) DO UPDATE SET status=excluded.status,payload=excluded.payload",rusqlite::params![p.id,p.status,json]).map_err(err)?;
    app.emit("download-progress", p).map_err(err)
}
pub fn ytdlp(app: &tauri::AppHandle) -> Result<Command> {
    let mut cmd = command(binary(app, "yt-dlp.exe")?);
    cmd.args([
        "--ignore-config",
        "--no-plugin-dirs",
        "--no-playlist",
        "--no-cache-dir",
        "--no-colors",
        "--socket-timeout",
        "25",
        "--retries",
        "3",
        "--no-js-runtimes",
        "--js-runtimes",
    ])
    .arg(format!("deno:{}", binary(app, "deno.exe")?.display()));
    Ok(cmd)
}
fn allowed_fetch_host(host: &str) -> bool {
    matches!(
        host,
        "api.github.com"
            | "github.com"
            | "objects.githubusercontent.com"
            | "release-assets.githubusercontent.com"
            | "i.ytimg.com"
            | "i9.ytimg.com"
    )
}
pub async fn fetch(url: &str, limit: usize) -> Result<Vec<u8>> {
    let requested = url::Url::parse(url).map_err(err)?;
    if requested.scheme() != "https" || !allowed_fetch_host(requested.host_str().unwrap_or("")) {
        return Err("Unsafe fetch target".into());
    }
    let client = reqwest::Client::builder()
        .user_agent("auvora/1.0")
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(err)?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(err)?
        .error_for_status()
        .map_err(err)?;
    if response.url().scheme() != "https"
        || !allowed_fetch_host(response.url().host_str().unwrap_or(""))
    {
        return Err("Unsafe redirect".into());
    }
    if response.content_length().unwrap_or(0) > limit as u64 {
        return Err("File exceeds the size limit".into());
    }
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(err)?;
        if bytes.len() + chunk.len() > limit {
            return Err("File exceeds the size limit".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}
async fn thumbnail(app: &tauri::AppHandle, url: &str, source: &str) -> Option<String> {
    let u = url::Url::parse(url).ok()?;
    if u.scheme() != "https"
        || !["i.ytimg.com", "i9.ytimg.com"].contains(&u.host_str().unwrap_or(""))
    {
        return None;
    }
    let dir = library::artwork_dir(app).ok()?;
    let key = format!("{:x}", Sha256::digest(source.as_bytes()));
    for extension in ["jpg", "webp", "png"] {
        let cached = dir.join(format!("{key}.{extension}"));
        if cached.is_file() {
            app.asset_protocol_scope().allow_file(&cached).ok()?;
            return Some(cached.to_string_lossy().into());
        }
    }
    let bytes = fetch(url, 5_000_000).await.ok()?;
    let extension = if bytes.starts_with(&[0xff, 0xd8]) {
        "jpg"
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        "webp"
    } else if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        "png"
    } else {
        return None;
    };
    let path = dir.join(format!("{key}.{extension}"));
    atomic_write(&path, &bytes).ok()?;
    app.asset_protocol_scope().allow_file(&path).ok()?;
    Some(path.to_string_lossy().into())
}
#[tauri::command]
pub async fn inspect_video(app: tauri::AppHandle, url: String) -> Result<Preview> {
    let url = normalize_url(&url)?;
    let mut cmd = ytdlp(&app)?;
    cmd.args(["--dump-single-json", "--skip-download", "--", &url]);
    let output = tokio::time::timeout(std::time::Duration::from_secs(90), cmd.output())
        .await
        .map_err(|_| "Source did not respond within 90 seconds".to_owned())?
        .map_err(err)?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr)
            .chars()
            .take(1500)
            .collect());
    }
    let info: serde_json::Value = serde_json::from_slice(&output.stdout).map_err(err)?;
    if info["is_live"] == true {
        return Err("Wait until the live stream has ended".into());
    }
    let artwork = if let Some(thumb) = info["thumbnail"].as_str() {
        thumbnail(&app, thumb, &url).await
    } else {
        None
    };
    Ok(Preview {
        url,
        title: info["title"].as_str().unwrap_or("Audio track").into(),
        artist: info["uploader"].as_str().unwrap_or("Unknown artist").into(),
        duration: info["duration"].as_f64().unwrap_or(0.),
        artwork,
    })
}
#[tauri::command]
pub fn list_downloads(app: tauri::AppHandle) -> Result<Vec<Progress>> {
    let state = app.state::<Store>();
    let db = state.db.lock().map_err(err)?;
    let mut stmt = db
        .prepare("SELECT payload FROM downloads ORDER BY rowid DESC LIMIT 500")
        .map_err(err)?;
    let rows = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(err)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(err)?;
    rows.into_iter()
        .map(|s| serde_json::from_str(&s).map_err(err))
        .collect()
}
#[tauri::command]
pub fn cancel_download(app: tauri::AppHandle, id: String) -> Result<()> {
    if let Some(tx) = app.state::<Store>().jobs.lock().map_err(err)?.get(&id) {
        let _ = tx.send(true);
    }
    Ok(())
}
fn clean_task_directory(folder: &Path, root: &Path) -> Result<()> {
    let root = root.canonicalize().map_err(err)?;
    let path = folder.canonicalize().map_err(err)?;
    if path.parent() != Some(root.as_path())
        || uuid::Uuid::parse_str(path.file_name().and_then(|n| n.to_str()).unwrap_or("")).is_err()
    {
        return Err("Unsafe temporary download path".into());
    }
    fs::remove_dir_all(path).map_err(err)
}
#[tauri::command]
pub async fn start_download(
    app: tauri::AppHandle,
    id: String,
    url: String,
    format: String,
    quality: String,
    playlist: String,
) -> Result<()> {
    uuid::Uuid::parse_str(&id).map_err(err)?;
    let url = normalize_url(&url)?;
    if !["m4a", "mp3"].contains(&format.as_str())
        || !["128", "192", "320"].contains(&quality.as_str())
    {
        return Err("Invalid format or quality".into());
    }
    let mut cmd = ytdlp(&app)?;
    let ffmpeg = binary(&app, "ffmpeg.exe")?;
    {
        let state = app.state::<Store>();
        let db = state.db.lock().map_err(err)?;
        let v = library::current_library(&db)?;
        if v["tracks"].as_array().unwrap().iter().any(|t| {
            t["source"]
                .as_str()
                .and_then(|s| normalize_url(s).ok())
                .as_deref()
                == Some(&url)
        }) {
            return Err("This track is already in your library".into());
        }
        let active:i64=db.query_row("SELECT count(*) FROM downloads WHERE json_extract(payload,'$.url')=?1 AND status IN ('queued','downloading')",[&url],|r|r.get(0)).map_err(err)?;
        if active > 0 {
            return Err("This track is already downloading".into());
        }
    }
    let (tx, mut rx) = watch::channel(false);
    {
        let state = app.state::<Store>();
        let mut jobs = state.jobs.lock().map_err(err)?;
        if jobs.len() >= 3 {
            return Err("Wait for one of the three active downloads to finish".into());
        }
        if jobs.contains_key(&id) {
            return Err("Duplicate task ID".into());
        }
        jobs.insert(id.clone(), tx);
    }
    let mut p = Progress {
        id: id.clone(),
        url: url.clone(),
        status: "downloading".into(),
        progress: 0.,
        detail: "Downloading audio…".into(),
        format: format.clone(),
        quality: quality.clone(),
        playlist,
        track: None,
        created: now(),
    };
    if let Err(e) = emit(&app, &p) {
        app.state::<Store>().jobs.lock().map_err(err)?.remove(&id);
        return Err(e);
    }
    tauri::async_runtime::spawn(async move {
        let mut cleanup = None;
        let result:Result<()>=async{
            let root=PathBuf::from(get_folder(app.clone())?);fs::create_dir_all(&root).map_err(err)?;let folder=root.join(&id);fs::create_dir(&folder).map_err(err)?;cleanup=Some((folder.clone(),root.clone()));
            cmd.args(["--newline","--progress","--progress-delta","1","--extract-audio","--write-info-json","--no-write-playlist-metafiles","--embed-metadata","--audio-format",&format,"--audio-quality",&format!("{quality}K"),"--format","bestaudio","--progress-template","download:PROGRESS:%(progress._percent_str)s %(progress._speed_str)s ETA %(progress._eta_str)s","--output"]).arg(folder.join("audio.%(ext)s")).arg("--ffmpeg-location").arg(ffmpeg.parent().unwrap()).arg("--").arg(&url).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped());
            let mut child=cmd.spawn().map_err(err)?;
            let _job=crate::process::ProcessTree::attach(child.id().ok_or("Process did not start")?)?;
            let mut stdout=BufReader::new(child.stdout.take().unwrap()).lines();let mut stderr=BufReader::new(child.stderr.take().unwrap()).lines();let(mut out_done,mut err_done)=(false,false);let mut errors=String::new();
            loop{tokio::select!{
                _=rx.changed()=>{let _=child.kill().await;let _=child.wait().await;p.status="cancelled".into();p.detail="Download cancelled".into();emit(&app,&p)?;return Ok(());},
                line=stdout.next_line(),if !out_done=>{match line.map_err(err)?{Some(line)=>{if let Some(v)=line.strip_prefix("PROGRESS:"){p.progress=v.split('%').next().unwrap_or("0").trim().parse::<f64>().unwrap_or(0.).clamp(0.,99.);p.detail=v.trim().into();emit(&app,&p)?;}},None=>out_done=true}},
                line=stderr.next_line(),if !err_done=>{match line.map_err(err)?{Some(line)=>{if line.contains("ERROR")||errors.is_empty(){errors=line.chars().take(1500).collect();}},None=>err_done=true}},
            }if out_done&&err_done{break;}}
            let status=child.wait().await.map_err(err)?;if !status.success(){return Err(if errors.is_empty(){format!("Downloader exited with status {status}")}else{errors});}if *rx.borrow(){p.status="cancelled".into();p.detail="Download cancelled".into();emit(&app,&p)?;return Ok(());}
            p.detail="Reading metadata…".into();emit(&app,&p)?;
            let path=permit(&app,&folder.join(format!("audio.{format}")))?;let mut t=probe(&app,&path).await?;t.source=Some(url.clone());
            if let Ok(raw)=fs::read_to_string(folder.join("audio.info.json")){if let Ok(info)=serde_json::from_str::<serde_json::Value>(&raw){if let Some(v)=info["title"].as_str(){t.title=v.into();}if let Some(v)=info["uploader"].as_str(){t.artist=v.into();}if let Some(thumb)=info["thumbnail"].as_str(){t.artwork=thumbnail(&app,thumb,&url).await;}}}
            {let state=app.state::<Store>();let db=state.db.lock().map_err(err)?;let v=library::current_library(&db)?;if v["tracks"].as_array().unwrap().iter().any(|x|x["fingerprint"].as_str()==t.fingerprint.as_deref()){return Err("An identical audio file is already in your library".into());}}
            // Persist completion before notifying the renderer. The inbox is merged on the next startup.
            p.status="completed".into();p.progress=100.;p.detail="Added to library".into();p.track=Some(t);emit(&app,&p)?;cleanup=None;Ok(())
        }.await;
        if let Err(e) = result {
            p.status = "failed".into();
            p.detail = e;
            let _ = emit(&app, &p);
        }
        if let Some((folder, root)) = cleanup {
            if let Err(e) = clean_task_directory(&folder, &root) {
                p.detail = format!("{}; cleanup: {}", p.detail, e);
                let _ = emit(&app, &p);
            }
        }
        let state = app.state::<Store>();
        if let Ok(mut jobs) = state.jobs.lock() {
            jobs.remove(&id);
        };
    });
    Ok(())
}
#[tauri::command]
pub async fn component_versions(app: tauri::AppHandle) -> Result<serde_json::Value> {
    let mut v = serde_json::Map::new();
    for (name, arg) in [
        ("yt-dlp.exe", "--version"),
        ("deno.exe", "--version"),
        ("ffmpeg.exe", "-version"),
    ] {
        let out = command(binary(&app, name)?)
            .arg(arg)
            .output()
            .await
            .map_err(err)?;
        v.insert(
            name.into(),
            String::from_utf8_lossy(&out.stdout)
                .lines()
                .next()
                .unwrap_or("unknown")
                .into(),
        );
    }
    Ok(v.into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn canonical_video_links() {
        for url in [
            "https://youtu.be/BaW_jenozKc?t=1",
            "https://youtube.com/watch?v=BaW_jenozKc&list=x",
            "https://www.youtube.com/shorts/BaW_jenozKc",
        ] {
            assert_eq!(
                normalize_url(url).unwrap(),
                "https://www.youtube.com/watch?v=BaW_jenozKc"
            );
        }
    }
    #[test]
    fn rejects_other_targets() {
        for url in [
            "http://youtube.com/watch?v=BaW_jenozKc",
            "https://youtube.com.evil.test/watch?v=BaW_jenozKc",
            "https://user@youtube.com/watch?v=BaW_jenozKc",
            "https://youtube.com/playlist?list=x",
            "file:///C:/x",
        ] {
            assert!(normalize_url(url).is_err());
        }
    }
    #[test]
    fn fetch_host_allowlist_accepts_expected_cdns_only() {
        assert!(allowed_fetch_host("api.github.com"));
        assert!(allowed_fetch_host("release-assets.githubusercontent.com"));
        assert!(allowed_fetch_host("i.ytimg.com"));
        assert!(!allowed_fetch_host("evil.example"));
        assert!(!allowed_fetch_host("github.com.evil.test"));
    }
}
