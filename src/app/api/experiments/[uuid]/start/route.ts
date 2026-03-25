import { NextRequest } from "next/server";
import { z } from "zod";
import { errors, success } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";
import { startExperiment } from "@/services/experiment.service";
import { reserveGpusForExperiment } from "@/services/compute.service";

type RouteContext = { params: Promise<{ uuid: string }> };

const startSchema = z.object({
  gpuUuids: z.array(z.string()).default([]),
});

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  const { uuid } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return errors.validationError(parsed.error.flatten().fieldErrors);
  }

  if (parsed.data.gpuUuids.length > 0) {
    await reserveGpusForExperiment({
      companyUuid: auth.companyUuid,
      experimentUuid: uuid,
      gpuUuids: parsed.data.gpuUuids,
    });
  }

  const experiment = await startExperiment({
    companyUuid: auth.companyUuid,
    experimentUuid: uuid,
    actorType: auth.type,
    actorUuid: auth.actorUuid,
  });

  return success({ experiment });
}
