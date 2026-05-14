import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AgentAuthContext } from "@/types/auth";
import { prisma } from "@/lib/prisma";
import * as activityService from "@/services/activity.service";
import * as computeService from "@/services/compute.service";
import * as experimentService from "@/services/experiment.service";
import * as experimentRunService from "@/services/experiment-run.service";
import { createProgressLog } from "@/services/experiment-progress.service";
import * as sessionService from "@/services/session.service";
import * as notificationService from "@/services/notification.service";
import * as incidentLessonsService from "@/services/incident-lessons.service";

function serializeAccess(node: {
  sshHost: string | null;
  sshUser: string | null;
  sshPort: number | null;
  sshKeyName?: string | null;
  sshKeySource?: string | null;
  managedKeyAvailable?: boolean;
  ssmTarget: string | null;
}) {
  return {
    ssh: node.sshHost || node.sshUser || node.sshPort
      ? {
          host: node.sshHost,
          user: node.sshUser,
          port: node.sshPort ?? 22,
          keyName: node.sshKeyName ?? null,
          // sshKeyPath and sshKeyFingerprint intentionally excluded
          managedKeyAvailable: node.managedKeyAvailable ?? false,
          accessBundleTool: "synapse_get_node_access_bundle",
        }
      : null,
    ssmTarget: node.ssmTarget,
  };
}

function isAssignedToActor(
  assignee: { type: string; uuid: string } | null,
  auth: AgentAuthContext,
) {
  if (!assignee) {
    return true;
  }

  if (assignee.type === "agent" && assignee.uuid === auth.actorUuid) {
    return true;
  }

  return assignee.type === "user" && assignee.uuid === auth.ownerUuid;
}

