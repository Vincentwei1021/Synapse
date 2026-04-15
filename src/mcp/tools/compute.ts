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
      description: "Get full details for a single experiment, including any inherited parent-question context.",
      inputSchema: z.object({
        experimentUuid: z.string(),
      }),
    },
    async ({ experimentUuid }) => {
      const experiment = await experimentService.getExperiment(auth.companyUuid, experimentUuid);
      if (!experiment) {
        return { content: [{ type: "text", text: "Experiment not found" }], isError: true };
      }

      return {
        content: [{ type: "text", text: JSON.stringify({ experiment }, null, 2) }],
      };
    },
  );

  server.registerTool(
    "synapse_start_experiment",
    {
      description: "Move an assigned experiment from pending_start to in_progress, optionally reserving GPUs first.",
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
      description: "Get full research context for a project: brief, datasets, evaluation methods, all research questions, all experiments with outcomes, and related works count. Use for autonomous research analysis.",
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
          _count: { select: { relatedWorks: true } },
        },
      });
      if (!project) {
        return { content: [{ type: "text", text: "Project not found" }], isError: true };
      }

      // Slim experiment data — truncate description/results for overview
      const trimmedExperiments = project.experiments.map((exp) => ({
        uuid: exp.uuid,
        title: exp.title,
        status: exp.status,
        priority: exp.priority,
        outcome: exp.outcome,
        completedAt: exp.completedAt,
        description: exp.description ? (exp.description.length > 120 ? exp.description.slice(0, 120) + "..." : exp.description) : null,
        resultSummary: exp.results ? (String(exp.results).length > 150 ? String(exp.results).slice(0, 150) + "..." : String(exp.results)) : null,
      }));

      // Fetch the auto-maintained experiment results log if it exists
      const resultsLog = await prisma.document.findFirst({
        where: { researchProjectUuid, companyUuid: auth.companyUuid, type: "experiment_results_log" },
        select: { uuid: true, title: true, content: true, updatedAt: true },
      });

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
          project: { ...project, experiments: trimmedExperiments },
          resultsLog: resultsLog ? { uuid: resultsLog.uuid, content: resultsLog.content, updatedAt: resultsLog.updatedAt } : null,
          computeAvailability,
          experimentQueue: { inProgress: inProgressCount, pendingStart: pendingStartCount },
          _hint: "Use synapse_get_experiment for full details of a specific experiment. When proposing experiments, consider available compute resources — propose at most as many experiments as there are available GPUs, minus already queued/running experiments.",
        }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "synapse_propose_experiment",
    {
      description: "Propose a new experiment. In Human Review mode, created as 'pending_review' for human approval. In Full Auto mode, created as 'pending_start' and assigned to you for immediate execution. Only usable when autonomous loop is active and you are the assigned agent.",
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
        select: { uuid: true, autonomousLoopMode: true },
      });
      if (!project) {
        return { content: [{ type: "text", text: "Autonomous loop is not enabled for this project or you are not the assigned agent" }], isError: true };
      }

      const isFullAuto = project.autonomousLoopMode === "full_auto";

      const experiment = await experimentService.createExperiment({
        companyUuid: auth.companyUuid,
        researchProjectUuid,
        title,
        description,
        researchQuestionUuid: researchQuestionUuid || null,
        priority,
        createdByUuid: auth.actorUuid,
        createdByType: "agent",
        // Mode 2: skip review, go straight to pending_start with agent assigned
        ...(isFullAuto ? { status: "pending_start" as const, assigneeUuid: auth.actorUuid, assigneeType: "agent" as const } : {}),
      });

      // Notify the agent's owner that a new experiment was auto-proposed
      try {
        const projectForNotif = await prisma.researchProject.findFirst({
          where: { uuid: researchProjectUuid, companyUuid: auth.companyUuid },
          select: { name: true },
        });
        const agent = await prisma.agent.findUnique({
          where: { uuid: auth.actorUuid },
          select: { ownerUuid: true, name: true },
        });
        if (agent?.ownerUuid && projectForNotif) {
          await notificationService.create({
            companyUuid: auth.companyUuid,
            researchProjectUuid,
            recipientType: "user",
            recipientUuid: agent.ownerUuid,
            entityType: "experiment",
            entityUuid: experiment.uuid,
            entityTitle: experiment.title,
            projectName: projectForNotif.name,
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
        if (isFullAuto && projectForNotif) {
          await notificationService.create({
            companyUuid: auth.companyUuid,
            researchProjectUuid,
            recipientType: "agent",
            recipientUuid: auth.actorUuid,
            entityType: "experiment",
            entityUuid: experiment.uuid,
            entityTitle: experiment.title,
            projectName: projectForNotif.name,
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
    "synapse_update_experiment_plan",
    {
      description: "Update an experiment's plan/details. Use this when asked to flesh out an experiment plan from a brief description. You can update title, description, research question link, and priority.",
      inputSchema: z.object({
        experimentUuid: z.string(),
        title: z.string().optional(),
        description: z.string().optional().describe("Detailed experiment plan/methodology"),
        researchQuestionUuid: z.string().optional().describe("Link to a research question"),
        priority: z.enum(["low", "medium", "high", "immediate"]).optional(),
      }),
    },
    async ({ experimentUuid, title, description, researchQuestionUuid, priority }) => {
      const experiment = await experimentService.getExperiment(auth.companyUuid, experimentUuid);
      if (!experiment) {
        return { content: [{ type: "text", text: "Experiment not found" }], isError: true };
      }

      const updateData: Record<string, unknown> = {};
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (researchQuestionUuid !== undefined) updateData.researchQuestionUuid = researchQuestionUuid || null;
      if (priority !== undefined) updateData.priority = priority;

      if (Object.keys(updateData).length === 0) {
        return { content: [{ type: "text", text: "No fields to update" }], isError: true };
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
