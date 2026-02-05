// src/services/document.service.ts
// Document 服务层 (ARCHITECTURE.md §3.1 Service Layer)

import { prisma } from "@/lib/prisma";

export interface DocumentListParams {
  companyId: number;
  projectId: number;
  skip: number;
  take: number;
  type?: string;
}

export interface DocumentCreateParams {
  companyId: number;
  projectId: number;
  type: string;
  title: string;
  content?: string | null;
  proposalId?: number | null;
  createdBy: number;
}

export interface DocumentUpdateParams {
  title?: string;
  content?: string | null;
  incrementVersion?: boolean;
}

// Documents 列表查询
export async function listDocuments({
  companyId,
  projectId,
  skip,
  take,
  type,
}: DocumentListParams) {
  const where = {
    projectId,
    companyId,
    ...(type && { type }),
  };

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      skip,
      take,
      orderBy: { updatedAt: "desc" },
      select: {
        uuid: true,
        type: true,
        title: true,
        version: true,
        proposalId: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.document.count({ where }),
  ]);

  return { documents, total };
}

// 获取 Document 详情
export async function getDocument(companyId: number, uuid: string) {
  return prisma.document.findFirst({
    where: { uuid, companyId },
    include: {
      project: { select: { uuid: true, name: true } },
    },
  });
}

// 通过 ID 获取 Document（内部使用）
export async function getDocumentById(companyId: number, uuid: string) {
  return prisma.document.findFirst({
    where: { uuid, companyId },
    select: { id: true },
  });
}

// 创建 Document
export async function createDocument(params: DocumentCreateParams) {
  return prisma.document.create({
    data: {
      companyId: params.companyId,
      projectId: params.projectId,
      type: params.type,
      title: params.title,
      content: params.content,
      version: 1,
      proposalId: params.proposalId,
      createdBy: params.createdBy,
    },
    select: {
      uuid: true,
      type: true,
      title: true,
      content: true,
      version: true,
      proposalId: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

// 更新 Document
export async function updateDocument(
  id: number,
  { title, content, incrementVersion }: DocumentUpdateParams
) {
  const data: { title?: string; content?: string | null; version?: { increment: number } } = {};

  if (title !== undefined) {
    data.title = title;
  }
  if (content !== undefined) {
    data.content = content;
  }
  if (incrementVersion) {
    data.version = { increment: 1 };
  }

  return prisma.document.update({
    where: { id },
    data,
    include: {
      project: { select: { uuid: true, name: true } },
    },
  });
}

// 删除 Document
export async function deleteDocument(id: number) {
  return prisma.document.delete({ where: { id } });
}

// 从 Proposal 创建 Document
export async function createDocumentFromProposal(
  companyId: number,
  projectId: number,
  proposalId: number,
  createdBy: number,
  doc: { type: string; title: string; content?: string }
) {
  return prisma.document.create({
    data: {
      companyId,
      projectId,
      type: doc.type || "prd",
      title: doc.title,
      content: doc.content || null,
      version: 1,
      proposalId,
      createdBy,
    },
  });
}
