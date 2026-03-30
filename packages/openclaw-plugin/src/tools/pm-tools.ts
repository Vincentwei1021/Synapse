import type { SynapseMcpClient } from "../mcp-client.js";
import { pmToolDefinitions } from "./pm-tool-definitions.js";
import { registerOpenClawTools } from "./tool-registry.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerPmTools(api: any, mcpClient: SynapseMcpClient) {
  registerOpenClawTools(api, mcpClient, pmToolDefinitions);
}
