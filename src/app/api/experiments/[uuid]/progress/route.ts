import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { errors, success } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";
import { listProgressLogs } from "@/services/experiment-progress.service";

type RouteContext = { params: Promise<{ uuid: string }> };

export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) return errors.unauthorized();
    const { uuid } = await context.params;
    const logs = await listProgressLogs(auth.companyUuid, uuid);
    return success({
      logs: logs.map((log) => ({
        uuid: log.uuid,
        message: log.message,
        phase: log.phase,
        actorUuid: log.actorUuid,
        createdAt: log.createdAt.toISOString(),
      })),
    });
  }
);
