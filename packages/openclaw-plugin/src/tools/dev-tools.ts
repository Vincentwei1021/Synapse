import type { SynapseMcpClient } from "../mcp-client.js";
import { devToolDefinitions } from "./dev-tool-definitions.js";
import { registerOpenClawTools, type OpenClawToolApi } from "./tool-registry.js";

export function registerDevTools(api: OpenClawToolApi, mcpClient: SynapseMcpClient) {
  registerOpenClawTools(api, mcpClient, devToolDefinitions);
}
