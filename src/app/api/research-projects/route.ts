// src/app/api/research-projects/route.ts
// Research Projects API - List and Create (ARCHITECTURE.md §5.1)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { withErrorHandler, parseBody, parsePagination } from "@/lib/api-handler";
import { success, paginated, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { getProjectGroupRef } from "@/services/project-group.service";
import { createResearchProject, listResearchProjectsWithStats } from "@/services/research-project.service";
import { toProjectCompatibilityCounts } from "@/services/project-metrics.service";

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

// GET /api/research-projects - List Research Projects
export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  const { page, pageSize, skip, take } = parsePagination(request);

  const { projects: researchProjects, total } = await listResearchProjectsWithStats({
    companyUuid: auth.companyUuid,
    skip,
    take,
  });

  // Transform to API response format
  const data = researchProjects.map((p) => ({
    uuid: p.uuid,
    name: p.name,
    description: p.description,
    goal: p.goal,
    datasets: p.datasets,
    evaluationMethods: p.evaluationMethods,
    latestSynthesisAt: p.latestSynthesisAt?.toISOString() ?? null,
    latestSynthesisIdeaCount: p.latestSynthesisIdeaCount ?? 0,
    latestSynthesisSummary: p.latestSynthesisSummary,
    groupUuid: p.groupUuid,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    counts: toProjectCompatibilityCounts(p.metrics),
  }));

  return paginated(data, page, pageSize, total);
});

// POST /api/research-projects - Create Research Project
export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  // Only users can create research projects
  if (!isUser(auth)) {
    return errors.forbidden("Only users can create research projects");
  }

  const body = await parseBody<{
    name: string;
    description?: string;
    goal?: string;
    datasets?: string[] | string;
    evaluationMethods?: string[] | string;
    groupUuid?: string;
  }>(request);

  // Validate required fields
  if (!body.name || body.name.trim() === "") {
    return errors.validationError({ name: "Name is required" });
  }

  // Validate groupUuid belongs to the same company if provided
  if (body.groupUuid) {
    const group = await getProjectGroupRef(auth.companyUuid, body.groupUuid);
    if (!group) {
      return errors.notFound("Project Group");
    }
  }

  const researchProject = await createResearchProject({
    companyUuid: auth.companyUuid,
    name: body.name.trim(),
    description: body.description?.trim() || null,
    goal: body.goal?.trim() || null,
    datasets: normalizeStringArray(body.datasets),
    evaluationMethods: normalizeStringArray(body.evaluationMethods),
    groupUuid: body.groupUuid || null,
  });

  return success({
    uuid: researchProject.uuid,
    name: researchProject.name,
    description: researchProject.description,
    goal: researchProject.goal,
    datasets: researchProject.datasets,
    evaluationMethods: researchProject.evaluationMethods,
    createdAt: researchProject.createdAt.toISOString(),
    updatedAt: researchProject.updatedAt.toISOString(),
  });
});
