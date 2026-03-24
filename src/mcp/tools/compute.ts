import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AgentAuthContext } from "@/types/auth";
import * as activityService from "@/services/activity.service";
import * as computeService from "@/services/compute.service";
import * as experimentRunService from "@/services/experiment-run.service";
import * as sessionService from "@/services/session.service";

function serializeAccess(node: {
  sshHost: string | null;
  sshUser: string | null;
  sshPort: number | null;
  sshKeyPath: string | null;
  ssmTarget: string | null;
}) {
  return {
    ssh:
      node.sshHost || node.sshUser || node.sshPort || node.sshKeyPath
        ? {
            host: node.sshHost,
            user: node.sshUser,
            port: node.sshPort ?? 22,
            keyPath: node.sshKeyPath,
          }
        : null,
    ssmTarget: node.ssmTarget,
  };
}

export function registerComputeTools(server: McpServer, auth: AgentAuthContext) {
  server.registerTool(
    "synapse_list_compute_nodes",
    {
      description: "List compute pools, nodes, SSH/SSM access details, and the status of every GPU.",
      inputSchema: z.object({
        onlyAvailable: z.boolean().default(false),
      }),
    },
    async ({ onlyAvailable }) => {
      const pools = await computeService.listComputePools(auth.companyUuid);
      const nodes = pools.flatMap((pool) =>
        pool.nodes.map((node) => ({
          uuid: node.uuid,
          label: node.label,
          pool: { uuid: pool.uuid, name: pool.name },
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
              status: gpu.activeReservation ? `occupied:${gpu.activeReservation.runTitle}` : gpu.computedStatus,
              utilizationPercent: gpu.utilizationPercent,
              memoryUsedGb: gpu.memoryUsedGb,
              temperatureC: gpu.temperatureC,
              activeReservation: gpu.activeReservation,
              lastReportedAt: gpu.lastReportedAt,
            })),
        }))
      );

      return {
        content: [{ type: "text", text: JSON.stringify({ pools, nodes }, null, 2) }],
      };
    }
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
    "synapse_start_experiment_run_with_gpus",
    {
      description: "Claim an experiment run if needed, reserve one or more GPUs, and move the run into in_progress.",
      inputSchema: z.object({
        runUuid: z.string(),
        gpuUuids: z.array(z.string()).min(1),
        sessionUuid: z.string().optional(),
      }),
    },
    async ({ runUuid, gpuUuids, sessionUuid }) => {
      const run = await experimentRunService.getExperimentRunByUuid(auth.companyUuid, runUuid);
      if (!run) {
        return { content: [{ type: "text", text: "Experiment Run not found" }], isError: true };
      }

      if (run.assigneeUuid && run.assigneeUuid !== auth.actorUuid) {
        return { content: [{ type: "text", text: "Experiment Run is assigned to another actor" }], isError: true };
      }

      if (!run.assigneeUuid && run.status === "open") {
        await experimentRunService.claimExperimentRun({
          runUuid,
          companyUuid: auth.companyUuid,
          assigneeType: "agent",
          assigneeUuid: auth.actorUuid,
        });

        await activityService.createActivity({
          companyUuid: auth.companyUuid,
          researchProjectUuid: run.researchProjectUuid,
          targetType: "experiment_run",
          targetUuid: runUuid,
          actorType: "agent",
          actorUuid: auth.actorUuid,
          action: "assigned",
          value: { assigneeType: "agent", assigneeUuid: auth.actorUuid },
        });
      }

      const depCheck = await experimentRunService.checkDependenciesResolved(runUuid);
      if (!depCheck.resolved) {
        return {
          content: [{ type: "text", text: `Dependencies not resolved for run ${runUuid}` }],
          isError: true,
        };
      }

      await computeService.reserveGpusForRun({
        companyUuid: auth.companyUuid,
        runUuid,
        gpuUuids,
      });

      const updated = await experimentRunService.updateExperimentRun(
        runUuid,
        { status: "in_progress" },
        { actorType: "agent", actorUuid: auth.actorUuid },
      );

      await activityService.createActivity({
        companyUuid: auth.companyUuid,
        researchProjectUuid: run.researchProjectUuid,
        targetType: "experiment_run",
        targetUuid: runUuid,
        actorType: "agent",
        actorUuid: auth.actorUuid,
        action: "status_changed",
        value: { status: "in_progress", gpuUuids },
        sessionUuid,
      });

      if (sessionUuid) {
        await sessionService.sessionCheckinToRun(auth.companyUuid, sessionUuid, runUuid);
      }

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
        content: [{ type: "text", text: JSON.stringify({ run: updated, nodes: selectedNodes }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "synapse_submit_experiment_results",
    {
      description: "Submit experiment outcomes, move the run to verification, and release any GPU reservations held by the run.",
      inputSchema: z.object({
        runUuid: z.string(),
        outcome: z.string().optional(),
        experimentResults: z.unknown().optional(),
        sessionUuid: z.string().optional(),
      }),
    },
    async ({ runUuid, outcome, experimentResults, sessionUuid }) => {
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
}
