import { decideWake } from "./wake-filter.js";
import { WakeQueue } from "./wake-queue.js";
import { buildTurnPrompt } from "./prompt-builder.js";
import { spawnClaudeTurn, type SpawnDeps } from "./claude-spawner.js";
import type { SseNotificationEvent } from "./sse-listener.js";
import type { DaemonConfig } from "./config.js";

export interface DaemonDeps {
  config: DaemonConfig;
  queue: WakeQueue;
  mcpConfigPath: string;
  spawn: SpawnDeps;
  logger: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
}

export class Daemon {
  private readonly deps: DaemonDeps;
  private readonly seen = new Set<string>();

  constructor(deps: DaemonDeps) {
    this.deps = deps;
  }

  seenExperiment(uuid: string): boolean {
    return this.seen.has(uuid);
  }

  handleEvent(event: SseNotificationEvent): Promise<unknown> | null {
    const decision = decideWake(event);
    if (!decision.wake || !decision.experimentUuid) return null;

    const experimentUuid = decision.experimentUuid;
    const isResume = this.seen.has(experimentUuid);

    return this.deps.queue.enqueue(experimentUuid, async () => {
      const prompt = buildTurnPrompt({
        experimentUuid,
        researchProjectUuid: decision.researchProjectUuid,
        title: decision.title,
        message: decision.message,
        isFirstTurn: !isResume,
      });
      this.deps.logger.info(`Spawning claude turn for experiment ${experimentUuid} (resume=${isResume})`);
      const result = await spawnClaudeTurn(
        {
          prompt,
          sessionId: experimentUuid,
          isResume,
          mcpConfigPath: this.deps.mcpConfigPath,
          yolo: this.deps.config.yolo,
          model: this.deps.config.model,
          cwd: this.deps.config.cwd,
          env: { ...process.env, SYNAPSE_URL: this.deps.config.synapseUrl, SYNAPSE_API_KEY: this.deps.config.apiKey },
        },
        this.deps.spawn,
      );
      // Mark seen only when a session actually exists, so a failed first turn retries fresh.
      if (result.ok && (result.sessionId || isResume)) {
        this.seen.add(experimentUuid);
      }
      return result;
    });
  }
}
