import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SynapseSseListener } from "./sse-listener.js";

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createSseResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("SynapseSseListener", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("parses SSE data events and forwards them to onEvent", async () => {
    const logger = createLogger();
    const onEvent = vi.fn();
    const onReconnect = vi.fn().mockResolvedValue(undefined);

    const fetchMock = vi.fn().mockResolvedValue(
      createSseResponse([
        ": heartbeat\n\n",
        "data: {\"type\":\"new_notification\",\"notificationUuid\":\"notification-1\"}\n\n",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const listener = new SynapseSseListener({
      synapseUrl: "https://synapse.example.com/",
      apiKey: "syn_test_key",
      onEvent,
      onReconnect,
      logger,
    });

    await listener.connect();
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://synapse.example.com/api/events/notifications",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer syn_test_key",
          Accept: "text/event-stream",
        },
      }),
    );
    expect(onEvent).toHaveBeenCalledWith({
      type: "new_notification",
      notificationUuid: "notification-1",
    });
    expect(listener.status).toBe("reconnecting");
    expect(logger.info).toHaveBeenCalledWith("[Synapse] SSE connection established");

    listener.disconnect();
  });

  it("reconnects after an initial fetch failure and runs onReconnect once connected", async () => {
    const logger = createLogger();
    const onEvent = vi.fn();
    const onReconnect = vi.fn().mockResolvedValue(undefined);

    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(createSseResponse(["data: {\"type\":\"count_update\",\"unreadCount\":2}\n\n"]));
    vi.stubGlobal("fetch", fetchMock);

    const listener = new SynapseSseListener({
      synapseUrl: "https://synapse.example.com",
      apiKey: "syn_test_key",
      onEvent,
      onReconnect,
      logger,
    });

    await listener.connect();
    expect(listener.status).toBe("reconnecting");
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("SSE connection failed"));
    expect(logger.info).toHaveBeenCalledWith("SSE reconnecting in 1000ms");

    await vi.advanceTimersByTimeAsync(1000);
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onReconnect).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({
      type: "count_update",
      unreadCount: 2,
    });

    listener.disconnect();
  });

  it("warns on malformed JSON payloads without crashing the listener", async () => {
    const logger = createLogger();
    const onEvent = vi.fn();
    const onReconnect = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(createSseResponse(["data: not-json\n\n"])),
    );

    const listener = new SynapseSseListener({
      synapseUrl: "https://synapse.example.com",
      apiKey: "syn_test_key",
      onEvent,
      onReconnect,
      logger,
    });

    await listener.connect();
    await flushMicrotasks();

    expect(onEvent).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("SSE JSON parse error"));

    listener.disconnect();
  });
});
