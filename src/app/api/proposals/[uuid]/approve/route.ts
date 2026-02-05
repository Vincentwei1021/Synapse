// src/app/api/proposals/[uuid]/approve/route.ts
// Proposals API - 审批通过 (ARCHITECTURE.md §7.4)

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";

type RouteContext = { params: Promise<{ uuid: string }> };

// 文档输出数据类型
interface DocumentOutputData {
  type: string;
  title: string;
  content: string;
}

// 任务输出数据类型
interface TaskOutputData {
  tasks: Array<{
    title: string;
    description?: string;
    priority?: string;
  }>;
}

// POST /api/proposals/[uuid]/approve - 审批通过 Proposal
export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    // 只有用户可以审批
    if (!isUser(auth)) {
      return errors.forbidden("Only users can approve proposals");
    }

    const { uuid } = await context.params;

    const proposal = await prisma.proposal.findFirst({
      where: { uuid, companyId: auth.companyId },
    });

    if (!proposal) {
      return errors.notFound("Proposal");
    }

    // 只有 pending 状态的 Proposal 可以审批
    if (proposal.status !== "pending") {
      return errors.badRequest("Can only approve pending proposals");
    }

    const body = await parseBody<{
      reviewNote?: string;
    }>(request);

    // 开启事务处理
    const result = await prisma.$transaction(async (tx) => {
      // 更新 Proposal 状态
      const updatedProposal = await tx.proposal.update({
        where: { id: proposal.id },
        data: {
          status: "approved",
          reviewedBy: auth.actorId,
          reviewNote: body.reviewNote || null,
          reviewedAt: new Date(),
        },
      });

      // 根据 outputType 创建产物
      if (proposal.outputType === "document") {
        // 创建 Document
        const outputData = proposal.outputData as unknown as DocumentOutputData;
        await tx.document.create({
          data: {
            companyId: auth.companyId,
            projectId: proposal.projectId,
            type: outputData.type || "prd",
            title: outputData.title,
            content: outputData.content || null,
            version: 1,
            proposalId: proposal.id,
            createdBy: proposal.createdBy,
          },
        });
      } else if (proposal.outputType === "task") {
        // 批量创建 Tasks
        const outputData = proposal.outputData as unknown as TaskOutputData;
        const tasksData = outputData.tasks || [];

        for (const taskData of tasksData) {
          await tx.task.create({
            data: {
              companyId: auth.companyId,
              projectId: proposal.projectId,
              title: taskData.title,
              description: taskData.description || null,
              status: "open",
              priority: taskData.priority || "medium",
              proposalId: proposal.id,
              createdBy: proposal.createdBy,
            },
          });
        }
      }

      return updatedProposal;
    });

    return success({
      uuid: result.uuid,
      title: result.title,
      description: result.description,
      inputType: result.inputType,
      inputIds: result.inputIds,
      outputType: result.outputType,
      outputData: result.outputData,
      status: result.status,
      createdBy: result.createdBy,
      review: {
        reviewedBy: result.reviewedBy,
        reviewNote: result.reviewNote,
        reviewedAt: result.reviewedAt?.toISOString(),
      },
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
    });
  }
);
