// src/app/api/research-questions/[uuid]/claim/route.ts
// Research Questions API - Claim Research Question (PRD §4.1 F5 claiming rules)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser, isAgent, isResearchLead } from "@/lib/auth";
import { getResearchQuestionByUuid, claimResearchQuestion } from "@/services/research-question.service";
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

    let assigneeType: string;
    let assigneeUuid: string;
    let assignedByUuid: string | null = null;

    if (isAgent(auth)) {
      // Agent claim - must be a Research Lead Agent
      if (!isResearchLead(auth)) {
        return errors.forbidden("Only research lead agents can claim research questions");
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
            roles: { has: "pm" }, // Can only assign to Research Lead Agents
          },
        });

        if (!agent) {
          return errors.notFound("Research Lead Agent");
        }

        assigneeType = "agent";
        assigneeUuid = agent.uuid;
        assignedByUuid = auth.actorUuid;
      } else {
        // Assign to self (all owned Research Lead Agents can handle it)
        assigneeType = "user";
        assigneeUuid = auth.actorUuid;
        assignedByUuid = auth.actorUuid;
      }
    } else {
      return errors.forbidden("Invalid authentication context");
    }

    try {
      const updated = await claimResearchQuestion({
        researchQuestionUuid: researchQuestion.uuid,
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
