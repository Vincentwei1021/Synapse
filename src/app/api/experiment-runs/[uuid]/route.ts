// src/app/api/experiment-runs/[uuid]/route.ts
// Experiment Runs API - Detail, Update, Delete (ARCHITECTURE.md §5.1, §7.2)
// UUID-Based Architecture: All operations use UUIDs

import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser, isAssignee } from "@/lib/auth";
import {
  getExperimentRun,
  getExperimentRunByUuid,
  updateExperimentRun,
  deleteExperimentRun,
  isValidExperimentRunStatusTransition,
  checkDependenciesResolved,
} from "@/services/experiment-run.service";
import { createActivity } from "@/services/activity.service";

type RouteContext = { params: Promise<{ uuid: string }> };

// GET /api/experiment-runs/[uuid] - Experiment Run Detail
export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid } = await context.params;
    const experimentRun = await getExperimentRun(auth.companyUuid, uuid);

    if (!experimentRun) {
      return errors.notFound("Experiment Run");
    }

    return success(experimentRun);
  }
);

// PATCH /api/experiment-runs/[uuid] - Update Experiment Run
export const PATCH = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    const { uuid } = await context.params;

    // Get original Experiment Run data for permission check
    const experimentRun = await getExperimentRunByUuid(auth.companyUuid, uuid);
    if (!experimentRun) {
      return errors.notFound("Experiment Run");
    }

    const body = await parseBody<{
      title?: string;
      description?: string;
      status?: string;
      priority?: string;
      computeBudgetHours?: number | null;
      force?: boolean;
    }>(request);

    // Build update data
    const updateData: {
      title?: string;
      description?: string | null;
      status?: string;
      priority?: string;
      computeBudgetHours?: number | null;
    } = {};

    // Title validation
    if (body.title !== undefined) {
      if (body.title.trim() === "") {
        return errors.validationError({ title: "Title cannot be empty" });
      }
      updateData.title = body.title.trim();
    }

    // Description update
    if (body.description !== undefined) {
      updateData.description = body.description.trim() || null;
    }

    // Priority validation
    if (body.priority !== undefined) {
      const validPriorities = ["low", "medium", "high"];
      if (!validPriorities.includes(body.priority)) {
        return errors.validationError({
          priority: "Priority must be low, medium, or high",
        });
      }
      updateData.priority = body.priority;
    }

    // Compute Budget Hours validation (unit: agent hours)
    if (body.computeBudgetHours !== undefined) {
      if (body.computeBudgetHours !== null && (body.computeBudgetHours < 0 || body.computeBudgetHours > 1000)) {
        return errors.validationError({
          computeBudgetHours: "Compute budget hours must be between 0 and 1000 agent hours",
        });
      }
      updateData.computeBudgetHours = body.computeBudgetHours;
    }

    // Status update
    if (body.status !== undefined) {
      // Check if state transition is valid
      if (!isValidExperimentRunStatusTransition(experimentRun.status, body.status)) {
        return errors.invalidStatusTransition(experimentRun.status, body.status);
      }

      // Non-users can only update the status of Experiment Runs they have claimed
      if (!isUser(auth)) {
        if (!isAssignee(auth, experimentRun.assigneeType, experimentRun.assigneeUuid)) {
          return errors.permissionDenied("Only assignee can update status");
        }
      }

      // Dependency check when moving to in_progress
      if (body.status === "in_progress") {
        const depResult = await checkDependenciesResolved(experimentRun.uuid);
        if (!depResult.resolved) {
          // force is only accepted from user or super_admin
          if (body.force && (auth.type === "user" || auth.type === "super_admin")) {
            // Log force status change activity
            await createActivity({
              companyUuid: auth.companyUuid,
              researchProjectUuid: experimentRun.researchProjectUuid,
              targetType: "experiment_run",
              targetUuid: experimentRun.uuid,
              actorType: auth.type,
              actorUuid: auth.actorUuid,
              action: "force_status_change",
              value: JSON.stringify({
                from: experimentRun.status,
                to: body.status,
                blockers: depResult.blockers,
              }),
            });
          } else {
            return NextResponse.json(
              {
                success: false,
                error: "Dependencies not resolved",
                blocked: true,
                blockers: depResult.blockers,
              },
              { status: 409 }
            );
          }
        }
      }

      updateData.status = body.status;
    }

    const updated = await updateExperimentRun(experimentRun.uuid, updateData);
    return success(updated);
  }
);

// DELETE /api/experiment-runs/[uuid] - Delete Experiment Run
export const DELETE = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }

    // Only users can delete Experiment Runs
    if (!isUser(auth)) {
      return errors.forbidden("Only users can delete experiment runs");
    }

    const { uuid } = await context.params;

    const experimentRun = await getExperimentRunByUuid(auth.companyUuid, uuid);
    if (!experimentRun) {
      return errors.notFound("Experiment Run");
    }

    await deleteExperimentRun(experimentRun.uuid);
    return success({ deleted: true });
  }
);
