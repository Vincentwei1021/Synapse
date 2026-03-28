import { prisma } from "@/lib/prisma";
import { isAgent, isAssignee, isUser } from "@/lib/auth";
import type { AuthContext } from "@/types/auth";

export interface AssignmentRequestBody {
  assignToSelf?: boolean;
  agentUuid?: string;
}

export interface AssignmentTarget {
  assigneeType: "user" | "agent";
  assigneeUuid: string;
  assignedByUuid: string | null;
}

interface ResolveAssignmentTargetInput {
  auth: AuthContext;
  companyUuid: string;
  body?: AssignmentRequestBody;
  allowAgentClaim: (auth: AuthContext) => boolean;
  agentClaimForbiddenMessage: string;
  assignableAgentRole: string;
  assignableAgentLabel: string;
}

type AssignmentResolution =
  | { ok: true; target: AssignmentTarget }
  | { ok: false; error: "forbidden" | "not_found"; message: string };

export function canClaimEntity(auth: AuthContext, allowAgentClaim: (auth: AuthContext) => boolean): boolean {
  if (isUser(auth)) {
    return true;
  }

  if (isAgent(auth)) {
    return allowAgentClaim(auth);
  }

  return false;
}

export function canReleaseEntity(
  auth: AuthContext,
  assigneeType: string | null,
  assigneeUuid: string | null
): boolean {
  return isUser(auth) || isAssignee(auth, assigneeType, assigneeUuid);
}

export async function canAssignEntity(input: {
  companyUuid: string;
  agentUuid: string;
  requiredRole: string;
  notFoundLabel: string;
}): Promise<
  | { ok: true; assigneeType: "agent"; assigneeUuid: string }
  | { ok: false; error: "not_found"; message: string }
> {
  const agent = await prisma.agent.findFirst({
    where: {
      uuid: input.agentUuid,
      companyUuid: input.companyUuid,
      roles: { has: input.requiredRole },
    },
    select: { uuid: true },
  });

  if (!agent) {
    return { ok: false, error: "not_found", message: `${input.notFoundLabel} not found` };
  }

  return {
    ok: true,
    assigneeType: "agent",
    assigneeUuid: agent.uuid,
  };
}

export async function resolveAssignmentTarget(
  input: ResolveAssignmentTargetInput
): Promise<AssignmentResolution> {
  const { auth, companyUuid, body, allowAgentClaim, agentClaimForbiddenMessage, assignableAgentRole, assignableAgentLabel } = input;

  if (isAgent(auth)) {
    if (!allowAgentClaim(auth)) {
      return {
        ok: false,
        error: "forbidden",
        message: agentClaimForbiddenMessage,
      };
    }

    return {
      ok: true,
      target: {
        assigneeType: "agent",
        assigneeUuid: auth.actorUuid,
        assignedByUuid: null,
      },
    };
  }

  if (!isUser(auth)) {
    return {
      ok: false,
      error: "forbidden",
      message: "Invalid authentication context",
    };
  }

  if (body?.agentUuid) {
    const assignment = await canAssignEntity({
      companyUuid,
      agentUuid: body.agentUuid,
      requiredRole: assignableAgentRole,
      notFoundLabel: assignableAgentLabel,
    });

    if (!assignment.ok) {
      return assignment;
    }

    return {
      ok: true,
      target: {
        assigneeType: assignment.assigneeType,
        assigneeUuid: assignment.assigneeUuid,
        assignedByUuid: auth.actorUuid,
      },
    };
  }

  return {
    ok: true,
    target: {
      assigneeType: "user",
      assigneeUuid: auth.actorUuid,
      assignedByUuid: auth.actorUuid,
    },
  };
}
