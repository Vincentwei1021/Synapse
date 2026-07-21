import { describe, it, expect, vi } from "vitest";
import { spawnClaudeTurn } from "../claude-spawner";

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const base = {
  prompt: "do it", sessionId: "exp-1", isResume: false,
  mcpConfigPath: "/tmp/m.json", yolo: false, model: null,
  cwd: "/work", env: { PATH: "/usr/bin" },
};

describe("spawnClaudeTurn", () => {
  it("passes built argv to the runner and captures session_id from json", async () => {
    const run = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({ session_id: "exp-1", result: "done" }),
      stderr: "",
    });
    const res = await spawnClaudeTurn(base, { run, logger });
    expect(res.ok).toBe(true);
    expect(res.sessionId).toBe("exp-1");
    const argv = run.mock.calls[0][0] as string[];
    expect(argv).toContain("--session-id");
    expect(argv).toContain("--mcp-config");
    expect(run.mock.calls[0][1]).toMatchObject({ cwd: "/work" });
  });

  it("ok:false on non-zero exit, stderr captured", async () => {
    const run = vi.fn().mockResolvedValue({ code: 1, stdout: "", stderr: "boom" });
    const res = await spawnClaudeTurn(base, { run, logger });
    expect(res.ok).toBe(false);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toBe("boom");
  });

  it("ok stays true but sessionId null when stdout is not json", async () => {
    const run = vi.fn().mockResolvedValue({ code: 0, stdout: "not json", stderr: "" });
    const res = await spawnClaudeTurn(base, { run, logger });
    expect(res.ok).toBe(true);
    expect(res.sessionId).toBeNull();
  });

  it("never throws if runner rejects", async () => {
    const run = vi.fn().mockRejectedValue(new Error("spawn failed"));
    const res = await spawnClaudeTurn(base, { run, logger });
    expect(res.ok).toBe(false);
    expect(res.stderr).toContain("spawn failed");
  });
});
