// src/app/api/research-projects/[uuid]/baselines/route.ts
// Baselines API - List and Create
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";
import { listBaselines, createBaseline } from "@/services/baseline.service";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/research-projects/[uuid]/baselines - List baselines for project
export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid } = await context.params;
    const baselines = await listBaselines(auth.companyUuid, uuid);

    return success(baselines);
  }
);

// POST /api/research-projects/[uuid]/baselines - Create a baseline
export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid } = await context.params;

    const body = await parseBody<{
      name: string;
      metrics: Record<string, number>;
      experimentUuid?: string;
    }>(request);

    if (!body.name || body.name.trim() === "") {
      return errors.badRequest("Name is required");
    }

    if (!body.metrics || typeof body.metrics !== "object") {
      return errors.badRequest("Metrics must be a valid object");
    }

    const baseline = await createBaseline(auth.companyUuid, {
      researchProjectUuid: uuid,
      name: body.name,
      metrics: body.metrics,
      experimentUuid: body.experimentUuid,
    });

    return NextResponse.json({ success: true, data: baseline }, { status: 201 });
  }
);
