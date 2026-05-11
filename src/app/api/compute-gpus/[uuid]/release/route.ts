import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { releaseGpuReservationsForGpu } from "@/services/compute.service";

export const POST = withErrorHandler(
  async (request: NextRequest, context: { params: Promise<{ uuid: string }> }) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }
    if (!isUser(auth)) {
      return errors.forbidden("Only users can release GPU reservations");
    }

    const { uuid } = await context.params;

    try {
      const result = await releaseGpuReservationsForGpu(auth.companyUuid, uuid);
      return success({
        released: result.experimentsReleased + result.runsReleased,
        experimentsReleased: result.experimentsReleased,
        runsReleased: result.runsReleased,
      });
    } catch (err) {
      if (err instanceof Error && err.message === "GPU not found") {
        return errors.notFound("GPU");
      }
      throw err;
    }
  }
);
