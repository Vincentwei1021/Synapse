import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  agent: {
    findFirst: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  canClaimEntity,
  canReleaseEntity,
  canAssignEntity,
  resolveAssignmentTarget,
} from "@/services/assignment-policy.service";
import type { AgentAuthContext, UserAuthContext } from "@/types/auth";

const companyUuid = "company-0000-0000-0000-000000000001";

const userAuth: UserAuthContext = {
  type: "user",
  companyUuid,
  actorUuid: "user-uuid",
  email: "user@example.com",
};

const researcherAgentAuth: AgentAuthContext = {
  type: "agent",
  companyUuid,
  actorUuid: "agent-uuid",
  agentName: "Researcher Bot",
  roles: ["researcher"],
  ownerUuid: "owner-uuid",
};

const nonResearcherAgentAuth: AgentAuthContext = {
  type: "agent",
  companyUuid,
  actorUuid: "agent-non-researcher",
  agentName: "Other Bot",
  roles: ["pi"],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("assignment-policy.service", () => {
  describe("canClaimEntity", () => {
    it("allows users to claim entities", () => {
      expect(canClaimEntity(userAuth, () => false)).toBe(true);
    });

    it("uses role policy for agent claims", () => {
      expect(canClaimEntity(researcherAgentAuth, (auth) => auth.roles?.includes("researcher") ?? false)).toBe(true);
      expect(canClaimEntity(nonResearcherAgentAuth, (auth) => auth.roles?.includes("researcher") ?? false)).toBe(false);
    });
  });

  describe("canAssignEntity", () => {
    it("resolves an assignable agent with the required role", async () => {
      mockPrisma.agent.findFirst.mockResolvedValue({ uuid: "agent-target" });

      const result = await canAssignEntity({
        companyUuid,
        agentUuid: "agent-target",
        requiredRole: "developer",
        notFoundLabel: "Researcher Agent",
      });

      expect(result).toEqual({
        ok: true,
        assigneeType: "agent",
        assigneeUuid: "agent-target",
      });
    });

    it("returns not_found when the target agent is unavailable", async () => {
      mockPrisma.agent.findFirst.mockResolvedValue(null);

      const result = await canAssignEntity({
        companyUuid,
        agentUuid: "missing-agent",
        requiredRole: "pm",
        notFoundLabel: "Research Lead Agent",
      });

      expect(result).toEqual({
        ok: false,
        error: "not_found",
        message: "Research Lead Agent not found",
      });
    });
  });

  describe("resolveAssignmentTarget", () => {
    it("lets a matching agent claim directly", async () => {
      const result = await resolveAssignmentTarget({
        auth: researcherAgentAuth,
        companyUuid,
        allowAgentClaim: (auth) => auth.roles?.includes("researcher") ?? false,
        agentClaimForbiddenMessage: "Only researcher agents can claim experiment runs",
        assignableAgentRole: "developer",
        assignableAgentLabel: "Researcher Agent",
      });

      expect(result).toEqual({
        ok: true,
        target: {
          assigneeType: "agent",
          assigneeUuid: "agent-uuid",
          assignedByUuid: null,
        },
      });
    });

    it("rejects an agent without the required claim role", async () => {
      const result = await resolveAssignmentTarget({
        auth: nonResearcherAgentAuth,
        companyUuid,
        allowAgentClaim: (auth) => auth.roles?.includes("researcher") ?? false,
        agentClaimForbiddenMessage: "Only researcher agents can claim experiment runs",
        assignableAgentRole: "developer",
        assignableAgentLabel: "Researcher Agent",
      });

      expect(result).toEqual({
        ok: false,
        error: "forbidden",
        message: "Only researcher agents can claim experiment runs",
      });
    });

    it("assigns to the user themselves when no agentUuid is provided", async () => {
      const result = await resolveAssignmentTarget({
        auth: userAuth,
        companyUuid,
        body: { assignToSelf: true },
        allowAgentClaim: () => false,
        agentClaimForbiddenMessage: "forbidden",
        assignableAgentRole: "developer",
        assignableAgentLabel: "Researcher Agent",
      });

      expect(result).toEqual({
        ok: true,
        target: {
          assigneeType: "user",
          assigneeUuid: "user-uuid",
          assignedByUuid: "user-uuid",
        },
      });
    });

    it("assigns to a specific agent when the user provides an agentUuid", async () => {
      mockPrisma.agent.findFirst.mockResolvedValue({ uuid: "agent-target" });

      const result = await resolveAssignmentTarget({
        auth: userAuth,
        companyUuid,
        body: { agentUuid: "agent-target" },
        allowAgentClaim: () => false,
        agentClaimForbiddenMessage: "forbidden",
        assignableAgentRole: "developer",
        assignableAgentLabel: "Researcher Agent",
      });

      expect(result).toEqual({
        ok: true,
        target: {
          assigneeType: "agent",
          assigneeUuid: "agent-target",
          assignedByUuid: "user-uuid",
        },
      });
    });
  });

  describe("canReleaseEntity", () => {
    it("lets users release any assigned entity", () => {
      expect(canReleaseEntity(userAuth, "agent", "agent-uuid")).toBe(true);
    });

    it("lets an agent release their own assignment", () => {
      expect(canReleaseEntity(researcherAgentAuth, "agent", "agent-uuid")).toBe(true);
    });

    it("lets an owned agent release a user-owned assignment", () => {
      expect(canReleaseEntity(researcherAgentAuth, "user", "owner-uuid")).toBe(true);
    });

    it("blocks unrelated agents from releasing another assignment", () => {
      expect(canReleaseEntity(nonResearcherAgentAuth, "agent", "agent-uuid")).toBe(false);
    });
  });
});
