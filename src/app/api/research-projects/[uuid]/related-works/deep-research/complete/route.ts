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
      select: { uuid: true },
    });
    if (!project) return errors.notFound("Research Project");

    // Read active agent UUID
    const proj = await prisma.researchProject.findFirst({
      where: { uuid: projectUuid },
      select: { deepResearchActiveAgentUuid: true },
    });
    if (!proj?.deepResearchActiveAgentUuid) return success({ cleared: false });

    // Clear the active field
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
