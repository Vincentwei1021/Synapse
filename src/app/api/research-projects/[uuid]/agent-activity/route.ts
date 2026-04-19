import { NextRequest } from "next/server";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { getProjectAgentActivity } from "@/services/agent-activity.service";

type RouteContext = { params: Promise<{ uuid: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await getAuthContext(request);
  if (!auth) return errors.unauthorized();
  if (!isUser(auth)) return errors.forbidden("Only users can read agent activity");

  const { uuid } = await context.params;
  const activity = await getProjectAgentActivity({
    companyUuid: auth.companyUuid,
    projectUuid: uuid,
  });
  return success(activity);
}
