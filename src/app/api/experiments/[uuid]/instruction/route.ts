import { NextRequest } from "next/server";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import {
  injectInstruction,
  NoAgentAssigneeError,
  ExperimentNotFoundError,
} from "@/services/experiment-control.service";

export const dynamic = "force-dynamic";

export const POST = withErrorHandler<{ uuid: string }>(async (request: NextRequest, ctx) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }
  if (!isUser(auth)) {
    return errors.forbidden("Only users can send instructions");
  }

  const { uuid } = await ctx.params;
  const body = await parseBody<{ message?: string }>(request);
  if (!body.message || body.message.trim() === "") {
    return errors.badRequest("message is required");
  }

  try {
    const result = await injectInstruction({
      companyUuid: auth.companyUuid,
      experimentUuid: uuid,
      message: body.message.trim(),
      actorUuid: auth.actorUuid,
      actorName: auth.name ?? "",
    });
    return success(result);
  } catch (e) {
    if (e instanceof ExperimentNotFoundError) {
      return errors.notFound("Experiment");
    }
    if (e instanceof NoAgentAssigneeError) {
      return errors.conflict("Experiment has no agent assignee");
    }
    throw e;
  }
});
