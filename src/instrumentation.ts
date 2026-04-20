export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureEventBusConnected } = await import("./lib/event-bus");
    void ensureEventBusConnected();

    await import("./services/notification-listener");

    const { restoreEnabledTelemetry } = await import("./services/gpu-telemetry.service");
    void restoreEnabledTelemetry();
  }
}
