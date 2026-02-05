// src/services/project.service.ts
// Project 服务层 (ARCHITECTURE.md §3.1 Service Layer)

import { prisma } from "@/lib/prisma";

export interface ProjectListParams {
  companyId: number;
  skip: number;
  take: number;
}

export interface ProjectCreateParams {
  companyId: number;
  name: string;
  description?: string | null;
}

export interface ProjectUpdateParams {
  name?: string;
  description?: string | null;
}

// 项目列表查询
export async function listProjects({ companyId, skip, take }: ProjectListParams) {
  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where: { companyId },
      skip,
      take,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        uuid: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            ideas: true,
            documents: true,
            tasks: true,
            proposals: true,
          },
        },
      },
    }),
    prisma.project.count({ where: { companyId } }),
  ]);

  return { projects, total };
}

// 获取项目详情
export async function getProject(companyId: number, uuid: string) {
  return prisma.project.findFirst({
    where: { uuid, companyId },
    select: {
      id: true,
      uuid: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          ideas: true,
          documents: true,
          tasks: true,
          proposals: true,
          activities: true,
        },
      },
    },
  });
}

// 通过 UUID 获取项目 ID
export async function getProjectIdByUuid(companyId: number, uuid: string) {
  const project = await prisma.project.findFirst({
    where: { uuid, companyId },
    select: { id: true },
  });
  return project?.id ?? null;
}

// 创建项目
export async function createProject({ companyId, name, description }: ProjectCreateParams) {
  return prisma.project.create({
    data: { companyId, name, description },
    select: {
      uuid: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

// 更新项目
export async function updateProject(id: number, data: ProjectUpdateParams) {
  return prisma.project.update({
    where: { id },
    data,
    select: {
      uuid: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

// 删除项目
export async function deleteProject(id: number) {
  return prisma.project.delete({ where: { id } });
}
