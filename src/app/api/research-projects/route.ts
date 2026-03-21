// src/app/api/research-projects/route.ts
// Research Projects API - List and Create (ARCHITECTURE.md §5.1)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler, parseBody, parsePagination } from "@/lib/api-handler";
import { success, paginated, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";

// GET /api/research-projects - List Research Projects
export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  const { page, pageSize, skip, take } = parsePagination(request);

  const [researchProjects, total] = await Promise.all([
    prisma.researchProject.findMany({
      where: { companyUuid: auth.companyUuid },
      skip,
      take,
      orderBy: { updatedAt: "desc" },
      select: {
        uuid: true,
        name: true,
        description: true,
        groupUuid: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            researchQuestions: true,
            documents: true,
            experimentRuns: true,
            experimentDesigns: true,
          },
        },
        experimentRuns: {
          where: { status: "done" },
          select: { uuid: true },
        },
      },
    }),
    prisma.researchProject.count({
      where: { companyUuid: auth.companyUuid },
    }),
  ]);

  // Transform to API response format
  const data = researchProjects.map((p) => ({
    uuid: p.uuid,
    name: p.name,
    description: p.description,
    groupUuid: p.groupUuid,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    counts: {
      researchQuestions: p._count.researchQuestions,
      documents: p._count.documents,
      experimentRuns: p._count.experimentRuns,
      doneExperimentRuns: p.experimentRuns.length,
      experimentDesigns: p._count.experimentDesigns,
    },
  }));

  return paginated(data, page, pageSize, total);
});

// POST /api/research-projects - Create Research Project
export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  // Only users can create research projects
  if (!isUser(auth)) {
    return errors.forbidden("Only users can create research projects");
  }

  const body = await parseBody<{
    name: string;
    description?: string;
    groupUuid?: string;
  }>(request);

  // Validate required fields
  if (!body.name || body.name.trim() === "") {
    return errors.validationError({ name: "Name is required" });
  }

  // Validate groupUuid belongs to the same company if provided
  if (body.groupUuid) {
    const group = await prisma.projectGroup.findFirst({
      where: { uuid: body.groupUuid, companyUuid: auth.companyUuid },
    });
    if (!group) {
      return errors.notFound("Project Group");
    }
  }

  const researchProject = await prisma.researchProject.create({
    data: {
      companyUuid: auth.companyUuid,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      groupUuid: body.groupUuid || null,
    },
    select: {
      uuid: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return success({
    uuid: researchProject.uuid,
    name: researchProject.name,
    description: researchProject.description,
    createdAt: researchProject.createdAt.toISOString(),
    updatedAt: researchProject.updatedAt.toISOString(),
  });
});
