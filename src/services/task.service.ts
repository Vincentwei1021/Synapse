// src/services/task.service.ts
// Task Service Layer (ARCHITECTURE.md §3.1 Service Layer)
// UUID-Based Architecture: All operations use UUIDs

import { prisma } from "@/lib/prisma";
import { formatAssigneeComplete, formatCreatedBy } from "@/lib/uuid-resolver";
import { eventBus } from "@/lib/event-bus";
import { AlreadyClaimedError, NotClaimedError, isPrismaNotFound } from "@/lib/errors";
import { batchCommentCounts } from "@/services/comment.service";
import * as mentionService from "@/services/mention.service";
import * as activityService from "@/services/activity.service";

// ===== Type Definitions =====

export interface TaskListParams {
  companyUuid: string;
  projectUuid: string;
  skip: number;
  take: number;
  status?: string;
  priority?: string;
}

export interface TaskCreateParams {
  companyUuid: string;
  projectUuid: string;
  title: string;
  description?: string | null;
  priority?: string;
  storyPoints?: number | null;
  acceptanceCriteria?: string | null;  // acceptance criteria
  proposalUuid?: string | null;
  createdByUuid: string;
}

export interface TaskClaimParams {
  taskUuid: string;
  companyUuid: string;
  assigneeType: string;
  assigneeUuid: string;
  assignedByUuid?: string | null;
}

export interface TaskUpdateParams {
  title?: string;
  description?: string | null;
  status?: string;
  priority?: string;
  storyPoints?: number | null;
  acceptanceCriteria?: string | null;  // acceptance criteria
}

// Dependency summary info
export interface TaskDependencyInfo {
  uuid: string;
  title: string;
  status: string;
}

// API response format
export interface TaskResponse {
  uuid: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  storyPoints: number | null;
  acceptanceCriteria: string | null;  // acceptance criteria
  assignee: {
    type: string;
    uuid: string;
    name: string;
    assignedAt: string | null;
    assignedBy: { type: string; uuid: string; name: string } | null;
  } | null;
  proposalUuid: string | null;
  project?: { uuid: string; name: string };
  createdBy: { type: string; uuid: string; name: string } | null;
  dependsOn: TaskDependencyInfo[];
  dependedBy: TaskDependencyInfo[];
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

// Task status transition rules (ARCHITECTURE.md §7.2)
export const TASK_STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ["assigned", "closed"],
  assigned: ["open", "in_progress", "closed"],
  in_progress: ["to_verify", "closed"],
  to_verify: ["done", "in_progress", "closed"],
  done: ["closed"],
  closed: [],
};

