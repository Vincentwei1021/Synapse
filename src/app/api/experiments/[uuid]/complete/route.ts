import { NextRequest } from "next/server";
import { z } from "zod";
import { errors, success } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";
import { releaseGpuReservationsForExperiment } from "@/services/compute.service";
import { completeExperiment } from "@/services/experiment.service";

type RouteContext = { params: Promise<{ uuid: string }> };

const completeSchema = z.object({
  outcome: z.string().optional(),
  results: z.unknown().optional(),
  computeUsedHours: z.coerce.number().nullable().optional(),
});

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  const { uuid } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) {
    return errors.validationError(parsed.error.flatten().fieldErrors);
  }

  const experiment = await completeExperiment({
    companyUuid: auth.companyUuid,
    experimentUuid: uuid,
    actorType: auth.type,
    actorUuid: auth.actorUuid,
    outcome: parsed.data.outcome,
    results: parsed.data.results,
    computeUsedHours: parsed.data.computeUsedHours ?? null,
  });

  await releaseGpuReservationsForExperiment(auth.companyUuid, uuid);

  return success({ experiment });
}
