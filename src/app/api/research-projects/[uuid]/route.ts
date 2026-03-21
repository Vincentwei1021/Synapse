// src/app/api/research-projects/[uuid]/route.ts
// Research Projects API - Detail, Update, Delete (ARCHITECTURE.md §5.1)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/research-projects/[uuid] - Research Project Detail
export const GET = withErrorHandler(async (request: NextRequest, context: RouteContext) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  const { uuid } = await context.params;

  const researchProject = await prisma.researchProject.findFirst({
    where: {
      uuid,
      companyUuid: auth.companyUuid,
    },
    select: {
      uuid: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          researchQuestions: true,
          documents: true,
          experimentRuns: true,
          experimentDesigns: true,
          activities: true,
        },
      },
    },
  });

  if (!researchProject) {
    return errors.notFound("Research Project");
  }

  return success({
    uuid: researchProject.uuid,
    name: researchProject.name,
    description: researchProject.description,
    createdAt: researchProject.createdAt.toISOString(),
    updatedAt: researchProject.updatedAt.toISOString(),
    counts: {
      researchQuestions: researchProject._count.researchQuestions,
      documents: researchProject._count.documents,
      experimentRuns: researchProject._count.experimentRuns,
      experimentDesigns: researchProject._count.experimentDesigns,
      activities: researchProject._count.activities,
    },
  });
});

// PATCH /api/research-projects/[uuid] - Update Research Project
export const PATCH = withErrorHandler(async (request: NextRequest, context: RouteContext) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  // Only users can update research projects
  if (!isUser(auth)) {
    return errors.forbidden("Only users can update research projects");
  }

  const { uuid } = await context.params;

  // Validate research project exists and belongs to the current company (query by UUID)
  const existing = await prisma.researchProject.findFirst({
    where: { uuid, companyUuid: auth.companyUuid },
    select: { uuid: true },
  });

  if (!existing) {
    return errors.notFound("Research Project");
  }

  const body = await parseBody<{
    name?: string;
    description?: string;
  }>(request);

  // Build update data
  const updateData: { name?: string; description?: string | null } = {};

  if (body.name !== undefined) {
    if (body.name.trim() === "") {
      return errors.validationError({ name: "Name cannot be empty" });
    }
    updateData.name = body.name.trim();
  }

  if (body.description !== undefined) {
    updateData.description = body.description?.trim() || null;
  }

  const researchProject = await prisma.researchProject.update({
    where: { uuid: existing.uuid },
    data: updateData,
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

// DELETE /api/research-projects/[uuid] - Delete Research Project
export const DELETE = withErrorHandler(async (request: NextRequest, context: RouteContext) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  // Only users can delete research projects
  if (!isUser(auth)) {
    return errors.forbidden("Only users can delete research projects");
  }

  const { uuid } = await context.params;

  // Validate research project exists and belongs to the current company (query by UUID)
  const existing = await prisma.researchProject.findFirst({
    where: { uuid, companyUuid: auth.companyUuid },
    select: { uuid: true },
  });

  if (!existing) {
    return errors.notFound("Research Project");
  }

  // Delete research project (Prisma handles cascade deletes at the application level)
  await prisma.researchProject.delete({
    where: { uuid: existing.uuid },
  });

  return success({ deleted: true });
});
