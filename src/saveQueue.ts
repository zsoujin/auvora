// Keep at most the in-flight and newest snapshot when storage is slower than UI.
export function createSaveQueue<T>(write: (value: T) => Promise<void>) {
  let next:
    | {
        value: T;
        resolve: (() => void)[];
        reject: ((error: unknown) => void)[];
      }
    | undefined;
  let running = false;
  async function drain() {
    running = true;
    while (next) {
      const batch = next;
      next = undefined;
      try {
        await write(batch.value);
        batch.resolve.forEach((resolve) => resolve());
      } catch (error) {
        batch.reject.forEach((reject) => reject(error));
      }
    }
    running = false;
  }
  return (value: T) =>
    new Promise<void>((resolve, reject) => {
      if (next) {
        next.value = value;
        next.resolve.push(resolve);
        next.reject.push(reject);
      } else next = { value, resolve: [resolve], reject: [reject] };
      if (!running) void drain();
    });
}
