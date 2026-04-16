import { NextRequest } from "next/server";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api-handler";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isRealtimeAgent } from "@/lib/agent-transport";
import * as notificationService from "@/services/notification.service";
import { eventBus } from "@/lib/event-bus";

type RouteContext = { params: Promise<{ uuid: string }> };

const bodySchema = z.object({ agentUuid: z.string(), customPrompt: z.string().optional() });

export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) return errors.unauthorized();
    if (!isUser(auth)) return errors.forbidden("Only users can trigger auto-search");

    const { uuid: projectUuid } = await context.params;
    const project = await prisma.researchProject.findFirst({
      where: { uuid: projectUuid, companyUuid: auth.companyUuid },
      select: { name: true },
    });
    if (!project) return errors.notFound("Research Project");

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return errors.validationError(parsed.error.flatten().fieldErrors);

    // Validate agent supports realtime dispatch
    const agent = await prisma.agent.findFirst({
      where: { uuid: parsed.data.agentUuid, companyUuid: auth.companyUuid },
      select: { type: true },
    });
    if (!agent) return errors.notFound("Agent");
    if (!isRealtimeAgent(agent.type)) {
      return errors.validationError({
        agentUuid: "This agent does not support real-time task dispatch. Select an OpenClaw agent.",
      });
    }

    // Mark auto-search as active
    await prisma.researchProject.update({
      where: { uuid: projectUuid },
      data: { autoSearchActiveAgentUuid: parsed.data.agentUuid },
    });
    eventBus.emitChange({
      companyUuid: auth.companyUuid,
      researchProjectUuid: projectUuid,
      entityType: "research_project",
      entityUuid: projectUuid,
      action: "updated",
    });

    await notificationService.create({
      companyUuid: auth.companyUuid,
      researchProjectUuid: projectUuid,
      recipientType: "agent",
      recipientUuid: parsed.data.agentUuid,
      entityType: "research_project",
      entityUuid: projectUuid,
      entityTitle: project.name,
      projectName: project.name,
      action: "auto_search_triggered",
      message: parsed.data.customPrompt || "Search for related papers for this project.",
      actorType: "user",
      actorUuid: auth.actorUuid,
      actorName: "User",
    });

    return success({ triggered: true });
  }
);
