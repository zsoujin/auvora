import { expect, it, vi } from "vitest";
import { initial, type State } from "./model";
import { createStateWriter } from "./stateWriter";
import { createSaveQueue } from "./saveQueue";

function library(): State {
  return {
    ...initial,
    tracks: Array.from({ length: 10000 }, (_, index) => ({
      id: String(index),
      title: "Track",
      artist: "Artist",
      path: `${index}.mp3`,
      duration: 60,
      size: 100,
      added: 0,
      position: 0,
    })),
  };
}
const seek = (state: State, position: number): State => ({
  ...state,
  tracks: state.tracks.map((track, index) =>
    index === 2 ? { ...track, position } : track,
  ),
});

it("writes a small position update for a 10,000-track library and resets at the end", async () => {
  const full = vi.fn(async (_state: State) => {});
  const position = vi.fn(async () => true);
  const write = createStateWriter(full, position);
  const state = library();
  await write(state);
  await write(seek(state, 25));
  await write(seek(state, 0));
  expect(full).toHaveBeenCalledTimes(1);
  expect(position.mock.calls).toHaveLength(2);
  expect(position).toHaveBeenLastCalledWith({ index: 2, id: "2", position: 0 });
});

it("uses full saves for metadata edits, removed fields, reorders and stale database indices", async () => {
  const full = vi.fn(async (_state: State) => {});
  const position = vi.fn(async () => false);
  const write = createStateWriter(full, position);
  const state = library();
  await write(state);
  await write(seek(state, 25));
  const favorite = {
    ...state,
    tracks: state.tracks.map((t, i) =>
      i === 2 ? { ...t, favorite: true } : t,
    ),
  };
  await write(favorite);
  await write(state);
  await write({ ...state, tracks: [...state.tracks].reverse() });
  expect(full).toHaveBeenCalledTimes(5);
  expect(position).toHaveBeenCalledTimes(1);
});

it("retries a failed position write and serializes it before a closing full snapshot", async () => {
  const full = vi.fn(async (_state: State) => {});
  const position = vi
    .fn<() => Promise<boolean>>()
    .mockRejectedValueOnce(new Error("disk full"))
    .mockResolvedValue(true);
  const save = createSaveQueue(createStateWriter(full, position));
  const state = library();
  await save(state);
  await expect(save(seek(state, 10))).rejects.toThrow("disk full");
  await save(seek(state, 10));
  const close = { ...seek(state, 15), volume: 0.5 };
  await save(close);
  expect(position).toHaveBeenCalledTimes(2);
  expect(full).toHaveBeenLastCalledWith(close);
});
