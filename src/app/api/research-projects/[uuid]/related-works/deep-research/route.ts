import { NextRequest } from "next/server";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api-handler";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as notificationService from "@/services/notification.service";

type RouteContext = { params: Promise<{ uuid: string }> };

const bodySchema = z.object({ agentUuid: z.string() });

export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) return errors.unauthorized();
    if (!isUser(auth)) return errors.forbidden("Only users can trigger deep research");

    const { uuid: projectUuid } = await context.params;
    const project = await prisma.researchProject.findFirst({
      where: { uuid: projectUuid, companyUuid: auth.companyUuid },
      select: { name: true },
    });
    if (!project) return errors.notFound("Research Project");

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return errors.validationError(parsed.error.flatten().fieldErrors);

    await notificationService.create({
      companyUuid: auth.companyUuid,
      researchProjectUuid: projectUuid,
      recipientType: "agent",
      recipientUuid: parsed.data.agentUuid,
      entityType: "research_project",
      entityUuid: projectUuid,
      entityTitle: project.name,
      projectName: project.name,
      action: "deep_research_requested",
      message: "Generate a deep research literature review for this project.",
      actorType: "user",
      actorUuid: auth.actorUuid,
      actorName: "User",
    });

    return success({ triggered: true });
  }
);
