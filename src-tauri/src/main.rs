#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager};
use tokio::{process::Command, sync::watch};
mod downloads;
mod library;
mod process;
mod memory;
use downloads::*;
use library::*;
struct Store {
    db: Mutex<Connection>,
    allowed: Mutex<HashSet<PathBuf>>,
    jobs: Mutex<HashMap<String, watch::Sender<bool>>>,
}
type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn command(path: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut c = Command::new(path);
    c.kill_on_drop(true);
    #[cfg(windows)]
    c.creation_flags(0x08000000);
    c
}
fn binary(app: &tauri::AppHandle, name: &str) -> Result<PathBuf> {
    if name == "yt-dlp.exe" {
        let updated = app
            .path()
            .app_data_dir()
            .map_err(err)?
            .join("components")
            .join(name);
        if updated.is_file() {
            return Ok(updated);
        }
    }
    let p = app
        .path()
        .resource_dir()
        .map_err(err)?
        .join("binaries")
        .join(name);
    if p.is_file() {
        return Ok(p);
    }
    #[cfg(debug_assertions)]
    {
        let p = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(name);
        if p.is_file() {
            return Ok(p);
        }
    }
    Err(format!(
        "Missing component: {name}. Reinstall the full version of auvora."
    ))
}
fn main() {
    tauri::Builder::default().plugin(tauri_plugin_dialog::init()).setup(|app|{
    memory::configure(app);
    let dir=app.path().app_data_dir()?;fs::create_dir_all(&dir)?;let db=Connection::open(dir.join("library.sqlite3"))?;
    db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS downloads(id TEXT PRIMARY KEY,status TEXT NOT NULL,payload TEXT NOT NULL,consumed INTEGER NOT NULL DEFAULT 0); UPDATE downloads SET status='failed',payload=json_set(payload,'$.status','failed','$.detail','Download interrupted when the app closed. Select Retry.') WHERE status IN ('queued','downloading');")?;
    app.manage(Store{db:Mutex::new(db),allowed:Mutex::new(HashSet::new()),jobs:Mutex::new(HashMap::new())});Ok(())
}).invoke_handler(tauri::generate_handler![load_state,save_state,save_position,import_audio,relink_audio,authorize_tracks,get_folder,choose_folder,reveal_audio,delete_audio,write_backup,read_backup,inspect_video,list_downloads,start_download,cancel_download,component_versions,update_downloader]).run(tauri::generate_context!()).expect("Failed to start auvora");
}
