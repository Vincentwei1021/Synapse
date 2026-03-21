// src/app/api/research-projects/[uuid]/activity/route.ts
// Activity API - Research Project Activity Stream (ARCHITECTURE.md §4.2)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler, parsePagination } from "@/lib/api-handler";
import { paginated, errors } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/research-projects/[uuid]/activity - Research Project Activity Stream
export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid: researchProjectUuid } = await context.params;
    const { page, pageSize, skip, take } = parsePagination(request);

    // Find research project (query by UUID)
    const researchProject = await prisma.researchProject.findFirst({
      where: { uuid: researchProjectUuid, companyUuid: auth.companyUuid },
      select: { uuid: true },
    });

    if (!researchProject) {
      return errors.notFound("Research Project");
    }

    const where = {
      researchProjectUuid: researchProject.uuid,
      companyUuid: auth.companyUuid,
    };

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        select: {
          uuid: true,
          targetType: true,
          targetUuid: true,
          actorType: true,
          actorUuid: true,
          action: true,
          value: true,
          createdAt: true,
        },
      }),
      prisma.activity.count({ where }),
    ]);

    const data = activities.map((a) => ({
      uuid: a.uuid,
      targetType: a.targetType,
      targetUuid: a.targetUuid,
      actor: {
        type: a.actorType,
        uuid: a.actorUuid,
      },
      action: a.action,
      value: a.value,
      createdAt: a.createdAt.toISOString(),
    }));

    return paginated(data, page, pageSize, total);
  }
);