export function registerComputeTools(server: McpServer, auth: AgentAuthContext) {
  server.registerTool(
    "synapse_list_compute_nodes",
    {
      description: "List compute pools, nodes, SSH/SSM access details, and the status of every GPU.",
      inputSchema: z.object({
        onlyAvailable: z.boolean().default(false),
        researchProjectUuid: z.string().optional(),
      }),
    },
    async ({ onlyAvailable, researchProjectUuid }) => {
      let pools = await computeService.listComputePools(auth.companyUuid);

      if (researchProjectUuid) {
        const project = await prisma.researchProject.findFirst({
          where: { uuid: researchProjectUuid, companyUuid: auth.companyUuid },
          select: { computePoolUuid: true },
        });
        if (project?.computePoolUuid) {
          pools = pools.filter(pool => pool.uuid === project.computePoolUuid);
        }
      }
      const serializeNodeForMcp = (node: (typeof pools)[number]["nodes"][number]) => ({
        uuid: node.uuid,
        label: node.label,
        lifecycle: node.lifecycle,
        ec2InstanceId: node.ec2InstanceId,
        instanceType: node.instanceType,
        region: node.region,
        inventoryPending: node.inventoryPending,
        access: serializeAccess(node),
        lastReportedAt: node.lastReportedAt,
        gpus: node.gpus
          .filter((gpu) => !onlyAvailable || gpu.computedStatus === "available")
          .map((gpu) => ({
            uuid: gpu.uuid,
            slotIndex: gpu.slotIndex,
            model: gpu.model,
            memoryGb: gpu.memoryGb,
            status: gpu.activeReservation ? `occupied:${gpu.activeReservation.itemTitle}` : gpu.computedStatus,
            utilizationPercent: gpu.utilizationPercent,
            memoryUsedGb: gpu.memoryUsedGb,
            temperatureC: gpu.temperatureC,
            activeReservation: gpu.activeReservation,
            lastReportedAt: gpu.lastReportedAt,
          })),
      });

      const sanitizedPools = pools.map((pool) => ({
        uuid: pool.uuid,
        name: pool.name,
        description: pool.description,
        nodes: pool.nodes.map((node) => serializeNodeForMcp(node)),
      }));

      const nodes = sanitizedPools.flatMap((pool) =>
        pool.nodes.map((node) => ({
          ...node,
          pool: { uuid: pool.uuid, name: pool.name },
        })),
      );

      return {
        content: [{ type: "text", text: JSON.stringify({ pools: sanitizedPools, nodes }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "synapse_get_node_access_bundle",
    {
      description:
        "Return a managed SSH access bundle for a node assigned to your current experiment. Use this instead of any server-local key path.",
      inputSchema: z.object({
        experimentUuid: z.string(),
        nodeUuid: z.string(),
      }),
    },
    async ({ experimentUuid, nodeUuid }) => {
      const bundle = await computeService.getNodeAccessBundle({
        companyUuid: auth.companyUuid,
        experimentUuid,
        nodeUuid,
        agentUuid: auth.actorUuid,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(bundle, null, 2) }],
      };
    },
  );

  server.registerTool(
    "synapse_get_assigned_experiments",
    {
      description: "List experiments currently assigned to you, sorted by priority and assignment order.",
      inputSchema: z.object({
        researchProjectUuid: z.string().optional(),
        statuses: z
          .array(z.enum(["draft", "pending_review", "pending_start", "in_progress", "completed"]))
          .optional(),
      }),
    },
    async ({ researchProjectUuid, statuses }) => {
      const experiments = await experimentService.listAssignedExperiments({
        companyUuid: auth.companyUuid,
        assigneeType: "agent",
        assigneeUuid: auth.actorUuid,
        researchProjectUuid,
        statuses,
      });

      for (const exp of experiments) {
        if ((exp as { liveStatus?: string }).liveStatus === "sent") {
          await experimentService.updateExperimentLiveStatus(exp.uuid, "ack");
        }
      }

      return {
        content: [{ type: "text", text: JSON.stringify({ experiments }, null, 2) }],
      };
    },
  );

  server.registerTool(
    "synapse_get_experiment",
    {
      description: "Get full details for a single experiment, including inherited parent-question context and a projectExperimentContext summary that tells callers whether this is the very first experiment on the project.",
      inputSchema: z.object({
        experimentUuid: z.string(),
      }),
    },
    async ({ experimentUuid }) => {
      const experiment = await experimentService.getExperiment(auth.companyUuid, experimentUuid);
      if (!experiment) {
        return { content: [{ type: "text", text: "Experiment not found" }], isError: true };
      }

      // Count sibling experiments on the same project (excluding this one) so
      // callers — notably the OpenClaw wake prompt — can decide whether to
      // inject the "first experiment" foundational-setup guidance.
      const [priorCompletedCount, priorAnyCount] = await Promise.all([
        prisma.experiment.count({
          where: {
            companyUuid: auth.companyUuid,
            researchProjectUuid: experiment.researchProjectUuid,
            status: "completed",
            NOT: { uuid: experiment.uuid },
          },
        }),
        prisma.experiment.count({
          where: {
            companyUuid: auth.companyUuid,
            researchProjectUuid: experiment.researchProjectUuid,
            NOT: { uuid: experiment.uuid },
          },
        }),
      ]);

      const projectExperimentContext = {
        isFirstExperiment: priorAnyCount === 0,
        priorCompletedCount,
        priorAnyCount,
      };

      return {
        content: [{ type: "text", text: JSON.stringify({ experiment, projectExperimentContext }, null, 2) }],
      };
    },
  );

  server.registerTool(
    "synapse_start_experiment",
    {
      description: "Move an assigned experiment from pending_start to in_progress. Pass gpuUuids only when start_experiment should also reserve them; if you already called synapse_reserve_gpus, start without gpuUuids.",
      inputSchema: z.object({
        experimentUuid: z.string(),
        gpuUuids: z.array(z.string()).default([]),
        workingNotes: z.string().optional(),
      }),
    },
    async ({ experimentUuid, gpuUuids, workingNotes }) => {
      const experiment = await experimentService.getExperiment(auth.companyUuid, experimentUuid);
      if (!experiment) {
        return { content: [{ type: "text", text: "Experiment not found" }], isError: true };
      }

      if (!isAssignedToActor(experiment.assignee, auth)) {
        return { content: [{ type: "text", text: "Experiment is assigned to another actor" }], isError: true };
      }

      if (experiment.status !== "pending_start" && experiment.status !== "in_progress") {
        return {
          content: [{ type: "text", text: `Experiment must be pending_start or in_progress, current status: ${experiment.status}` }],
          isError: true,
        };
      }

      if (workingNotes?.trim()) {
        const current = await experimentService.getExperiment(auth.companyUuid, experimentUuid);
        const existingDescription = current?.description ?? "";
        const separator = existingDescription ? "\n\n---\n\n" : "";
        await experimentService.updateExperiment(
          auth.companyUuid,
          experimentUuid,
          { description: existingDescription + separator + workingNotes.trim() },
          { actorType: "agent", actorUuid: auth.actorUuid },
        );
      }

      await experimentService.updateExperimentLiveStatus(experimentUuid, "checking_resources");

      const updated =
        experiment.status === "in_progress"
          ? await experimentService.getExperiment(auth.companyUuid, experimentUuid)
          : await experimentService.startExperiment({
              companyUuid: auth.companyUuid,
              experimentUuid,
              actorType: "agent",
              actorUuid: auth.actorUuid,
              ownerUuid: auth.ownerUuid,
            });

      if (gpuUuids.length > 0) {
        await computeService.reserveGpusForExperiment({
          companyUuid: auth.companyUuid,
          experimentUuid,
          gpuUuids,
        });
      }

      await experimentService.updateExperimentLiveStatus(experimentUuid, "running");

      const availableNodes = await computeService.listComputePools(auth.companyUuid);
      const selectedNodes = availableNodes
        .flatMap((pool) => pool.nodes)
        .filter((node) => node.gpus.some((gpu) => gpuUuids.includes(gpu.uuid)))
        .map((node) => ({
          uuid: node.uuid,
          label: node.label,
          access: serializeAccess(node),
          gpus: node.gpus.filter((gpu) => gpuUuids.includes(gpu.uuid)),
        }));

      return {
        content: [{ type: "text", text: JSON.stringify({ experiment: updated, nodes: selectedNodes }, null, 2) }],
      };
    },
  );

  server.registerTool(
    "synapse_sync_node_inventory",
    {
      description: "After logging into a machine, sync its instance metadata and GPU inventory back into Synapse.",
      inputSchema: z.object({
        nodeUuid: z.string(),
        ec2InstanceId: z.string().optional(),
        instanceType: z.string().optional(),
        region: z.string().optional(),
        gpus: z.array(
          z.object({
            slotIndex: z.number().int().min(0),
            model: z.string(),
            memoryGb: z.number().int().positive().optional(),
          })
        ),
      }),
    },
    async ({ nodeUuid, ec2InstanceId, instanceType, region, gpus }) => {
      const node = await computeService.syncNodeInventory({
        companyUuid: auth.companyUuid,
        nodeUuid,
        ec2InstanceId,
        instanceType,
        region,
        gpus,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                uuid: node.uuid,
                ec2InstanceId: node.ec2InstanceId,
                instanceType: node.instanceType,
                region: node.region,
                gpus: node.gpus.map((gpu) => ({
                  uuid: gpu.uuid,
                  slotIndex: gpu.slotIndex,
                  model: gpu.model,
                  memoryGb: gpu.memoryGb,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "synapse_reserve_gpus",
    {
      description: "Reserve one or more GPUs for an experiment. Reserved GPUs show as 'busy' and cannot be reserved by other experiments. GPUs are automatically released when the experiment is completed via synapse_submit_experiment_results.",
      inputSchema: z.object({
        experimentUuid: z.string().describe("Experiment UUID"),
        gpuUuids: z.array(z.string()).min(1).describe("List of GPU UUIDs to reserve"),
      }),
    },
    async ({ experimentUuid, gpuUuids }) => {
      try {
        const result = await computeService.reserveGpusForExperiment({
          companyUuid: auth.companyUuid,
          experimentUuid,
          gpuUuids,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ success: true, ...result }) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `GPU reservation failed: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "synapse_report_gpu_status",
    {
      description: "Report the latest GPU lifecycle or telemetry after running a workload.",
      inputSchema: z.object({
        nodeUuid: z.string(),
        gpus: z.array(
          z.object({
            gpuUuid: z.string(),
            lifecycle: z.enum(["available", "offline", "maintenance", "unhealthy"]).optional(),
            utilizationPercent: z.number().int().min(0).max(100).optional(),
            memoryUsedGb: z.number().min(0).optional(),
            temperatureC: z.number().int().min(0).optional(),
            notes: z.string().optional(),
          })
        ),
      }),
    },
    async ({ nodeUuid, gpus }) => {
      await computeService.updateGpuStatuses({
        nodeUuid,
        gpus,
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, nodeUuid, updatedGpuCount: gpus.length }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "synapse_submit_experiment_results",
    {
      description: "Submit experiment outcomes. Supports both legacy experiment runs and the new unified Experiment workflow.",
      inputSchema: z.object({
        runUuid: z.string().optional(),
        experimentUuid: z.string().optional(),
        outcome: z.string().optional(),
        experimentResults: z.unknown().optional(),
        sessionUuid: z.string().optional(),
        experimentBranch: z.string().optional().describe("Git branch name where experiment code was pushed"),
        commitSha: z.string().optional().describe("Git commit SHA of the final experiment code"),
      }),
    },
    async ({ runUuid, experimentUuid, outcome, experimentResults, sessionUuid, experimentBranch, commitSha }) => {
      if (experimentUuid) {
        const experiment = await experimentService.getExperiment(auth.companyUuid, experimentUuid);
        if (!experiment) {
          return { content: [{ type: "text", text: "Experiment not found" }], isError: true };
        }

        if (!isAssignedToActor(experiment.assignee, auth)) {
          return { content: [{ type: "text", text: "Only the assigned agent can submit results" }], isError: true };
        }

        // Release GPU reservations FIRST so they are available before autonomous loop triggers
        await computeService.releaseGpuReservationsForExperiment(auth.companyUuid, experimentUuid);

        const updated = await experimentService.completeExperiment({
          companyUuid: auth.companyUuid,
          experimentUuid,
          actorType: "agent",
          actorUuid: auth.actorUuid,
          ownerUuid: auth.ownerUuid,
          outcome,
          results: experimentResults,
          experimentBranch,
          commitSha,
        });

        await experimentService.updateExperimentLiveStatus(experimentUuid, null, null);

        // Re-trigger queued experiments now that GPUs are freed
        // Find all experiments with liveStatus='queuing', sorted by priority then assignedAt
        const queuedExperiments = await prisma.experiment.findMany({
          where: {
            companyUuid: auth.companyUuid,
            liveStatus: "queuing",
            assigneeUuid: { not: null },
            assigneeType: { not: null },
          },
          select: {
            uuid: true,
            title: true,
            assigneeType: true,
            assigneeUuid: true,
            assignedByUuid: true,
            researchProjectUuid: true,
            researchProject: { select: { name: true } },
            priority: true,
            assignedAt: true,
          },
          orderBy: [{ assignedAt: "asc" }],
        });

        // Sort by priority: immediate > high > medium > low
        const priorityOrder: Record<string, number> = { immediate: 0, high: 1, medium: 2, low: 3 };
        queuedExperiments.sort((a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3));

        // Send task_assigned notification for each queued experiment
        for (const qExp of queuedExperiments) {
          if (!qExp.assigneeUuid || !qExp.assigneeType) continue;
          await notificationService.create({
            companyUuid: auth.companyUuid,
            researchProjectUuid: qExp.researchProjectUuid,
            recipientType: qExp.assigneeType,
            recipientUuid: qExp.assigneeUuid,
            entityType: "experiment",
            entityUuid: qExp.uuid,
            entityTitle: qExp.title,
            projectName: qExp.researchProject.name,
            action: "task_assigned",
            message: `GPUs released. Retrying: ${qExp.title}`,
            actorType: "agent",
            actorUuid: auth.actorUuid,
            actorName: "Synapse",
          });
        }

        // Note: completeExperiment() already creates the "completed" activity,
        // so we do not duplicate it here.

        return {
          content: [{ type: "text", text: JSON.stringify({ experiment: updated, released: true }, null, 2) }],
        };
      }

      if (!runUuid) {
        return { content: [{ type: "text", text: "Either experimentUuid or runUuid is required" }], isError: true };
      }

      const run = await experimentRunService.getExperimentRunByUuid(auth.companyUuid, runUuid);
      if (!run) {
        return { content: [{ type: "text", text: "Experiment Run not found" }], isError: true };
      }

      if (run.assigneeUuid !== auth.actorUuid) {
        return { content: [{ type: "text", text: "Only the assigned agent can submit results" }], isError: true };
      }

      const updated = await experimentRunService.submitExperimentRunResults(
        auth.companyUuid,
        runUuid,
        {
          outcome,
          experimentResults,
        },
        { actorType: "agent", actorUuid: auth.actorUuid },
      );

      await activityService.createActivity({
        companyUuid: auth.companyUuid,
        researchProjectUuid: run.researchProjectUuid,
        targetType: "experiment_run",
        targetUuid: runUuid,
        actorType: "agent",
        actorUuid: auth.actorUuid,
        action: "submitted",
        value: { outcome: outcome ?? null },
        sessionUuid,
      });

      if (sessionUuid) {
        await sessionService.sessionCheckoutFromRun(auth.companyUuid, sessionUuid, runUuid);
      }

      return {
        content: [{ type: "text", text: JSON.stringify({ run: updated, released: true }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "synapse_save_experiment_report",
    {
      description: "Create or update the dedicated experiment result document for a completed experiment.",
      inputSchema: z.object({
        experimentUuid: z.string().describe("Experiment UUID"),
        title: z.string().optional().describe("Optional report title"),
        content: z.string().describe("Full experiment report content (Markdown)"),
      }),
    },
    async ({ experimentUuid, title, content }) => {
      try {
        const document = await experimentService.saveExperimentReportDocument({
          companyUuid: auth.companyUuid,
          actorType: auth.type,
          actorUuid: auth.actorUuid,
          ownerUuid: auth.ownerUuid,
          experimentUuid,
          title: title ?? null,
          content,
        });

        return {
          content: [{ type: "text", text: JSON.stringify({ document }, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: error instanceof Error ? error.message : "Failed to save experiment report" }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "synapse_record_experiment_incident_lesson",
    {
      description:
        "Record a reusable execution incident lesson for an experiment. Use this when an experiment fails, or when an agent hits a recoverable issue during execution and fixes it. Pair live execution updates with synapse_report_experiment_progress; this tool stores the reusable lesson for future search. Do not include raw secrets, full environment variables, private keys, or unredacted logs.",
      inputSchema: z.object({
        experimentUuid: z.string().describe("Experiment UUID"),
        title: z.string().describe("Short lesson title, e.g. 'CUDA OOM during reward model training'"),
        failureType: z
          .enum(["code_bug", "data_issue", "compute_issue", "auth_issue", "environment", "methodology", "agent_error", "other"])
          .describe("Incident category"),
        status: z
          .enum(["resolved_in_run", "unresolved", "caused_failure"])
          .describe("Whether the incident was fixed during the run, remains unresolved, or caused final experiment failure"),
        severity: z.enum(["low", "medium", "high"]).default("medium"),
        phase: z.string().optional().describe("Execution phase, e.g. data_prep, training, evaluation, compute, reporting"),
        symptom: z.string().describe("What went wrong, in concise factual terms"),
        rootCause: z.string().optional().describe("Best known root cause, if identified"),
        resolution: z.string().optional().describe("How the agent fixed or worked around it"),
        prevention: z.string().optional().describe("What future agents should do to avoid this issue"),
        evidenceSummary: z.string().optional().describe("Short redacted evidence summary; do not paste raw logs containing secrets"),
        experimentOutcomeImpact: z
          .enum(["none", "changed_config", "invalidated_partial_results", "increased_cost", "caused_failure"])
          .optional()
          .describe("How this incident affected the experiment outcome or reproducibility"),
        tags: z.array(z.string()).optional().describe("Searchable tags such as cuda, oom, ssh, dataset-schema"),
      }),
    },
    async (input) => {
      try {
        const lesson = await incidentLessonsService.recordExperimentIncidentLesson({
          companyUuid: auth.companyUuid,
          experimentUuid: input.experimentUuid,
          title: input.title,
          failureType: input.failureType,
          status: input.status,
          severity: input.severity,
          phase: input.phase ?? null,
          symptom: input.symptom,
          rootCause: input.rootCause ?? null,
          resolution: input.resolution ?? null,
          prevention: input.prevention ?? null,
          evidenceSummary: input.evidenceSummary ?? null,
          experimentOutcomeImpact: input.experimentOutcomeImpact ?? null,
          tags: input.tags,
          createdByUuid: auth.actorUuid,
          createdByType: auth.type,
        });

        return {
          content: [{ type: "text", text: JSON.stringify({ lesson }, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: error instanceof Error ? error.message : "Failed to record incident lesson" }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "synapse_search_incident_lessons",
    {
      description:
        "Search reusable execution incident lessons for a research project before or during experiment work. Keyword/BM25 search uses Postgres full-text search with structured filters; semantic/hybrid modes are reserved for future embedding support.",
      inputSchema: z.object({
        researchProjectUuid: z.string().describe("Research Project UUID"),
        query: z.string().optional().describe("Keyword query, e.g. 'cuda oom batch size'"),
        failureType: z
          .enum(["code_bug", "data_issue", "compute_issue", "auth_issue", "environment", "methodology", "agent_error", "other"])
          .optional(),
        phase: z.string().optional(),
        status: z.enum(["resolved_in_run", "unresolved", "caused_failure"]).optional(),
        severity: z.enum(["low", "medium", "high"]).optional(),
        tags: z.array(z.string()).optional(),
        limit: z.number().int().min(1).max(50).default(20),
        mode: z.enum(["keyword", "bm25", "semantic", "hybrid"]).default("keyword"),
      }),
    },
    async (input) => {
      try {
        const result = await incidentLessonsService.searchIncidentLessons({
          companyUuid: auth.companyUuid,
          researchProjectUuid: input.researchProjectUuid,
          query: input.query ?? null,
          failureType: input.failureType ?? null,
          phase: input.phase ?? null,
          status: input.status ?? null,
          severity: input.severity ?? null,
          tags: input.tags,
          limit: input.limit,
          mode: input.mode,
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: error instanceof Error ? error.message : "Failed to search incident lessons" }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "synapse_get_experiment_incident_lessons",
    {
      description: "List execution incident lessons recorded for a single experiment.",
      inputSchema: z.object({
        experimentUuid: z.string().describe("Experiment UUID"),
      }),
    },
    async ({ experimentUuid }) => {
      try {
        const lessons = await incidentLessonsService.getExperimentIncidentLessons({
          companyUuid: auth.companyUuid,
          experimentUuid,
        });

        return {
          content: [{ type: "text", text: JSON.stringify({ lessons }, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: error instanceof Error ? error.message : "Failed to get incident lessons" }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "synapse_report_experiment_progress",
    {
      description:
        "Report a progress update for an in-progress experiment. The message appears on the experiment card in real-time and is logged in the progress timeline.",
      inputSchema: z.object({
        experimentUuid: z.string(),
        message: z
          .string()
          .describe("Short status message, e.g. 'Training epoch 3/10, loss=0.42'"),
        phase: z
          .string()
          .optional()
          .describe("Optional phase label, e.g. 'data_download', 'training', 'evaluation'"),
        liveStatus: z
          .enum(["queuing", "checking_resources", "running"])
          .optional()
          .describe("Live status badge shown on the experiment card. Default: 'running'. Use 'queuing' when waiting for GPU resources."),
      }),
    },
    async ({ experimentUuid, message, phase, liveStatus }) => {
      if (liveStatus === "queuing") {
        await experimentService.updateExperimentLiveStatus(experimentUuid, "queuing", message);
        return {
          content: [
            { type: "text", text: JSON.stringify({ success: true, statusOnly: true }) },
          ],
        };
      }

      const log = await createProgressLog({
        companyUuid: auth.companyUuid,
        experimentUuid,
        message,
        phase,
        liveStatus,
        actorUuid: auth.actorUuid,
      });

      // Notify the experiment creator about progress
      try {
        const experiment = await prisma.experiment.findFirst({
          where: { uuid: experimentUuid, companyUuid: auth.companyUuid },
          select: {
            uuid: true,
            title: true,
            createdByUuid: true,
            researchProjectUuid: true,
            researchProject: { select: { name: true } },
          },
        });
        if (experiment) {
          await notificationService.create({
            companyUuid: auth.companyUuid,
            researchProjectUuid: experiment.researchProjectUuid,
            recipientType: "user",
            recipientUuid: experiment.createdByUuid,
            entityType: "experiment",
            entityUuid: experiment.uuid,
            entityTitle: experiment.title,
            projectName: experiment.researchProject.name,
            action: "experiment_progress",
            message,
            actorType: auth.type,
            actorUuid: auth.actorUuid,
            actorName: "Agent",
          });
        }
      } catch { /* ignore notification errors */ }

      return {
        content: [
          { type: "text", text: JSON.stringify({ success: true, logUuid: log.uuid }) },
        ],
      };
    }
  );

  server.registerTool(
    "synapse_get_project_full_context",
    {
      description: "Get full research context for a project: brief, datasets, evaluation methods, all research questions, experiments with UUIDs and outcome summaries, related-work paper titles, document references, and compute availability. Use for autonomous research analysis.",
      inputSchema: z.object({
        researchProjectUuid: z.string(),
      }),
    },
    async ({ researchProjectUuid }) => {
      const project = await prisma.researchProject.findFirst({
        where: { uuid: researchProjectUuid, companyUuid: auth.companyUuid },
        select: {
          uuid: true, name: true, description: true, goal: true,
          datasets: true, evaluationMethods: true,
          researchQuestions: {
            select: { uuid: true, title: true, content: true, status: true, reviewStatus: true },
            orderBy: { createdAt: "asc" },
          },
          experiments: {
            select: {
              uuid: true, title: true, status: true, priority: true, outcome: true, completedAt: true,
              // Lightweight: only first 120 chars of description/results for context summary
              description: true, results: true,
            },
            orderBy: { createdAt: "asc" },
          },
          relatedWorks: {
            select: { title: true },
            orderBy: { createdAt: "desc" },
          },
          documents: {
            select: { uuid: true, title: true, type: true, updatedAt: true },
            orderBy: { updatedAt: "desc" },
          },
          _count: { select: { relatedWorks: true } },
        },
      });
      if (!project) {
        return { content: [{ type: "text", text: "Project not found" }], isError: true };
      }

      // Slim experiment data — truncate description/results for overview
      const trimmedExperiments = project.experiments.map((exp) => ({
        // id is a public UUID alias for agents that look for an id field.
        id: exp.uuid,
        uuid: exp.uuid,
        title: exp.title,
        status: exp.status,
        priority: exp.priority,
        outcome: exp.outcome,
        completedAt: exp.completedAt,
        description: exp.description ? (exp.description.length > 120 ? exp.description.slice(0, 120) + "..." : exp.description) : null,
        resultSummary: exp.results ? (String(exp.results).length > 150 ? String(exp.results).slice(0, 150) + "..." : String(exp.results)) : null,
      }));
      const relatedWorks = project.relatedWorks.map((work) => work.title);
      const documents = project.documents.map((document) => ({
        id: document.uuid,
        uuid: document.uuid,
        title: document.title,
        type: document.type,
        updatedAt: document.updatedAt,
      }));

      // Fetch the auto-maintained experiment results log if it exists
      const resultsLog = await prisma.document.findFirst({
        where: { researchProjectUuid, companyUuid: auth.companyUuid, type: "experiment_results_log" },
        select: { uuid: true, title: true, content: true, updatedAt: true },
      });

      let recentIncidentLessons: Array<{
        uuid: string;
        experimentUuid: string;
        experimentTitle: string | null;
        title: string;
        status: string;
        severity: string;
        failureType: string;
        phase: string | null;
        symptom: string;
        resolution: string | null;
        prevention: string | null;
        tags: string[];
      }> = [];
      try {
        const incidentResult = await incidentLessonsService.searchIncidentLessons({
          companyUuid: auth.companyUuid,
          researchProjectUuid,
          limit: 6,
        });
        recentIncidentLessons = incidentResult.lessons.map((lesson) => ({
          uuid: lesson.uuid,
          experimentUuid: lesson.experimentUuid,
          experimentTitle: lesson.experimentTitle,
          title: lesson.title,
          status: lesson.status,
          severity: lesson.severity,
          failureType: lesson.failureType,
          phase: lesson.phase,
          symptom: lesson.symptom,
          resolution: lesson.resolution,
          prevention: lesson.prevention,
          tags: lesson.tags,
        }));
      } catch { /* ignore incident lesson errors */ }

      // Fetch compute availability for the project's bound pool
      let computeAvailability: { totalGpus: number; availableGpus: number; occupiedGpus: number; gpuModels: string[] } | null = null;
      try {
        const projectForCompute = await prisma.researchProject.findFirst({
          where: { uuid: researchProjectUuid, companyUuid: auth.companyUuid },
          select: { computePoolUuid: true },
        });
        let pools = await computeService.listComputePools(auth.companyUuid);
        if (projectForCompute?.computePoolUuid) {
          pools = pools.filter((p) => p.uuid === projectForCompute.computePoolUuid);
        }
        const allGpus = pools.flatMap((p) => p.nodes.flatMap((n) => n.gpus));
        const available = allGpus.filter((g) => g.computedStatus === "available" && !g.activeReservation);
        const models = [...new Set(allGpus.map((g) => g.model).filter(Boolean))];
        computeAvailability = {
          totalGpus: allGpus.length,
          availableGpus: available.length,
          occupiedGpus: allGpus.length - available.length,
          gpuModels: models as string[],
        };
      } catch { /* ignore compute errors */ }

      // Count in-progress experiments that occupy compute
      const inProgressCount = trimmedExperiments.filter((e) => e.status === "in_progress").length;
      const pendingStartCount = trimmedExperiments.filter((e) => e.status === "pending_start").length;

      return {
        content: [{ type: "text", text: JSON.stringify({
          project: {
            ...project,
            experiments: trimmedExperiments,
            relatedWorks,
            relatedWorksCount: project._count.relatedWorks,
            documents,
          },
          resultsLog: resultsLog ? { uuid: resultsLog.uuid, content: resultsLog.content, updatedAt: resultsLog.updatedAt } : null,
          recentIncidentLessons,
          relatedWorks,
          documents,
          computeAvailability,
          experimentQueue: { inProgress: inProgressCount, pendingStart: pendingStartCount },
          _hint: "Experiment id and uuid fields are the same public UUID; pass either value as experimentUuid to synapse_get_experiment for full details. Document id and uuid fields are the same public UUID; pass either value as documentUuid to synapse_get_document for full content. Use synapse_get_related_works when paper metadata beyond titles is needed. Before starting or proposing experiments, inspect recentIncidentLessons and call synapse_search_incident_lessons for relevant execution lessons. When an experiment fails or a recoverable issue changes config, cost, partial results, or reproducibility, call synapse_record_experiment_incident_lesson. When proposing experiments, consider available compute resources — propose at most as many experiments as there are available GPUs, minus already queued/running experiments. Each experiment card must represent ONE independent run: split sweeps, ablations, repeated trials, and baseline-vs-variant comparisons into separate cards. Multi-phase cards are only acceptable when the phases are strictly sequential stages of a single run — never pack parallel or comparative runs together.",
        }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "synapse_create_experiment",
    {
      description: "Create a new experiment outside the autonomous loop. Defaults to draft so the calling agent can run a self-review sub-agent against the new experiment, revise the plan if needed, then advance to pending_review with synapse_update_experiment_status. User-directed terminal flows on Claude Code follow this same draft → self-review → pending_review path before asking the user to approve.",
      inputSchema: z.object({
        researchProjectUuid: z.string(),
        title: z.string(),
        description: z.string(),
        researchQuestionUuid: z.string().optional(),
        priority: z.enum(["low", "medium", "high", "immediate"]).default("medium"),
        status: z.enum(["draft", "pending_review"]).default("draft"),
      }),
    },
    async ({ researchProjectUuid, title, description, researchQuestionUuid, priority, status }) => {
      const project = await prisma.researchProject.findFirst({
        where: {
          uuid: researchProjectUuid,
          companyUuid: auth.companyUuid,
        },
        select: { uuid: true, name: true },
      });
      if (!project) {
        return { content: [{ type: "text", text: "Research project not found" }], isError: true };
      }

      if (researchQuestionUuid) {
        const question = await prisma.researchQuestion.findFirst({
          where: {
            uuid: researchQuestionUuid,
            companyUuid: auth.companyUuid,
            researchProjectUuid,
          },
          select: { uuid: true },
        });
        if (!question) {
          return {
            content: [{ type: "text", text: "Research question not found in this project" }],
            isError: true,
          };
        }
      }

      const experiment = await experimentService.createExperiment({
        companyUuid: auth.companyUuid,
        researchProjectUuid,
        title,
        description,
        researchQuestionUuid: researchQuestionUuid || null,
        priority,
        status,
        createdByUuid: auth.actorUuid,
        createdByType: "agent",
      });

      try {
        const agent = await prisma.agent.findUnique({
          where: { uuid: auth.actorUuid },
          select: { ownerUuid: true, name: true },
        });
        if (agent?.ownerUuid) {
          await notificationService.create({
            companyUuid: auth.companyUuid,
            researchProjectUuid,
            recipientType: "user",
            recipientUuid: agent.ownerUuid,
            entityType: "experiment",
            entityUuid: experiment.uuid,
            entityTitle: experiment.title,
            projectName: project.name,
            action: "experiment_created",
            message:
              status === "draft"
                ? `Agent created draft experiment "${title}".`
                : `Agent created experiment "${title}" for review.`,
            actorType: "agent",
            actorUuid: auth.actorUuid,
            actorName: agent.name ?? "Agent",
          });
        }
      } catch { /* ignore notification errors */ }

      const note =
        status === "draft"
          ? "Experiment created in draft. Continue refining it or move it to pending_review when ready."
          : "Experiment created in pending_review. Human review is required before execution.";

      return {
        content: [{ type: "text", text: JSON.stringify({ experiment, note }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "synapse_propose_experiment",
    {
      description: "Autonomous-loop only: propose one independent experiment run after reviewing project context, synthesis, and compute. Before calling this tool, the autonomous-loop main agent MUST spawn a sub-agent to self-review the proposal text (motivation, hypothesis, method, success criteria, compute fit). Self-review never persists to the database. Human Review mode creates 'pending_review'; Full Auto mode creates 'pending_start' and assigns it to you. For user-directed or terminal-created experiments outside autonomous loop, use synapse_create_experiment instead.",
      inputSchema: z.object({
        researchProjectUuid: z.string(),
        title: z.string(),
        description: z.string(),
        researchQuestionUuid: z.string().optional(),
        priority: z.enum(["low", "medium", "high", "immediate"]).default("medium"),
      }),
    },
    async ({ researchProjectUuid, title, description, researchQuestionUuid, priority }) => {
      const project = await prisma.researchProject.findFirst({
        where: {
          uuid: researchProjectUuid,
          companyUuid: auth.companyUuid,
          autonomousLoopEnabled: true,
          autonomousLoopAgentUuid: auth.actorUuid,
        },
        select: {
          uuid: true,
          name: true,
          autonomousLoopEnabled: true,
          autonomousLoopAgentUuid: true,
          autonomousLoopMode: true,
        },
      });
      if (!project) {
        return {
          content: [
            {
              type: "text",
              text: "synapse_propose_experiment is only available to the project's assigned autonomous-loop agent. For user-directed or terminal-created experiments, use synapse_create_experiment.",
            },
          ],
          isError: true,
        };
      }

      if (researchQuestionUuid) {
        const question = await prisma.researchQuestion.findFirst({
          where: {
            uuid: researchQuestionUuid,
            companyUuid: auth.companyUuid,
            researchProjectUuid,
          },
          select: { uuid: true },
        });
        if (!question) {
          return {
            content: [{ type: "text", text: "Research question not found in this project" }],
            isError: true,
          };
        }
      }

      const isFullAuto = project.autonomousLoopMode === "full_auto";

      const experiment = await experimentService.createExperiment({
        companyUuid: auth.companyUuid,
        researchProjectUuid,
        title,
        description,
        researchQuestionUuid: researchQuestionUuid || null,
        priority,
        // F-023: persist the agent actor as creator so the experiment is
        // attributable back to the proposing agent.
        createdByUuid: auth.actorUuid,
        createdByType: "agent",
        status: isFullAuto ? "pending_start" : "pending_review",
        // Mode 2: skip review, go straight to pending_start with agent assigned.
        // F-024: also stamp assignedBy/assignedAt so the assignment appears
        // complete in the queue and activity streams.
        ...(isFullAuto
          ? {
              status: "pending_start" as const,
              assigneeUuid: auth.actorUuid,
              assigneeType: "agent" as const,
              assignedByUuid: auth.actorUuid,
              assignedAt: new Date(),
            }
          : {}),
      });

      // Notify the agent's owner that a new experiment was auto-proposed
      try {
        const agent = await prisma.agent.findUnique({
          where: { uuid: auth.actorUuid },
          select: { ownerUuid: true, name: true },
        });
        if (agent?.ownerUuid) {
          await notificationService.create({
            companyUuid: auth.companyUuid,
            researchProjectUuid,
            recipientType: "user",
            recipientUuid: agent.ownerUuid,
            entityType: "experiment",
            entityUuid: experiment.uuid,
            entityTitle: experiment.title,
            projectName: project.name,
            action: "experiment_auto_proposed",
            message: isFullAuto
              ? `Agent auto-proposed experiment "${title}" for immediate execution.`
              : `Agent proposed experiment "${title}" for review.`,
            actorType: "agent",
            actorUuid: auth.actorUuid,
            actorName: agent.name ?? "Agent",
          });
        }

        // Full Auto: also send task_assigned notification to the agent itself
        // This triggers handleExperimentAssigned in the plugin → detailed execution prompt
        if (isFullAuto) {
          await notificationService.create({
            companyUuid: auth.companyUuid,
            researchProjectUuid,
            recipientType: "agent",
            recipientUuid: auth.actorUuid,
            entityType: "experiment",
            entityUuid: experiment.uuid,
            entityTitle: experiment.title,
            projectName: project.name,
            action: "task_assigned",
            message: `Experiment "${title}" auto-assigned for immediate execution.`,
            actorType: "agent",
            actorUuid: auth.actorUuid,
            actorName: agent?.name ?? "Agent",
          });
        }
      } catch { /* ignore notification errors */ }

      const note = isFullAuto
        ? "Experiment created in pending_start (Full Auto mode). Ready for immediate execution."
        : "Experiment created in pending_review. Human review required before execution.";

      return {
        content: [{ type: "text", text: JSON.stringify({ experiment, note }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "synapse_update_experiment_status",
    {
      description: "Update an assigned experiment's workflow status during planning or revision. Use this to move an experiment into draft while revising, then send it back to pending_review or pending_start. For execution, keep using synapse_start_experiment and synapse_submit_experiment_results.",
      inputSchema: z.object({
        experimentUuid: z.string(),
        status: z.enum(["draft", "pending_review", "pending_start"]),
        liveStatus: z
          .enum(["sent", "ack", "writing", "checking_resources", "queuing", "running"])
          .nullable()
          .optional()
          .describe("Optional live badge override. Draft defaults to running; pending_review/pending_start default to cleared. Use 'writing' while drafting a plan."),
        liveMessage: z
          .string()
          .nullable()
          .optional()
          .describe("Optional short status text shown on the experiment card."),
      }),
    },
    async ({ experimentUuid, status, liveStatus, liveMessage }) => {
      const experiment = await experimentService.getExperiment(auth.companyUuid, experimentUuid);
      if (!experiment) {
        return { content: [{ type: "text", text: "Experiment not found" }], isError: true };
      }

      if (!isAssignedToActor(experiment.assignee, auth)) {
        return { content: [{ type: "text", text: "Experiment is assigned to another actor" }], isError: true };
      }

      const updated = await experimentService.updateExperimentWorkflowStatus({
        companyUuid: auth.companyUuid,
        experimentUuid,
        status,
        actorType: "agent",
        actorUuid: auth.actorUuid,
        ownerUuid: auth.ownerUuid,
        liveStatus,
        liveMessage,
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ experiment: updated }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "synapse_update_experiment_plan",
    {
      description: "Update an experiment's plan/details. Use this when asked to flesh out an experiment plan from a brief description. You can update title, description/plan, research question link, and priority. Either `description` or `plan` is accepted; if both are provided, `description` wins.",
      inputSchema: z.object({
        experimentUuid: z.string(),
        title: z.string().optional(),
        description: z.string().optional().describe("Detailed experiment plan/methodology"),
        // F-036: accept `plan` as an alias for `description`.
        plan: z.string().optional().describe("Alias for description."),
        researchQuestionUuid: z.string().optional().describe("Link to a research question"),
        priority: z.enum(["low", "medium", "high", "immediate"]).optional(),
      }),
    },
    async ({ experimentUuid, title, description, plan, researchQuestionUuid, priority }) => {
      const experiment = await experimentService.getExperiment(auth.companyUuid, experimentUuid);
      if (!experiment) {
        return { content: [{ type: "text", text: "Experiment not found" }], isError: true };
      }

      // F-036: `description` wins when both are provided.
      const resolvedDescription = description ?? plan;

      const updateData: Record<string, unknown> = {};
      if (title !== undefined) updateData.title = title;
      if (resolvedDescription !== undefined) updateData.description = resolvedDescription;
      if (researchQuestionUuid !== undefined) updateData.researchQuestionUuid = researchQuestionUuid || null;
      if (priority !== undefined) updateData.priority = priority;

      if (Object.keys(updateData).length === 0) {
        return { content: [{ type: "text", text: "No fields to update (provide at least one of title, description/plan, researchQuestionUuid, priority)" }], isError: true };
      }

      const updated = await experimentService.updateExperiment(
        auth.companyUuid,
        experimentUuid,
        updateData as Parameters<typeof experimentService.updateExperiment>[2],
        { actorType: "agent", actorUuid: auth.actorUuid },
      );

      return {
        content: [{ type: "text", text: JSON.stringify({ experiment: updated }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "synapse_get_repo_access",
    {
      description: "Get GitHub repository credentials for a research project. Returns repoUrl, username, token, and the experiment's base branch. Token is for cloning/pushing.",
      inputSchema: z.object({
        researchProjectUuid: z.string(),
        experimentUuid: z.string().optional().describe("If provided, returns the experiment's baseBranch"),
      }),
    },
    async ({ researchProjectUuid, experimentUuid }) => {
      const project = await prisma.researchProject.findFirst({
        where: { uuid: researchProjectUuid, companyUuid: auth.companyUuid },
        select: { repoUrl: true, githubUsername: true, githubToken: true },
      });
      if (!project?.repoUrl || !project?.githubToken) {
        return { content: [{ type: "text", text: JSON.stringify({ configured: false }) }] };
      }

      let baseBranch: string | null = null;
      if (experimentUuid) {
        const experiment = await prisma.experiment.findFirst({
          where: { uuid: experimentUuid, companyUuid: auth.companyUuid },
          select: { baseBranch: true },
        });
        baseBranch = experiment?.baseBranch ?? null;
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            configured: true,
            repoUrl: project.repoUrl,
            githubUsername: project.githubUsername,
            githubToken: project.githubToken,
            baseBranch,
          }),
        }],
      };
    }
  );
}
