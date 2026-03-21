// src/mcp/tools/researcher.ts
// Researcher Agent MCP Tools (ARCHITECTURE.md §5.2)
// UUID-Based Architecture: All operations use UUIDs

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AgentAuthContext } from "@/types/auth";
import * as experimentRunService from "@/services/experiment-run.service";
import * as activityService from "@/services/activity.service";
import * as commentService from "@/services/comment.service";
import * as sessionService from "@/services/session.service";
import * as experimentRegistryService from "@/services/experiment-registry.service";
import * as criteriaEvaluationService from "@/services/criteria-evaluation.service";
import { AlreadyClaimedError, NotClaimedError } from "@/lib/errors";

export function registerResearcherTools(server: McpServer, auth: AgentAuthContext) {
  // synapse_claim_experiment_run - Claim an Experiment Run
  server.registerTool(
    "synapse_claim_experiment_run",
    {
      description: "Claim an Experiment Run (open -> assigned)",
      inputSchema: z.object({
        runUuid: z.string().describe("Experiment Run UUID"),
      }),
    },
    async ({ runUuid }) => {
      const run = await experimentRunService.getExperimentRunByUuid(auth.companyUuid, runUuid);
      if (!run) {
        return { content: [{ type: "text", text: "Experiment Run not found" }], isError: true };
      }

      try {
        const updated = await experimentRunService.claimExperimentRun({
          runUuid: run.uuid,
          companyUuid: auth.companyUuid,
          assigneeType: "agent",
          assigneeUuid: auth.actorUuid,
        });

        await activityService.createActivity({
          companyUuid: auth.companyUuid,
          researchProjectUuid: run.researchProjectUuid,
          targetType: "experiment_run",
          targetUuid: run.uuid,
          actorType: "agent",
          actorUuid: auth.actorUuid,
          action: "assigned",
          value: { assigneeType: "agent", assigneeUuid: auth.actorUuid },
        });

        return {
          content: [{ type: "text", text: JSON.stringify({ uuid: updated.uuid, status: updated.status }, null, 2) }],
        };
      } catch (e) {
        if (e instanceof AlreadyClaimedError) {
          return { content: [{ type: "text", text: "Can only claim experiment runs with open status" }], isError: true };
        }
        throw e;
      }
    }
  );

  // synapse_release_experiment_run - Release a claimed Experiment Run
  server.registerTool(
    "synapse_release_experiment_run",
    {
      description: "Release a claimed Experiment Run (assigned -> open)",
      inputSchema: z.object({
        runUuid: z.string().describe("Experiment Run UUID"),
      }),
    },
    async ({ runUuid }) => {
      const run = await experimentRunService.getExperimentRunByUuid(auth.companyUuid, runUuid);
      if (!run) {
        return { content: [{ type: "text", text: "Experiment Run not found" }], isError: true };
      }

      // Check if the caller is the assignee (UUID comparison)
      const isAssignee =
        (run.assigneeType === "agent" && run.assigneeUuid === auth.actorUuid) ||
        (run.assigneeType === "user" && auth.ownerUuid && run.assigneeUuid === auth.ownerUuid);

      if (!isAssignee) {
        return { content: [{ type: "text", text: "Only the assignee can release an experiment run" }], isError: true };
      }

      try {
        const updated = await experimentRunService.releaseExperimentRun(run.uuid);

        await activityService.createActivity({
          companyUuid: auth.companyUuid,
          researchProjectUuid: run.researchProjectUuid,
          targetType: "experiment_run",
          targetUuid: run.uuid,
          actorType: "agent",
          actorUuid: auth.actorUuid,
          action: "released",
        });

        return {
          content: [{ type: "text", text: JSON.stringify({ uuid: updated.uuid, status: updated.status }, null, 2) }],
        };
      } catch (e) {
        if (e instanceof NotClaimedError) {
          return { content: [{ type: "text", text: "Can only release experiment runs with assigned status" }], isError: true };
        }
        throw e;
      }
    }
  );

  // synapse_update_experiment_run - Update experiment run status
  server.registerTool(
    "synapse_update_experiment_run",
    {
      description: "Update experiment run status (only the assignee can operate)",
      inputSchema: z.object({
        runUuid: z.string().describe("Experiment Run UUID"),
        status: z.enum(["in_progress", "to_verify"]).describe("New status"),
        sessionUuid: z.string().optional().describe("Session UUID (for sub-agent identification)"),
      }),
    },
    async ({ runUuid, status, sessionUuid }) => {
      const run = await experimentRunService.getExperimentRunByUuid(auth.companyUuid, runUuid);
      if (!run) {
        return { content: [{ type: "text", text: "Experiment Run not found" }], isError: true };
      }

      // Check if the caller is the assignee (UUID comparison)
      const isAssignee =
        (run.assigneeType === "agent" && run.assigneeUuid === auth.actorUuid) ||
        (run.assigneeType === "user" && auth.ownerUuid && run.assigneeUuid === auth.ownerUuid);

      if (!isAssignee) {
        return { content: [{ type: "text", text: "Only the assignee can update experiment run status" }], isError: true };
      }

      // Resolve session info
      let sessionName: string | undefined;
      if (sessionUuid) {
        const session = await sessionService.getSession(auth.companyUuid, sessionUuid);
        if (session && session.agentUuid === auth.actorUuid) {
          sessionName = session.name;
          await sessionService.heartbeatSession(auth.companyUuid, sessionUuid);
        }
      }

      // Validate status transition
      if (!experimentRunService.isValidExperimentRunStatusTransition(run.status, status)) {
        return {
          content: [{ type: "text", text: `Invalid status transition: ${run.status} -> ${status}` }],
          isError: true,
        };
      }

      // Check dependencies are resolved before moving to in_progress
      if (status === "in_progress") {
        const depCheck = await experimentRunService.checkDependenciesResolved(run.uuid);
        if (!depCheck.resolved) {
          const blockerLines = depCheck.blockers.map((b, i) => {
            const assigneeStr = b.assignee
              ? `${b.assignee.name} [${b.assignee.type}]`
              : "none";
            const sessionStr = b.sessionCheckin
              ? `session: ${b.sessionCheckin.sessionName}`
              : "no active session";
            return `${i + 1}. "${b.title}" (status: ${b.status}, assignee: ${assigneeStr}, ${sessionStr})`;
          });
          const msg = [
            `Cannot move to in_progress: ${depCheck.blockers.length} dependencies not resolved.`,
            "",
            "Blockers:",
            ...blockerLines,
            "",
            "Tip: Use synapse_get_unblocked_experiment_runs to find experiment runs you can start now.",
          ].join("\n");
          return { content: [{ type: "text", text: msg }], isError: true };
        }
      }

      const updated = await experimentRunService.updateExperimentRun(run.uuid, { status });

      await activityService.createActivity({
        companyUuid: auth.companyUuid,
        researchProjectUuid: run.researchProjectUuid,
        targetType: "experiment_run",
        targetUuid: run.uuid,
        actorType: "agent",
        actorUuid: auth.actorUuid,
        action: "status_changed",
        value: { status },
        sessionUuid,
        sessionName,
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ uuid: updated.uuid, status: updated.status }, null, 2) }],
      };
    }
  );

  // synapse_submit_for_verify - Submit experiment run for human verification
  server.registerTool(
    "synapse_submit_for_verify",
    {
      description: "Submit experiment run for human verification (in_progress -> to_verify)",
      inputSchema: z.object({
        runUuid: z.string().describe("Experiment Run UUID"),
        summary: z.string().optional().describe("Work summary"),
      }),
    },
    async ({ runUuid, summary }) => {
      const run = await experimentRunService.getExperimentRunByUuid(auth.companyUuid, runUuid);
      if (!run) {
        return { content: [{ type: "text", text: "Experiment Run not found" }], isError: true };
      }

      // Check if the caller is the assignee (UUID comparison)
      const isAssignee =
        (run.assigneeType === "agent" && run.assigneeUuid === auth.actorUuid) ||
        (run.assigneeType === "user" && auth.ownerUuid && run.assigneeUuid === auth.ownerUuid);

      if (!isAssignee) {
        return { content: [{ type: "text", text: "Only the assignee can submit for verification" }], isError: true };
      }

      if (run.status !== "in_progress") {
        return { content: [{ type: "text", text: "Can only submit for verification from in_progress status" }], isError: true };
      }

      const updated = await experimentRunService.updateExperimentRun(run.uuid, { status: "to_verify" });

      // Log activity
      await activityService.createActivity({
        companyUuid: auth.companyUuid,
        researchProjectUuid: run.researchProjectUuid,
        targetType: "experiment_run",
        targetUuid: run.uuid,
        actorType: "agent",
        actorUuid: auth.actorUuid,
        action: "submitted",
        value: summary ? { summary } : undefined,
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ uuid: updated.uuid, status: updated.status }, null, 2) }],
      };
    }
  );

  // synapse_report_criteria_self_check - Report self-check results on acceptance criteria
  server.registerTool(
    "synapse_report_criteria_self_check",
    {
      description: "Report self-check results on acceptance criteria for an experiment run you're working on",
      inputSchema: z.object({
        runUuid: z.string().describe("Experiment Run UUID"),
        criteria: z.array(z.object({
          uuid: z.string().describe("AcceptanceCriterion UUID"),
          devStatus: z.enum(["passed", "failed"]).describe("Self-check result"),
          devEvidence: z.string().optional().describe("Optional evidence/notes"),
        })).describe("Criteria self-check results"),
      }),
    },
    async ({ runUuid, criteria }) => {
      // Verify caller is the assignee
      const run = await experimentRunService.getExperimentRunByUuid(auth.companyUuid, runUuid);
      if (!run) return { content: [{ type: "text", text: "Experiment Run not found" }], isError: true };
      const isAssignee =
        (run.assigneeType === "agent" && run.assigneeUuid === auth.actorUuid) ||
        (run.assigneeType === "user" && auth.ownerUuid && run.assigneeUuid === auth.ownerUuid);
      if (!isAssignee) return { content: [{ type: "text", text: "Only the assignee can self-check acceptance criteria" }], isError: true };

      const result = await experimentRunService.reportCriteriaSelfCheck(
        auth.companyUuid,
        runUuid,
        criteria,
        { type: auth.type, actorUuid: auth.actorUuid },
      );
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // synapse_report_work - Report work progress or completion
  server.registerTool(
    "synapse_report_work",
    {
      description: "Report work progress or completion",
      inputSchema: z.object({
        runUuid: z.string().describe("Experiment Run UUID"),
        report: z.string().describe("Work report content"),
        status: z.enum(["in_progress", "to_verify"]).optional().describe("Optional: update status at the same time"),
        sessionUuid: z.string().optional().describe("Session UUID (for sub-agent identification)"),
      }),
    },
    async ({ runUuid, report, status, sessionUuid }) => {
      const run = await experimentRunService.getExperimentRunByUuid(auth.companyUuid, runUuid);
      if (!run) {
        return { content: [{ type: "text", text: "Experiment Run not found" }], isError: true };
      }

      // Check if the caller is the assignee (UUID comparison)
      const isAssignee =
        (run.assigneeType === "agent" && run.assigneeUuid === auth.actorUuid) ||
        (run.assigneeType === "user" && auth.ownerUuid && run.assigneeUuid === auth.ownerUuid);

      if (!isAssignee) {
        return { content: [{ type: "text", text: "Only the assignee can report work" }], isError: true };
      }

      // Resolve session info
      let sessionName: string | undefined;
      if (sessionUuid) {
        const session = await sessionService.getSession(auth.companyUuid, sessionUuid);
        if (session && session.agentUuid === auth.actorUuid) {
          sessionName = session.name;
          await sessionService.heartbeatSession(auth.companyUuid, sessionUuid);
        }
      }

      // Update status if requested
      if (status && experimentRunService.isValidExperimentRunStatusTransition(run.status, status)) {
        await experimentRunService.updateExperimentRun(run.uuid, { status });
      }

      // Write comment
      await commentService.createComment({
        companyUuid: auth.companyUuid,
        targetType: "experiment_run",
        targetUuid: run.uuid,
        content: report,
        authorType: "agent",
        authorUuid: auth.actorUuid,
      });

      // Log activity
      await activityService.createActivity({
        companyUuid: auth.companyUuid,
        researchProjectUuid: run.researchProjectUuid,
        targetType: "experiment_run",
        targetUuid: run.uuid,
        actorType: "agent",
        actorUuid: auth.actorUuid,
        action: "comment_added",
        value: { report, statusUpdated: status || null },
        sessionUuid,
        sessionName,
      });

      return {
        content: [{ type: "text", text: `Work report recorded: ${report}` }],
      };
    }
  );

  // ===== Experiment Registry & Criteria Tools =====

  // synapse_register_experiment — Register experiment config and environment
  server.registerTool(
    "synapse_register_experiment",
    {
      description: "Register experiment configuration and environment for reproducibility tracking",
      inputSchema: z.object({
        researchProjectUuid: z.string(),
        runUuid: z.string(),
        config: z.record(z.string(), z.unknown()),
        environment: z.record(z.string(), z.unknown()),
        seed: z.number().optional(),
      }),
    },
    async (params) => {
      const result = await experimentRegistryService.registerExperiment(auth.companyUuid, {
        ...params,
        startedAt: new Date(),
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // synapse_report_metrics — Report structured metrics and auto-evaluate criteria
  server.registerTool(
    "synapse_report_metrics",
    {
      description: "Report structured experiment metrics and auto-evaluate Go/No-Go criteria",
      inputSchema: z.object({
        runUuid: z.string(),
        metrics: z.record(z.string(), z.number()),
      }),
    },
    async (params) => {
      const evaluation = await criteriaEvaluationService.evaluateCriteria(auth.companyUuid, params.runUuid, params.metrics);
      return { content: [{ type: "text", text: JSON.stringify(evaluation, null, 2) }] };
    }
  );

  // synapse_check_criteria — Check Go/No-Go criteria status without reporting new metrics
  server.registerTool(
    "synapse_check_criteria",
    {
      description: "Check current Go/No-Go criteria evaluation status for an experiment run",
      inputSchema: z.object({
        runUuid: z.string(),
      }),
    },
    async (params) => {
      // Pass empty metrics to just read current state
      const evaluation = await criteriaEvaluationService.evaluateCriteria(auth.companyUuid, params.runUuid, {});
      return { content: [{ type: "text", text: JSON.stringify(evaluation, null, 2) }] };
    }
  );

  // synapse_request_early_stop — Request early termination of an experiment
  server.registerTool(
    "synapse_request_early_stop",
    {
      description: "Request early termination of an experiment run with justification",
      inputSchema: z.object({
        runUuid: z.string(),
        reason: z.string(),
        metrics: z.record(z.string(), z.number()).optional(),
      }),
    },
    async (params) => {
      let evaluation = null;
      if (params.metrics) {
        evaluation = await criteriaEvaluationService.evaluateCriteria(auth.companyUuid, params.runUuid, params.metrics);
      }
      return { content: [{ type: "text", text: JSON.stringify({
        earlyStopRequested: true,
        reason: params.reason,
        evaluation,
      }, null, 2) }] };
    }
  );
}
