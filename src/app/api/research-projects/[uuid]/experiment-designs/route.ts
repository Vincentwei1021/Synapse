// src/app/api/research-projects/[uuid]/experiment-designs/route.ts
// Experiment Designs API - List and Create (ARCHITECTURE.md §5.1, PRD §4.1 F5)
// UUID-Based Architecture: All operations use UUIDs
// Container Model: ExperimentDesign contains documentDrafts and runDrafts

import { NextRequest } from "next/server";
import { withErrorHandler, parseBody, parsePagination } from "@/lib/api-handler";
import { success, paginated, errors } from "@/lib/api-response";
import { getAuthContext, isAgent, isResearchLead, isUser } from "@/lib/auth";
import { researchProjectExists } from "@/services/research-project.service";
import { listExperimentDesigns, createExperimentDesign, type DocumentDraft, type TaskDraft } from "@/services/experiment-design.service";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/research-projects/[uuid]/experiment-designs - List Experiment Designs
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

    // Validate research project exists
    if (!(await researchProjectExists(auth.companyUuid, researchProjectUuid))) {
      return errors.notFound("Research Project");
    }

    const { experimentDesigns, total } = await listExperimentDesigns({
      companyUuid: auth.companyUuid,
      researchProjectUuid,
      skip,
      take,
      status: statusFilter,
    });

    return paginated(experimentDesigns, page, pageSize, total);
  }
);

// POST /api/research-projects/[uuid]/experiment-designs - Create Experiment Design (container model)
export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    // Research Lead Agent or User can create Experiment Designs
    const canCreate = isUser(auth) || (isAgent(auth) && isResearchLead(auth));
    if (!canCreate) {
      return errors.forbidden("Only research lead agents or users can create experiment designs");
    }

    const { uuid: researchProjectUuid } = await context.params;

    // Validate research project exists
    if (!(await researchProjectExists(auth.companyUuid, researchProjectUuid))) {
      return errors.notFound("Research Project");
    }

    const body = await parseBody<{
      title: string;
      description?: string;
      inputType: "research_question" | "document";
      inputUuids: string[];
      documentDrafts?: DocumentDraft[];
      runDrafts?: TaskDraft[];
    }>(request);

    // Validate required fields
    if (!body.title || body.title.trim() === "") {
      return errors.validationError({ title: "Title is required" });
    }
    if (!body.inputType || !["research_question", "document"].includes(body.inputType)) {
      return errors.validationError({ inputType: "Invalid input type" });
    }
    if (!body.inputUuids || !Array.isArray(body.inputUuids) || body.inputUuids.length === 0) {
      return errors.validationError({ inputUuids: "Input UUIDs are required" });
    }

    // Determine creator type
    const createdByType = isUser(auth) ? "user" : "agent";

    const experimentDesign = await createExperimentDesign({
      companyUuid: auth.companyUuid,
      researchProjectUuid,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      inputType: body.inputType,
      inputUuids: body.inputUuids,
      documentDrafts: body.documentDrafts,
      taskDrafts: body.runDrafts,
      createdByUuid: auth.actorUuid,
      createdByType,
    });

    return success(experimentDesign);
  }
);
