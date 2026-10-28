import { useEffect, useMemo, useRef, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save as saveDialog, confirm } from "@tauri-apps/plugin-dialog";
import {
  Library,
  Download,
  ListMusic,
  ListOrdered,
  Settings,
  Plus,
  Search,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Music2,
  X,
  GripVertical,
  FolderOpen,
  RotateCcw,
  RotateCw,
  ArrowUp,
  ArrowDown,
  Shuffle,
  Repeat,
  MoreHorizontal,
  Clock3,
  Heart,
  ChevronRight,
  ChevronLeft,
  Check,
} from "lucide-react";
import {
  initial,
  uid,
  ordered,
  enqueue,
  removeTrack,
  parseBackup,
  time,
  bytes,
  changeOrder,
  mergeImported,
  isActiveCollection,
  collectionDuration,
  queueForPlayback,
  moveQueueEntry,
  type State,
  type Track,
  type Mode,
} from "./model";
import { desktop, load, save, source, browserImport } from "./storage";
import { Timeline } from "./Timeline";
import { Popup, Select } from "./Popup";
import auvoraLogo from "../assets/auvora-mark.png";

type Task = {
  id: string;
  url: string;
  status: string;
  progress: number;
  detail: string;
  format: string;
  quality?: string;
  playlist: string;
  track?: Track;
};
export default function App() {
  const [s, set] = useState<State>(initial),
    [ready, setReady] = useState(false),
    [view, setView] = useState("library");
  const [drawer, setDrawer] = useState<"queue" | "downloads" | null>(null);
  const [queueLimit, setQueueLimit] = useState(100);
  const [query, setQuery] = useState(""),
    [sort, setSort] = useState("added"),
    [page, setPage] = useState(0),
    [playing, setPlaying] = useState(false),
    [error, setError] = useState("");
  const [menu, setMenu] = useState<{
      kind: "track" | "playlist";
      id: string;
      anchor: HTMLElement;
      panel?: "playlists";
    } | null>(null),
    [dialog, setDialog] = useState<{
      kind: string;
      id?: string;
      title: string;
      artist: string;
      trackId?: string;
    } | null>(null);
  const [url, setUrl] = useState(""),
    [format, setFormat] = useState("m4a"),
    [quality, setQuality] = useState("192"),
    [destination, setDestination] = useState(""),
    [tasks, setTasks] = useState<Task[]>([]),
    [folder, setFolder] = useState("");
  const [preview, setPreview] = useState<{
    url: string;
    title: string;
    artist: string;
    duration: number;
    artwork?: string | null;
  } | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [versions, setVersions] = useState<Record<string, string>>({});
  const audio = useRef<HTMLAudioElement>(null),
    input = useRef<HTMLInputElement>(null),
    backupInput = useRef<HTMLInputElement>(null),
    latest = useRef(s),
    drag = useRef(""),
    wantPlay = useRef(false),
    lastSave = useRef(0);
  latest.current = s;
  const trackById = useMemo(
    () => new Map(s.tracks.map((t) => [t.id, t])),
    [s.tracks],
  );
  const current = s.current ? trackById.get(s.current) : undefined,
    playlist = s.playlists.find((p) => p.id === view);
  const report = (e: unknown) =>
    setError(e instanceof Error ? e.message : String(e));
  useEffect(() => {
    setPage(0);
    setMenu(null);
  }, [view, query, sort, s.tracks.length]);
  useEffect(() => {
    load()
      .then((state) => {
        set(state);
        setReady(true);
      })
      .catch(report);
    if (desktop) invoke<string>("get_folder").then(setFolder).catch(report);
    if (desktop) invoke<Task[]>("list_downloads").then(setTasks).catch(report);
  }, []);
  useEffect(() => {
    if (desktop && view === "settings" && Object.keys(versions).length === 0)
      invoke<Record<string, string>>("component_versions")
        .then(setVersions)
        .catch(report);
  }, [view]);
  useEffect(() => {
    if (!desktop) return;
    const off = listen<string>("import-warning", ({ payload }) =>
      report(payload),
    );
    return () => {
      void off.then((f) => f());
    };
  }, []);
  useEffect(() => {
    if (ready) {
      const t = setTimeout(() => {
        save(s).catch(report);
      }, 350);
      return () => clearTimeout(t);
    }
  }, [s, ready]);
  useEffect(() => {
    const flush = () => {
      if (ready) void save(latest.current);
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [ready]);
  useEffect(() => {
    if (!desktop || !ready) return;
    const window = getCurrentWindow();
    const unlisten = window.onCloseRequested(async (event) => {
      event.preventDefault();
      audio.current?.pause();
      try {
        const snapshot = latest.current;
        await save({
          ...snapshot,
          tracks: snapshot.tracks.map((t) =>
            t.id === snapshot.current && audio.current
              ? {
                  ...t,
                  position: audio.current.ended ? 0 : audio.current.currentTime,
                }
              : t,
          ),
        });
        await window.destroy();
      } catch (e) {
        report(e);
      }
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, [ready]);
  useEffect(() => {
    document.documentElement.dataset.theme = s.theme;
  }, [s.theme]);
  useEffect(() => {
    if (audio.current) {
      audio.current.volume = s.volume;
      audio.current.playbackRate = s.speed;
    }
  }, [s.volume, s.speed, s.current]);
  useEffect(() => {
    if (!desktop) return;
    const off = listen<Task>("download-progress", ({ payload }) => {
      setTasks((ts) =>
        ts.some((t) => t.id === payload.id)
          ? ts.map((t) => (t.id === payload.id ? { ...t, ...payload } : t))
          : [payload, ...ts],
      );
      if (payload.track)
        set((prev) => {
          const t = payload.track!;
          if (
            prev.tracks.some((x) => x.source === t.source || x.path === t.path)
          )
            return prev;
          return {
            ...prev,
            tracks: [...prev.tracks, t],
            playlists: prev.playlists.map((p) =>
              p.id === payload.playlist
                ? { ...p, tracks: [...p.tracks, t.id] }
                : p,
            ),
          };
        });
    });
    return () => {
      void off.then((f) => f());
    };
  }, []);
  const checkpoint = () => {
    const id = latest.current.current;
    const position = audio.current?.ended ? 0 : audio.current?.currentTime;
    if (!id || position === undefined || !Number.isFinite(position)) return;
    lastSave.current = Date.now();
    set((p) => ({
      ...p,
      tracks: p.tracks.map((t) => (t.id === id ? { ...t, position } : t)),
    }));
  };
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !document.querySelector(".floating-menu") &&
        !dialog
      )
        setDrawer(null);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [dialog]);
  const playList = (ids: string[], start?: string) => {
    checkpoint();
    const ranks = new Map(ids.map((id, rank) => [id, rank]));
    const sequence = ordered(ids, s.mode);
    const index = start ? sequence.indexOf(start) : 0;
    const currentId = sequence[Math.max(0, index)];
    if (!currentId) return;
    wantPlay.current = true;
    set((p) => ({
      ...p,
      current: currentId,
      history: [],
      cycle: ids,
      queue: queueForPlayback(
        p.queue,
        sequence.slice(Math.max(0, index) + 1),
        currentId,
        ranks,
      ),
    }));
    if (currentId === s.current) void audio.current?.play().catch(report);
  };
  const next = (ended = false) => {
    if (!ended) checkpoint();
    const st = latest.current;
    const a = audio.current;
    if (ended && st.repeat === "one" && a) {
      a.currentTime = 0;
      void a.play().catch(report);
      return;
    }
    const item = st.queue[0];
    if (item) {
      wantPlay.current = true;
      set((p) => ({
        ...p,
        current: item.track,
        queue: p.queue.slice(1),
        history: p.current ? [...p.history, p.current] : p.history,
      }));
      if (item.track === st.current && a) {
        a.currentTime = 0;
        void a.play().catch(report);
      }
    } else if (st.repeat === "all" && st.current) {
      const cycle = st.cycle?.length ? st.cycle : [...st.history, st.current];
      const ids = ordered(cycle, st.mode);
      const ranks = new Map(cycle.map((id, rank) => [id, rank]));
      wantPlay.current = true;
      set((p) => ({
        ...p,
        current: ids[0],
        history: [],
        queue: ids.slice(1).map((track) => ({
          id: uid(),
          track,
          source: "playlist",
          rank: ranks.get(track),
        })),
      }));
      if (ids[0] === st.current && a) {
        a.currentTime = 0;
        void a.play().catch(report);
      }
    } else {
      a?.pause();
    }
  };
  const previous = () => {
    checkpoint();
    const st = latest.current;
    if (audio.current && audio.current.currentTime > 3) {
      audio.current.currentTime = 0;
      return;
    }
    const id = st.history.at(-1);
    if (id) {
      wantPlay.current = true;
      set((p) => ({
        ...p,
        current: id,
        history: p.history.slice(0, -1),
        queue: p.current
          ? [{ id: uid(), track: p.current, source: "manual" }, ...p.queue]
          : p.queue,
      }));
    }
  };
  const toggle = () => {
    const a = audio.current;
    if (!latest.current.current && latest.current.queue.length) {
      next();
      return;
    }
    if (!a || !latest.current.current) return;
    if (a.paused) void a.play().catch(report);
    else a.pause();
  };
  const seek = (delta: number) => {
    const a = audio.current;
    if (a)
      a.currentTime = Math.max(
        0,
        Math.min(
          Number.isFinite(a.duration) ? a.duration : 0,
          a.currentTime + delta,
        ),
      );
  };
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = current
      ? new MediaMetadata({
          title: current.title,
          artist: current.artist,
          album: "auvora",
        })
      : null;
    const actions: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => void audio.current?.play().catch(report)],
      ["pause", () => audio.current?.pause()],
      ["nexttrack", () => next()],
      ["previoustrack", previous],
      ["seekbackward", () => seek(-10)],
      ["seekforward", () => seek(30)],
      [
        "seekto",
        (d) => {
          if (audio.current && d.seekTime !== undefined)
            audio.current.currentTime = d.seekTime;
        },
      ],
    ];
    actions.forEach(([name, fn]) => {
      try {
        navigator.mediaSession.setActionHandler(name, fn);
      } catch {
        /* unsupported platform action */
      }
    });
    return () =>
      actions.forEach(([name]) => {
        try {
          navigator.mediaSession.setActionHandler(name, null);
        } catch {}
      });
  }, [current?.id]);
  const mergeTracks = (tracks: Track[]) =>
    set((p) => ({
      ...p,
      tracks: mergeImported(p.tracks, tracks),
    }));
  const importFiles = async () => {
    try {
      if (!desktop) {
        input.current?.click();
        return;
      }
      setBusy("import");
      const tracks = await invoke<Track[]>("import_audio");
      mergeTracks(tracks);
    } catch (e) {
      report(e);
    } finally {
      setBusy("");
    }
  };
  const relink = async (t: Track) => {
    try {
      setBusy("relink");
      const file = await invoke<Track | null>("relink_audio");
      if (file) {
        if (t.id === s.current) audio.current?.pause();
        set((p) => ({
          ...p,
          tracks: p.tracks.map((x) =>
            x.id === t.id
              ? {
                  ...x,
                  path: file.path,
                  size: file.size,
                  duration: file.duration,
                  artwork: file.artwork,
                  fingerprint: file.fingerprint,
                }
              : x,
          ),
        }));
        setNotice("File relinked. Playlists and progress preserved.");
      }
    } catch (e) {
      report(e);
    } finally {
      setBusy("");
      setMenu(null);
    }
  };
  const inspect = async () => {
    try {
      if (!desktop) throw new Error("Preview is available in the Windows app.");
      setBusy("preview");
      setPreview(await invoke("inspect_video", { url }));
    } catch (e) {
      report(e);
    } finally {
      setBusy("");
    }
  };
  const updateDownloader = async () => {
    try {
      setBusy("update");
      const version = await invoke<string>("update_downloader");
      setNotice(`Downloader updated to ${version}`);
      setVersions(await invoke("component_versions"));
    } catch (e) {
      report(e);
    } finally {
      setBusy("");
    }
  };
  const remove = async (id: string) => {
    try {
      const ok = desktop
        ? await confirm(
            "Remove this track from the library? The file will stay on disk.",
            { title: "Remove track", kind: "warning" },
          )
        : window.confirm("Remove this track from the library?");
      if (ok) set((p) => removeTrack(p, id));
    } catch (e) {
      report(e);
    }
  };
  const deleteFile = async (t: Track) => {
    try {
      if (
        !(await confirm(`Permanently delete the file “${t.title}” from disk?`, {
          title: "Delete file",
          kind: "warning",
        }))
      )
        return;
      if (s.current === t.id) audio.current?.pause();
      await invoke("delete_audio", { path: t.path });
      set((p) => removeTrack(p, t.id));
    } catch (e) {
      report(e);
    }
  };
  const download = async (retry?: Task) => {
    let taskId = "";
    try {
      if (!desktop)
        throw new Error(
          "Downloads are available in the Windows app. You can import local files here.",
        );
      const target = retry?.url || url;
      const parsed = new URL(target);
      if (
        parsed.protocol !== "https:" ||
        ![
          "youtube.com",
          "www.youtube.com",
          "m.youtube.com",
          "youtu.be",
        ].includes(parsed.hostname)
      )
        throw new Error("Enter an HTTPS YouTube URL.");
      if (s.tracks.some((t) => t.source === target))
        throw new Error("This track is already in your library.");
      const task: Task = {
        id: uid(),
        url: target,
        status: "queued",
        progress: 0,
        detail: "Fetching information…",
        format: retry?.format || format,
        quality: retry?.quality || quality,
        playlist: retry?.playlist || destination,
      };
      taskId = task.id;
      setTasks((ts) => [task, ...ts]);
      setUrl("");
      setPreview(null);
      await invoke("start_download", {
        id: task.id,
        url: task.url,
        format: task.format,
        quality: task.quality,
        playlist: task.playlist,
      });
    } catch (e) {
      if (taskId)
        setTasks((ts) =>
          ts.map((t) =>
            t.id === taskId ? { ...t, status: "failed", detail: String(e) } : t,
          ),
        );
      report(e);
    }
  };
  const exportBackup = async () => {
    try {
      const json = JSON.stringify(s, null, 2);
      if (desktop) {
        const path = await saveDialog({
          defaultPath: "auvora-backup.json",
          filters: [{ name: "JSON", extensions: ["json"] }],
        });
        if (path) await invoke("write_backup", { path, json });
      } else {
        const href = URL.createObjectURL(
          new Blob([json], { type: "application/json" }),
        );
        const a = document.createElement("a");
        a.href = href;
        a.download = "auvora-backup.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(href), 1000);
      }
    } catch (e) {
      report(e);
    }
  };
  const restore = async (text: string) => {
    const state = parseBackup(text);
    const ok = desktop
      ? await confirm(
          "Replace the current library with this backup? Audio files will not be changed.",
          { title: "Restore backup", kind: "warning" },
        )
      : window.confirm("Replace the library with this backup?");
    if (ok) {
      if (desktop)
        await invoke("authorize_tracks", {
          paths: state.tracks.flatMap((t) =>
            t.artwork ? [t.path, t.artwork] : [t.path],
          ),
        });
      audio.current?.pause();
      wantPlay.current = false;
      set(state);
      setReady(true);
    }
  };
  const restoreBackup = async () => {
    try {
      if (!desktop) {
        backupInput.current?.click();
        return;
      }
      const path = await open({
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (typeof path === "string")
        await restore(await invoke<string>("read_backup", { path }));
    } catch (e) {
      report(e);
    }
  };
  const changeMode = (mode: Mode) =>
    set((p) => ({
      ...p,
      mode,
      queue: changeOrder(p.queue, mode),
    }));
  const playlistPositions = new Map(
    playlist?.tracks.map((id, i) => [id, i]) || [],
  );
  const rows = s.tracks
    .filter(
      (t) =>
        (!playlist || playlistPositions.has(t.id)) &&
        (view !== "favorites" || t.favorite) &&
        `${t.title} ${t.artist}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      playlist
        ? playlistPositions.get(a.id)! - playlistPositions.get(b.id)!
        : sort === "title"
          ? a.title.localeCompare(b.title)
          : sort === "duration"
            ? b.duration - a.duration
            : b.added - a.added,
    );
  const toggleFavorite = (id: string) =>
    set((p) => ({
      ...p,
      tracks: p.tracks.map((t) =>
        t.id === id ? { ...t, favorite: !t.favorite } : t,
      ),
    }));
  const playCollection = (ids: string[]) => {
    if (!ids.length) return;
    if (isActiveCollection(latest.current, ids)) toggle();
    else playList(ids);
  };
  const playRow = (id: string) => {
    const ids = rows.map((t) => t.id);
    if (id === s.current) toggle();
    else playList(ids, id);
  };
  const collectionPlaying =
    playing &&
    isActiveCollection(
      s,
      rows.map((t) => t.id),
    );
  const menuTrack = menu?.kind === "track" ? trackById.get(menu.id) : undefined;
  const menuPlaylist =
    menu?.kind === "playlist"
      ? s.playlists.find((p) => p.id === menu.id)
      : undefined;
  const addToPlaylist = (playlistId: string, trackId: string) => {
    set((p) => ({
      ...p,
      playlists: p.playlists.map((pl) =>
        pl.id === playlistId
          ? { ...pl, tracks: [...new Set([...pl.tracks, trackId])] }
          : pl,
      ),
    }));
    setMenu(null);
    setNotice("Added to playlist");
  };
  const deletePlaylist = async (id: string) => {
    setMenu(null);
    const ok = desktop
      ? await confirm(
          "Delete this playlist? Audio files will stay in your library.",
          { title: "Delete playlist", kind: "warning" },
        )
      : window.confirm(
          "Delete this playlist? Audio files will stay in your library.",
        );
    if (!ok) return;
    set((p) => ({ ...p, playlists: p.playlists.filter((pl) => pl.id !== id) }));
    if (view === id) setView("playlists");
  };
  const reorder = (target: string) => {
    const from = drag.current;
    if (from === target) return;
    set((p) => {
      return {
        ...p,
        playlists: p.playlists.map((pl) => {
          if (pl.id !== view) return pl;
          const ids = [...pl.tracks],
            i = ids.indexOf(from),
            j = ids.indexOf(target);
          if (i < 0 || j < 0) return pl;
          ids.splice(i, 1);
          ids.splice(j, 0, from);
          return { ...pl, tracks: ids };
        }),
      };
    });
  };
  const finishDialog = () => {
    if (!dialog?.title.trim()) return;
    set((p) =>
      dialog.kind === "edit"
        ? {
            ...p,
            tracks: p.tracks.map((t) =>
              t.id === dialog.id
                ? {
                    ...t,
                    title: dialog.title.trim(),
                    artist: dialog.artist.trim() || "Unknown artist",
                  }
                : t,
            ),
          }
        : dialog.kind === "rename"
          ? {
              ...p,
              playlists: p.playlists.map((pl) =>
                pl.id === dialog.id ? { ...pl, name: dialog.title.trim() } : pl,
              ),
            }
          : {
              ...p,
              playlists: [
                ...p.playlists,
                {
                  id: uid(),
                  name: dialog.title.trim(),
                  tracks: dialog.trackId ? [dialog.trackId] : [],
                },
              ],
            },
    );
    setDialog(null);
  };
  const addToQueue = (id: string, first: boolean) => {
    set((p) => ({ ...p, queue: enqueue(p.queue, id, first) }));
    setNotice(first ? "Playing next" : "Added to queue");
    setMenu(null);
  };
  const playQueued = (entryId: string) => {
    const entry = latest.current.queue.find((e) => e.id === entryId);
    if (!entry) return;
    checkpoint();
    wantPlay.current = true;
    set((p) => ({
      ...p,
      current: entry.track,
      history: p.current ? [...p.history, p.current] : p.history,
      queue: p.queue.filter((e) => e.id !== entryId),
    }));
    if (entry.track === latest.current.current)
      void audio.current?.play().catch(report);
  };
  const cover = (t?: Track, large = false) => (
    <div
      className={`cover ${large ? "large" : ""}`}
      style={
        {
          "--hue": t
            ? String(
                ([...t.title].reduce((a, c) => a + c.charCodeAt(0), 0) % 120) +
                  15,
              )
            : "36",
        } as React.CSSProperties
      }
    >
      {desktop && t?.artwork ? (
        <img
          src={convertFileSrc(t.artwork)}
          alt=""
          loading={large ? "eager" : "lazy"}
          decoding="async"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <Music2 size={large ? 34 : 19} />
      )}
    </div>
  );
  return (
    <div className={`app ${drawer ? "drawer-open" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <img src={auvoraLogo} alt="" />
          </div>
          <div>auvora</div>
        </div>
        <nav>
          {(
            [
              ["library", "Library", Library],
              ["favorites", "Favorites", Heart],
              ["playlists", "Playlists", ListMusic],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => {
                setView(id);
                setQuery("");
              }}
            >
              <Icon size={19} />
              {label}
              {id === "library" && <small>{s.tracks.length}</small>}
            </button>
          ))}
        </nav>
        <div className="section-label">
          PLAYLISTS
          <button
            title="New playlist"
            aria-label="New playlist"
            className="new-playlist-button"
            onClick={() => setDialog({ kind: "create", title: "", artist: "" })}
          >
            <Plus size={17} />
          </button>
        </div>
        <div className="playlist-nav">
          {s.playlists.map((p) => (
            <button
              key={p.id}
              className={view === p.id ? "active" : ""}
              onClick={() => {
                setView(p.id);
                setQuery("");
              }}
            >
              <span className="playlist-dot">
                <ListMusic size={16} />
              </span>
              {p.name}
              <small>{p.tracks.length}</small>
            </button>
          ))}
          {!s.playlists.length && <p className="muted tiny">No playlists</p>}
        </div>
        <div className="sidebar-bottom">
          <div className="local-status">
            <span />
            Library storage
            <small>{bytes(s.tracks.reduce((a, t) => a + t.size, 0))}</small>
          </div>
          <button
            className={view === "settings" ? "active" : ""}
            onClick={() => setView("settings")}
          >
            <Settings size={18} />
            Settings
          </button>
        </div>
      </aside>
      <main>
        <div className="library-tools">
          <button
            aria-label="Downloads"
            aria-expanded={drawer === "downloads"}
            onClick={() =>
              setDrawer(drawer === "downloads" ? null : "downloads")
            }
          >
            <Download size={18} />
            Downloads
            {tasks.some((t) =>
              ["queued", "downloading"].includes(t.status),
            ) && <span className="activity-dot" />}
          </button>
        </div>
        <div className="content">
          {error && (
            <div role="alert" className="error">
              {error}
              <button title="Dismiss message" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button onClick={() => setNotice("")} title="Close">
                <X size={16} />
              </button>
            </div>
          )}
          {busy && (
            <div className="notice" role="status">
              {busy === "preview"
                ? "Fetching source information…"
                : busy === "update"
                  ? "Updating downloader…"
                  : "Reading audio files…"}
            </div>
          )}
          {!ready && <p>Loading library…</p>}
          {(view === "library" || view === "favorites" || playlist) && (
            <>
              <div className="page-heading library-heading">
                <div className="library-art">
                  <Library size={64} strokeWidth={1.5} />
                </div>
                <div className="library-heading-copy">
                  <h1>
                    {playlist?.name ||
                      (view === "favorites" ? "Favorites" : "Library")}
                  </h1>
                  <p>
                    {s.tracks.length
                      ? `${rows.length} ${rows.length === 1 ? "track" : "tracks"} · ${collectionDuration(rows.reduce((a, t) => a + t.duration, 0))}`
                      : "0 tracks"}
                  </p>
                </div>
                <button className="primary" onClick={importFiles}>
                  <Plus size={18} />
                  Import
                </button>
              </div>
              <div className="toolbar">
                <label className="search">
                  <Search size={17} />
                  <input
                    aria-label="Search"
                    placeholder="Search by title or artist"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <Select
                  aria-label="Sort"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  disabled={!!playlist}
                >
                  <option value="added">Recently added</option>
                  <option value="title">Title</option>
                  <option value="duration">Duration</option>
                </Select>
                <button
                  title={collectionPlaying ? "Pause" : "Play"}
                  aria-label={
                    collectionPlaying ? "Pause collection" : "Play collection"
                  }
                  className="play-all"
                  disabled={!rows.length}
                  onClick={() => playCollection(rows.map((t) => t.id))}
                >
                  {collectionPlaying ? (
                    <Pause size={22} fill="currentColor" />
                  ) : (
                    <Play size={22} fill="currentColor" />
                  )}
                </button>
              </div>
              {playlist && (
                <div className="playlist-tools">
                  <button
                    aria-label="Playlist options"
                    aria-haspopup="menu"
                    onClick={(e) =>
                      setMenu({
                        kind: "playlist",
                        id: playlist.id,
                        anchor: e.currentTarget,
                      })
                    }
                  >
                    <MoreHorizontal size={22} />
                  </button>
                  <span>Drag tracks to reorder</span>
                </div>
              )}
              <div className="track-table">
                <div className="table-head">
                  <span>#</span>
                  <span>Title</span>
                  <span className="duration-heading" title="Duration">
                    <Clock3 size={17} aria-label="Duration" />
                  </span>
                  <span aria-hidden="true" />
                  <span />
                </div>
                {rows.slice(page * 100, (page + 1) * 100).map((t, i) => (
                  <div
                    className={`track-row ${current?.id === t.id ? "current" : ""}`}
                    key={t.id}
                    draggable={!!playlist}
                    onDragStart={() => (drag.current = t.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => reorder(t.id)}
                    onDoubleClick={() =>
                      playList(
                        rows.map((x) => x.id),
                        t.id,
                      )
                    }
                  >
                    <div className="row-number">
                      <span className="track-index" aria-hidden="true">
                        {current?.id === t.id && playing
                          ? "♫"
                          : page * 100 + i + 1}
                      </span>
                      <button
                        className="row-play"
                        aria-label={
                          current?.id === t.id && playing
                            ? `Pause ${t.title}`
                            : `Play ${t.title}`
                        }
                        onDoubleClick={(e) => e.stopPropagation()}
                        onClick={() => playRow(t.id)}
                      >
                        {current?.id === t.id && playing ? (
                          <Pause size={16} fill="currentColor" />
                        ) : (
                          <Play size={16} fill="currentColor" />
                        )}
                      </button>
                    </div>
                    <button
                      className="track-title"
                      onClick={() => playRow(t.id)}
                    >
                      {cover(t)}
                      <div>
                        <strong>{t.title}</strong>
                        <small>{t.artist}</small>
                        {t.position > 0 && (
                          <div className="tiny-progress">
                            <i
                              style={{
                                width: `${Math.min(100, (t.position / (t.duration || 1)) * 100)}%`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </button>
                    <span className="duration">
                      {t.duration ? time(t.duration) : "—"}
                    </span>
                    <button
                      className={`favorite-button ${t.favorite ? "is-favorite" : ""}`}
                      aria-label={`${t.favorite ? "Remove from" : "Add to"} favorites: ${t.title}`}
                      aria-pressed={!!t.favorite}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onClick={() => toggleFavorite(t.id)}
                    >
                      <Heart
                        size={18}
                        fill={t.favorite ? "currentColor" : "none"}
                      />
                    </button>
                    <div
                      className="menu-container"
                      onDoubleClick={(e) => e.stopPropagation()}
                    >
                      <button
                        title={`Actions: ${t.title}`}
                        aria-label={`Actions: ${t.title}`}
                        aria-haspopup="menu"
                        aria-expanded={
                          menu?.kind === "track" && menu.id === t.id
                        }
                        onClick={(e) =>
                          setMenu(
                            menu?.kind === "track" && menu.id === t.id
                              ? null
                              : {
                                  kind: "track",
                                  id: t.id,
                                  anchor: e.currentTarget,
                                },
                          )
                        }
                      >
                        <MoreHorizontal size={20} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {!rows.length && (
                <div className="empty">
                  <div className="empty-art">
                    <div />
                    <img className="empty-logo" src={auvoraLogo} alt="auvora" />
                    <div />
                  </div>
                  <h2>
                    {query
                      ? "No results"
                      : view === "favorites"
                        ? "No favorites yet"
                        : "No tracks"}
                  </h2>
                  <p>
                    {query
                      ? "Try another title or artist."
                      : view === "favorites"
                        ? "Use the heart beside a track to add it here."
                        : "Import audio files to get started."}
                  </p>
                  {!query && (
                    <button className="primary" onClick={importFiles}>
                      <FolderOpen size={18} />
                      Choose audio files
                    </button>
                  )}
                  <small>MP3 · M4A · AAC · WAV · FLAC · OGG</small>
                </div>
              )}
              {rows.length > 100 && (
                <div className="toolbar">
                  <button
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Back
                  </button>
                  <span className="muted tiny">
                    Page {page + 1} of {Math.ceil(rows.length / 100)}
                  </span>
                  <button
                    disabled={(page + 1) * 100 >= rows.length}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
          {view === "playlists" && (
            <>
              <div className="page-heading">
                <div>
                  <h1>Playlists</h1>
                </div>
                <button
                  className="primary"
                  onClick={() =>
                    setDialog({ kind: "create", title: "", artist: "" })
                  }
                >
                  <Plus size={18} />
                  New playlist
                </button>
              </div>
              <div className="playlist-grid">
                {s.playlists.map((p) => (
                  <article key={p.id} className="playlist-card">
                    <button
                      className="playlist-open"
                      onClick={() => {
                        setView(p.id);
                        setQuery("");
                      }}
                      aria-label={`Open ${p.name}`}
                    >
                      <div className="playlist-art">
                        <ListMusic size={44} />
                      </div>
                      <h3>{p.name}</h3>
                      <p>
                        {p.tracks.length}{" "}
                        {p.tracks.length === 1 ? "track" : "tracks"} ·{" "}
                        {collectionDuration(
                          p.tracks.reduce(
                            (sum, id) =>
                              sum + (trackById.get(id)?.duration || 0),
                            0,
                          ),
                        )}
                      </p>
                    </button>
                    <div className="playlist-card-actions">
                      <button
                        className="playlist-play"
                        disabled={!p.tracks.length}
                        aria-label={`${playing && isActiveCollection(s, p.tracks) ? "Pause" : "Play"} ${p.name}`}
                        onClick={() => playCollection(p.tracks)}
                      >
                        {playing && isActiveCollection(s, p.tracks) ? (
                          <Pause size={20} fill="currentColor" />
                        ) : (
                          <Play size={20} fill="currentColor" />
                        )}
                      </button>
                      <button
                        aria-label={`Options: ${p.name}`}
                        aria-haspopup="menu"
                        onClick={(e) =>
                          setMenu({
                            kind: "playlist",
                            id: p.id,
                            anchor: e.currentTarget,
                          })
                        }
                      >
                        <MoreHorizontal size={20} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {!s.playlists.length && (
                <div className="empty">
                  <ListMusic size={48} />
                  <h2>No playlists</h2>
                  <p>Create a playlist, then add tracks from your library.</p>
                </div>
              )}
            </>
          )}
          {view === "settings" && (
            <>
              <div className="page-heading">
                <h1>Settings</h1>
              </div>
              <section className="panel">
                <h3>Appearance</h3>
                <div className="segmented">
                  {(["dark", "light", "system"] as const).map((t, i) => (
                    <button
                      className={s.theme === t ? "chosen" : ""}
                      key={t}
                      onClick={() => set((p) => ({ ...p, theme: t }))}
                    >
                      {["Dark", "Light", "System"][i]}
                    </button>
                  ))}
                </div>
              </section>
              <section className="panel">
                <h3>Storage</h3>
                <p>
                  {bytes(s.tracks.reduce((a, t) => a + t.size, 0))} ·{" "}
                  {s.tracks.length} {s.tracks.length === 1 ? "track" : "tracks"}
                </p>
                <p className="muted">
                  {desktop
                    ? folder
                    : "Browser preview: reimport the same files after restarting to restore audio access."}
                </p>
                {desktop && (
                  <button
                    onClick={async () => {
                      try {
                        const path = await invoke<string | null>(
                          "choose_folder",
                        );
                        if (path) setFolder(path);
                      } catch (e) {
                        report(e);
                      }
                    }}
                  >
                    <FolderOpen size={17} />
                    Download folder
                  </button>
                )}
                <p className="tiny muted">
                  Imported files stay in their original locations. This folder
                  is used for new downloads only.
                </p>
              </section>
              <section className="panel">
                <h3>Backup</h3>
                <p className="muted">
                  Backs up metadata, playlists, queue and playback progress.
                  Audio files are not included.
                </p>
                <div className="form-row">
                  <button onClick={exportBackup}>Export JSON</button>
                  <button onClick={restoreBackup}>Restore backup</button>
                </div>
              </section>
              <section className="panel">
                <h3>
                  auvora <span className="muted">1.0.0</span>
                </h3>
                {desktop && (
                  <>
                    <h3>Components</h3>
                    {Object.entries(versions).map(([name, version]) => (
                      <p className="tiny muted" key={name}>
                        {name}: {version}
                      </p>
                    ))}
                    <button
                      disabled={
                        !!busy ||
                        tasks.some((t) =>
                          ["queued", "downloading"].includes(t.status),
                        )
                      }
                      onClick={() => void updateDownloader()}
                    >
                      Update downloader
                    </button>
                    <p className="tiny muted">
                      Downloads from the official yt-dlp GitHub repository and
                      verifies the SHA-256 checksum.
                    </p>
                  </>
                )}
              </section>
            </>
          )}
        </div>
      </main>

      {drawer && (
        <aside
          className="activity-drawer"
          aria-label={drawer === "queue" ? "Playing Next" : "Downloads"}
        >
          <div className="drawer-heading">
            <h2>{drawer === "queue" ? "Playing Next" : "Downloads"}</h2>
            <button aria-label="Close panel" onClick={() => setDrawer(null)}>
              <X size={20} />
            </button>
          </div>
          <div className="drawer-scroll">
            {drawer === "downloads" && (
              <>
                <form
                  className="panel"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void download();
                  }}
                >
                  <label>
                    YouTube URL
                    <input
                      type="url"
                      required
                      placeholder="https://www.youtube.com/watch?v=…"
                      value={url}
                      onChange={(e) => {
                        setUrl(e.target.value);
                        setPreview(null);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    style={{ marginTop: 15 }}
                    disabled={!url || !!busy}
                    onClick={() => void inspect()}
                  >
                    Get info
                  </button>
                  {preview && (
                    <div className="queue-row">
                      {preview.artwork && (
                        <img
                          className="preview-art"
                          src={convertFileSrc(preview.artwork)}
                          alt="Artwork"
                        />
                      )}
                      <div>
                        <strong>{preview.title}</strong>
                        <small>
                          {preview.artist} · {time(preview.duration)}
                        </small>
                      </div>
                    </div>
                  )}
                  <div className="form-row">
                    <label>
                      Format
                      <Select
                        value={format}
                        onChange={(e) => setFormat(e.target.value)}
                      >
                        <option value="m4a">M4A</option>
                        <option value="mp3">MP3</option>
                      </Select>
                    </label>
                    <label>
                      Quality
                      <Select
                        value={quality}
                        onChange={(e) => setQuality(e.target.value)}
                      >
                        <option value="128">128 kbps</option>
                        <option value="192">192 kbps</option>
                        <option value="320">320 kbps</option>
                      </Select>
                    </label>
                    <label>
                      Add to
                      <Select
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                      >
                        <option value="">Library</option>
                        {s.playlists.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <button className="primary" type="submit" disabled={!!busy}>
                      <Download size={18} />
                      Download
                    </button>
                  </div>
                  <p className="muted tiny">
                    Only download content you have permission to save. Higher
                    bitrates do not improve the source quality.
                  </p>
                </form>
                <h3>Download activity</h3>
                {!tasks.length && (
                  <div className="panel muted">No downloads</div>
                )}
                {tasks.map((t) => (
                  <div className="panel task" key={t.id}>
                    <strong>{t.track?.title || t.url}</strong>
                    <span>
                      {(
                        {
                          queued: "Queued",
                          downloading: "Downloading",
                          completed: "Completed",
                          failed: "Failed",
                          cancelled: "Cancelled",
                        } as Record<string, string>
                      )[t.status] || t.status}{" "}
                      · {Math.round(t.progress)}%
                    </span>
                    <progress value={t.progress} max="100" />
                    {!["completed", "cancelled"].includes(t.status) && (
                      <p>{t.detail}</p>
                    )}
                    {["queued", "downloading"].includes(t.status) ? (
                      <button
                        onClick={() =>
                          void invoke("cancel_download", { id: t.id }).catch(
                            report,
                          )
                        }
                      >
                        Cancel
                      </button>
                    ) : ["failed", "cancelled"].includes(t.status) ? (
                      <button onClick={() => void download(t)}>Retry</button>
                    ) : null}
                  </div>
                ))}
              </>
            )}

            {drawer === "queue" && (
              <>
                {current && (
                  <section className="queue-current">
                    <span className="eyebrow">NOW PLAYING</span>
                    <div>
                      {cover(current)}
                      <div>
                        <strong>{current.title}</strong>
                        <small>{current.artist}</small>
                      </div>
                      <button
                        aria-label={
                          playing
                            ? "Pause current track"
                            : "Resume current track"
                        }
                        onClick={toggle}
                      >
                        {playing ? <Pause size={19} /> : <Play size={19} />}
                      </button>
                    </div>
                  </section>
                )}
                <div className="queue-section-heading">
                  <h3>
                    Queue <span>{s.queue.length}</span>
                  </h3>
                  <button
                    disabled={!s.queue.length}
                    onClick={() => set((p) => ({ ...p, queue: [] }))}
                  >
                    Clear
                  </button>
                </div>
                {!s.queue.length && (
                  <div className="queue-empty">
                    <ListOrdered size={32} />
                    <h3>Your queue is empty</h3>
                    <p>Choose Play Next or Add to Queue from a track’s menu.</p>
                  </div>
                )}
                {s.queue.slice(0, queueLimit).map((entry, i) => {
                  const track = trackById.get(entry.track);
                  if (!track) return null;
                  return (
                    <div
                      className="up-next-row"
                      key={entry.id}
                      draggable
                      onDragStart={() => (drag.current = entry.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() =>
                        set((p) => ({
                          ...p,
                          queue: moveQueueEntry(
                            p.queue,
                            drag.current,
                            entry.id,
                          ),
                        }))
                      }
                    >
                      <button
                        className="queue-track"
                        onClick={() => playQueued(entry.id)}
                        aria-label={"Play queued: " + track.title}
                      >
                        {cover(track)}
                        <span>
                          <strong>{track.title}</strong>
                          <small>
                            {time(track.duration)} ·{" "}
                            {entry.source === "manual"
                              ? "In queue"
                              : "From playlist"}
                          </small>
                        </span>
                      </button>
                      <div className="queue-row-actions">
                        <button
                          aria-label={"Move up: " + track.title}
                          disabled={i === 0}
                          onClick={() =>
                            set((p) => ({
                              ...p,
                              queue: moveQueueEntry(
                                p.queue,
                                entry.id,
                                p.queue[i - 1].id,
                              ),
                            }))
                          }
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          aria-label={"Move down: " + track.title}
                          disabled={i === s.queue.length - 1}
                          onClick={() =>
                            set((p) => ({
                              ...p,
                              queue: moveQueueEntry(
                                p.queue,
                                entry.id,
                                p.queue[i + 1].id,
                              ),
                            }))
                          }
                        >
                          <ArrowDown size={13} />
                        </button>
                        <button
                          aria-label={"Remove from queue: " + track.title}
                          onClick={() =>
                            set((p) => ({
                              ...p,
                              queue: p.queue.filter((e) => e.id !== entry.id),
                            }))
                          }
                        >
                          <X size={14} />
                        </button>
                        <GripVertical size={16} />
                      </div>
                    </div>
                  );
                })}
                {s.queue.length > queueLimit && (
                  <button onClick={() => setQueueLimit((n) => n + 100)}>
                    Show more
                  </button>
                )}
                <div className="queue-options">
                  <label>
                    Playback order
                    <Select
                      aria-label="Playback order"
                      value={s.mode}
                      onChange={(e) => changeMode(e.target.value as Mode)}
                    >
                      <option value="normal">Normal</option>
                      <option value="reverse">Reverse</option>
                      <option value="shuffle">Shuffle</option>
                    </Select>
                  </label>
                  <label>
                    Repeat
                    <Select
                      aria-label="Repeat"
                      value={s.repeat}
                      onChange={(e) =>
                        set((p) => ({
                          ...p,
                          repeat: e.target.value as State["repeat"],
                        }))
                      }
                    >
                      <option value="off">Off</option>
                      <option value="one">Track</option>
                      <option value="all">Playlist</option>
                    </Select>
                  </label>
                </div>
              </>
            )}
          </div>
        </aside>
      )}
      <footer className="player">
        <div className="now-playing">
          {cover(current)}
          <div>
            <strong>{current?.title || "No track selected"}</strong>
            <small>
              {current?.artist || "Select a track from the library"}
            </small>
            <Timeline
              audio={audio}
              trackId={current?.id}
              duration={current?.duration || 0}
              position={current?.position || 0}
            />
          </div>
        </div>
        <div className="player-center">
          <div className="transport">
            <button
              className="skip-seconds"
              aria-label="Back 15 seconds"
              onClick={() => seek(-15)}
              disabled={!current}
            >
              <RotateCcw size={29} />
              <span>15</span>
            </button>
            <button
              className="play-button"
              aria-label={playing ? "Pause" : "Play"}
              onClick={toggle}
              disabled={!current && !s.queue.length}
            >
              {playing ? (
                <Pause size={28} fill="currentColor" />
              ) : (
                <Play size={28} fill="currentColor" />
              )}
            </button>
            <button
              className="skip-seconds"
              aria-label="Forward 30 seconds"
              onClick={() => seek(30)}
              disabled={!current}
            >
              <RotateCw size={29} />
              <span>30</span>
            </button>
            <button
              className="next-track"
              aria-label="Next track"
              onClick={() => next()}
              disabled={!s.queue.length}
            >
              <SkipForward size={18} />
            </button>
          </div>
        </div>
        <div className="player-right">
          <Select
            title="Speed"
            aria-label="Speed"
            value={s.speed}
            onChange={(e) =>
              set((p) => ({ ...p, speed: Number(e.target.value) }))
            }
          >
            {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3].map((n) => (
              <option key={n} value={n}>
                {n}×
              </option>
            ))}
          </Select>
          <Volume2 size={18} />
          <input
            aria-label="Volume"
            type="range"
            min="0"
            max="1"
            step=".01"
            value={s.volume}
            onChange={(e) =>
              set((p) => ({ ...p, volume: Number(e.target.value) }))
            }
          />
          <button
            title="Playing Next"
            aria-label="Playing Next"
            aria-expanded={drawer === "queue"}
            className={drawer === "queue" ? "accent" : ""}
            onClick={() => setDrawer(drawer === "queue" ? null : "queue")}
          >
            <ListOrdered size={20} />
          </button>
        </div>
      </footer>
      <audio
        ref={audio}
        preload="metadata"
        src={current ? source(current) || undefined : undefined}
        onLoadedMetadata={() => {
          const a = audio.current!;
          if (current) {
            a.currentTime = Math.min(
              current.position,
              Number.isFinite(a.duration) ? a.duration : 0,
            );
            set((p) => ({
              ...p,
              tracks: p.tracks.map((t) =>
                t.id === current.id
                  ? {
                      ...t,
                      duration: Number.isFinite(a.duration) ? a.duration : 0,
                    }
                  : t,
              ),
            }));
          }
          a.playbackRate = latest.current.speed;
          if (wantPlay.current) {
            wantPlay.current = false;
            void a.play().catch(report);
          }
        }}
        onTimeUpdate={() => {
          if (Date.now() - lastSave.current >= 5000) checkpoint();
        }}
        onSeeked={checkpoint}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          if (ready) checkpoint();
        }}
        onEnded={() => {
          set((p) => ({
            ...p,
            tracks: p.tracks.map((t) =>
              t.id === p.current ? { ...t, position: 0 } : t,
            ),
          }));
          next(true);
        }}
        onError={() =>
          setError(
            "Cannot play this file. Check that it exists and uses a supported format. In the browser, reimport the file.",
          )
        }
      />
      <input
        hidden
        ref={input}
        type="file"
        multiple
        accept="audio/*,.m4a,.flac,.ogg,.opus"
        onChange={(e) => {
          mergeTracks(browserImport(Array.from(e.target.files || [])));
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={backupInput}
        type="file"
        accept=".json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void f.text().then(restore).catch(report);
          e.target.value = "";
        }}
      />
      {menu && (menuTrack || menuPlaylist) && (
        <Popup
          key={menu.panel || menu.kind}
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
          label={menuTrack ? "Track actions" : "Playlist actions"}
        >
          {menuTrack &&
            (menu.panel === "playlists" ? (
              <>
                <button
                  role="menuitem"
                  onClick={() => setMenu({ ...menu, panel: undefined })}
                >
                  <ChevronLeft size={17} />
                  Back
                </button>
                <div className="menu-caption">Add to playlist</div>
                {s.playlists.map((pl) => (
                  <button
                    role="menuitem"
                    key={pl.id}
                    disabled={pl.tracks.includes(menuTrack.id)}
                    onClick={() => addToPlaylist(pl.id, menuTrack.id)}
                  >
                    <ListMusic size={17} />
                    <span>{pl.name}</span>
                    {pl.tracks.includes(menuTrack.id) && <Check size={16} />}
                  </button>
                ))}
                <button
                  role="menuitem"
                  onClick={() => {
                    setDialog({
                      kind: "create",
                      title: "",
                      artist: "",
                      trackId: menuTrack.id,
                    });
                    setMenu(null);
                  }}
                >
                  <Plus size={17} />
                  New playlist
                </button>
              </>
            ) : (
              <>
                <button
                  role="menuitem"
                  onClick={() => {
                    toggleFavorite(menuTrack.id);
                    setMenu(null);
                  }}
                >
                  <Heart
                    size={17}
                    fill={menuTrack.favorite ? "currentColor" : "none"}
                  />
                  {menuTrack.favorite
                    ? "Remove from favorites"
                    : "Add to favorites"}
                </button>
                <button
                  role="menuitem"
                  onClick={() => setMenu({ ...menu, panel: "playlists" })}
                >
                  <ListMusic size={17} />
                  <span>Add to playlist</span>
                  <ChevronRight size={17} />
                </button>
                {playlist && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      set((p) => ({
                        ...p,
                        playlists: p.playlists.map((pl) =>
                          pl.id === playlist.id
                            ? {
                                ...pl,
                                tracks: pl.tracks.filter(
                                  (id) => id !== menuTrack.id,
                                ),
                              }
                            : pl,
                        ),
                      }));
                      setMenu(null);
                    }}
                  >
                    Remove from this playlist
                  </button>
                )}
                <button
                  role="menuitem"
                  onClick={() => {
                    addToQueue(menuTrack.id, true);
                  }}
                >
                  Play next
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    addToQueue(menuTrack.id, false);
                  }}
                >
                  Add to queue
                </button>
                <div className="menu-separator" />
                <button
                  role="menuitem"
                  onClick={() => {
                    setDialog({
                      kind: "edit",
                      id: menuTrack.id,
                      title: menuTrack.title,
                      artist: menuTrack.artist,
                    });
                    setMenu(null);
                  }}
                >
                  Edit details
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    set((p) => ({
                      ...p,
                      tracks: p.tracks.map((t) =>
                        t.id === menuTrack.id ? { ...t, position: 0 } : t,
                      ),
                    }));
                    if (current?.id === menuTrack.id && audio.current)
                      audio.current.currentTime = 0;
                    setMenu(null);
                  }}
                >
                  Reset progress
                </button>
                {desktop && (
                  <>
                    <button
                      role="menuitem"
                      onClick={() => {
                        void invoke("reveal_audio", {
                          path: menuTrack.path,
                        }).catch(report);
                        setMenu(null);
                      }}
                    >
                      Show in File Explorer
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => {
                        void relink(menuTrack);
                        setMenu(null);
                      }}
                    >
                      Relink file…
                    </button>
                    <button
                      role="menuitem"
                      className="danger"
                      onClick={() => {
                        void deleteFile(menuTrack);
                        setMenu(null);
                      }}
                    >
                      Delete file from disk…
                    </button>
                  </>
                )}
                <button
                  role="menuitem"
                  className="danger"
                  onClick={() => {
                    void remove(menuTrack.id);
                    setMenu(null);
                  }}
                >
                  Remove from library…
                </button>
              </>
            ))}
          {menuPlaylist && (
            <>
              <button
                role="menuitem"
                disabled={!menuPlaylist.tracks.length}
                onClick={() => {
                  playCollection(menuPlaylist.tracks);
                  setMenu(null);
                }}
              >
                {playing && isActiveCollection(s, menuPlaylist.tracks)
                  ? "Pause"
                  : "Play"}
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setDialog({
                    kind: "rename",
                    id: menuPlaylist.id,
                    title: menuPlaylist.name,
                    artist: "",
                  });
                  setMenu(null);
                }}
              >
                Rename playlist
              </button>
              <button
                role="menuitem"
                className="danger"
                onClick={() => void deletePlaylist(menuPlaylist.id)}
              >
                Delete playlist…
              </button>
            </>
          )}
        </Popup>
      )}
      {dialog && (
        <div className="modal-backdrop">
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              finishDialog();
            }}
          >
            <div className="modal-heading">
              <h2>
                {dialog.kind === "edit"
                  ? "Edit track"
                  : dialog.kind === "rename"
                    ? "Rename playlist"
                    : "New playlist"}
              </h2>
              <button
                type="button"
                title="Close"
                onClick={() => setDialog(null)}
              >
                <X size={20} />
              </button>
            </div>
            <label>
              Title
              <input
                autoFocus
                required
                maxLength={250}
                value={dialog.title}
                onChange={(e) =>
                  setDialog({ ...dialog, title: e.target.value })
                }
              />
            </label>
            {dialog.kind === "edit" && (
              <label>
                Artist
                <input
                  value={dialog.artist}
                  onChange={(e) =>
                    setDialog({ ...dialog, artist: e.target.value })
                  }
                />
              </label>
            )}
            <button className="primary" type="submit">
              Save
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
