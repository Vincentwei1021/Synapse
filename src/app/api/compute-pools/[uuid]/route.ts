import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { deleteComputePool } from "@/services/compute.service";

export const DELETE = withErrorHandler(
  async (request: NextRequest, context: { params: Promise<{ uuid: string }> }) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }
    if (!isUser(auth)) {
      return errors.forbidden("Only users can delete compute pools");
    }

    const { uuid } = await context.params;
    const deleted = await deleteComputePool(auth.companyUuid, uuid);

    if (!deleted) {
      return errors.notFound("Compute pool");
    }

    return success({ deleted: true });
  }
);
