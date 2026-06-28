import { spawn } from "child_process";
import { homedir, hostname, tmpdir } from "os";
import { join } from "path";
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { resolveConfig, type DaemonConfig } from "./config.js";
import { writeMcpConfig } from "./mcp-config.js";
import { WakeQueue } from "./wake-queue.js";
import { Daemon } from "./daemon.js";
import { ChildRegistry, type Killable } from "./child-registry.js";
import { SynapseSseListener } from "./sse-listener.js";
import { HeartbeatReporter } from "./heartbeat-reporter.js";

type Logger = { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };

const consoleLogger: Logger = {
  info: (m) => console.log(m),
  warn: (m) => console.warn(m),
  error: (m) => console.error(m),
};

export function printPosture(config: DaemonConfig, logger: Logger): void {
  logger.info(`Synapse daemon connecting to ${config.synapseUrl}`);
  if (config.yolo) {
    logger.info("Tool posture: YOLO — spawns use --dangerously-skip-permissions (full autonomy).");
  } else {
    logger.info('Tool posture: safe — spawns allow only "mcp__synapse" with --permission-mode dontAsk.');
  }
}

const DEFAULT_TURN_TIMEOUT_MS = 600_000; // 10 minutes

function resolveTurnTimeoutMs(): number {
  const raw = process.env.SYNAPSE_DAEMON_TURN_TIMEOUT_MS;
  if (raw === undefined) return DEFAULT_TURN_TIMEOUT_MS;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TURN_TIMEOUT_MS;
}

// Real child-process runner: invokes the `claude` binary with the given argv.
// Registers in-flight children in the shared `ChildRegistry` keyed by
// experimentUuid so an interrupt event can kill the right turn and shutdown can
// kill orphans, and enforces a per-turn timeout so a hung turn can never wedge
// its WakeQueue key forever.
function makeChildRunner(registry: ChildRegistry) {
  return (argv: string[], opts: { cwd: string; env: Record<string, string | undefined>; experimentUuid: string }) =>
    new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
      const child = spawn("claude", argv, { cwd: opts.cwd, env: opts.env as NodeJS.ProcessEnv });
      // Adapt ChildProcess to the registry's Killable shape: ChildProcess.kill
      // accepts NodeJS.Signals (narrower than Killable's `string`), so wrap it.
      const killable: Killable = { kill: (signal) => child.kill(signal as NodeJS.Signals | undefined) };
      registry.register(opts.experimentUuid, killable);
      let stdout = "";
      let stderr = "";
      let settled = false;
      const timeoutMs = resolveTurnTimeoutMs();

      const settle = (result: { code: number | null; stdout: string; stderr: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        registry.unregister(opts.experimentUuid, killable);
        resolve(result);
      };

      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        settle({
          code: null,
          stdout,
          stderr: stderr + `\n[synapse-daemon] claude turn timed out after ${timeoutMs}ms`,
        });
      }, timeoutMs);

      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("error", (err) => settle({ code: null, stdout, stderr: stderr + String(err) }));
      child.on("close", (code) => settle({ code, stdout, stderr }));
    });
}

export async function runDaemon(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`synapse daemon — wakes local Claude Code on experiment assignment

Usage: synapse daemon [options]
  --url <url>     Synapse server URL (or env SYNAPSE_URL)
  --key <key>     Agent API key syn_... (or env SYNAPSE_API_KEY; env preferred)
  --cwd <path>    Working directory for claude (default: current dir)
  --model <id>    Claude model (default: claude default)
  --yolo          Use --dangerously-skip-permissions (full autonomy)
`);
    return;
  }

  const configPath = join(homedir(), ".synapse", "daemon.json");
  const fileContents = existsSync(configPath) ? readFileSync(configPath, "utf8") : null;
  const config = resolveConfig({ env: process.env, argv, fileContents, cwd: process.cwd() });

  printPosture(config, consoleLogger);

  const dir = mkdtempSync(join(tmpdir(), "synapse-daemon-"));
  const mcpConfigPath = writeMcpConfig({
    synapseUrl: config.synapseUrl,
    apiKey: config.apiKey,
    dir,
    writeFile: (p, c) => writeFileSync(p, c),
  });

  const registry = new ChildRegistry();
  const queue = new WakeQueue();
  const daemon = new Daemon({
    config,
    queue,
    mcpConfigPath,
    spawn: { run: makeChildRunner(registry), logger: consoleLogger },
    logger: consoleLogger,
    interrupt: (uuid) => registry.interrupt(uuid),
  });

  const heartbeat = new HeartbeatReporter({
    synapseUrl: config.synapseUrl,
    apiKey: config.apiKey,
    host: hostname(),
    cwd: config.cwd,
    pid: process.pid,
    clientType: "claude_code",
    logger: { warn: (m) => consoleLogger.warn(m) },
  });
  heartbeat.start();

  const listener = new SynapseSseListener({
    synapseUrl: config.synapseUrl,
    apiKey: config.apiKey,
    onEvent: (event) => {
      const p = daemon.handleEvent(event);
      if (p) p.catch((err) => consoleLogger.error(`turn error: ${err}`));
    },
    onReconnect: async () => {
      consoleLogger.info("SSE reconnected");
    },
    logger: consoleLogger,
  });

  await listener.connect();
  consoleLogger.info("Synapse daemon running. Press Ctrl-C to stop.");

  const shutdown = () => {
    heartbeat.stop();
    listener.disconnect();
    // Kill any in-flight claude turns so they don't outlive the daemon.
    registry.killAll();
    // Clean up the temp dir holding the bearer-key .mcp.json.
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort; never block exit on a cleanup failure
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep the process alive.
  await new Promise<void>(() => {});
}
