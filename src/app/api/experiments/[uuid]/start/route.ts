import { NextRequest } from "next/server";
import { z } from "zod";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isAgent, isAssignee } from "@/lib/auth";
import { getExperiment, startExperiment } from "@/services/experiment.service";
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

  const existing = await getExperiment(auth.companyUuid, uuid);
  if (!existing) {
    return errors.notFound("Experiment");
  }

  if (existing.assignee && !isAssignee(auth, existing.assignee.type, existing.assignee.uuid)) {
    return errors.permissionDenied("Only assignee can start experiment");
  }

  if (existing.status !== "pending_start") {
    return errors.invalidStatusTransition(existing.status, "in_progress");
  }

  const experiment = await startExperiment({
    companyUuid: auth.companyUuid,
    experimentUuid: uuid,
    actorType: auth.type,
    actorUuid: auth.actorUuid,
    ownerUuid: isAgent(auth) ? auth.ownerUuid : undefined,
  });

  if (parsed.data.gpuUuids.length > 0) {
    await reserveGpusForExperiment({
      companyUuid: auth.companyUuid,
      experimentUuid: uuid,
      gpuUuids: parsed.data.gpuUuids,
    });
  }

  return success({ experiment });
}
