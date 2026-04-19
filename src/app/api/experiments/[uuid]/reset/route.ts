import { NextRequest } from "next/server";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { releaseGpuReservationsForExperiment } from "@/services/compute.service";
import { getExperiment, resetExperimentToPendingStart } from "@/services/experiment.service";

type RouteContext = { params: Promise<{ uuid: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }
  if (!isUser(auth)) {
    return errors.forbidden("Only users can reset experiments from the dashboard");
  }

  const { uuid } = await context.params;
  const existing = await getExperiment(auth.companyUuid, uuid);
  if (!existing) {
    return errors.notFound("Experiment");
  }

  if (existing.status !== "in_progress") {
    return errors.invalidStatusTransition(existing.status, "pending_start");
  }

  await releaseGpuReservationsForExperiment(auth.companyUuid, uuid);

  const experiment = await resetExperimentToPendingStart({
    companyUuid: auth.companyUuid,
    experimentUuid: uuid,
    actorUuid: auth.actorUuid,
  });

  return success({ experiment });
}
