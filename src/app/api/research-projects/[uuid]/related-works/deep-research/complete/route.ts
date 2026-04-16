import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { errors, success } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { eventBus } from "@/lib/event-bus";

type RouteContext = { params: Promise<{ uuid: string }> };

export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) return errors.unauthorized();

    const { uuid: projectUuid } = await context.params;
    const project = await prisma.researchProject.findFirst({
      where: { uuid: projectUuid, companyUuid: auth.companyUuid },
      select: { deepResearchActiveAgentUuid: true },
    });
    if (!project) return errors.notFound("Research Project");
    if (!project.deepResearchActiveAgentUuid) return success({ cleared: false });

    // Clear the active field (notification already sent by synapse_save_deep_research_report)
    await prisma.researchProject.update({
      where: { uuid: projectUuid },
      data: { deepResearchActiveAgentUuid: null },
    });

    eventBus.emitChange({
      companyUuid: auth.companyUuid,
      researchProjectUuid: projectUuid,
      entityType: "research_project",
      entityUuid: projectUuid,
      action: "updated",
    });

    return success({ cleared: true });
  }
);
