import { beforeEach, describe, expect, it, vi } from "vitest";

const mockClientConnect = vi.fn();
const mockClientCallTool = vi.fn();
const mockClientClose = vi.fn();
const mockClientConstructor = vi.fn();
const mockTransportConstructor = vi.fn();

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class MockClient {
    constructor(config: unknown) {
      mockClientConstructor(config);
    }

    connect = mockClientConnect;
    callTool = mockClientCallTool;
    close = mockClientClose;
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: class MockStreamableHTTPClientTransport {
    constructor(url: URL, options: unknown) {
      mockTransportConstructor(url, options);
    }
  },
}));

import { SynapseMcpClient } from "./mcp-client.js";

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("SynapseMcpClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClientConnect.mockResolvedValue(undefined);
    mockClientClose.mockResolvedValue(undefined);
  });

  it("lazily connects and parses JSON tool output", async () => {
    mockClientCallTool.mockResolvedValueOnce({
      isError: false,
      content: [{ type: "text", text: "{\"ok\":true}" }],
    });

    const logger = createLogger();
    const client = new SynapseMcpClient({
      synapseUrl: "https://synapse.example.com",
      apiKey: "syn_test_key",
      logger,
    });

    const result = await client.callTool("synapse_ping", { foo: "bar" });

    expect(result).toEqual({ ok: true });
    expect(mockTransportConstructor).toHaveBeenCalledWith(
      new URL("https://synapse.example.com/api/mcp"),
      expect.objectContaining({
        requestInit: {
          headers: {
            Authorization: "Bearer syn_test_key",
          },
        },
      }),
    );
    expect(mockClientConstructor).toHaveBeenCalledWith({
      name: "openclaw-synapse",
      version: "0.1.0",
    });
    expect(mockClientConnect).toHaveBeenCalledTimes(1);
    expect(mockClientCallTool).toHaveBeenCalledWith({
      name: "synapse_ping",
      arguments: { foo: "bar" },
    });
    expect(client.status).toBe("connected");
    expect(logger.info).toHaveBeenCalledWith("MCP connection established");
  });

  it("reconnects once when the MCP session expires", async () => {
    mockClientCallTool
      .mockRejectedValueOnce(new Error("404 session not found"))
      .mockResolvedValueOnce({
        isError: false,
        content: [{ type: "text", text: "{\"retried\":true}" }],
      });

    const logger = createLogger();
    const client = new SynapseMcpClient({
      synapseUrl: "https://synapse.example.com",
      apiKey: "syn_test_key",
      logger,
    });

    const result = await client.callTool("synapse_retry_me");

    expect(result).toEqual({ retried: true });
    expect(mockClientConnect).toHaveBeenCalledTimes(2);
    expect(mockClientClose).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith("MCP session expired, reconnecting...");
    expect(client.status).toBe("connected");
  });

  it("returns raw text when the tool output is not JSON and disconnects cleanly", async () => {
    mockClientCallTool.mockResolvedValueOnce({
      isError: false,
      content: [{ type: "text", text: "plain text result" }],
    });

    const logger = createLogger();
    const client = new SynapseMcpClient({
      synapseUrl: "https://synapse.example.com",
      apiKey: "syn_test_key",
      logger,
    });

    const result = await client.callTool("synapse_plain_text");
    await client.disconnect();

    expect(result).toBe("plain text result");
    expect(mockClientClose).toHaveBeenCalledTimes(1);
    expect(client.status).toBe("disconnected");
    expect(logger.info).toHaveBeenLastCalledWith("MCP connection closed");
  });
});
