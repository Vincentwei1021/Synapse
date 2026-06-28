// packages/synapse-daemon/src/__tests__/wake-queue.test.ts
import { describe, it, expect } from "vitest";
import { WakeQueue } from "../wake-queue";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("WakeQueue", () => {
  it("runs same-key tasks strictly in order", async () => {
    const q = new WakeQueue();
    const order: number[] = [];
    const mk = (n: number, ms: number) => () =>
      new Promise<void>((res) => setTimeout(() => { order.push(n); res(); }, ms));
    const p1 = q.enqueue("k", mk(1, 20));
    const p2 = q.enqueue("k", mk(2, 1));
    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 2]); // 2 waited for 1 despite being faster
  });

  it("runs different keys concurrently", async () => {
    const q = new WakeQueue();
    let running = 0, maxConcurrent = 0;
    const mk = () => () => new Promise<void>((res) => {
      running++; maxConcurrent = Math.max(maxConcurrent, running);
      setTimeout(() => { running--; res(); }, 10);
    });
    await Promise.all([q.enqueue("a", mk()), q.enqueue("b", mk())]);
    expect(maxConcurrent).toBe(2);
  });

  it("a throwing task rejects but does not block the next same-key task", async () => {
    const q = new WakeQueue();
    const ran: string[] = [];
    const bad = q.enqueue("k", async () => { throw new Error("boom"); });
    const good = q.enqueue("k", async () => { ran.push("good"); return "ok"; });
    await expect(bad).rejects.toThrow("boom");
    await expect(good).resolves.toBe("ok");
    expect(ran).toEqual(["good"]);
  });

  it("activeKeyCount drops back to 0 when drained", async () => {
    const q = new WakeQueue();
    await q.enqueue("k", async () => {});
    await tick();
    expect(q.activeKeyCount()).toBe(0);
  });
});
