export type Track = {
  id: string;
  title: string;
  artist: string;
  path: string;
  duration: number;
  size: number;
  added: number;
  position: number;
  source?: string;
  artwork?: string | null;
  fingerprint?: string | null;
  favorite?: boolean;
};
export type Playlist = { id: string; name: string; tracks: string[] };
export type Entry = {
  id: string;
  track: string;
  source: "manual" | "playlist";
  rank?: number;
};
export type Mode = "normal" | "reverse" | "shuffle";
export type State = {
  version: 1;
  tracks: Track[];
  playlists: Playlist[];
  queue: Entry[];
  history: string[];
  cycle?: string[];
  current: string | null;
  mode: Mode;
  repeat: "off" | "one" | "all";
  volume: number;
  speed: number;
  theme: "dark" | "light" | "system";
};
export const initial: State = {
  version: 1,
  tracks: [],
  playlists: [],
  queue: [],
  history: [],
  current: null,
  mode: "normal",
  repeat: "off",
  volume: 0.8,
  speed: 1,
  theme: "dark",
};
export const uid = () => crypto.randomUUID();
export function ordered(ids: string[], mode: Mode, random = Math.random) {
  const result = [...ids];
  if (mode === "reverse") result.reverse();
  if (mode === "shuffle")
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
  return result;
}
export function enqueue(queue: Entry[], track: string, next: boolean): Entry[] {
  const item: Entry = { id: uid(), track, source: "manual" };
  const remaining = queue.filter((e) => e.track !== track);
  const manual = remaining.filter((e) => e.source === "manual");
  return [
    ...(next ? [item, ...manual] : [...manual, item]),
    ...remaining.filter((e) => e.source === "playlist"),
  ];
}
export function removeTrack(state: State, id: string): State {
  return {
    ...state,
    tracks: state.tracks.filter((t) => t.id !== id),
    playlists: state.playlists.map((p) => ({
      ...p,
      tracks: p.tracks.filter((t) => t !== id),
    })),
    queue: state.queue.filter((e) => e.track !== id),
    history: state.history.filter((t) => t !== id),
    cycle: state.cycle?.filter((t) => t !== id),
    current: state.current === id ? null : state.current,
  };
}
export function parseBackup(text: string): State {
  const s = JSON.parse(text) as State;
  if (
    s.version !== 1 ||
    !Array.isArray(s.tracks) ||
    !Array.isArray(s.playlists) ||
    !Array.isArray(s.queue) ||
    !Array.isArray(s.history)
  )
    throw new Error("Invalid backup format");
  const strings = (a: unknown): a is string[] =>
    Array.isArray(a) && a.every((v) => typeof v === "string");
  if (
    !s.tracks.every(
      (t) =>
        typeof t.id === "string" &&
        typeof t.path === "string" &&
        typeof t.title === "string" &&
        typeof t.artist === "string" &&
        (t.favorite === undefined || typeof t.favorite === "boolean") &&
        [t.duration, t.size, t.added, t.position].every(
          (n) => Number.isFinite(n) && n >= 0,
        ),
    ) ||
    new Set(s.tracks.map((t) => t.id)).size !== s.tracks.length
  )
    throw new Error("Invalid tracks");
  const ids = new Set(s.tracks.map((t) => t.id));
  if (
    s.cycle !== undefined &&
    (!strings(s.cycle) || !s.cycle.every((id) => ids.has(id)))
  )
    throw new Error("Invalid playback cycle");
  if (
    !s.playlists.every(
      (p) =>
        typeof p.id === "string" &&
        typeof p.name === "string" &&
        strings(p.tracks) &&
        p.tracks.every((id) => ids.has(id)),
    ) ||
    !s.queue.every(
      (e) =>
        typeof e.id === "string" &&
        ids.has(e.track) &&
        ["manual", "playlist"].includes(e.source),
    ) ||
    !strings(s.history) ||
    !s.history.every((id) => ids.has(id)) ||
    (s.current !== null && !ids.has(s.current))
  )
    throw new Error("Invalid library references");
  if (
    !["normal", "reverse", "shuffle"].includes(s.mode) ||
    !["off", "one", "all"].includes(s.repeat) ||
    !["dark", "light", "system"].includes(s.theme) ||
    !Number.isFinite(s.volume) ||
    s.volume < 0 ||
    s.volume > 1 ||
    !Number.isFinite(s.speed) ||
    s.speed < 0.5 ||
    s.speed > 3
  )
    throw new Error("Invalid settings");
  return s;
}
export const time = (n: number) =>
  `${Math.floor((n || 0) / 60)}:${String(Math.floor((n || 0) % 60)).padStart(2, "0")}`;
export const bytes = (n: number) =>
  n >= 1073741824
    ? `${(n / 1073741824).toFixed(1)} GB`
    : `${(n / 1048576).toFixed(1)} MB`;
export function changeOrder(queue: Entry[], mode: Mode): Entry[] {
  const automatic = queue
    .filter((e) => e.source === "playlist")
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const ids = ordered(
    automatic.map((e) => e.id),
    mode,
  );
  const byId = new Map(automatic.map((e) => [e.id, e]));
  return [
    ...queue.filter((e) => e.source === "manual"),
    ...ids.map((id) => byId.get(id)!),
  ];
}
export function mergeImported(existing: Track[], incoming: Track[]): Track[] {
  const paths = new Set(existing.map((t) => t.path));
  const hashes = new Set(existing.map((t) => t.fingerprint).filter(Boolean));
  const result = [...existing];
  for (const t of incoming) {
    if (paths.has(t.path) || (t.fingerprint && hashes.has(t.fingerprint)))
      continue;
    paths.add(t.path);
    if (t.fingerprint) hashes.add(t.fingerprint);
    result.push(t);
  }
  return result;
}

export function isActiveCollection(state: State, ids: string[]): boolean {
  return (
    !!state.current &&
    ids.includes(state.current) &&
    !!state.cycle &&
    state.cycle.length === ids.length &&
    state.cycle.every((id, i) => id === ids[i])
  );
}

export function collectionDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 min";
  const minutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60),
    rest = minutes % 60;
  return hours
    ? [hours + " hr", rest ? rest + " min" : ""].filter(Boolean).join(" ")
    : minutes + " min";
}
export function queueForPlayback(
  queue: Entry[],
  continuation: string[],
  current: string,
  ranks: Map<string, number>,
): Entry[] {
  const manual = queue.filter(
    (e) => e.source === "manual" && e.track !== current,
  );
  const chosen = new Set(manual.map((e) => e.track));
  return [
    ...manual,
    ...continuation
      .filter((id) => id !== current && !chosen.has(id))
      .map((track) => ({
        id: uid(),
        track,
        source: "playlist" as const,
        rank: ranks.get(track),
      })),
  ];
}
export function moveQueueEntry(
  queue: Entry[],
  from: string,
  to: string,
): Entry[] {
  const result = [...queue],
    i = result.findIndex((e) => e.id === from),
    j = result.findIndex((e) => e.id === to);
  if (i < 0 || j < 0 || i === j) return queue;
  const [entry] = result.splice(i, 1);
  result.splice(j, 0, entry);
  // Once explicitly arranged, preserve this order across collection changes.
  return result.map((e) => ({ ...e, source: "manual" as const }));
}
