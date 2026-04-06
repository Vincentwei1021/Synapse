import { NextRequest } from "next/server";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteComputeNode } from "@/services/compute.service";
import { startNodeTelemetry, stopNodeTelemetry } from "@/services/gpu-telemetry.service";

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

export const PATCH = withErrorHandler(
  async (request: NextRequest, context: { params: Promise<{ uuid: string }> }) => {
    const auth = await getAuthContext(request);
    if (!auth) return errors.unauthorized();
    if (!isUser(auth)) return errors.forbidden("Only users can update compute nodes");

    const { uuid } = await context.params;
    const body = await parseBody<{ telemetryEnabled?: boolean; lifecycle?: string; notes?: string }>(request);

    const node = await prisma.computeNode.findFirst({
      where: { uuid, companyUuid: auth.companyUuid },
      select: { uuid: true },
    });
    if (!node) return errors.notFound("Compute node");

    const updateData: Record<string, unknown> = {};
    if (body.telemetryEnabled !== undefined) updateData.telemetryEnabled = body.telemetryEnabled;
    if (body.lifecycle !== undefined) updateData.lifecycle = body.lifecycle;
    if (body.notes !== undefined) updateData.notes = body.notes;

    const updated = await prisma.computeNode.update({
      where: { uuid },
      data: updateData,
      select: { uuid: true, label: true, telemetryEnabled: true, lifecycle: true },
    });

    if (body.telemetryEnabled === true) {
      startNodeTelemetry(uuid);
    } else if (body.telemetryEnabled === false) {
      stopNodeTelemetry(uuid);
    }

    return success(updated);
  }
);
