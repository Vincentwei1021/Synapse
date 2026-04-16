import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { errors, success } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as notificationService from "@/services/notification.service";
import { eventBus } from "@/lib/event-bus";

type RouteContext = { params: Promise<{ uuid: string }> };

export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) return errors.unauthorized();

    const { uuid: projectUuid } = await context.params;
    const project = await prisma.researchProject.findFirst({
      where: { uuid: projectUuid, companyUuid: auth.companyUuid },
      select: { name: true },
    });
    if (!project) return errors.notFound("Research Project");

    // Read active agent UUID
    const proj = await prisma.researchProject.findFirst({
      where: { uuid: projectUuid },
      select: { autoSearchActiveAgentUuid: true },
    });
    const agentUuid = proj?.autoSearchActiveAgentUuid;
    if (!agentUuid) return success({ cleared: false });

    // Clear the active field
    await prisma.researchProject.update({
      where: { uuid: projectUuid },
      data: { autoSearchActiveAgentUuid: null },
    });

    eventBus.emitChange({
      companyUuid: auth.companyUuid,
      researchProjectUuid: projectUuid,
      entityType: "research_project",
      entityUuid: projectUuid,
      action: "updated",
    });

    // Send completion notification to agent owner
    try {
      const agent = await prisma.agent.findUnique({
        where: { uuid: agentUuid },
        select: { ownerUuid: true, name: true },
      });
      if (agent?.ownerUuid) {
        await notificationService.create({
          companyUuid: auth.companyUuid,
          researchProjectUuid: projectUuid,
          recipientType: "user",
          recipientUuid: agent.ownerUuid,
          entityType: "research_project",
          entityUuid: projectUuid,
          entityTitle: project.name,
          projectName: project.name,
          action: "auto_search_completed",
          message: "Auto-search for related papers has completed.",
          actorType: "agent",
          actorUuid: agentUuid,
          actorName: agent.name ?? "Agent",
        });
      }
    } catch { /* ignore notification errors */ }

    return success({ cleared: true });
  }
);
