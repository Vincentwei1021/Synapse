// src/mcp/server.ts
// MCP Server instance — 5-permission model

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPublicTools } from "./tools/public";
import { registerSessionTools } from "./tools/session";
import { registerComputeTools } from "./tools/compute";
import { registerLiteratureTools } from "./tools/literature";
import { registerResearchTools } from "./tools/research-lead";
import { registerAdminTools } from "./tools/pi";
import type { AgentAuthContext } from "@/types/auth";

export function createMcpServer(auth: AgentAuthContext): McpServer {
  const server = new McpServer({
    name: "synapse",
    version: "1.0.0",
  });

  const roles = auth.roles || [];
  const hasRole = (...names: string[]) => roles.some(r => names.includes(r));

  // All agents — read operations, comments, notifications, sessions
  registerPublicTools(server, auth);
  registerSessionTools(server, auth);

  // pre_research — literature search, paper collection
  if (hasRole("pre_research")) {
    registerLiteratureTools(server, auth);
  }

  // research — research question CRUD, project ideas
  // report — document CRUD, synthesis (registered via same function)
  if (hasRole("research", "report", "research_lead", "research_lead_agent")) {
    registerResearchTools(server, auth);
  }

  // experiment — execution, compute, metrics, baseline
  if (hasRole("experiment", "researcher", "researcher_agent")) {
    registerComputeTools(server, auth);
  }

  // admin — create/delete projects, manage groups, review/close RQs
  if (hasRole("admin", "pi", "pi_agent")) {
    registerAdminTools(server, auth);
  }

  return server;
}