// Validate whether a status transition is valid
export function isValidTaskStatusTransition(from: string, to: string): boolean {
  const allowed = TASK_STATUS_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

// ===== Internal Helper Functions =====

// Format a single Task into API response format
async function formatTaskResponse(
  task: {
    uuid: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    storyPoints: number | null;
    acceptanceCriteria: string | null;
    assigneeType: string | null;
    assigneeUuid: string | null;
    assignedAt: Date | null;
    assignedByUuid: string | null;
    proposalUuid: string | null;
    createdByUuid: string;
    createdAt: Date;
    updatedAt: Date;
    project?: { uuid: string; name: string };
    dependsOn?: Array<{ dependsOn: { uuid: string; title: string; status: string } }>;
    dependedBy?: Array<{ task: { uuid: string; title: string; status: string } }>;
  },
  commentCount: number = 0,
): Promise<TaskResponse> {
  const [assignee, createdBy] = await Promise.all([
    formatAssigneeComplete(task.assigneeType, task.assigneeUuid, task.assignedAt, task.assignedByUuid),
    formatCreatedBy(task.createdByUuid),
  ]);

  const dependsOn: TaskDependencyInfo[] = (task.dependsOn || []).map((d) => ({
    uuid: d.dependsOn.uuid,
    title: d.dependsOn.title,
    status: d.dependsOn.status,
  }));

  const dependedBy: TaskDependencyInfo[] = (task.dependedBy || []).map((d) => ({
    uuid: d.task.uuid,
    title: d.task.title,
    status: d.task.status,
  }));

  return {
    uuid: task.uuid,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    storyPoints: task.storyPoints,
    acceptanceCriteria: task.acceptanceCriteria,
    assignee,
    proposalUuid: task.proposalUuid,
    ...(task.project && { project: task.project }),
    createdBy,
    dependsOn,
    dependedBy,
    commentCount,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

// ===== Dependency relation include template =====

const dependencyInclude = {
  dependsOn: {
    select: {
      dependsOn: { select: { uuid: true, title: true, status: true } },
    },
  },
  dependedBy: {
    select: {
      task: { select: { uuid: true, title: true, status: true } },
    },
  },
} as const;

// ===== Service Methods =====

// List tasks query
export async function listTasks({
  companyUuid,
  projectUuid,
  skip,
  take,
  status,
  priority,
}: TaskListParams): Promise<{ tasks: TaskResponse[]; total: number }> {
  const where = {
    projectUuid,
    companyUuid,
    ...(status && { status }),
    ...(priority && { priority }),
  };

  const [rawTasks, total] = await Promise.all([
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
        acceptanceCriteria: true,
        assigneeType: true,
        assigneeUuid: true,
        assignedAt: true,
        assignedByUuid: true,
        proposalUuid: true,
        createdByUuid: true,
        createdAt: true,
        updatedAt: true,
        ...dependencyInclude,
      },
    }),
    prisma.task.count({ where }),
  ]);

  // Batch-fetch comment counts for all tasks in one query
  const commentCounts = await batchCommentCounts(
    companyUuid,
    "task",
    rawTasks.map((t) => t.uuid),
  );

  const tasks = await Promise.all(
    rawTasks.map((t) => formatTaskResponse(t, commentCounts[t.uuid] ?? 0)),
  );
  return { tasks, total };
}

// Get Task details
export async function getTask(
  companyUuid: string,
  uuid: string
): Promise<TaskResponse | null> {
  const task = await prisma.task.findFirst({
    where: { uuid, companyUuid },
    include: {
      project: { select: { uuid: true, name: true } },
      ...dependencyInclude,
    },
  });

  if (!task) return null;

  const commentCount = await prisma.comment.count({
    where: { companyUuid, targetType: "task", targetUuid: uuid },
  });

  return formatTaskResponse(task, commentCount);
}

// Get raw Task data by UUID (internal use, for permission checks etc.)
export async function getTaskByUuid(companyUuid: string, uuid: string) {
  return prisma.task.findFirst({
    where: { uuid, companyUuid },
  });
}

