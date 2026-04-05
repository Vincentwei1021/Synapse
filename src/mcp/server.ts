// src/mcp/server.ts
// MCP Server instance (ARCHITECTURE.md §5.2)

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPublicTools } from "./tools/public";
import { registerResearchLeadTools } from "./tools/research-lead";
import { registerResearcherTools } from "./tools/researcher";
import { registerPiTools } from "./tools/pi";
import { registerSessionTools } from "./tools/session";
import { registerComputeTools } from "./tools/compute";
import { registerLiteratureTools } from "./tools/literature";
import type { AgentAuthContext } from "@/types/auth";

// MCP Server factory function
export function createMcpServer(auth: AgentAuthContext): McpServer {
  const server = new McpServer({
    name: "synapse",
    version: "1.0.0",
  });

  // Register public tools (available to all Agents)
  registerPublicTools(server, auth);

  // Register Session tools (available to all Agents)
  registerSessionTools(server, auth);
  registerComputeTools(server, auth);
  registerLiteratureTools(server, auth);

  // Register role-specific tools based on agent roles
  const roles = auth.roles || [];

  // Helper: check if agent has any of the given role names
  const hasRole = (...names: string[]) => roles.some(r => names.includes(r));

  // Old roles (backward compat): research_lead / research_lead_agent, researcher / researcher_agent, pi / pi_agent
  // New permissions: pre_research, research, experiment, report
  const hasResearchLeadRole = hasRole("research_lead", "research_lead_agent", "research", "report");
  const hasResearcherRole = hasRole("researcher", "researcher_agent", "experiment");
  const hasPiRole = hasRole("pi", "pi_agent");

  if (hasPiRole) {
    registerPiTools(server, auth);
  }
  if (hasResearchLeadRole || hasPiRole) {
    registerResearchLeadTools(server, auth);
  }
  if (hasResearcherRole || hasPiRole) {
    registerResearcherTools(server, auth);
  }

  return server;
}
