"use server";

import { redirect } from "next/navigation";
import { getServerAuthContext } from "@/lib/auth-server";
import { VALID_AGENT_TYPES } from "@/lib/agent-transport";
import { isValidAgentColorName, DEFAULT_AGENT_COLOR_NAME } from "@/lib/agent-colors";
import {
  listApiKeys,
  createAgent,
  createApiKey,
  getAgentByUuid,
  getApiKey,
  revokeApiKey,
  updateAgent,
  syncApiKeyNames,
} from "@/services/agent.service";
import {
  getSession,
  listAgentSessions,
  closeSession,
  reopenSession,
  type SessionResponse,
} from "@/services/session.service";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "settings" });

interface ApiKeyResponse {
  uuid: string;
  keyPrefix: string;
  name: string | null;
  lastUsed: string | null;
  expiresAt: string | null;
  createdAt: string;
  roles: string[];
  agentUuid: string;
  persona: string | null;
}

export async function getApiKeysAction(): Promise<{
  success: boolean;
  data?: ApiKeyResponse[];
  error?: string;
}> {
  const auth = await getServerAuthContext();
  if (!auth) {
    redirect("/login");
  }

  try {
    const { apiKeys } = await listApiKeys(auth.companyUuid, 0, 100, auth.actorUuid);

    const data = apiKeys.map((key) => ({
      uuid: key.uuid,
      keyPrefix: key.keyPrefix,
      name: key.agent?.name || key.name,
      lastUsed: key.lastUsed?.toISOString() || null,
      expiresAt: key.expiresAt?.toISOString() || null,
      createdAt: key.createdAt.toISOString(),
      roles: key.agent?.roles || [],
      agentUuid: key.agent?.uuid || "",
      persona: key.agent?.persona || null,
    }));

    return { success: true, data };
  } catch (error) {
    log.error({ err: error }, "Failed to fetch API keys");
    return { success: false, error: "Failed to fetch API keys" };
  }
}

interface CreateAgentKeyInput {
  name: string;
  roles: string[];
  type?: string;
  persona: string | null;
  color?: string | null;
}

const VALID_AGENT_ROLES = new Set(["pre_research", "research", "experiment", "report", "admin"]);

export async function createAgentAndKeyAction(input: CreateAgentKeyInput): Promise<{
  success: boolean;
  key?: string;
  error?: string;
}> {
  const auth = await getServerAuthContext();
  if (!auth) {
    redirect("/login");
  }

  const name = input.name.trim();
  const roles = [...new Set(input.roles)];
  if (!name || roles.length === 0) {
    return { success: false, error: "Name and at least one role are required" };
  }
  if (roles.some((role) => !VALID_AGENT_ROLES.has(role))) {
    return { success: false, error: "Invalid agent role" };
  }
  if (input.type && !VALID_AGENT_TYPES.includes(input.type)) {
    return { success: false, error: "Invalid agent type" };
  }

  const resolvedColor = input.color && isValidAgentColorName(input.color)
    ? input.color
    : DEFAULT_AGENT_COLOR_NAME;

  try {
    const agent = await createAgent({
      companyUuid: auth.companyUuid,
      name,
      roles,
      type: input.type || "openclaw",
      ownerUuid: auth.actorUuid,
      persona: input.persona?.trim() || null,
      color: resolvedColor,
    });

    const apiKey = await createApiKey({
      companyUuid: auth.companyUuid,
      agentUuid: agent.uuid,
      name,
    });

    return { success: true, key: apiKey.key };
  } catch (error) {
    log.error({ err: error }, "Failed to create agent and API key");
    return { success: false, error: "Failed to create API key" };
  }
}

export async function deleteApiKeyAction(uuid: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const auth = await getServerAuthContext();
  if (!auth) {
    redirect("/login");
  }

  try {
    // Verify the API key belongs to the current user
    const apiKey = await getApiKey(auth.companyUuid, uuid, auth.actorUuid);
    if (!apiKey) {
      return { success: false, error: "API key not found" };
    }

    await revokeApiKey(apiKey.uuid);
    return { success: true };
  } catch (error) {
    log.error({ err: error }, "Failed to delete API key");
    return { success: false, error: "Failed to delete API key" };
  }
}

