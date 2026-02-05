// src/app/api/projects/[uuid]/proposals/route.ts
// Proposals API - 列表和创建 (ARCHITECTURE.md §5.1, PRD §4.1 F5)

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler, parseBody, parsePagination } from "@/lib/api-handler";
import { success, paginated, errors } from "@/lib/api-response";
import { getAuthContext, isAgent, isPmAgent } from "@/lib/auth";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/projects/[uuid]/proposals - Proposals 列表
export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid } = await context.params;
    const { page, pageSize, skip, take } = parsePagination(request);

    // 解析筛选参数
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status");

    // 查找项目
    const project = await prisma.project.findFirst({
      where: { uuid, companyId: auth.companyId },
      select: { id: true },
    });

    if (!project) {
      return errors.notFound("Project");
    }

    const where = {
      projectId: project.id,
      companyId: auth.companyId,
      ...(statusFilter && { status: statusFilter }),
    };

    const [proposals, total] = await Promise.all([
      prisma.proposal.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        select: {
          uuid: true,
          title: true,
          description: true,
          inputType: true,
          inputIds: true,
          outputType: true,
          status: true,
          createdBy: true,
          reviewedBy: true,
          reviewNote: true,
          reviewedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.proposal.count({ where }),
    ]);

    const data = proposals.map((p) => ({
      uuid: p.uuid,
      title: p.title,
      description: p.description,
      inputType: p.inputType,
      inputIds: p.inputIds,
      outputType: p.outputType,
      status: p.status,
      createdBy: p.createdBy,
      review: p.reviewedBy
        ? {
            reviewedBy: p.reviewedBy,
            reviewNote: p.reviewNote,
            reviewedAt: p.reviewedAt?.toISOString(),
          }
        : null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));

    return paginated(data, page, pageSize, total);
  }
);

// POST /api/projects/[uuid]/proposals - 创建 Proposal
export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    // 只有 PM Agent 可以创建 Proposal
    if (!isAgent(auth) || !isPmAgent(auth)) {
      return errors.forbidden("Only PM agents can create proposals");
    }

    const { uuid } = await context.params;

    // 查找项目
    const project = await prisma.project.findFirst({
      where: { uuid, companyId: auth.companyId },
      select: { id: true },
    });

    if (!project) {
      return errors.notFound("Project");
    }

    const body = await parseBody<{
      title: string;
      description?: string;
      inputType: "idea" | "document";
      inputIds: number[];
      outputType: "document" | "task";
      outputData: unknown;
    }>(request);

    // 验证必填字段
    if (!body.title || body.title.trim() === "") {
      return errors.validationError({ title: "Title is required" });
    }
    if (!body.inputType || !["idea", "document"].includes(body.inputType)) {
      return errors.validationError({ inputType: "Invalid input type" });
    }
    if (!body.inputIds || !Array.isArray(body.inputIds) || body.inputIds.length === 0) {
      return errors.validationError({ inputIds: "Input IDs are required" });
    }
    if (!body.outputType || !["document", "task"].includes(body.outputType)) {
      return errors.validationError({ outputType: "Invalid output type" });
    }
    if (!body.outputData) {
      return errors.validationError({ outputData: "Output data is required" });
    }

    const proposal = await prisma.proposal.create({
      data: {
        companyId: auth.companyId,
        projectId: project.id,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        inputType: body.inputType,
        inputIds: body.inputIds,
        outputType: body.outputType,
        outputData: body.outputData,
        status: "pending",
        createdBy: auth.actorId,
      },
      select: {
        uuid: true,
        title: true,
        description: true,
        inputType: true,
        inputIds: true,
        outputType: true,
        outputData: true,
        status: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return success({
      uuid: proposal.uuid,
      title: proposal.title,
      description: proposal.description,
      inputType: proposal.inputType,
      inputIds: proposal.inputIds,
      outputType: proposal.outputType,
      outputData: proposal.outputData,
      status: proposal.status,
      createdBy: proposal.createdBy,
      review: null,
      createdAt: proposal.createdAt.toISOString(),
      updatedAt: proposal.updatedAt.toISOString(),
    });
  }
);
