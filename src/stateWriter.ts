import type { State, Track } from "./model";

export type PositionUpdate = { index: number; id: string; position: number };

// Snapshots are immutable. Retain only the last successful snapshot; most data
// is shared with the current state. Never advance this baseline on an I/O error.
export function createStateWriter(
  full: (state: State) => Promise<void>,
  position: (update: PositionUpdate) => Promise<boolean>,
) {
  let previous: State | undefined;
  return async (state: State) => {
    let update: PositionUpdate | undefined;
    let compatible =
      previous !== undefined &&
      previous.tracks.length === state.tracks.length &&
      [...new Set([...Object.keys(previous), ...Object.keys(state)])].every(
        (key) =>
          key === "tracks" ||
          previous![key as keyof State] === state[key as keyof State],
      );
    if (compatible) {
      for (let index = 0; index < state.tracks.length; index++) {
        const before = previous!.tracks[index],
          after = state.tracks[index];
        if (before === after) continue;
        if (
          update ||
          ![...new Set([...Object.keys(before), ...Object.keys(after)])].every(
            (key) =>
              key === "position" ||
              before[key as keyof Track] === after[key as keyof Track],
          )
        ) {
          compatible = false;
          break;
        }
        update = { index, id: after.id, position: after.position };
      }
    }
    if (!compatible || (update && !(await position(update)))) await full(state);
    previous = state;
  };
}