export async function getAgentSessionsAction(agentUuid: string): Promise<{
  success: boolean;
  data?: SessionResponse[];
  error?: string;
}> {
  const auth = await getServerAuthContext();
  if (!auth) {
    redirect("/login");
  }

  try {
    const agent = await getAgentByUuid(auth.companyUuid, agentUuid, auth.actorUuid);
    if (!agent) {
      return { success: false, error: "Agent not found" };
    }

    const sessions = await listAgentSessions(auth.companyUuid, agentUuid);
    return { success: true, data: sessions };
  } catch (error) {
    log.error({ err: error }, "Failed to fetch agent sessions");
    return { success: false, error: "Failed to fetch agent sessions" };
  }
}

export async function closeSessionAction(sessionUuid: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const auth = await getServerAuthContext();
  if (!auth) {
    redirect("/login");
  }

  try {
    const session = await getSession(auth.companyUuid, sessionUuid);
    if (!session) {
      return { success: false, error: "Session not found" };
    }

    const agent = await getAgentByUuid(auth.companyUuid, session.agentUuid, auth.actorUuid);
    if (!agent) {
      return { success: false, error: "Session not found" };
    }

    await closeSession(auth.companyUuid, sessionUuid);
    return { success: true };
  } catch (error) {
    log.error({ err: error }, "Failed to close session");
    return { success: false, error: "Failed to close session" };
  }
}

export async function reopenSessionAction(sessionUuid: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const auth = await getServerAuthContext();
  if (!auth) {
    redirect("/login");
  }

  try {
    const session = await getSession(auth.companyUuid, sessionUuid);
    if (!session) {
      return { success: false, error: "Session not found" };
    }

    const agent = await getAgentByUuid(auth.companyUuid, session.agentUuid, auth.actorUuid);
    if (!agent) {
      return { success: false, error: "Session not found" };
    }

    await reopenSession(auth.companyUuid, sessionUuid);
    return { success: true };
  } catch (error) {
    log.error({ err: error }, "Failed to reopen session");
    return { success: false, error: "Failed to reopen session" };
  }
}

interface UpdateAgentInput {
  agentUuid: string;
  name: string;
  roles: string[];
  type?: string;
  persona: string | null;
  color?: string | null;
}

export async function updateAgentAction(input: UpdateAgentInput): Promise<{
  success: boolean;
  error?: string;
}> {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const agent = await getAgentByUuid(auth.companyUuid, input.agentUuid, auth.actorUuid);
    if (!agent) {
      return { success: false, error: "Agent not found" };
    }

    const name = input.name.trim();
    const roles = [...new Set(input.roles)];
    if (!name || roles.length === 0) {
      return { success: false, error: "Name and at least one role are required" };
    }
    if (roles.some((role) => !VALID_AGENT_ROLES.has(role))) {
      return { success: false, error: "Invalid agent role" };
    }
    if (input.type !== undefined && !VALID_AGENT_TYPES.includes(input.type)) {
      return { success: false, error: "Invalid agent type" };
    }

    let nextColor: string | null | undefined = undefined;
    if (input.color !== undefined) {
      if (input.color === null) {
        nextColor = null;
      } else if (isValidAgentColorName(input.color)) {
        nextColor = input.color;
      } else {
        return { success: false, error: "Invalid agent color" };
      }
    }

    await updateAgent(input.agentUuid, {
      name,
      roles,
      type: input.type,
      persona: input.persona?.trim() || null,
      ...(nextColor !== undefined ? { color: nextColor } : {}),
    }, auth.companyUuid);

    await syncApiKeyNames(input.agentUuid, name);

    return { success: true };
  } catch (error) {
    log.error({ err: error }, "Failed to update agent");
    return { success: false, error: "Failed to update agent" };
  }
}
