// src/app/api/experiment-runs/[uuid]/claim/route.ts
// Experiment Runs API - Claim Experiment Run (PRD §3.3.1 claiming rules)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser, isAgent, isResearcher } from "@/lib/auth";
import { getExperimentRunByUuid, claimExperimentRun } from "@/services/experiment-run.service";
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

    let assigneeType: string;
    let assigneeUuid: string;
    let assignedByUuid: string | null = null;

    if (isAgent(auth)) {
      // Agent claim - Researcher Agents can claim
      if (!isResearcher(auth)) {
        return errors.forbidden("Only researcher agents can claim experiment runs");
      }
      assigneeType = "agent";
      assigneeUuid = auth.actorUuid;
    } else if (isUser(auth)) {
      // User claim - can choose to assign to self or a specific Agent
      const body = await parseBody<{
        assignToSelf?: boolean;
        agentUuid?: string;
      }>(request);

      if (body.agentUuid) {
        // Assign to a specific Agent (by UUID)
        const agent = await prisma.agent.findFirst({
          where: {
            uuid: body.agentUuid,
            companyUuid: auth.companyUuid,
            roles: { has: "developer" }, // Can only assign to Researcher Agents
          },
        });

        if (!agent) {
          return errors.notFound("Researcher Agent");
        }

        assigneeType = "agent";
        assigneeUuid = agent.uuid;
        assignedByUuid = auth.actorUuid;
      } else {
        // Assign to self (all owned Researcher Agents can handle it)
        assigneeType = "user";
        assigneeUuid = auth.actorUuid;
        assignedByUuid = auth.actorUuid;
      }
    } else {
      return errors.forbidden("Invalid authentication context");
    }

    try {
      const updated = await claimExperimentRun({
        runUuid: experimentRun.uuid,
        companyUuid: auth.companyUuid,
        assigneeType,
        assigneeUuid,
        assignedByUuid,
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
