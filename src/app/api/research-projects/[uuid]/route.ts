// src/app/api/research-projects/[uuid]/route.ts
// Research Projects API - Detail, Update, Delete (ARCHITECTURE.md §5.1)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import {
  deleteResearchProject,
  getResearchProject,
  getResearchProjectByUuid,
  getResearchProjectDetailRef,
  updateResearchProject,
} from "@/services/research-project.service";
import { checkAutonomousLoopTrigger } from "@/services/experiment.service";
import { getProjectMetricsSnapshot, toProjectCompatibilityCounts } from "@/services/project-metrics.service";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/research-projects/[uuid] - Research Project Detail
export const GET = withErrorHandler(async (request: NextRequest, context: RouteContext) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  const { uuid } = await context.params;

  const [researchProject, metrics, projectGithub] = await Promise.all([
    getResearchProject(auth.companyUuid, uuid),
    getProjectMetricsSnapshot(auth.companyUuid, uuid),
    getResearchProjectByUuid(auth.companyUuid, uuid),
  ]);

  if (!researchProject) {
    return errors.notFound("Research Project");
  }

  return success({
    uuid: researchProject.uuid,
    name: researchProject.name,
    description: researchProject.description,
    createdAt: researchProject.createdAt.toISOString(),
    updatedAt: researchProject.updatedAt.toISOString(),
    repoUrl: projectGithub?.repoUrl ?? null,
    githubUsername: projectGithub?.githubUsername ?? null,
    githubConfigured: !!(projectGithub?.githubToken),
    counts: {
      ...toProjectCompatibilityCounts(metrics),
      activities: researchProject._count.activities,
    },
  });
});

// PATCH /api/research-projects/[uuid] - Update Research Project
export const PATCH = withErrorHandler(async (request: NextRequest, context: RouteContext) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  // Only users can update research projects
  if (!isUser(auth)) {
    return errors.forbidden("Only users can update research projects");
  }

  const { uuid } = await context.params;

  // Validate research project exists and belongs to the current company (query by UUID)
  const existing = await getResearchProjectDetailRef(auth.companyUuid, uuid);

  if (!existing) {
    return errors.notFound("Research Project");
  }

  const body = await parseBody<{
    name?: string;
    description?: string;
    datasets?: string[];
    evaluationMethods?: string[];
    computePoolUuid?: string | null;
    autonomousLoopEnabled?: boolean;
    autonomousLoopAgentUuid?: string | null;
    autoSearchEnabled?: boolean;
    autoSearchAgentUuid?: string | null;
    repoUrl?: string | null;
    githubUsername?: string | null;
    githubToken?: string | null;
  }>(request);

  // Build update data
  const updateData: {
    name?: string;
    description?: string | null;
    datasets?: string[] | null;
    evaluationMethods?: string[] | null;
    computePoolUuid?: string | null;
    autonomousLoopEnabled?: boolean;
    autonomousLoopAgentUuid?: string | null;
    autoSearchEnabled?: boolean;
    autoSearchAgentUuid?: string | null;
    repoUrl?: string | null;
    githubUsername?: string | null;
    githubToken?: string | null;
  } = {};

  if (body.name !== undefined) {
    if (body.name.trim() === "") {
      return errors.validationError({ name: "Name cannot be empty" });
    }
    updateData.name = body.name.trim();
  }

  if (body.description !== undefined) {
    updateData.description = body.description?.trim() || null;
  }

  if (body.datasets !== undefined) {
    updateData.datasets = Array.isArray(body.datasets) && body.datasets.length > 0
      ? body.datasets
      : null;
  }

  if (body.evaluationMethods !== undefined) {
    updateData.evaluationMethods = Array.isArray(body.evaluationMethods) && body.evaluationMethods.length > 0
      ? body.evaluationMethods
      : null;
  }

  if (body.computePoolUuid !== undefined) {
    updateData.computePoolUuid = body.computePoolUuid || null;
  }

  if (body.autonomousLoopEnabled !== undefined) {
    updateData.autonomousLoopEnabled = body.autonomousLoopEnabled;
  }

  if (body.autonomousLoopAgentUuid !== undefined) {
    updateData.autonomousLoopAgentUuid = body.autonomousLoopAgentUuid || null;
  }

  if (body.autoSearchEnabled !== undefined) {
    updateData.autoSearchEnabled = body.autoSearchEnabled;
  }

  if (body.autoSearchAgentUuid !== undefined) {
    updateData.autoSearchAgentUuid = body.autoSearchAgentUuid || null;
  }

  if (body.repoUrl !== undefined) {
    updateData.repoUrl = body.repoUrl?.trim() || null;
  }

  if (body.githubUsername !== undefined) {
    updateData.githubUsername = body.githubUsername?.trim() || null;
  }

  if (body.githubToken && body.githubToken.trim() !== "") {
    updateData.githubToken = body.githubToken.trim();
  }

  const researchProject = await updateResearchProject(existing.uuid, updateData);

  // If autonomous loop was just enabled, check trigger immediately
  if (body.autonomousLoopEnabled === true && body.autonomousLoopAgentUuid) {
    checkAutonomousLoopTrigger(existing.uuid, auth.companyUuid).catch(() => {});
  }

  return success({
    uuid: researchProject.uuid,
    name: researchProject.name,
    description: researchProject.description,
    createdAt: researchProject.createdAt.toISOString(),
    updatedAt: researchProject.updatedAt.toISOString(),
  });
});

// DELETE /api/research-projects/[uuid] - Delete Research Project
export const DELETE = withErrorHandler(async (request: NextRequest, context: RouteContext) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  // Only users can delete research projects
  if (!isUser(auth)) {
    return errors.forbidden("Only users can delete research projects");
  }

  const { uuid } = await context.params;

  // Validate research project exists and belongs to the current company (query by UUID)
  const existing = await getResearchProjectDetailRef(auth.companyUuid, uuid);

  if (!existing) {
    return errors.notFound("Research Project");
  }

  // Delete research project (Prisma handles cascade deletes at the application level)
  await deleteResearchProject(existing.uuid);

  return success({ deleted: true });
});
