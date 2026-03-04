import { describe, it, expect, vi, beforeEach } from "vitest";
import { GenericEventRouter } from "../event-router.js";
import type { SseNotificationEvent } from "../sse-listener.js";

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("GenericEventRouter", () => {
  let triggerAgent: ReturnType<typeof vi.fn>;
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(() => {
    triggerAgent = vi.fn();
    logger = makeLogger();
  });

  // ---------- (a) Happy path ----------

  it("calls triggerAgent with correct message and metadata when all fields present", () => {
    const router = new GenericEventRouter({ triggerAgent, logger });

    const event: SseNotificationEvent = {
      type: "some_event",
      event_type: "deployment",
      resource_type: "service",
      resource_id: "svc-123",
      message: "Deployment succeeded for service-api",
    };

    router.dispatch(event);

    expect(triggerAgent).toHaveBeenCalledOnce();
    expect(triggerAgent).toHaveBeenCalledWith("Deployment succeeded for service-api", {
      event_type: "deployment",
      resource_type: "service",
      resource_id: "svc-123",
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  // ---------- (b) Missing required fields ----------

  it("warns and skips when event_type is missing", () => {
    const router = new GenericEventRouter({ triggerAgent, logger });

    const event: SseNotificationEvent = {
      type: "x",
      resource_type: "service",
      resource_id: "svc-1",
      message: "hello",
    };

    router.dispatch(event);

    expect(triggerAgent).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn.mock.calls[0][0]).toContain("event_type=MISSING");
  });

  it("warns and skips when resource_type is missing", () => {
    const router = new GenericEventRouter({ triggerAgent, logger });

    const event: SseNotificationEvent = {
      type: "x",
      event_type: "deploy",
      resource_id: "svc-1",
      message: "hello",
    };

    router.dispatch(event);

    expect(triggerAgent).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn.mock.calls[0][0]).toContain("resource_type=MISSING");
  });

  it("warns and skips when resource_id is missing", () => {
    const router = new GenericEventRouter({ triggerAgent, logger });

    const event: SseNotificationEvent = {
      type: "x",
      event_type: "deploy",
      resource_type: "service",
      message: "hello",
    };

    router.dispatch(event);

    expect(triggerAgent).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn.mock.calls[0][0]).toContain("resource_id=MISSING");
  });

  it("warns and skips when message is missing", () => {
    const router = new GenericEventRouter({ triggerAgent, logger });

    const event: SseNotificationEvent = {
      type: "x",
      event_type: "deploy",
      resource_type: "service",
      resource_id: "svc-1",
    };

    router.dispatch(event);

    expect(triggerAgent).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn.mock.calls[0][0]).toContain("message=MISSING");
  });

  // ---------- (c) Custom messageField ----------

  it("reads from custom messageField instead of 'message'", () => {
    const router = new GenericEventRouter({
      triggerAgent,
      logger,
      messageField: "body",
    });

    const event: SseNotificationEvent = {
      type: "x",
      event_type: "alert",
      resource_type: "host",
      resource_id: "host-42",
      body: "CPU usage exceeded 90%",
    };

    router.dispatch(event);

    expect(triggerAgent).toHaveBeenCalledOnce();
    expect(triggerAgent).toHaveBeenCalledWith("CPU usage exceeded 90%", {
      event_type: "alert",
      resource_type: "host",
      resource_id: "host-42",
    });
  });

  it("warns when custom messageField is missing from event", () => {
    const router = new GenericEventRouter({
      triggerAgent,
      logger,
      messageField: "body",
    });

    const event: SseNotificationEvent = {
      type: "x",
      event_type: "alert",
      resource_type: "host",
      resource_id: "host-42",
      message: "this is in message, not body",
    };

    router.dispatch(event);

    expect(triggerAgent).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn.mock.calls[0][0]).toContain("body=MISSING");
  });

  // ---------- (d) Non-string message values ----------

  it("converts numeric message to string", () => {
    const router = new GenericEventRouter({ triggerAgent, logger });

    const event: SseNotificationEvent = {
      type: "x",
      event_type: "metric",
      resource_type: "gauge",
      resource_id: "cpu-1",
      message: 42,
    };

    router.dispatch(event);

    expect(triggerAgent).toHaveBeenCalledOnce();
    expect(triggerAgent.mock.calls[0][0]).toBe("42");
  });

  it("converts object message to string", () => {
    const router = new GenericEventRouter({ triggerAgent, logger });

    const obj = { detail: "something happened" };
    const event: SseNotificationEvent = {
      type: "x",
      event_type: "webhook",
      resource_type: "endpoint",
      resource_id: "ep-7",
      message: obj,
    };

    router.dispatch(event);

    expect(triggerAgent).toHaveBeenCalledOnce();
    expect(triggerAgent.mock.calls[0][0]).toBe(String(obj));
  });
});