// Create Task
export async function createTask(params: TaskCreateParams): Promise<TaskResponse> {
  const task = await prisma.task.create({
    data: {
      companyUuid: params.companyUuid,
      projectUuid: params.projectUuid,
      title: params.title,
      description: params.description,
      status: "open",
      priority: params.priority || "medium",
      storyPoints: params.storyPoints,
      acceptanceCriteria: params.acceptanceCriteria,
      proposalUuid: params.proposalUuid,
      createdByUuid: params.createdByUuid,
    },
    select: {
      uuid: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      storyPoints: true,
      acceptanceCriteria: true,
      assigneeType: true,
      assigneeUuid: true,
      assignedAt: true,
      assignedByUuid: true,
      proposalUuid: true,
      createdByUuid: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  eventBus.emitChange({ companyUuid: params.companyUuid, projectUuid: params.projectUuid, entityType: "task", entityUuid: task.uuid, action: "created" });

  return formatTaskResponse(task);
}

// Update Task
export async function updateTask(
  uuid: string,
  data: TaskUpdateParams,
  actorContext?: { actorType: string; actorUuid: string }
): Promise<TaskResponse> {
  // If description is being updated and we have actor context, capture old description for mention diffing
  let oldDescription: string | null = null;
  if (data.description !== undefined && actorContext) {
    const existing = await prisma.task.findUnique({ where: { uuid }, select: { description: true } });
    oldDescription = existing?.description ?? null;
  }

  const task = await prisma.task.update({
    where: { uuid },
    data,
    include: {
      project: { select: { uuid: true, name: true } },
    },
  });

  eventBus.emitChange({ companyUuid: task.companyUuid, projectUuid: task.project.uuid, entityType: "task", entityUuid: task.uuid, action: "updated" });

  // Process new @mentions in description (append-only: only new mentions)
  if (data.description !== undefined && actorContext && data.description) {
    processNewMentions(
      task.companyUuid,
      task.project.uuid,
      "task",
      task.uuid,
      task.title,
      oldDescription,
      data.description,
      actorContext.actorType,
      actorContext.actorUuid,
    ).catch((err) => console.error("[Task] Failed to process mentions:", err));
  }

  return formatTaskResponse(task);
}

// Claim Task (atomic: only succeeds if status is "open")
export async function claimTask({
  taskUuid,
  companyUuid,
  assigneeType,
  assigneeUuid,
  assignedByUuid,
}: TaskClaimParams): Promise<TaskResponse> {
  try {
    const task = await prisma.task.update({
      where: { uuid: taskUuid, status: "open" },
      data: {
        status: "assigned",
        assigneeType,
        assigneeUuid,
        assignedAt: new Date(),
        assignedByUuid,
      },
      include: {
        project: { select: { uuid: true, name: true } },
      },
    });

    eventBus.emitChange({ companyUuid: task.companyUuid, projectUuid: task.project.uuid, entityType: "task", entityUuid: task.uuid, action: "updated" });

    return formatTaskResponse(task);
  } catch (e: unknown) {
    if (isPrismaNotFound(e)) {
      throw new AlreadyClaimedError("Task");
    }
    throw e;
  }
}

// Release Task (atomic: only succeeds if status is "assigned")
export async function releaseTask(uuid: string): Promise<TaskResponse> {
  try {
    const task = await prisma.task.update({
      where: { uuid, status: "assigned" },
      data: {
        status: "open",
        assigneeType: null,
        assigneeUuid: null,
        assignedAt: null,
        assignedByUuid: null,
      },
      include: {
        project: { select: { uuid: true, name: true } },
      },
    });

    eventBus.emitChange({ companyUuid: task.companyUuid, projectUuid: task.project.uuid, entityType: "task", entityUuid: task.uuid, action: "updated" });

    return formatTaskResponse(task);
  } catch (e: unknown) {
    if (isPrismaNotFound(e)) {
      throw new NotClaimedError("Task");
    }
    throw e;
  }
}

// Delete Task
export async function deleteTask(uuid: string) {
  const task = await prisma.task.delete({ where: { uuid } });
  eventBus.emitChange({ companyUuid: task.companyUuid, projectUuid: task.projectUuid, entityType: "task", entityUuid: task.uuid, action: "deleted" });
  return task;
}

// Batch create Tasks (used for Proposal approval)
// Accepts a task list with draftUuids, returns { tasks, draftToTaskUuidMap }
export async function createTasksFromProposal(
  companyUuid: string,
  projectUuid: string,
  proposalUuid: string,
  createdByUuid: string,
  tasks: Array<{ uuid?: string; title: string; description?: string; priority?: string; storyPoints?: number; acceptanceCriteria?: string }>
): Promise<{ tasks: TaskResponse[]; draftToTaskUuidMap: Map<string, string> }> {
  const draftToTaskUuidMap = new Map<string, string>();

  const createPromises = tasks.map((task) =>
    prisma.task.create({
      data: {
        companyUuid,
        projectUuid,
        title: task.title,
        description: task.description || null,
        status: "open",
        priority: task.priority || "medium",
        storyPoints: task.storyPoints || null,
        acceptanceCriteria: task.acceptanceCriteria || null,
        proposalUuid,
        createdByUuid,
      },
      select: {
        uuid: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        storyPoints: true,
        acceptanceCriteria: true,
        assigneeType: true,
        assigneeUuid: true,
        assignedAt: true,
        assignedByUuid: true,
        proposalUuid: true,
        createdByUuid: true,
        createdAt: true,
        updatedAt: true,
      },
    })
  );

  const rawTasks = await Promise.all(createPromises);

  // Build draftUuid → taskUuid mapping
  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].uuid) {
      draftToTaskUuidMap.set(tasks[i].uuid!, rawTasks[i].uuid);
    }
  }

  const formattedTasks = await Promise.all(rawTasks.map(formatTaskResponse));
  return { tasks: formattedTasks, draftToTaskUuidMap };
}

