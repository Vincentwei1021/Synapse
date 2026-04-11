// src/app/api/onboarding/status/route.ts
import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) return errors.unauthorized();
  if (!isUser(auth)) return errors.forbidden("Only users can check onboarding status");

  const [agentCount, sessionCount, poolCount, projectCount] = await Promise.all([
    prisma.agent.count({ where: { companyUuid: auth.companyUuid, ownerUuid: auth.actorUuid } }),
    prisma.agentSession.count({ where: { companyUuid: auth.companyUuid, agent: { ownerUuid: auth.actorUuid } } }),
    prisma.computePool.count({ where: { companyUuid: auth.companyUuid } }),
    prisma.researchProject.count({ where: { companyUuid: auth.companyUuid } }),
  ]);

  return success({
    hasAgent: agentCount > 0,
    hasAgentSession: sessionCount > 0,
    hasComputePool: poolCount > 0,
    hasProject: projectCount > 0,
  });
});
