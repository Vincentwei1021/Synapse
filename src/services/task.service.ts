// src/services/task.service.ts
// Task 服务层 (ARCHITECTURE.md §3.1 Service Layer)

import { prisma } from "@/lib/prisma";

export interface TaskListParams {
  companyId: number;
  projectId: number;
  skip: number;
  take: number;
  status?: string;
  priority?: string;
}

export interface TaskCreateParams {
  companyId: number;
  projectId: number;
  title: string;
  description?: string | null;
  priority?: string;
  storyPoints?: number | null;  // 工作量估算（单位：Agent 小时）
  proposalId?: number | null;
  createdBy: number;
}

export interface TaskClaimParams {
  taskId: number;
  assigneeType: string;
  assigneeId: number;
  assignedBy?: number | null;
}

export interface TaskUpdateParams {
  title?: string;
  description?: string | null;
  status?: string;
  priority?: string;
  storyPoints?: number | null;  // 工作量估算（单位：Agent 小时）
}

// Task 状态转换规则 (ARCHITECTURE.md §7.2)
export const TASK_STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ["assigned", "closed"],
  assigned: ["open", "in_progress", "closed"],
  in_progress: ["to_verify", "closed"],
  to_verify: ["done", "in_progress", "closed"],
  done: ["closed"],
  closed: [],
};

// 验证状态转换是否有效
export function isValidTaskStatusTransition(from: string, to: string): boolean {
  const allowed = TASK_STATUS_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

// Tasks 列表查询
export async function listTasks({ companyId, projectId, skip, take, status, priority }: TaskListParams) {
  const where = {
    projectId,
    companyId,
    ...(status && { status }),
    ...(priority && { priority }),
  };

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      skip,
      take,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      select: {
        uuid: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        storyPoints: true,
        assigneeType: true,
        assigneeId: true,
        assignedAt: true,
        assignedBy: true,
        proposalId: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.task.count({ where }),
  ]);

  return { tasks, total };
}

// 获取 Task 详情
export async function getTask(companyId: number, uuid: string) {
  return prisma.task.findFirst({
    where: { uuid, companyId },
    include: {
      project: { select: { uuid: true, name: true } },
    },
  });
}

// 通过 ID 获取 Task（内部使用）
export async function getTaskById(companyId: number, uuid: string) {
  return prisma.task.findFirst({
    where: { uuid, companyId },
  });
}

// 创建 Task
export async function createTask(params: TaskCreateParams) {
  return prisma.task.create({
    data: {
      companyId: params.companyId,
      projectId: params.projectId,
      title: params.title,
      description: params.description,
      status: "open",
      priority: params.priority || "medium",
      storyPoints: params.storyPoints,
      proposalId: params.proposalId,
      createdBy: params.createdBy,
    },
    select: {
      uuid: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      storyPoints: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

// 更新 Task
export async function updateTask(id: number, data: TaskUpdateParams) {
  return prisma.task.update({
    where: { id },
    data,
    include: {
      project: { select: { uuid: true, name: true } },
    },
  });
}

// 认领 Task
export async function claimTask({ taskId, assigneeType, assigneeId, assignedBy }: TaskClaimParams) {
  return prisma.task.update({
    where: { id: taskId },
    data: {
      status: "assigned",
      assigneeType,
      assigneeId,
      assignedAt: new Date(),
      assignedBy,
    },
    include: {
      project: { select: { uuid: true, name: true } },
    },
  });
}

// 放弃认领 Task
export async function releaseTask(id: number) {
  return prisma.task.update({
    where: { id },
    data: {
      status: "open",
      assigneeType: null,
      assigneeId: null,
      assignedAt: null,
      assignedBy: null,
    },
    include: {
      project: { select: { uuid: true, name: true } },
    },
  });
}

// 删除 Task
export async function deleteTask(id: number) {
  return prisma.task.delete({ where: { id } });
}

// 批量创建 Tasks（用于 Proposal 审批）
export async function createTasksFromProposal(
  companyId: number,
  projectId: number,
  proposalId: number,
  createdBy: number,
  tasks: Array<{ title: string; description?: string; priority?: string; storyPoints?: number }>
) {
  const createPromises = tasks.map((task) =>
    prisma.task.create({
      data: {
        companyId,
        projectId,
        title: task.title,
        description: task.description || null,
        status: "open",
        priority: task.priority || "medium",
        storyPoints: task.storyPoints || null,
        proposalId,
        createdBy,
      },
    })
  );

  return Promise.all(createPromises);
}
