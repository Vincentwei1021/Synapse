// src/mcp/tools/presence.ts
// MCP tool handler wrapper for automatic presence event emission.
// Wraps registerTool to detect target resources and emit presence events.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { eventBus, type PresenceEvent } from "@/lib/event-bus";
import type { AgentAuthContext } from "@/types/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "mcp" });

// Entity types that presence events support
const ENTITY_UUID_FIELDS: Record<string, PresenceEvent["entityType"]> = {
  experimentUuid: "experiment",
  researchQuestionUuid: "research_question",
  documentUuid: "document",
};

// Polymorphic targetType values
const TARGET_TYPE_MAP: Record<string, PresenceEvent["entityType"]> = {
  experiment: "experiment",
  research_question: "research_question",
  document: "document",
};

// Tool name prefixes that indicate "view" action
const VIEW_PREFIXES = ["synapse_get_", "synapse_list_", "synapse_search"];

function classifyAction(toolName: string): "view" | "mutate" {
  return VIEW_PREFIXES.some((p) => toolName.startsWith(p)) ? "view" : "mutate";
}

interface DetectedResource {
  entityType: PresenceEvent["entityType"];
  entityUuid: string;
  researchProjectUuid?: string;
}

function detectResource(params: Record<string, unknown>): DetectedResource | null {
  // Check entity-specific UUID fields
  for (const [field, entityType] of Object.entries(ENTITY_UUID_FIELDS)) {
    if (typeof params[field] === "string") {
      return {
        entityType,
        entityUuid: params[field] as string,
        researchProjectUuid:
          typeof params.researchProjectUuid === "string"
            ? params.researchProjectUuid
            : undefined,
      };
    }
  }

  // Check polymorphic targetUuid + targetType pattern
  if (
    typeof params.targetUuid === "string" &&
    typeof params.targetType === "string"
  ) {
    const entityType = TARGET_TYPE_MAP[params.targetType];
    if (entityType) {
      return {
        entityType,
        entityUuid: params.targetUuid as string,
        researchProjectUuid:
          typeof params.researchProjectUuid === "string"
            ? params.researchProjectUuid
            : undefined,
      };
    }
  }

  return null;
}

// Resolve researchProjectUuid from an entity UUID via DB lookup
async function resolveProjectUuid(
  entityType: PresenceEvent["entityType"],
  entityUuid: string,
  cache: Map<string, string>
): Promise<string | null> {
  const cacheKey = `${entityType}:${entityUuid}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    let projectUuid: string | null = null;

    switch (entityType) {
      case "experiment": {
        const exp = await prisma.experiment.findFirst({
          where: { uuid: entityUuid },
          select: { researchProject: { select: { uuid: true } } },
        });
        projectUuid = exp?.researchProject?.uuid ?? null;
        break;
      }
      case "research_question": {
        const rq = await prisma.researchQuestion.findFirst({
          where: { uuid: entityUuid },
          select: { researchProject: { select: { uuid: true } } },
        });
        projectUuid = rq?.researchProject?.uuid ?? null;
        break;
      }
      case "document": {
        const doc = await prisma.document.findFirst({
          where: { uuid: entityUuid },
          select: { researchProject: { select: { uuid: true } } },
        });
        projectUuid = doc?.researchProject?.uuid ?? null;
        break;
      }
    }

    if (projectUuid) {
      cache.set(cacheKey, projectUuid);
    }
    return projectUuid;
  } catch (err) {
    log.warn({ err }, "failed to resolve projectUuid");
    return null;
  }
}

/** Fire-and-forget presence emission — never blocks the tool handler */
async function emitPresenceAsync(
  resource: DetectedResource,
  toolName: string,
  auth: AgentAuthContext,
  cache: Map<string, string>
): Promise<void> {
  try {
    let researchProjectUuid = resource.researchProjectUuid;
    if (!researchProjectUuid) {
      researchProjectUuid =
        (await resolveProjectUuid(
          resource.entityType,
          resource.entityUuid,
          cache
        )) ?? undefined;
    }

    if (researchProjectUuid) {
      const presenceEvent: PresenceEvent = {
        type: "presence",
        companyUuid: auth.companyUuid,
        researchProjectUuid,
        entityType: resource.entityType,
        entityUuid: resource.entityUuid,
        agentUuid: auth.actorUuid,
        agentName: auth.agentName,
        action: classifyAction(toolName),
        timestamp: Date.now(),
      };
      eventBus.emitPresence(presenceEvent);
    }
  } catch (err) {
    log.warn({ err }, "failed to emit presence event");
  }
}

/**
 * Wraps a McpServer to automatically emit presence events for all registered tools.
 * Call this once after creating the server, before registering tools.
 */
export function enablePresence(server: McpServer, auth: AgentAuthContext): void {
  const projectUuidCache = new Map<string, string>();

  const originalRegisterTool = server.registerTool.bind(server);

  server.registerTool = function (
    name: string,
    config: unknown,
    handler: unknown
  ) {
    const originalHandler = handler as (
      params: Record<string, unknown>,
      extra: unknown
    ) => Promise<unknown>;

    const wrappedHandler = async (
      params: Record<string, unknown>,
      extra: unknown
    ) => {
      const resource = detectResource(params);
      if (resource) {
        // Fire-and-forget — never awaited
        emitPresenceAsync(resource, name, auth, projectUuidCache);
      }
      return originalHandler(params, extra);
    };

    return originalRegisterTool(
      name,
      config as Parameters<typeof originalRegisterTool>[1],
      wrappedHandler as Parameters<typeof originalRegisterTool>[2]
    );
  } as typeof server.registerTool;
}

// Exported for testing
export { detectResource, classifyAction, resolveProjectUuid };
