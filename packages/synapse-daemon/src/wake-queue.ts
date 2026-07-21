// packages/synapse-daemon/src/wake-queue.ts
// Serialises async tasks per key: same key runs FIFO one-at-a-time; different
// keys run concurrently. A failing task rejects its own promise without
// breaking the chain for its key.
export class WakeQueue {
  private tails = new Map<string, Promise<unknown>>();

  enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    // Chain after prev regardless of whether prev resolved or rejected.
    const run = prev.then(() => task(), () => task());
    // The tail tracks completion (settled either way) so the next task waits.
    const tail = run.then(() => undefined, () => undefined).then(() => {
      // If this run is still the tail, the key is drained — drop it.
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    this.tails.set(key, tail);
    return run;
  }

  activeKeyCount(): number {
    return this.tails.size;
  }
}
