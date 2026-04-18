import { describe, expect, it } from "vitest";
import {
  AGENT_WORK_STALE_AFTER_MS,
  getLatestActivityMillis,
  isAgentWorkStale,
} from "@/lib/agent-presence";

describe("agent presence helpers", () => {
  it("returns the newest activity timestamp", () => {
    const result = getLatestActivityMillis(
      "2026-04-18T11:59:00.000Z",
      "2026-04-18T12:03:00.000Z",
      "2026-04-18T12:01:00.000Z",
    );

    expect(result).toBe(new Date("2026-04-18T12:03:00.000Z").getTime());
  });

  it("treats work as active when either heartbeat or progress is still fresh", () => {
    const now = new Date("2026-04-18T12:10:00.000Z");

    expect(
      isAgentWorkStale({
        agentLastActiveAt: "2026-04-18T11:57:00.000Z",
        lastProgressAt: "2026-04-18T12:09:00.000Z",
        now,
      }),
    ).toBe(false);
  });

  it("marks work as stale when the latest signal is older than the stale window", () => {
    const now = new Date("2026-04-18T12:10:00.000Z");

    expect(
      isAgentWorkStale({
        agentLastActiveAt: "2026-04-18T11:59:59.000Z",
        staleAfterMs: 30 * 1000,
        now,
      }),
    ).toBe(true);
  });

  it("does not mark work stale when no activity exists yet", () => {
    expect(
      isAgentWorkStale({
        agentLastActiveAt: null,
        lastProgressAt: null,
        staleAfterMs: AGENT_WORK_STALE_AFTER_MS,
        now: new Date("2026-04-18T12:10:00.000Z"),
      }),
    ).toBe(false);
  });
});
