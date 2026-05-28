import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { eventBus } from "@/lib/event-bus";
import { completePaperFeedRun } from "@/services/paper-feed.service";

export const POST = withErrorHandler<{ uuid: string }>(async (
  req: NextRequest,
  ctx: { params: Promise<{ uuid: string }> },
) => {
  const auth = await getAuthContext(req);
  if (!auth) return errors.unauthorized();
  if (!isUser(auth)) return errors.forbidden();
  const { uuid } = await ctx.params;

  const project = await prisma.researchProject.findFirst({
    where: { uuid, companyUuid: auth.companyUuid },
    select: { uuid: true, paperFeedActiveAgentUuid: true, paperFeedStartedAt: true },
  });
  if (!project) return errors.notFound("Research Project");

  // Find any in-flight run for this project. Fail-marking it via
  // completePaperFeedRun also clears the project active flags + notifies the
  // owner, mirroring the "real" failure path so the audit trail is honest.
  const inFlight = await prisma.paperFeedRun.findFirst({
    where: {
      researchProjectUuid: uuid,
      status: { in: ["pending", "running"] },
    },
    orderBy: { startedAt: "desc" },
    select: { uuid: true },
  });

  if (inFlight) {
    await completePaperFeedRun({
      feedRunUuid: inFlight.uuid,
      status: "failed",
      errorMessage: "manually reset",
    });
    return success({ cleared: true });
  }

  // No in-flight run, but the project may still hold stale active flags
  // (e.g. an older agent crashed before completePaperFeedRun ran). Clear them
  // directly.
  if (project.paperFeedActiveAgentUuid || project.paperFeedStartedAt) {
    await prisma.researchProject.update({
      where: { uuid },
      data: { paperFeedActiveAgentUuid: null, paperFeedStartedAt: null },
    });
    eventBus.emitChange({
      companyUuid: auth.companyUuid,
      researchProjectUuid: uuid,
      entityType: "research_project",
      entityUuid: uuid,
      action: "updated",
    });
    return success({ cleared: true });
  }

  return success({ cleared: false });
});
