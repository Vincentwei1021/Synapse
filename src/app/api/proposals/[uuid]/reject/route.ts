// src/app/api/proposals/[uuid]/reject/route.ts
// Proposals API - 拒绝 Proposal (ARCHITECTURE.md §7.4)

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";

type RouteContext = { params: Promise<{ uuid: string }> };

// POST /api/proposals/[uuid]/reject - 拒绝 Proposal
export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    // 只有用户可以拒绝
    if (!isUser(auth)) {
      return errors.forbidden("Only users can reject proposals");
    }

    const { uuid } = await context.params;

    const proposal = await prisma.proposal.findFirst({
      where: { uuid, companyId: auth.companyId },
    });

    if (!proposal) {
      return errors.notFound("Proposal");
    }

    // 只有 pending 状态的 Proposal 可以拒绝
    if (proposal.status !== "pending") {
      return errors.badRequest("Can only reject pending proposals");
    }

    const body = await parseBody<{
      reviewNote?: string;
    }>(request);

    // 验证拒绝时必须提供原因
    if (!body.reviewNote || body.reviewNote.trim() === "") {
      return errors.validationError({
        reviewNote: "Review note is required when rejecting",
      });
    }

    const updated = await prisma.proposal.update({
      where: { id: proposal.id },
      data: {
        status: "rejected",
        reviewedBy: auth.actorId,
        reviewNote: body.reviewNote.trim(),
        reviewedAt: new Date(),
      },
    });

    return success({
      uuid: updated.uuid,
      title: updated.title,
      description: updated.description,
      inputType: updated.inputType,
      inputIds: updated.inputIds,
      outputType: updated.outputType,
      outputData: updated.outputData,
      status: updated.status,
      createdBy: updated.createdBy,
      review: {
        reviewedBy: updated.reviewedBy,
        reviewNote: updated.reviewNote,
        reviewedAt: updated.reviewedAt?.toISOString(),
      },
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  }
);
