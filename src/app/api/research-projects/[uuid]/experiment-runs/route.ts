// src/app/api/research-projects/[uuid]/experiment-runs/route.ts
// Experiment Runs API - List and Create (ARCHITECTURE.md §5.1, PRD §3.3.1)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { withErrorHandler, parseBody, parsePagination } from "@/lib/api-handler";
import { success, paginated, errors } from "@/lib/api-response";
import { getAuthContext, isUser, isResearchLead } from "@/lib/auth";
import { researchProjectExists } from "@/services/research-project.service";
import { listExperimentRuns, createExperimentRun } from "@/services/experiment-run.service";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/research-projects/[uuid]/experiment-runs - List Experiment Runs
export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid: researchProjectUuid } = await context.params;
    const { page, pageSize, skip, take } = parsePagination(request);

    // Parse filter parameters
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status") || undefined;
    const priorityFilter = url.searchParams.get("priority") || undefined;
    const experimentDesignUuids = url.searchParams.get("experimentDesignUuids")?.split(",").filter(Boolean);

    // Validate research project exists
    if (!(await researchProjectExists(auth.companyUuid, researchProjectUuid))) {
      return errors.notFound("Research Project");
    }

    const { tasks: experimentRuns, total } = await listExperimentRuns({
      companyUuid: auth.companyUuid,
      researchProjectUuid,
      skip,
      take,
      status: statusFilter,
      priority: priorityFilter,
      experimentDesignUuids,
    });

    return paginated(experimentRuns, page, pageSize, total);
  }
);

// POST /api/research-projects/[uuid]/experiment-runs - Create Experiment Run
export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    // Users and Research Lead agents can create Experiment Runs
    if (!isUser(auth) && !isResearchLead(auth)) {
      return errors.forbidden("Only users and research lead agents can create experiment runs");
    }

    const { uuid: researchProjectUuid } = await context.params;

    // Validate research project exists
    if (!(await researchProjectExists(auth.companyUuid, researchProjectUuid))) {
      return errors.notFound("Research Project");
    }

    const body = await parseBody<{
      title: string;
      description?: string;
      priority?: string;
      computeBudgetHours?: number;
    }>(request);

    // Validate required fields
    if (!body.title || body.title.trim() === "") {
      return errors.validationError({ title: "Title is required" });
    }

    // Validate priority
    const validPriorities = ["low", "medium", "high"];
    const priority = body.priority || "medium";
    if (!validPriorities.includes(priority)) {
      return errors.validationError({
        priority: "Priority must be low, medium, or high",
      });
    }

    // Validate computeBudgetHours (unit: agent hours)
    const computeBudgetHours = body.computeBudgetHours;
    if (computeBudgetHours !== undefined && (computeBudgetHours < 0 || computeBudgetHours > 1000)) {
      return errors.validationError({
        computeBudgetHours: "Compute budget hours must be between 0 and 1000 agent hours",
      });
    }

    const experimentRun = await createExperimentRun({
      companyUuid: auth.companyUuid,
      researchProjectUuid,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      priority,
      computeBudgetHours: computeBudgetHours || null,
      createdByUuid: auth.actorUuid,
    });

    return success(experimentRun);
  }
);