// ===== Mention Processing (append-only) =====

// Process new @mentions by diffing old vs new content
async function processNewMentions(
  companyUuid: string,
  projectUuid: string,
  sourceType: "task" | "idea",
  sourceUuid: string,
  entityTitle: string,
  oldContent: string | null,
  newContent: string,
  actorType: string,
  actorUuid: string,
): Promise<void> {
  const oldMentions = oldContent ? mentionService.parseMentions(oldContent) : [];
  const newMentions = mentionService.parseMentions(newContent);

  // Find only truly new mentions (not in old set)
  const oldKeys = new Set(oldMentions.map((m) => `${m.type}:${m.uuid}`));
  const brandNewMentions = newMentions.filter((m) => !oldKeys.has(`${m.type}:${m.uuid}`));

  if (brandNewMentions.length === 0) return;

  // Build content with only new mentions for createMentions to process
  // We pass the full new content and let createMentions handle it, but we
  // need to ensure only new mentions create records. We do this by calling
  // createMentions with full new content (it deduplicates internally) and
  // then the records are created. Since this is append-only, we only run
  // when there are truly new mentions detected above.
  await mentionService.createMentions({
    companyUuid,
    sourceType,
    sourceUuid,
    content: newContent,
    actorType,
    actorUuid,
    projectUuid,
    entityTitle,
  });

  // Log activity for each new mention
  for (const mention of brandNewMentions) {
    if (mention.type === actorType && mention.uuid === actorUuid) continue;
    await activityService.createActivity({
      companyUuid,
      projectUuid,
      targetType: sourceType,
      targetUuid: sourceUuid,
      actorType,
      actorUuid,
      action: "mentioned",
      value: {
        mentionedType: mention.type,
        mentionedUuid: mention.uuid,
        mentionedName: mention.displayName,
        sourceType,
        sourceUuid,
      },
    });
  }
}

// ===== Dependency Management =====

// DFS cycle detection: check if targetUuid is reachable from startUuid via existing edges
async function wouldCreateCycle(
  startUuid: string,
  targetUuid: string
): Promise<boolean> {
  // Get all dependency edges within the project
  const allDeps = await prisma.taskDependency.findMany({
    select: { taskUuid: true, dependsOnUuid: true },
  });

  // Build adjacency list: taskUuid depends on dependsOnUuid
  // If adding edge: taskUuid=targetUuid -> dependsOnUuid=startUuid
  // Need to check if startUuid can reach targetUuid via existing edges
  const adjacency = new Map<string, string[]>();
  for (const dep of allDeps) {
    if (!adjacency.has(dep.taskUuid)) {
      adjacency.set(dep.taskUuid, []);
    }
    adjacency.get(dep.taskUuid)!.push(dep.dependsOnUuid);
  }

  // DFS from startUuid following existing edges (taskUuid -> dependsOnUuid)
  const visited = new Set<string>();
  const stack = [startUuid];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === targetUuid) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const neighbors = adjacency.get(current) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        stack.push(neighbor);
      }
    }
  }

  return false;
}

// Add task dependency
export async function addTaskDependency(
  companyUuid: string,
  taskUuid: string,
  dependsOnUuid: string
): Promise<{ taskUuid: string; dependsOnUuid: string; createdAt: Date }> {
  // Cannot depend on itself
  if (taskUuid === dependsOnUuid) {
    throw new Error("A task cannot depend on itself");
  }

  // Verify both tasks exist and belong to the same project
  const [task, dependsOnTask] = await Promise.all([
    prisma.task.findFirst({ where: { uuid: taskUuid, companyUuid } }),
    prisma.task.findFirst({ where: { uuid: dependsOnUuid, companyUuid } }),
  ]);

  if (!task) throw new Error("Task not found");
  if (!dependsOnTask) throw new Error("Dependency task not found");

  if (task.projectUuid !== dependsOnTask.projectUuid) {
    throw new Error("Tasks must belong to the same project");
  }

  // Cycle detection: if adding the edge taskUuid -> dependsOnUuid,
  // check if dependsOnUuid can reach taskUuid via existing edges (forming a cycle)
  const cycleDetected = await wouldCreateCycle(dependsOnUuid, taskUuid);
  if (cycleDetected) {
    throw new Error("Adding this dependency would create a cycle");
  }

  const dep = await prisma.taskDependency.create({
    data: { taskUuid, dependsOnUuid },
  });

  return { taskUuid: dep.taskUuid, dependsOnUuid: dep.dependsOnUuid, createdAt: dep.createdAt };
}

