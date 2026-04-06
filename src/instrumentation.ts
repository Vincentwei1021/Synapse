export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./services/notification-listener");

    const { restoreEnabledTelemetry } = await import("./services/gpu-telemetry.service");
    void restoreEnabledTelemetry();
  }
}
