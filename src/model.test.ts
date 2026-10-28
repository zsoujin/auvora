import { describe, expect, it } from "vitest";
import {
  initial,
  collectionDuration,
  queueForPlayback,
  moveQueueEntry,
  isActiveCollection,
  ordered,
  enqueue,
  removeTrack,
  parseBackup,
  changeOrder,
  mergeImported,
  type Track,
  type Entry,
} from "./model";
const t: Track = {
  id: "a",
  title: "Lecture",
  artist: "Author",
  path: "C:/Music/a.mp3",
  size: 100,
  duration: 300,
  added: 1,
  position: 40,
};
describe("queue invariants", () => {
  it("inserts manual next/last ahead of automatic continuation without changing the input", () => {
    const q: Entry[] = [
      { id: "1", track: "a", source: "manual" },
      { id: "2", track: "b", source: "playlist" },
    ];
    expect(enqueue(q, "c", false).map((e) => e.track)).toEqual(["a", "c", "b"]);
    expect(enqueue(q, "c", true).map((e) => e.track)).toEqual(["c", "a", "b"]);
    expect(q.map((e) => e.track)).toEqual(["a", "b"]);
  });
  it("shuffles once without omissions or repeats and leaves the playlist unchanged", () => {
    const ids = ["a", "b", "c", "d"];
    const shuffled = ordered(ids, "shuffle", () => 0.3);
    expect(new Set(shuffled)).toEqual(new Set(ids));
    expect(shuffled).toHaveLength(4);
    expect(ids).toEqual(["a", "b", "c", "d"]);
    expect(ordered(ids, "reverse")).toEqual(["d", "c", "b", "a"]);
  });
  it("removes every dangling reference when a track is removed", () => {
    const s = {
      ...initial,
      tracks: [t],
      current: "a",
      history: ["a"],
      queue: [{ id: "q", track: "a", source: "manual" as const }],
      playlists: [{ id: "p", name: "P", tracks: ["a"] }],
    };
    const result = removeTrack(s, "a");
    expect(result.current).toBeNull();
    expect(result.queue).toEqual([]);
    expect(result.history).toEqual([]);
    expect(result.playlists[0].tracks).toEqual([]);
    expect(s.tracks).toHaveLength(1);
  });
});
describe("backup validation", () => {
  it("round trips positions, queue and settings", () => {
    const s = { ...initial, tracks: [t], current: "a", speed: 1.5 };
    expect(parseBackup(JSON.stringify(s))).toEqual(s);
  });
  it("rejects dangling references, invalid values and duplicate IDs", () => {
    for (const patch of [
      { current: "missing" },
      { speed: 99 },
      { volume: -1 },
      { tracks: [t, t] },
      { tracks: [{ ...t, position: -5 }] },
      { playlists: [{ id: "p", name: "P", tracks: ["missing"] }] },
    ])
      expect(() =>
        parseBackup(JSON.stringify({ ...initial, tracks: [t], ...patch })),
      ).toThrow();
  });
});
describe("large libraries and mode changes", () => {
  it("restores playlist order after reverse and shuffle while preserving manual priority", () => {
    const q: Entry[] = [
      { id: "m", track: "m", source: "manual" },
      ...["a", "b", "c"].map((track, rank) => ({
        id: track,
        track,
        rank,
        source: "playlist" as const,
      })),
    ];
    expect(changeOrder(q, "reverse").map((e) => e.track)).toEqual([
      "m",
      "c",
      "b",
      "a",
    ]);
    expect(
      changeOrder(changeOrder(q, "reverse"), "normal").map((e) => e.track),
    ).toEqual(["m", "a", "b", "c"]);
    expect(
      changeOrder(changeOrder(q, "shuffle"), "normal").map((e) => e.track),
    ).toEqual(["m", "a", "b", "c"]);
  });
  it("deduplicates renamed files and duplicate files within one import", () => {
    const one = { ...t, fingerprint: "sha256" };
    expect(
      mergeImported([one], [{ ...one, id: "b", path: "renamed.mp3" }]),
    ).toEqual([one]);
    expect(mergeImported([], [one, one])).toEqual([one]);
  });
  it("round trips 10,000 records with playlist and queue references", () => {
    const tracks = Array.from({ length: 10000 }, (_, i) => ({
      ...t,
      id: String(i),
      path: `C:/Audio/${i}.mp3`,
    }));
    const state = {
      ...initial,
      tracks,
      playlists: [{ id: "p", name: "All", tracks: tracks.map((t) => t.id) }],
      queue: tracks.map((t, rank) => ({
        id: `q${rank}`,
        track: t.id,
        source: "playlist" as const,
        rank,
      })),
      cycle: tracks.map((t) => t.id),
    };
    const started = performance.now();
    expect(parseBackup(JSON.stringify(state)).tracks).toHaveLength(10000);
    expect(changeOrder(state.queue, "reverse")[0].track).toBe("9999");
    console.info(
      `10,000-track validation and reorder: ${Math.round(performance.now() - started)} ms`,
    );
  });
});

