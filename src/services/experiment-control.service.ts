// src/services/experiment-control.service.ts
// Experiment-control service: resolve an experiment's agent assignee, then
// deliver an out-of-band instruction (comment + notification) or an interrupt
// request (notification only) to that agent.
//
// All operations are scoped by companyUuid via getExperiment.

import { getExperiment } from "@/services/experiment.service";
import * as notificationService from "@/services/notification.service";
import * as commentService from "@/services/comment.service";
import { prisma } from "@/lib/prisma";

export class NoAgentAssigneeError extends Error {
  constructor() {
    super("Experiment has no agent assignee");
    this.name = "NoAgentAssigneeError";
  }
}

export class ExperimentNotFoundError extends Error {
  constructor() {
    super("Experiment not found");
    this.name = "ExperimentNotFoundError";
  }
}

export interface InjectInstructionParams {
  companyUuid: string;
  experimentUuid: string;
  message: string;
  actorUuid: string;
  actorName: string;
}

export interface RequestInterruptParams {
  companyUuid: string;
  experimentUuid: string;
  actorUuid: string;
  actorName: string;
}

// Load the experiment and assert it is assigned to an agent. Returns the
// experiment plus the resolved agent assignee uuid.
async function loadAgentExperiment(companyUuid: string, experimentUuid: string) {
  const experiment = await getExperiment(companyUuid, experimentUuid);
  if (!experiment) {
    throw new ExperimentNotFoundError();
  }
  // getExperiment returns ExperimentResponse, where the assignee is nested as
  // { type, uuid, name, ... } | null — there is no top-level assigneeType.
  const assignee = experiment.assignee;
  if (!assignee || assignee.type !== "agent" || !assignee.uuid) {
    throw new NoAgentAssigneeError();
  }
  return { experiment, agentUuid: assignee.uuid };
}

// notificationService.create requires a real projectName; ExperimentResponse
// does not carry one, so resolve it the same way createExperiment does.
async function resolveProjectName(
  companyUuid: string,
  researchProjectUuid: string,
): Promise<string> {
  const project = await prisma.researchProject.findFirst({
    where: { uuid: researchProjectUuid, companyUuid },
    select: { name: true },
  });
  return project?.name ?? "";
}

export async function injectInstruction(
  p: InjectInstructionParams,
): Promise<{ notificationUuid?: string }> {
  const { experiment, agentUuid } = await loadAgentExperiment(p.companyUuid, p.experimentUuid);

  // Comment must be created BEFORE the notification.
  // Note: createComment also emits a `comment_added` wake event. The daemon
  // intentionally ignores `comment_added` wakes, so do not try to suppress it
  // here — the `experiment_instruction` notification below is what wakes the agent.
  await commentService.createComment({
    companyUuid: p.companyUuid,
    targetType: "experiment",
    targetUuid: p.experimentUuid,
    content: p.message,
    authorType: "user",
    authorUuid: p.actorUuid,
  });

  const projectName = await resolveProjectName(p.companyUuid, experiment.researchProjectUuid);

  const notification = await notificationService.create({
    companyUuid: p.companyUuid,
    researchProjectUuid: experiment.researchProjectUuid,
    recipientType: "agent",
    recipientUuid: agentUuid,
    entityType: "experiment",
    entityUuid: p.experimentUuid,
    entityTitle: experiment.title,
    projectName,
    action: "experiment_instruction",
    message: p.message,
    actorType: "user",
    actorUuid: p.actorUuid,
    actorName: p.actorName,
  });

  return { notificationUuid: notification.uuid };
}

export async function requestInterrupt(
  p: RequestInterruptParams,
): Promise<{ notificationUuid?: string }> {
  const { experiment, agentUuid } = await loadAgentExperiment(p.companyUuid, p.experimentUuid);

  const projectName = await resolveProjectName(p.companyUuid, experiment.researchProjectUuid);

  const notification = await notificationService.create({
    companyUuid: p.companyUuid,
    researchProjectUuid: experiment.researchProjectUuid,
    recipientType: "agent",
    recipientUuid: agentUuid,
    entityType: "experiment",
    entityUuid: p.experimentUuid,
    entityTitle: experiment.title,
    projectName,
    action: "experiment_interrupt",
    message: "Interrupt requested",
    actorType: "user",
    actorUuid: p.actorUuid,
    actorName: p.actorName,
  });

  return { notificationUuid: notification.uuid };
}
