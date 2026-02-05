// src/app/api/proposals/[uuid]/route.ts
// Proposals API - 详情 (ARCHITECTURE.md §5.1)

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/proposals/[uuid] - Proposal 详情
export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid } = await context.params;

    const proposal = await prisma.proposal.findFirst({
      where: { uuid, companyId: auth.companyId },
      include: {
        project: {
          select: { uuid: true, name: true },
        },
      },
    });

    if (!proposal) {
      return errors.notFound("Proposal");
    }

    return success({
      uuid: proposal.uuid,
      title: proposal.title,
      description: proposal.description,
      inputType: proposal.inputType,
      inputIds: proposal.inputIds,
      outputType: proposal.outputType,
      outputData: proposal.outputData,
      status: proposal.status,
      project: {
        uuid: proposal.project.uuid,
        name: proposal.project.name,
      },
      createdBy: proposal.createdBy,
      review: proposal.reviewedBy
        ? {
            reviewedBy: proposal.reviewedBy,
            reviewNote: proposal.reviewNote,
            reviewedAt: proposal.reviewedAt?.toISOString(),
          }
        : null,
      createdAt: proposal.createdAt.toISOString(),
      updatedAt: proposal.updatedAt.toISOString(),
    });
  }
);
