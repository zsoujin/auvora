// Node 24 runs the erasable TypeScript writer directly. No user library is read.
import { createStateWriter } from '../src/stateWriter.ts';
const tracks = Array.from({ length: 10000 }, (_, index) => ({
  id: String(index), title: `Sample ${index}`, artist: 'Fixture artist',
  path: `fixtures/${index}.mp3`, duration: 3600, size: 10000000,
  added: 0, position: 0,
}));
const initial = { version: 1, tracks, playlists: [], queue: [], history: [],
  current: '0', mode: 'normal', repeat: 'off', volume: 0.8, speed: 1, theme: 'dark' };
let fullBytes = 0, incrementalBytes = 0, fullWrites = 0, positionWrites = 0;
const write = createStateWriter(async state => {
  fullBytes += Buffer.byteLength(JSON.stringify(state)); fullWrites++;
}, async update => {
  incrementalBytes += Buffer.byteLength(JSON.stringify(update)); positionWrites++; return true;
});
await write(initial);
const initialBytes = fullBytes;
let legacyBytes = 0;
for (let tick = 1; tick <= 120; tick++) {
  const state = { ...initial, tracks: [{ ...tracks[0], position: tick * 5 }, ...tracks.slice(1)] };
  legacyBytes += Buffer.byteLength(JSON.stringify(state));
  await write(state);
}
console.log(JSON.stringify({ tracks: tracks.length, checkpoints: 120, initialBytes,
  legacyCheckpointBytes: legacyBytes, optimizedCheckpointBytes: fullBytes - initialBytes + incrementalBytes,
  fullWrites, positionWrites,
  note: 'Serialized IPC payload benchmark only; not process memory or SQLite allocation measurement.' }, null, 2));
