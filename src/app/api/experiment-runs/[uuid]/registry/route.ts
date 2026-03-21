// src/app/api/experiment-runs/[uuid]/registry/route.ts
// Experiment Registry API - Get and Register
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";
import { getByRun, registerExperiment } from "@/services/experiment-registry.service";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/experiment-runs/[uuid]/registry - Get registry entry for this run
export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid } = await context.params;
    const registry = await getByRun(auth.companyUuid, uuid);

    if (!registry) {
      return errors.notFound("Registry entry");
    }

    return success(registry);
  }
);

// POST /api/experiment-runs/[uuid]/registry - Register experiment
export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid } = await context.params;

    const body = await parseBody<{
      researchProjectUuid: string;
      config: Record<string, unknown>;
      environment: Record<string, unknown>;
      seed?: number;
      startedAt: string;
    }>(request);

    if (!body.researchProjectUuid) {
      return errors.badRequest("researchProjectUuid is required");
    }

    if (!body.config || typeof body.config !== "object") {
      return errors.badRequest("config must be a valid object");
    }

    if (!body.environment || typeof body.environment !== "object") {
      return errors.badRequest("environment must be a valid object");
    }

    if (!body.startedAt) {
      return errors.badRequest("startedAt is required");
    }

    const registry = await registerExperiment(auth.companyUuid, {
      researchProjectUuid: body.researchProjectUuid,
      runUuid: uuid,
      config: body.config,
      environment: body.environment,
      seed: body.seed,
      startedAt: new Date(body.startedAt),
    });

    return NextResponse.json({ success: true, data: registry }, { status: 201 });
  }
);
