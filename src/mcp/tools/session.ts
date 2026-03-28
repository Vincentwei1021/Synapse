// src/mcp/tools/session.ts
// Agent Session MCP tools (available to all roles)
// UUID-Based Architecture: All operations use UUIDs

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AgentAuthContext } from "@/types/auth";
import * as sessionService from "@/services/session.service";
import {
  createMcpTool,
  defineMcpTools,
  jsonTextResult,
  type McpTextResult,
  registerMcpTools,
  textResult,
} from "./tool-registry";

function isOwnedByActor(
  auth: AgentAuthContext,
  session: { agentUuid: string }
) {
  return session.agentUuid === auth.actorUuid;
}

export function registerSessionTools(server: McpServer, auth: AgentAuthContext) {
  type OwnedSessionResult =
    | { ok: true; session: Awaited<ReturnType<typeof sessionService.getSession>> extends infer T ? Exclude<T, null> : never }
    | { ok: false; error: McpTextResult };

  const getOwnedSession = async (sessionUuid: string) => {
    const session = await sessionService.getSession(auth.companyUuid, sessionUuid);
    if (!session) {
      return { ok: false, error: textResult("Session not found", true) } as OwnedSessionResult;
    }

    if (!isOwnedByActor(auth, session)) {
      return { ok: false, error: textResult("No permission to operate this Session", true) } as OwnedSessionResult;
    }

    return { ok: true, session } as OwnedSessionResult;
  };

  const sessionTools = defineMcpTools([
    createMcpTool({
      name: "synapse_list_sessions",
      description: "List all Sessions for the current Agent",
      inputSchema: z.object({
        status: z.enum(["active", "inactive", "closed"]).optional().describe("Filter by status"),
      }),
      async execute({ status }) {
        const sessions = await sessionService.listAgentSessions(
          auth.companyUuid,
          auth.actorUuid,
          status
        );

        return jsonTextResult(sessions);
      },
    }),
    createMcpTool({
      name: "synapse_get_session",
      description: "Get Session details and active checkins",
      inputSchema: z.object({
        sessionUuid: z.string().describe("Session UUID"),
      }),
      async execute({ sessionUuid }) {
        const session = await sessionService.getSession(auth.companyUuid, sessionUuid);
        if (!session) {
          return textResult("Session not found", true);
        }

        if (!isOwnedByActor(auth, session)) {
          return textResult("No permission to access this Session", true);
        }

        return jsonTextResult(session);
      },
    }),
    createMcpTool({
      name: "synapse_create_session",
      description: "Create a new Agent Session. TIP: Before creating, call synapse_list_sessions first to check for existing sessions that can be reopened with synapse_reopen_session.",
      inputSchema: z.object({
        name: z.string().describe("Session name (e.g. 'frontend-worker')"),
        description: z.string().optional().describe("Session description"),
        expiresAt: z.string().optional().describe("Expiration time (ISO 8601)"),
      }),
      async execute({ name, description, expiresAt }) {
        const session = await sessionService.createSession({
          companyUuid: auth.companyUuid,
          agentUuid: auth.actorUuid,
          name,
          description,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        });

        return jsonTextResult({ uuid: session.uuid, name: session.name, status: session.status });
      },
    }),
    createMcpTool({
      name: "synapse_close_session",
      description: "Close a Session (batch checkout all checkins)",
      inputSchema: z.object({
        sessionUuid: z.string().describe("Session UUID"),
      }),
      async execute({ sessionUuid }) {
        const result = await getOwnedSession(sessionUuid);
        if (!result.ok) {
          return result.error;
        }

        const closed = await sessionService.closeSession(auth.companyUuid, result.session.uuid);
        return jsonTextResult({ uuid: closed.uuid, status: closed.status });
      },
    }),
    createMcpTool({
      name: "synapse_reopen_session",
      description: "Reopen a closed Session (closed -> active). Use this to reuse a previous session instead of creating a new one.",
      inputSchema: z.object({
        sessionUuid: z.string().describe("Session UUID"),
      }),
      async execute({ sessionUuid }) {
        const result = await getOwnedSession(sessionUuid);
        if (!result.ok) {
          return result.error;
        }

        if (result.session.status !== "closed") {
          return textResult(`Session is ${result.session.status}, only closed sessions can be reopened`, true);
        }

        const reopened = await sessionService.reopenSession(auth.companyUuid, result.session.uuid);
        return jsonTextResult({ uuid: reopened.uuid, status: reopened.status });
      },
    }),
    createMcpTool({
      name: "synapse_session_checkin_experiment_run",
      description: "Check in a Session to a specified Experiment Run",
      inputSchema: z.object({
        sessionUuid: z.string().describe("Session UUID"),
        runUuid: z.string().describe("Experiment Run UUID"),
      }),
      async execute({ sessionUuid, runUuid }) {
        const result = await getOwnedSession(sessionUuid);
        if (!result.ok) {
          return result.error;
        }

        const checkin = await sessionService.sessionCheckinToRun(
          auth.companyUuid,
          result.session.uuid,
          runUuid
        );

        return jsonTextResult({ sessionUuid, runUuid, checkedInAt: checkin.checkinAt });
      },
    }),
    createMcpTool({
      name: "synapse_session_checkout_experiment_run",
      description: "Check out a Session from a specified Experiment Run",
      inputSchema: z.object({
        sessionUuid: z.string().describe("Session UUID"),
        runUuid: z.string().describe("Experiment Run UUID"),
      }),
      async execute({ sessionUuid, runUuid }) {
        const result = await getOwnedSession(sessionUuid);
        if (!result.ok) {
          return result.error;
        }

        await sessionService.sessionCheckoutFromRun(auth.companyUuid, result.session.uuid, runUuid);

        return textResult(`Successfully checked out from experiment run ${runUuid}`);
      },
    }),
    createMcpTool({
      name: "synapse_session_heartbeat",
      description: "Session heartbeat (updates lastActiveAt)",
      inputSchema: z.object({
        sessionUuid: z.string().describe("Session UUID"),
      }),
      async execute({ sessionUuid }) {
        const result = await getOwnedSession(sessionUuid);
        if (!result.ok) {
          return result.error;
        }

        await sessionService.heartbeatSession(auth.companyUuid, result.session.uuid);
        return textResult(`Heartbeat successful: ${new Date().toISOString()}`);
      },
    }),
  ]);

  registerMcpTools(server, sessionTools);
}
