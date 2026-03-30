import type { SynapseMcpClient } from "../mcp-client.js";
import { adminToolDefinitions } from "./admin-tool-definitions.js";
import { registerOpenClawTools, type OpenClawToolApi } from "./tool-registry.js";

export function registerAdminTools(api: OpenClawToolApi, mcpClient: SynapseMcpClient) {
  registerOpenClawTools(api, mcpClient, adminToolDefinitions);
}
