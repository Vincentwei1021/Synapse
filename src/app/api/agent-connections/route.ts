// GET /api/agent-connections — owner-scoped live agent connections + executions.
import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { listOwnerConnections } from "@/services/agent-connection.service";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) return errors.unauthorized();
  if (!isUser(auth)) return errors.forbidden("Only users can view connections");

  const connections = await listOwnerConnections({
    companyUuid: auth.companyUuid,
    ownerUuid: auth.actorUuid,
  });

  return success(connections);
});
