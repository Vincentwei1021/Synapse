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

    // Read active agent UUID via raw SQL
    const rows = await prisma.$queryRawUnsafe<Array<{ deepResearchActiveAgentUuid: string | null }>>(
      'SELECT "deepResearchActiveAgentUuid" FROM "Project" WHERE uuid = $1',
      projectUuid,
    );
    if (!rows[0]?.deepResearchActiveAgentUuid) return success({ cleared: false });

    // Clear the active field (use $queryRawUnsafe — $executeRawUnsafe is broken in Next.js standalone)
    await prisma.$queryRawUnsafe(
      'UPDATE "Project" SET "deepResearchActiveAgentUuid" = NULL WHERE uuid = $1 RETURNING uuid',
      projectUuid,
    );

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
