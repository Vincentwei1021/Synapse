// src/app/api/research-projects/[uuid]/available/route.ts
// Agent Self-Service API - Get Claimable Research Questions + Experiment Runs (PRD §5.4)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isAgent, isResearchLead, isResearcher } from "@/lib/auth";
import { getResearchProjectByUuid } from "@/services/research-project.service";
import { getAvailableItems } from "@/services/assignment.service";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/research-projects/[uuid]/available - Get claimable Research Questions + Experiment Runs
export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid: researchProjectUuid } = await context.params;

    // Find research project
    const researchProject = await getResearchProjectByUuid(auth.companyUuid, researchProjectUuid);
    if (!researchProject) {
      return errors.notFound("Research Project");
    }

    // Return different content based on role
    // Research Lead: can claim Research Questions
    // Researcher: can claim Experiment Runs
    // User: can see everything
    const canClaimResearchQuestions = isAgent(auth) ? isResearchLead(auth) : true;
    const canClaimExperimentRuns = isAgent(auth) ? isResearcher(auth) : true;

    const result = await getAvailableItems(
      auth.companyUuid,
      researchProjectUuid,
      canClaimResearchQuestions,
      canClaimExperimentRuns
    );

    return success({
      researchProject: {
        uuid: researchProject.uuid,
        name: researchProject.name,
      },
      ...result,
    });
  }
);
