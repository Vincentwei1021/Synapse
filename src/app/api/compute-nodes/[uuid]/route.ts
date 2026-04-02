import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { deleteComputeNode } from "@/services/compute.service";

export const DELETE = withErrorHandler(
  async (request: NextRequest, context: { params: Promise<{ uuid: string }> }) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }
    if (!isUser(auth)) {
      return errors.forbidden("Only users can delete compute nodes");
    }

    const { uuid } = await context.params;
    const deleted = await deleteComputeNode(auth.companyUuid, uuid);

    if (!deleted) {
      return errors.notFound("Compute node");
    }

    return success({ deleted: true });
  }
);
