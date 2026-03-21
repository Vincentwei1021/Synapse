// src/services/assignment.service.ts
// Assignment Service Layer - Agent self-service queries (PRD §5.4)
// UUID-Based Architecture: All operations use UUIDs

import { prisma } from "@/lib/prisma";
import type { AuthContext } from "@/types/auth";
import { isAgent } from "@/lib/auth";
import { formatAssignee, formatCreatedBy } from "@/lib/uuid-resolver";

// ===== Type Definitions =====

// Claimed Research Question response format
export interface AssignedResearchQuestionResponse {
  uuid: string;
  title: string;
  content: string | null;
  status: string;
  assignee: { type: string; uuid: string; name: string } | null;
  assignedAt: string | null;
  project: { uuid: string; name: string };
  createdAt: string;
  updatedAt: string;
}

// Claimed Experiment Run response format
export interface AssignedExperimentRunResponse {
  uuid: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignee: { type: string; uuid: string; name: string } | null;
  assignedAt: string | null;
  project: { uuid: string; name: string };
  createdAt: string;
  updatedAt: string;
}

// Available Research Question response format
export interface AvailableResearchQuestionResponse {
  uuid: string;
  title: string;
  content: string | null;
  status: string;
  createdBy: { type: string; uuid: string; name: string } | null;
  createdAt: string;
}

// Available Experiment Run response format
export interface AvailableExperimentRunResponse {
  uuid: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  createdBy: { type: string; uuid: string; name: string } | null;
  createdAt: string;
}

// My assignments response
export interface MyAssignmentsResponse {
  researchQuestions: AssignedResearchQuestionResponse[];
  experimentRuns: AssignedExperimentRunResponse[];
}

// Available items response
export interface AvailableItemsResponse {
  researchQuestions: AvailableResearchQuestionResponse[];
  experimentRuns: AvailableExperimentRunResponse[];
}

// ===== Internal Helper Functions =====

// Get assignment conditions for the current user/Agent
function getAssignmentConditions(auth: AuthContext) {
  const conditions: Array<{ assigneeType: string; assigneeUuid: string }> = [];

  if (isAgent(auth)) {
    // Directly claimed by Agent
    conditions.push({ assigneeType: "agent", assigneeUuid: auth.actorUuid });
    // Claimed by Agent's Owner ("Assign to myself")
    if (auth.ownerUuid) {
      conditions.push({ assigneeType: "user", assigneeUuid: auth.ownerUuid });
    }
  } else {
    // Directly claimed by user
    conditions.push({ assigneeType: "user", assigneeUuid: auth.actorUuid });
  }

  return conditions;
}

// Format claimed Research Question
async function formatAssignedResearchQuestion(idea: {
  uuid: string;
  title: string;
  content: string | null;
  status: string;
  assigneeType: string | null;
  assigneeUuid: string | null;
  assignedAt: Date | null;
  project: { uuid: string; name: string };
  createdAt: Date;
  updatedAt: Date;
}): Promise<AssignedResearchQuestionResponse> {
  const assignee = await formatAssignee(idea.assigneeType, idea.assigneeUuid);

  return {
    uuid: idea.uuid,
    title: idea.title,
    content: idea.content,
    status: idea.status,
    assignee,
    assignedAt: idea.assignedAt?.toISOString() ?? null,
    project: idea.project,
    createdAt: idea.createdAt.toISOString(),
    updatedAt: idea.updatedAt.toISOString(),
  };
}

