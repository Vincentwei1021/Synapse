// src/app/api/research-questions/[uuid]/claim/route.ts
// Research Questions API - Claim Research Question (PRD §4.1 F5 claiming rules)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isResearchLead, isUser } from "@/lib/auth";
import { getResearchQuestionByUuid, claimResearchQuestion } from "@/services/research-question.service";
import { resolveAssignmentTarget } from "@/services/assignment-policy.service";
import { AlreadyClaimedError } from "@/lib/errors";

type RouteContext = { params: Promise<{ uuid: string }> };

// POST /api/research-questions/[uuid]/claim - Claim Research Question
export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid } = await context.params;

    const researchQuestion = await getResearchQuestionByUuid(auth.companyUuid, uuid);
    if (!researchQuestion) {
      return errors.notFound("Research Question");
    }

    const body = isUser(auth)
      ? await parseBody<{
          assignToSelf?: boolean;
          agentUuid?: string;
        }>(request)
      : undefined;

    const assignment = await resolveAssignmentTarget({
      auth,
      companyUuid: auth.companyUuid,
      body,
      allowAgentClaim: isResearchLead,
      agentClaimForbiddenMessage: "Only research lead agents can claim research questions",
      assignableAgentRole: "pm",
      assignableAgentLabel: "Research Lead Agent",
    });

    if (!assignment.ok) {
      return assignment.error === "not_found"
        ? errors.notFound("Research Lead Agent")
        : errors.forbidden(assignment.message);
    }

    try {
      const updated = await claimResearchQuestion({
        researchQuestionUuid: researchQuestion.uuid,
        companyUuid: auth.companyUuid,
        assigneeType: assignment.target.assigneeType,
        assigneeUuid: assignment.target.assigneeUuid,
        assignedByUuid: assignment.target.assignedByUuid,
      });

      return success(updated);
    } catch (e) {
      if (e instanceof AlreadyClaimedError) {
        return errors.alreadyClaimed();
      }
      throw e;
    }
  }
);
