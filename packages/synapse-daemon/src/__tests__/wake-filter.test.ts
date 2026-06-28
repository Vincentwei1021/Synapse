import { describe, it, expect } from "vitest";
import { decideWake } from "../wake-filter";
import type { SseNotificationEvent } from "../sse-listener";

function ev(over: Partial<SseNotificationEvent>): SseNotificationEvent {
  return { type: "new_notification", ...over } as SseNotificationEvent;
}

describe("decideWake", () => {
  it("wakes on run_assigned with entityUuid", () => {
    const d = decideWake(ev({ action: "run_assigned", entityUuid: "exp-1", researchProjectUuid: "proj-1", entityTitle: "Run A", message: "go" }));
    expect(d.wake).toBe(true);
    expect(d.experimentUuid).toBe("exp-1");
    expect(d.researchProjectUuid).toBe("proj-1");
    expect(d.title).toBe("Run A");
  });

  it("wakes on task_assigned", () => {
    expect(decideWake(ev({ action: "task_assigned", entityUuid: "exp-2" })).wake).toBe(true);
  });

  it("does not wake on comment_added", () => {
    expect(decideWake(ev({ action: "comment_added", entityUuid: "exp-3" })).wake).toBe(false);
  });

  it("does not wake when entityUuid missing", () => {
    expect(decideWake(ev({ action: "run_assigned" })).wake).toBe(false);
  });

  it("uses notificationType when action absent", () => {
    expect(decideWake(ev({ notificationType: "run_assigned", entityUuid: "exp-4" })).wake).toBe(true);
  });

  it("classifies experiment_instruction as a resume wake", () => {
    const d = decideWake(ev({ action: "experiment_instruction", entityUuid: "exp-1", message: "go" }));
    expect(d.wake).toBe(true);
    expect(d.kind).toBe("resume");
    expect(d.experimentUuid).toBe("exp-1");
  });
  it("classifies experiment_interrupt as an interrupt wake", () => {
    const d = decideWake(ev({ action: "experiment_interrupt", entityUuid: "exp-1" }));
    expect(d.wake).toBe(true);
    expect(d.kind).toBe("interrupt");
  });
  it("run_assigned stays a resume wake", () => {
    expect(decideWake(ev({ action: "run_assigned", entityUuid: "exp-1" })).kind).toBe("resume");
  });
});
