import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listPaperFeedItems } from "@/services/paper-feed.service";

type RouteContext = { params: Promise<{ uuid: string }> };

export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) return errors.unauthorized();
    if (!isUser(auth)) return errors.forbidden("Only users can view paper feeds");

    const { uuid: projectUuid } = await context.params;
    const project = await prisma.researchProject.findFirst({
      where: { uuid: projectUuid, companyUuid: auth.companyUuid },
      select: {
        uuid: true,
        paperFeedEnabled: true,
        paperFeedAgentUuid: true,
        paperFeedActiveAgentUuid: true,
        paperFeedStartedAt: true,
        paperFeedLastRunAt: true,
      },
    });
    if (!project) return errors.notFound("Research Project");

    const [itemsByDate, runs] = await Promise.all([
      listPaperFeedItems({
        companyUuid: auth.companyUuid,
        researchProjectUuid: projectUuid,
      }),
      prisma.paperFeedRun.findMany({
        where: {
          companyUuid: auth.companyUuid,
          researchProjectUuid: projectUuid,
        },
        orderBy: { feedDate: "desc" },
        take: 30,
        select: {
          uuid: true,
          feedDate: true,
          status: true,
          paperCount: true,
          errorMessage: true,
          triggeredBy: true,
          startedAt: true,
          completedAt: true,
        },
      }),
    ]);

    return success({ config: project, itemsByDate, runs });
  }
);
