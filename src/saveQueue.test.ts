import { expect, it } from "vitest";
import { createSaveQueue } from "./saveQueue";

it("coalesces a blocked storage backlog and waits for the final close snapshot", async () => {
  const written: number[] = [];
  let unblock!: () => void;
  const barrier = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  const save = createSaveQueue<number>(async (value) => {
    if (value === 1) await barrier;
    written.push(value);
  });
  const first = save(1),
    intermediate = save(2),
    close = save(3);
  expect(written).toEqual([]);
  unblock();
  await Promise.all([first, intermediate, close]);
  expect(written).toEqual([1, 3]);
});

it("reports a failed write but permits a later retry", async () => {
  let fail = true;
  const save = createSaveQueue(async () => {
    if (fail) throw new Error("disk full");
  });
  await expect(save(1)).rejects.toThrow("disk full");
  fail = false;
  await expect(save(2)).resolves.toBeUndefined();
});
