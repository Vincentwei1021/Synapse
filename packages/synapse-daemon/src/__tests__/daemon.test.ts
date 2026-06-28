import { describe, it, expect, vi } from "vitest";
import { Daemon } from "../daemon";
import { WakeQueue } from "../wake-queue";
import type { SseNotificationEvent } from "../sse-listener";

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const config = { synapseUrl: "https://s", apiKey: "syn_x", yolo: false, model: null, cwd: "/work" };

function ev(over: Partial<SseNotificationEvent>): SseNotificationEvent {
  return { type: "new_notification", ...over } as SseNotificationEvent;
}

function makeDaemon(run: ReturnType<typeof vi.fn>) {
  return new Daemon({
    config,
    queue: new WakeQueue(),
    mcpConfigPath: "/tmp/.mcp.json",
    spawn: { run, logger },
    logger,
  });
}

describe("Daemon.handleEvent", () => {
  it("ignores non-wake events", async () => {
    const run = vi.fn();
    const d = makeDaemon(run);
    expect(d.handleEvent(ev({ action: "comment_added", entityUuid: "x" }))).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it("first wake spawns a --session-id turn", async () => {
    const run = vi.fn().mockResolvedValue({ code: 0, stdout: JSON.stringify({ session_id: "exp-1" }), stderr: "" });
    const d = makeDaemon(run);
    await d.handleEvent(ev({ action: "run_assigned", entityUuid: "exp-1", researchProjectUuid: "p1", entityTitle: "T" }));
    const argv = run.mock.calls[0][0] as string[];
    expect(argv).toContain("--session-id");
    expect(argv).not.toContain("--resume");
    expect(d.seenExperiment("exp-1")).toBe(true);
  });

  it("second wake for same experiment resumes", async () => {
    const run = vi.fn().mockResolvedValue({ code: 0, stdout: JSON.stringify({ session_id: "exp-1" }), stderr: "" });
    const d = makeDaemon(run);
    await d.handleEvent(ev({ action: "run_assigned", entityUuid: "exp-1" }));
    await d.handleEvent(ev({ action: "run_assigned", entityUuid: "exp-1", message: "more" }));
    const secondArgv = run.mock.calls[1][0] as string[];
    expect(secondArgv).toContain("--resume");
    expect(secondArgv).not.toContain("--session-id");
  });

  it("failed first turn leaves experiment un-seen for retry", async () => {
    const run = vi.fn().mockResolvedValue({ code: 1, stdout: "", stderr: "boom" });
    const d = makeDaemon(run);
    await d.handleEvent(ev({ action: "run_assigned", entityUuid: "exp-9" }));
    expect(d.seenExperiment("exp-9")).toBe(false);
  });
});
