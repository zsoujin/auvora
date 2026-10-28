import { invoke, isTauri, convertFileSrc } from "@tauri-apps/api/core";
import { initial, parseBackup, type State, type Track, uid } from "./model";
import { createSaveQueue } from "./saveQueue";
import { createStateWriter } from "./stateWriter";
export const desktop = isTauri();
const blobs = new Map<string, string>();
export async function load(): Promise<State> {
  const raw = desktop
    ? await invoke<string | null>("load_state")
    : (localStorage.getItem("auvora") ??
      localStorage.getItem("personal-audio"));
  return raw ? parseBackup(raw) : structuredClone(initial);
}
const writeFull = async (state: State) => {
  const json = JSON.stringify(state);
  if (desktop) await invoke("save_state", { json });
  else localStorage.setItem("auvora", json);
};
export const save = createSaveQueue<State>(
  desktop
    ? createStateWriter(writeFull, (update) =>
        invoke<boolean>("save_position", update),
      )
    : writeFull,
);
export const source = (track: Track) =>
  desktop ? convertFileSrc(track.path) : blobs.get(track.path) || "";
export function browserImport(files: File[]): Track[] {
  return files.map((f) => {
    const path = `${f.name}:${f.size}:${f.lastModified}`;
    const old = blobs.get(path);
    if (old) URL.revokeObjectURL(old);
    blobs.set(path, URL.createObjectURL(f));
    return {
      id: uid(),
      path,
      title: f.name.replace(/\.[^.]+$/, ""),
      artist: "Unknown artist",
      duration: 0,
      size: f.size,
      added: Date.now(),
      position: 0,
    };
  });
}
