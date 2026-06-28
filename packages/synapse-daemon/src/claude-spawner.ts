import { buildClaudeArgv, type ClaudeArgvParams } from "./mcp-config.js";

export interface SpawnResult {
  ok: boolean;
  sessionId: string | null;
  exitCode: number | null;
  stderr: string;
}

export interface SpawnDeps {
  run: (
    argv: string[],
    opts: { cwd: string; env: Record<string, string | undefined> },
  ) => Promise<{ code: number | null; stdout: string; stderr: string }>;
  logger: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
}

export async function spawnClaudeTurn(
  params: ClaudeArgvParams & { cwd: string; env: Record<string, string | undefined> },
  deps: SpawnDeps,
): Promise<SpawnResult> {
  const argv = buildClaudeArgv(params);
  try {
    const { code, stdout, stderr } = await deps.run(argv, { cwd: params.cwd, env: params.env });
    let sessionId: string | null = null;
    if (code === 0 && stdout) {
      try {
        const parsed = JSON.parse(stdout) as { session_id?: string };
        if (typeof parsed.session_id === "string") sessionId = parsed.session_id;
      } catch {
        deps.logger.warn("claude stdout was not valid JSON; session_id not captured");
      }
    }
    if (code !== 0) deps.logger.error(`claude turn exited ${code}: ${stderr}`);
    return { ok: code === 0, sessionId, exitCode: code, stderr };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    deps.logger.error(`claude spawn failed: ${msg}`);
    return { ok: false, sessionId: null, exitCode: null, stderr: msg };
  }
}
