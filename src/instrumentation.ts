export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./services/notification-listener");

    if (process.env.SYNAPSE_GPU_TELEMETRY_AUTOSTART === "true") {
      const { startGpuTelemetryPoller } = await import("./services/compute.service");
      startGpuTelemetryPoller();
    }
  }
}
