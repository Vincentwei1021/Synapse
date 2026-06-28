// Vendored from packages/openclaw-plugin/src/heartbeat-reporter.ts (P2).
// Periodically POSTs this daemon's connection metadata to Synapse so the
// server-side connection registry knows we are online.

export interface HeartbeatReporterOptions {
  synapseUrl: string;
  apiKey: string;
  host: string;
  cwd: string;
  pid: number | null;
  clientType: string;
  intervalMs?: number;
  fetchImpl?: typeof fetch;
  logger: { warn: (msg: string) => void };
}

const DEFAULT_INTERVAL_MS = 30_000;

export class HeartbeatReporter {
  private readonly opts: HeartbeatReporterOptions;
  private readonly fetchImpl: typeof fetch;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: HeartbeatReporterOptions) {
    this.opts = opts;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  start(): void {
    this.stop();
    void this.sendOnce();
    this.timer = setInterval(() => {
      void this.sendOnce();
    }, this.opts.intervalMs ?? DEFAULT_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async sendOnce(): Promise<void> {
    const url = `${this.opts.synapseUrl.replace(/\/$/, "")}/api/agent-connections/heartbeat`;
    try {
      await this.fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          host: this.opts.host,
          cwd: this.opts.cwd,
          pid: this.opts.pid,
          clientType: this.opts.clientType,
        }),
      });
    } catch (err) {
      this.opts.logger.warn(`[Synapse] heartbeat failed: ${err}`);
    }
  }
}