describe("favorites and collection playback", () => {
  it("persists favorites while keeping older libraries compatible", () => {
    for (const favorite of [undefined, true, false]) {
      const state = { ...initial, tracks: [{ ...t, favorite }] };
      expect(parseBackup(JSON.stringify(state)).tracks[0].favorite).toBe(
        favorite,
      );
    }
    expect(() =>
      parseBackup(
        JSON.stringify({ ...initial, tracks: [{ ...t, favorite: "yes" }] }),
      ),
    ).toThrow();
  });
  it("recognizes the playing collection after advancing without confusing other lists", () => {
    const state = { ...initial, current: "b", cycle: ["a", "b"] };
    expect(isActiveCollection(state, ["a", "b"])).toBe(true);
    expect(isActiveCollection(state, ["b", "a"])).toBe(false);
    expect(isActiveCollection(state, ["b"])).toBe(false);
    expect(isActiveCollection(state, [])).toBe(false);
    expect(isActiveCollection({ ...state, current: "c" }, ["a", "b"])).toBe(
      false,
    );
  });
});

describe("podcast queue behavior", () => {
  const manual = { id: "m", track: "b", source: "manual" as const };
  const auto = { id: "p", track: "c", source: "playlist" as const };
  it("moves repeated additions instead of creating duplicate playback", () => {
    const queue = [manual, auto];
    expect(enqueue(queue, "c", true).map((e) => e.track)).toEqual(["c", "b"]);
    expect(enqueue(queue, "b", false).map((e) => e.track)).toEqual(["b", "c"]);
    expect(queue).toEqual([manual, auto]);
  });
  it("keeps manual requests when a different collection starts and avoids duplicates", () => {
    expect(
      queueForPlayback([manual, auto], ["b", "c", "d"], "a", new Map()).map(
        (e) => [e.track, e.source],
      ),
    ).toEqual([
      ["b", "manual"],
      ["c", "playlist"],
      ["d", "playlist"],
    ]);
    expect(
      queueForPlayback([manual], ["a", "c"], "b", new Map()).map(
        (e) => e.track,
      ),
    ).toEqual(["a", "c"]);
  });
  it("preserves explicitly rearranged order across playback changes", () => {
    const moved = moveQueueEntry([manual, auto], "p", "m");
    expect(moved.map((e) => e.track)).toEqual(["c", "b"]);
    expect(
      queueForPlayback(moved, ["d"], "a", new Map()).map((e) => e.track),
    ).toEqual(["c", "b", "d"]);
    expect(moveQueueEntry([manual, auto], "missing", "m")).toEqual([
      manual,
      auto,
    ]);
  });
  it("formats collection duration as human readable hours and minutes", () => {
    expect(collectionDuration(7896)).toBe("2 hr 12 min");
    expect(collectionDuration(3600)).toBe("1 hr");
    expect(collectionDuration(90)).toBe("2 min");
    expect(collectionDuration(8)).toBe("1 min");
    expect(collectionDuration(0)).toBe("0 min");
  });
});
