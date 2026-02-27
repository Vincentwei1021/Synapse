export type SseListenerStatus = "connected" | "disconnected" | "reconnecting";

export interface SseNotificationEvent {
  type: string; // "new_notification"
  notificationUuid?: string;
  notificationType?: string; // "task_assigned", "mentioned", etc.
  unreadCount?: number;
  [key: string]: unknown;
}

export interface ChorusSseListenerOptions {
  chorusUrl: string;
  apiKey: string;
  onEvent: (event: SseNotificationEvent) => void;
  onReconnect: () => Promise<void>;
  logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
}

const INITIAL_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;

export class ChorusSseListener {
  private readonly opts: ChorusSseListenerOptions;
  private _status: SseListenerStatus = "disconnected";
  private abortController: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = INITIAL_DELAY_MS;

  constructor(opts: ChorusSseListenerOptions) {
    this.opts = opts;
  }

  get status(): SseListenerStatus {
    return this._status;
  }

  /** Start the SSE connection. Resolves once the first bytes arrive (or rejects on immediate failure). */
  async connect(): Promise<void> {
    this.clearReconnectTimer();

    const abortController = new AbortController();
    this.abortController = abortController;

    const url = `${this.opts.chorusUrl.replace(/\/$/, "")}/api/events/notifications`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          Accept: "text/event-stream",
        },
        signal: abortController.signal,
      });
    } catch (err) {
      if (abortController.signal.aborted) return; // intentional disconnect
      this.opts.logger.error(`SSE connection failed: ${err}`);
      this.scheduleReconnect();
      return;
    }

    if (!response.ok) {
      this.opts.logger.error(`SSE endpoint returned ${response.status}`);
      this.scheduleReconnect();
      return;
    }

    if (!response.body) {
      this.opts.logger.error("SSE response has no body");
      this.scheduleReconnect();
      return;
    }

    // Connection succeeded — reset backoff
    const isReconnect = this._status === "reconnecting";
    this._status = "connected";
    this.reconnectDelay = INITIAL_DELAY_MS;
    this.opts.logger.info("SSE connection established");

    if (isReconnect) {
      // Fire onReconnect callback so the caller can back-fill missed notifications
      try {
        await this.opts.onReconnect();
      } catch (err) {
        this.opts.logger.warn(`onReconnect callback error: ${err}`);
      }
    }

    // Read the stream
    this.consumeStream(response.body, abortController.signal);
  }

  /** Gracefully close the SSE connection. */
  disconnect(): void {
    this.clearReconnectTimer();
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this._status = "disconnected";
    this.opts.logger.info("SSE connection closed");
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async consumeStream(body: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<void> {
    const decoder = new TextDecoder();
    const reader = body.getReader();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done || signal.aborted) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE messages are delimited by double newlines
        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          const raw = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          this.processMessage(raw);
        }
      }
    } catch (err) {
      if (signal.aborted) return; // intentional disconnect
      this.opts.logger.warn(`SSE stream error: ${err}`);
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // already released
      }
    }

    // Stream ended unexpectedly — reconnect unless we were intentionally disconnected
    if (!signal.aborted) {
      this.opts.logger.warn("SSE stream ended, scheduling reconnect");
      this.scheduleReconnect();
    }
  }

  private processMessage(raw: string): void {
    for (const line of raw.split("\n")) {
      // Comment lines (heartbeats) — ignore
      if (line.startsWith(":")) continue;

      // Data lines
      if (line.startsWith("data: ")) {
        const jsonStr = line.slice(6);
        try {
          const event: SseNotificationEvent = JSON.parse(jsonStr);
          this.opts.onEvent(event);
        } catch (err) {
          this.opts.logger.warn(`SSE JSON parse error: ${err} — raw: ${jsonStr}`);
        }
      }
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this._status = "reconnecting";

    this.opts.logger.info(`SSE reconnecting in ${this.reconnectDelay}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);

    // Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_DELAY_MS);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
