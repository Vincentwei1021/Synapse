// POST /api/agent-connections/heartbeat — agents self-report connection liveness.
import { NextRequest } from "next/server";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isAgent } from "@/lib/auth";
import { recordHeartbeat } from "@/services/agent-connection.service";

export const dynamic = "force-dynamic";

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) return errors.unauthorized();
  if (!isAgent(auth)) return errors.forbidden("Only agents can report connections");

  const body = await parseBody<{
    host?: string;
    cwd?: string;
    pid?: number;
    clientType?: string;
  }>(request);

  if (!body.host || !body.cwd) {
    return errors.badRequest("host and cwd are required");
  }

  const { connectionKey } = await recordHeartbeat({
    companyUuid: auth.companyUuid,
    agentUuid: auth.actorUuid,
    host: body.host,
    cwd: body.cwd,
    pid: typeof body.pid === "number" ? body.pid : null,
    clientType: body.clientType || "unknown",
  });

  return success({ connectionKey });
});
