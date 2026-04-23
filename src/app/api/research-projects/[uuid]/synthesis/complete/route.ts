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
      select: { name: true, synthesisActiveAgentUuid: true },
    });
    if (!project) return errors.notFound("Research Project");

    const agentUuid = project.synthesisActiveAgentUuid;
    if (!agentUuid) return success({ cleared: false });

    await prisma.researchProject.update({
      where: { uuid: projectUuid },
      data: { synthesisActiveAgentUuid: null, synthesisStartedAt: null },
    });

    eventBus.emitChange({
      companyUuid: auth.companyUuid,
      researchProjectUuid: projectUuid,
      entityType: "research_project",
      entityUuid: projectUuid,
      action: "updated",
    });

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
          action: "synthesis_refresh_completed",
          message: "Project synthesis has been updated by agent.",
          actorType: "agent",
          actorUuid: agentUuid,
          actorName: agent.name ?? "Agent",
        });
      }
    } catch { /* ignore notification errors */ }

    return success({ cleared: true });
  }
);