// Format claimed Experiment Run
async function formatAssignedExperimentRun(task: {
  uuid: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigneeType: string | null;
  assigneeUuid: string | null;
  assignedAt: Date | null;
  project: { uuid: string; name: string };
  createdAt: Date;
  updatedAt: Date;
}): Promise<AssignedExperimentRunResponse> {
  const assignee = await formatAssignee(task.assigneeType, task.assigneeUuid);

  return {
    uuid: task.uuid,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    assignee,
    assignedAt: task.assignedAt?.toISOString() ?? null,
    project: task.project,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

// Format available Research Question
async function formatAvailableResearchQuestion(idea: {
  uuid: string;
  title: string;
  content: string | null;
  status: string;
  createdByUuid: string;
  createdAt: Date;
}): Promise<AvailableResearchQuestionResponse> {
  const createdBy = await formatCreatedBy(idea.createdByUuid);

  return {
    uuid: idea.uuid,
    title: idea.title,
    content: idea.content,
    status: idea.status,
    createdBy,
    createdAt: idea.createdAt.toISOString(),
  };
}

// Format available Experiment Run
async function formatAvailableExperimentRun(task: {
  uuid: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  createdByUuid: string;
  createdAt: Date;
}): Promise<AvailableExperimentRunResponse> {
  const createdBy = await formatCreatedBy(task.createdByUuid);

  return {
    uuid: task.uuid,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    createdBy,
    createdAt: task.createdAt.toISOString(),
  };
}

// ===== Service Methods =====

// Get my claimed Research Questions + Experiment Runs
export async function getMyAssignments(
  auth: AuthContext,
  researchProjectUuids?: string[],
): Promise<MyAssignmentsResponse> {
  const conditions = getAssignmentConditions(auth);

  const [rawResearchQuestions, rawExperimentRuns] = await Promise.all([
    // Get claimed Research Questions
    prisma.researchQuestion.findMany({
      where: {
        companyUuid: auth.companyUuid,
        ...(researchProjectUuids && researchProjectUuids.length > 0 && { researchProjectUuid: { in: researchProjectUuids } }),
        OR: conditions,
        status: { notIn: ["completed", "closed"] },
      },
      select: {
        uuid: true,
        title: true,
        content: true,
        status: true,
        assigneeType: true,
        assigneeUuid: true,
        assignedAt: true,
        project: { select: { uuid: true, name: true } },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { assignedAt: "desc" },
    }),
    // Get claimed Experiment Runs
    prisma.experimentRun.findMany({
      where: {
        companyUuid: auth.companyUuid,
        ...(researchProjectUuids && researchProjectUuids.length > 0 && { researchProjectUuid: { in: researchProjectUuids } }),
        OR: conditions,
        status: { notIn: ["done", "closed"] },
      },
      select: {
        uuid: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        assigneeType: true,
        assigneeUuid: true,
        assignedAt: true,
        project: { select: { uuid: true, name: true } },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ priority: "desc" }, { assignedAt: "desc" }],
    }),
  ]);

  const [researchQuestions, experimentRuns] = await Promise.all([
    Promise.all(rawResearchQuestions.map(formatAssignedResearchQuestion)),
    Promise.all(rawExperimentRuns.map(formatAssignedExperimentRun)),
  ]);

  return { researchQuestions, experimentRuns };
}

// Get available Research Questions + Experiment Runs in a research project
export async function getAvailableItems(
  companyUuid: string,
  researchProjectUuid: string,
  canClaimResearchQuestions: boolean,
  canClaimExperimentRuns: boolean,
  experimentDesignUuids?: string[],
): Promise<AvailableItemsResponse> {
  const baseWhere = { researchProjectUuid, companyUuid, status: "open" };
  const experimentRunWhere = {
    ...baseWhere,
    ...(experimentDesignUuids && experimentDesignUuids.length > 0 && { experimentDesignUuid: { in: experimentDesignUuids } }),
  };

  const [rawResearchQuestions, rawExperimentRuns] = await Promise.all([
    canClaimResearchQuestions
      ? prisma.researchQuestion.findMany({
          where: baseWhere,
          select: {
            uuid: true,
            title: true,
            content: true,
            status: true,
            createdByUuid: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : [],
    canClaimExperimentRuns
      ? prisma.experimentRun.findMany({
          where: experimentRunWhere,
          select: {
            uuid: true,
            title: true,
            description: true,
            status: true,
            priority: true,
            createdByUuid: true,
            createdAt: true,
          },
          orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
          take: 50,
        })
      : [],
  ]);

  const [researchQuestions, experimentRuns] = await Promise.all([
    Promise.all(rawResearchQuestions.map(formatAvailableResearchQuestion)),
    Promise.all(rawExperimentRuns.map(formatAvailableExperimentRun)),
  ]);

  return { researchQuestions, experimentRuns };
}