// Remove task dependency
export async function removeTaskDependency(
  companyUuid: string,
  taskUuid: string,
  dependsOnUuid: string
): Promise<void> {
  // Verify task belongs to this company
  const task = await prisma.task.findFirst({ where: { uuid: taskUuid, companyUuid } });
  if (!task) throw new Error("Task not found");

  await prisma.taskDependency.deleteMany({
    where: { taskUuid, dependsOnUuid },
  });
}

// Get task dependencies
export async function getTaskDependencies(
  companyUuid: string,
  taskUuid: string
): Promise<{ dependsOn: TaskDependencyInfo[]; dependedBy: TaskDependencyInfo[] }> {
  const task = await prisma.task.findFirst({
    where: { uuid: taskUuid, companyUuid },
    include: dependencyInclude,
  });

  if (!task) throw new Error("Task not found");

  return {
    dependsOn: task.dependsOn.map((d) => ({
      uuid: d.dependsOn.uuid,
      title: d.dependsOn.title,
      status: d.dependsOn.status,
    })),
    dependedBy: task.dependedBy.map((d) => ({
      uuid: d.task.uuid,
      title: d.task.title,
      status: d.task.status,
    })),
  };
}

// Get unblocked tasks (all dependencies are resolved)
export async function getUnblockedTasks({
  companyUuid,
  projectUuid,
}: {
  companyUuid: string;
  projectUuid: string;
}): Promise<{ tasks: TaskResponse[]; total: number }> {
  const where = {
    projectUuid,
    companyUuid,
    status: { in: ["open", "assigned"] },
    // Exclude tasks that have any dependency NOT in done/to_verify
    NOT: {
      dependsOn: {
        some: {
          dependsOn: {
            status: { notIn: ["done", "to_verify"] },
          },
        },
      },
    },
  };

  const [rawTasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      select: {
        uuid: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        storyPoints: true,
        acceptanceCriteria: true,
        assigneeType: true,
        assigneeUuid: true,
        assignedAt: true,
        assignedByUuid: true,
        proposalUuid: true,
        createdByUuid: true,
        createdAt: true,
        updatedAt: true,
        ...dependencyInclude,
      },
    }),
    prisma.task.count({ where }),
  ]);

  const commentCounts = await batchCommentCounts(
    companyUuid,
    "task",
    rawTasks.map((t) => t.uuid),
  );

  const tasks = await Promise.all(
    rawTasks.map((t) => formatTaskResponse(t, commentCounts[t.uuid] ?? 0)),
  );
  return { tasks, total };
}

// Get all task dependencies within a project (for DAG visualization)
export async function getProjectTaskDependencies(
  companyUuid: string,
  projectUuid: string
): Promise<{
  nodes: Array<{ uuid: string; title: string; status: string; priority: string }>;
  edges: Array<{ from: string; to: string }>;
}> {
  const [tasks, dependencies] = await Promise.all([
    prisma.task.findMany({
      where: { companyUuid, projectUuid },
      select: { uuid: true, title: true, status: true, priority: true },
    }),
    prisma.taskDependency.findMany({
      where: {
        task: { companyUuid, projectUuid },
      },
      select: { taskUuid: true, dependsOnUuid: true },
    }),
  ]);

  return {
    nodes: tasks.map((t) => ({
      uuid: t.uuid,
      title: t.title,
      status: t.status,
      priority: t.priority,
    })),
    edges: dependencies.map((d) => ({
      from: d.taskUuid,
      to: d.dependsOnUuid,
    })),
  };
}
