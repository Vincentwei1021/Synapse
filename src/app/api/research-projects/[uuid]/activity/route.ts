// src/app/api/research-projects/[uuid]/activity/route.ts
// Activity API - Research Project Activity Stream (ARCHITECTURE.md §4.2)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { withErrorHandler, parsePagination } from "@/lib/api-handler";
import { paginated, errors } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";
import { listActivities } from "@/services/activity.service";
import { researchProjectExists } from "@/services/research-project.service";

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

    const exists = await researchProjectExists(auth.companyUuid, researchProjectUuid);
    if (!exists) {
      return errors.notFound("Research Project");
    }

    const { activities, total } = await listActivities({
      companyUuid: auth.companyUuid,
      researchProjectUuid,
      skip,
      take,
    });

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
