// src/mcp/tools/session.ts
// Agent Session MCP tools (available to all roles)
// UUID-Based Architecture: All operations use UUIDs

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AgentAuthContext } from "@/types/auth";
import * as sessionService from "@/services/session.service";

export function registerSessionTools(server: McpServer, auth: AgentAuthContext) {
  // synapse_list_sessions - List current agent's sessions
  server.registerTool(
    "synapse_list_sessions",
    {
      description: "List all Sessions for the current Agent",
      inputSchema: z.object({
        status: z.enum(["active", "inactive", "closed"]).optional().describe("Filter by status"),
      }),
    },
    async ({ status }) => {
      const sessions = await sessionService.listAgentSessions(
        auth.companyUuid,
        auth.actorUuid,
        status
      );

      return {
        content: [{ type: "text", text: JSON.stringify(sessions, null, 2) }],
      };
    }
  );

  // synapse_get_session - Get session details
  server.registerTool(
    "synapse_get_session",
    {
      description: "Get Session details and active checkins",
      inputSchema: z.object({
        sessionUuid: z.string().describe("Session UUID"),
      }),
    },
    async ({ sessionUuid }) => {
      const session = await sessionService.getSession(auth.companyUuid, sessionUuid);
      if (!session) {
        return { content: [{ type: "text", text: "Session not found" }], isError: true };
      }

      if (session.agentUuid !== auth.actorUuid) {
        return { content: [{ type: "text", text: "No permission to access this Session" }], isError: true };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(session, null, 2) }],
      };
    }
  );

  // synapse_create_session - Create a new session
  server.registerTool(
    "synapse_create_session",
    {
      description: "Create a new Agent Session. TIP: Before creating, call synapse_list_sessions first to check for existing sessions that can be reopened with synapse_reopen_session.",
      inputSchema: z.object({
        name: z.string().describe("Session name (e.g. 'frontend-worker')"),
        description: z.string().optional().describe("Session description"),
        expiresAt: z.string().optional().describe("Expiration time (ISO 8601)"),
      }),
    },
    async ({ name, description, expiresAt }) => {
      const session = await sessionService.createSession({
        companyUuid: auth.companyUuid,
        agentUuid: auth.actorUuid,
        name,
        description,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ uuid: session.uuid, name: session.name, status: session.status }, null, 2) }],
      };
    }
  );

  // synapse_close_session - Close a session
  server.registerTool(
    "synapse_close_session",
    {
      description: "Close a Session (batch checkout all checkins)",
      inputSchema: z.object({
        sessionUuid: z.string().describe("Session UUID"),
      }),
    },
    async ({ sessionUuid }) => {
      const session = await sessionService.getSession(auth.companyUuid, sessionUuid);
      if (!session) {
        return { content: [{ type: "text", text: "Session not found" }], isError: true };
      }

      if (session.agentUuid !== auth.actorUuid) {
        return { content: [{ type: "text", text: "No permission to close this Session" }], isError: true };
      }

      const closed = await sessionService.closeSession(auth.companyUuid, sessionUuid);

      return {
        content: [{ type: "text", text: JSON.stringify({ uuid: closed.uuid, status: closed.status }, null, 2) }],
      };
    }
  );

  // synapse_reopen_session - Reopen a closed session
  server.registerTool(
    "synapse_reopen_session",
    {
      description: "Reopen a closed Session (closed -> active). Use this to reuse a previous session instead of creating a new one.",
      inputSchema: z.object({
        sessionUuid: z.string().describe("Session UUID"),
      }),
    },
    async ({ sessionUuid }) => {
      const session = await sessionService.getSession(auth.companyUuid, sessionUuid);
      if (!session) {
        return { content: [{ type: "text", text: "Session not found" }], isError: true };
      }

      if (session.agentUuid !== auth.actorUuid) {
        return { content: [{ type: "text", text: "No permission to reopen this Session" }], isError: true };
      }

      if (session.status !== "closed") {
        return { content: [{ type: "text", text: `Session is ${session.status}, only closed sessions can be reopened` }], isError: true };
      }

      const reopened = await sessionService.reopenSession(auth.companyUuid, sessionUuid);

      return {
        content: [{ type: "text", text: JSON.stringify({ uuid: reopened.uuid, status: reopened.status }, null, 2) }],
      };
    }
  );

  // synapse_session_checkin_experiment_run - Check in session to an experiment run
  server.registerTool(
    "synapse_session_checkin_experiment_run",
    {
      description: "Check in a Session to a specified Experiment Run",
      inputSchema: z.object({
        sessionUuid: z.string().describe("Session UUID"),
        runUuid: z.string().describe("Experiment Run UUID"),
      }),
    },
    async ({ sessionUuid, runUuid }) => {
      const session = await sessionService.getSession(auth.companyUuid, sessionUuid);
      if (!session) {
        return { content: [{ type: "text", text: "Session not found" }], isError: true };
      }

      if (session.agentUuid !== auth.actorUuid) {
        return { content: [{ type: "text", text: "No permission to operate this Session" }], isError: true };
      }

      const checkin = await sessionService.sessionCheckinToRun(
        auth.companyUuid,
        sessionUuid,
        runUuid
      );

      return {
        content: [{ type: "text", text: JSON.stringify({ sessionUuid, runUuid, checkedInAt: checkin.checkinAt }, null, 2) }],
      };
    }
  );

  // synapse_session_checkout_experiment_run - Check out session from an experiment run
  server.registerTool(
    "synapse_session_checkout_experiment_run",
    {
      description: "Check out a Session from a specified Experiment Run",
      inputSchema: z.object({
        sessionUuid: z.string().describe("Session UUID"),
        runUuid: z.string().describe("Experiment Run UUID"),
      }),
    },
    async ({ sessionUuid, runUuid }) => {
      const session = await sessionService.getSession(auth.companyUuid, sessionUuid);
      if (!session) {
        return { content: [{ type: "text", text: "Session not found" }], isError: true };
      }

      if (session.agentUuid !== auth.actorUuid) {
        return { content: [{ type: "text", text: "No permission to operate this Session" }], isError: true };
      }

      await sessionService.sessionCheckoutFromRun(auth.companyUuid, sessionUuid, runUuid);

      return {
        content: [{ type: "text", text: `Successfully checked out from experiment run ${runUuid}` }],
      };
    }
  );

  // synapse_session_heartbeat - Session heartbeat
  server.registerTool(
    "synapse_session_heartbeat",
    {
      description: "Session heartbeat (updates lastActiveAt)",
      inputSchema: z.object({
        sessionUuid: z.string().describe("Session UUID"),
      }),
    },
    async ({ sessionUuid }) => {
      const session = await sessionService.getSession(auth.companyUuid, sessionUuid);
      if (!session) {
        return { content: [{ type: "text", text: "Session not found" }], isError: true };
      }

      if (session.agentUuid !== auth.actorUuid) {
        return { content: [{ type: "text", text: "No permission to operate this Session" }], isError: true };
      }

      await sessionService.heartbeatSession(auth.companyUuid, sessionUuid);

      return {
        content: [{ type: "text", text: `Heartbeat successful: ${new Date().toISOString()}` }],
      };
    }
  );
}
