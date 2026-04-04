// src/lib/event-bus.ts
// Dual-layer event bus: local EventEmitter + optional Redis Pub/Sub
// Local emit for same-process delivery, Redis for cross-instance delivery.
import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { isRedisEnabled, getRedisPublisher, getRedisSubscriber } from "./redis";

export interface RealtimeEvent {
  companyUuid: string;
  researchProjectUuid: string;
  entityType: "experiment" | "experiment_run" | "research_question" | "experiment_design" | "document" | "research_project" | "related_work";
  entityUuid: string;
  action: "created" | "updated" | "deleted";
  actorUuid?: string;
}

// Single Redis channel for all events (ElastiCache Serverless doesn't support PSUBSCRIBE)
const REDIS_CHANNEL = "synapse:events";

/** Envelope wrapping event data with origin ID for dedup + channel for local dispatch */
interface RedisEnvelope {
  _origin: string;
  channel: string;
  data: unknown;
}

class SynapseEventBus extends EventEmitter {
  private _connected = false;
  private _connectPromise: Promise<void> | null = null;
  /** Unique per-process ID to deduplicate own messages from Redis */
  private readonly _instanceId = randomUUID();

  /** Call once at startup to initialize Redis subscriptions */
  async connect(): Promise<void> {
    if (this._connected || !isRedisEnabled()) return;
    if (this._connectPromise) {
      await this._connectPromise;
      return;
    }

    this._connectPromise = (async () => {
      const sub = getRedisSubscriber();
      const pub = getRedisPublisher();
      if (!sub) return;

      await sub.connect();
      if (pub) {
        await pub.connect();
      }
      // Use SUBSCRIBE (not PSUBSCRIBE) — compatible with ElastiCache Serverless
      await sub.subscribe(REDIS_CHANNEL);

      sub.on("message", (_channel: string, message: string) => {
        try {
          const envelope: RedisEnvelope = JSON.parse(message);
          // Skip messages we published ourselves — already delivered locally
          if (envelope._origin === this._instanceId) return;
          // Emit locally using the original channel name for cross-instance delivery
          super.emit(envelope.channel, envelope.data);
        } catch {
          // Ignore malformed messages
        }
      });

      this._connected = true;
    })();

    try {
      await this._connectPromise;
    } finally {
      this._connectPromise = null;
    }
  }

  // Override emit to publish to Redis when available
  emit(event: string | symbol, ...args: unknown[]): boolean {
    if (typeof event === "string" && isRedisEnabled()) {
      const pub = getRedisPublisher();
      if (pub) {
        const envelope: RedisEnvelope = {
          _origin: this._instanceId,
          channel: event,
          data: args[0],
        };
        pub.publish(REDIS_CHANNEL, JSON.stringify(envelope)).catch(() => {
          // Silently fail — local emit still works
        });
      }
    }
    // Always emit locally for same-process consumers
    return super.emit(event, ...args);
  }

  emitChange(event: RealtimeEvent) {
    this.emit("change", event);
  }

  async disconnect(): Promise<void> {
    const pub = getRedisPublisher();
    const sub = getRedisSubscriber();
    if (sub) await sub.quit().catch(() => {});
    if (pub) await pub.quit().catch(() => {});
    this._connected = false;
  }
}

// Use globalThis to ensure a true process-level singleton across
// Next.js Route Handlers and Server Actions (which use separate module graphs)
const globalForEventBus = globalThis as unknown as {
  synapseEventBus: SynapseEventBus | undefined;
};

export const eventBus = (globalForEventBus.synapseEventBus ??= new SynapseEventBus());

export async function ensureEventBusConnected(): Promise<void> {
  if (!isRedisEnabled()) return;
  try {
    await eventBus.connect();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[EventBus] Redis connect failed, falling back to memory:", message);
  }
}
