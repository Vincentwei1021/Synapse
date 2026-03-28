// src/app/api/experiment-runs/[uuid]/claim/route.ts
// Experiment Runs API - Claim Experiment Run (PRD §3.3.1 claiming rules)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isResearcher, isUser } from "@/lib/auth";
import { getExperimentRunByUuid, claimExperimentRun } from "@/services/experiment-run.service";
import { resolveAssignmentTarget } from "@/services/assignment-policy.service";
import { AlreadyClaimedError } from "@/lib/errors";

type RouteContext = { params: Promise<{ uuid: string }> };

// POST /api/experiment-runs/[uuid]/claim - Claim Experiment Run
export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid } = await context.params;

    const experimentRun = await getExperimentRunByUuid(auth.companyUuid, uuid);
    if (!experimentRun) {
      return errors.notFound("Experiment Run");
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
      allowAgentClaim: isResearcher,
      agentClaimForbiddenMessage: "Only researcher agents can claim experiment runs",
      assignableAgentRole: "developer",
      assignableAgentLabel: "Researcher Agent",
    });

    if (!assignment.ok) {
      return assignment.error === "not_found"
        ? errors.notFound("Researcher Agent")
        : errors.forbidden(assignment.message);
    }

    try {
      const updated = await claimExperimentRun({
        runUuid: experimentRun.uuid,
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
