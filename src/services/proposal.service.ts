// src/services/proposal.service.ts
// Proposal 服务层 (ARCHITECTURE.md §3.1 Service Layer)

import { prisma } from "@/lib/prisma";
import { createDocumentFromProposal } from "./document.service";
import { createTasksFromProposal } from "./task.service";

export interface ProposalListParams {
  companyId: number;
  projectId: number;
  skip: number;
  take: number;
  status?: string;
}

export interface ProposalCreateParams {
  companyId: number;
  projectId: number;
  title: string;
  description?: string | null;
  inputType: string;
  inputIds: number[];
  outputType: string;
  outputData: unknown;
  createdBy: number;
}

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

// Proposals 列表查询
export async function listProposals({
  companyId,
  projectId,
  skip,
  take,
  status,
}: ProposalListParams) {
  const where = {
    projectId,
    companyId,
    ...(status && { status }),
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

  return { proposals, total };
}

// 获取 Proposal 详情
export async function getProposal(companyId: number, uuid: string) {
  return prisma.proposal.findFirst({
    where: { uuid, companyId },
    include: {
      project: { select: { uuid: true, name: true } },
    },
  });
}

// 通过 ID 获取 Proposal（内部使用）
export async function getProposalById(companyId: number, uuid: string) {
  return prisma.proposal.findFirst({
    where: { uuid, companyId },
  });
}

// 创建 Proposal
export async function createProposal(params: ProposalCreateParams) {
  return prisma.proposal.create({
    data: {
      companyId: params.companyId,
      projectId: params.projectId,
      title: params.title,
      description: params.description,
      inputType: params.inputType,
      inputIds: params.inputIds,
      outputType: params.outputType,
      outputData: params.outputData as object,
      status: "pending",
      createdBy: params.createdBy,
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
}

// 审批通过 Proposal
export async function approveProposal(
  proposalId: number,
  reviewedBy: number,
  reviewNote?: string | null
) {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
  });

  if (!proposal) {
    throw new Error("Proposal not found");
  }

  // 开启事务处理
  return prisma.$transaction(async (tx) => {
    // 更新 Proposal 状态
    const updatedProposal = await tx.proposal.update({
      where: { id: proposalId },
      data: {
        status: "approved",
        reviewedBy,
        reviewNote: reviewNote || null,
        reviewedAt: new Date(),
      },
    });

    // 根据 outputType 创建产物
    if (proposal.outputType === "document") {
      const outputData = proposal.outputData as unknown as DocumentOutputData;
      await createDocumentFromProposal(
        proposal.companyId,
        proposal.projectId,
        proposal.id,
        proposal.createdBy,
        outputData
      );
    } else if (proposal.outputType === "task") {
      const outputData = proposal.outputData as unknown as TaskOutputData;
      await createTasksFromProposal(
        proposal.companyId,
        proposal.projectId,
        proposal.id,
        proposal.createdBy,
        outputData.tasks || []
      );
    }

    return updatedProposal;
  });
}

// 拒绝 Proposal
export async function rejectProposal(
  proposalId: number,
  reviewedBy: number,
  reviewNote: string
) {
  return prisma.proposal.update({
    where: { id: proposalId },
    data: {
      status: "rejected",
      reviewedBy,
      reviewNote,
      reviewedAt: new Date(),
    },
  });
}
