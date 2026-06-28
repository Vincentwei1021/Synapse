import { describe, it, expect, vi } from "vitest";
import { buildMcpConfigJson, buildClaudeArgv, writeMcpConfig } from "../mcp-config";

describe("buildMcpConfigJson", () => {
  it("produces a synapse http server config", () => {
    const json = JSON.parse(buildMcpConfigJson("https://s.example", "syn_abc"));
    expect(json.mcpServers.synapse.type).toBe("http");
    expect(json.mcpServers.synapse.url).toBe("https://s.example/api/mcp");
    expect(json.mcpServers.synapse.headers.Authorization).toBe("Bearer syn_abc");
  });
});

describe("buildClaudeArgv", () => {
  const baseArgs = { prompt: "do it", sessionId: "exp-1", mcpConfigPath: "/tmp/m.json", yolo: false, model: null };

  it("first turn uses --session-id and safe tool posture", () => {
    const a = buildClaudeArgv({ ...baseArgs, isResume: false });
    expect(a).toContain("-p");
    expect(a[a.indexOf("-p") + 1]).toBe("do it");
    expect(a).toContain("--session-id");
    expect(a[a.indexOf("--session-id") + 1]).toBe("exp-1");
    expect(a).not.toContain("--resume");
    expect(a).toContain("--mcp-config");
    expect(a).toContain("--strict-mcp-config");
    expect(a.join(" ")).toContain("--output-format json");
    expect(a).toContain("--allowedTools");
    expect(a[a.indexOf("--allowedTools") + 1]).toBe("mcp__synapse");
    expect(a.join(" ")).toContain("--permission-mode dontAsk");
    expect(a).not.toContain("--dangerously-skip-permissions");
  });

  it("resume turn uses --resume not --session-id", () => {
    const a = buildClaudeArgv({ ...baseArgs, isResume: true });
    expect(a).toContain("--resume");
    expect(a[a.indexOf("--resume") + 1]).toBe("exp-1");
    expect(a).not.toContain("--session-id");
  });

  it("yolo maps to --dangerously-skip-permissions and drops allowedTools", () => {
    const a = buildClaudeArgv({ ...baseArgs, isResume: false, yolo: true });
    expect(a).toContain("--dangerously-skip-permissions");
    expect(a).not.toContain("--allowedTools");
  });

  it("model adds --model when set", () => {
    const a = buildClaudeArgv({ ...baseArgs, isResume: false, model: "opus" });
    expect(a[a.indexOf("--model") + 1]).toBe("opus");
  });
});

describe("writeMcpConfig", () => {
  it("writes json to dir and returns path", () => {
    const writeFile = vi.fn();
    const path = writeMcpConfig({ synapseUrl: "https://s", apiKey: "syn_x", dir: "/tmp/d", writeFile });
    expect(path).toBe("/tmp/d/.mcp.json");
    expect(writeFile).toHaveBeenCalledWith("/tmp/d/.mcp.json", expect.stringContaining("api/mcp"));
  });
});
