import type { SynapseMcpClient } from "../mcp-client.js";
import { commonToolDefinitions } from "./common-tool-definitions.js";
import { registerOpenClawTools } from "./tool-registry.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerCommonTools(api: any, mcpClient: SynapseMcpClient) {
  registerOpenClawTools(api, mcpClient, commonToolDefinitions);
}
