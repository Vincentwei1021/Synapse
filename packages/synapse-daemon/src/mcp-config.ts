export function buildMcpConfigJson(synapseUrl: string, apiKey: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        synapse: {
          type: "http",
          url: `${synapseUrl.replace(/\/$/, "")}/api/mcp`,
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      },
    },
    null,
    2,
  );
}

export interface ClaudeArgvParams {
  prompt: string;
  sessionId: string;
  isResume: boolean;
  mcpConfigPath: string;
  yolo: boolean;
  model: string | null;
}

export function buildClaudeArgv(p: ClaudeArgvParams): string[] {
  const argv: string[] = ["-p", p.prompt];
  if (p.isResume) {
    argv.push("--resume", p.sessionId);
  } else {
    argv.push("--session-id", p.sessionId);
  }
  argv.push("--mcp-config", p.mcpConfigPath, "--strict-mcp-config");
  argv.push("--output-format", "json");
  if (p.yolo) {
    argv.push("--dangerously-skip-permissions");
  } else {
    argv.push("--allowedTools", "mcp__synapse", "--permission-mode", "dontAsk");
  }
  if (p.model) argv.push("--model", p.model);
  return argv;
}

export function writeMcpConfig(args: {
  synapseUrl: string;
  apiKey: string;
  dir: string;
  writeFile: (path: string, contents: string) => void;
}): string {
  const path = `${args.dir.replace(/\/$/, "")}/.mcp.json`;
  args.writeFile(path, buildMcpConfigJson(args.synapseUrl, args.apiKey));
  return path;
}
