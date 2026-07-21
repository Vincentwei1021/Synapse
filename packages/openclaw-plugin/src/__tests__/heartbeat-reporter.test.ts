import { describe, it, expect, vi } from "vitest";
import { HeartbeatReporter } from "../heartbeat-reporter";

describe("HeartbeatReporter", () => {
  it("POSTs connection metadata to the heartbeat endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const reporter = new HeartbeatReporter({
      synapseUrl: "https://synapse.example/",
      apiKey: "syn_x",
      host: "box-a",
      cwd: "/home/ubuntu/Synapse",
      pid: 4242,
      clientType: "openclaw",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger: { warn: vi.fn() },
    });

    await reporter.sendOnce();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://synapse.example/api/agent-connections/heartbeat");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer syn_x");
    expect(JSON.parse(init.body)).toMatchObject({
      host: "box-a", cwd: "/home/ubuntu/Synapse", pid: 4242, clientType: "openclaw",
    });
  });

  it("swallows network errors and logs a warning", async () => {
    const warn = vi.fn();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("boom"));
    const reporter = new HeartbeatReporter({
      synapseUrl: "https://s/", apiKey: "k", host: "h", cwd: "/c", pid: null,
      clientType: "openclaw", fetchImpl: fetchImpl as unknown as typeof fetch, logger: { warn },
    });
    await reporter.sendOnce();
    expect(warn).toHaveBeenCalled();
  });
});
