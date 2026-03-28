import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRedirect = vi.fn();
const mockGetServerAuthContext = vi.fn();
const mockListApiKeys = vi.fn();
const mockCreateAgent = vi.fn();
const mockCreateApiKey = vi.fn();
const mockGetAgentByUuid = vi.fn();
const mockGetApiKey = vi.fn();
const mockRevokeApiKey = vi.fn();
const mockUpdateAgent = vi.fn();
const mockSyncApiKeyNames = vi.fn();
const mockGetSession = vi.fn();
const mockListAgentSessions = vi.fn();
const mockCloseSession = vi.fn();
const mockReopenSession = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

vi.mock("@/lib/auth-server", () => ({
  getServerAuthContext: (...args: unknown[]) => mockGetServerAuthContext(...args),
}));

vi.mock("@/services/agent.service", () => ({
  listApiKeys: (...args: unknown[]) => mockListApiKeys(...args),
  createAgent: (...args: unknown[]) => mockCreateAgent(...args),
  createApiKey: (...args: unknown[]) => mockCreateApiKey(...args),
  getAgentByUuid: (...args: unknown[]) => mockGetAgentByUuid(...args),
  getApiKey: (...args: unknown[]) => mockGetApiKey(...args),
  revokeApiKey: (...args: unknown[]) => mockRevokeApiKey(...args),
  updateAgent: (...args: unknown[]) => mockUpdateAgent(...args),
  syncApiKeyNames: (...args: unknown[]) => mockSyncApiKeyNames(...args),
}));

vi.mock("@/services/session.service", () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
  listAgentSessions: (...args: unknown[]) => mockListAgentSessions(...args),
  closeSession: (...args: unknown[]) => mockCloseSession(...args),
  reopenSession: (...args: unknown[]) => mockReopenSession(...args),
}));

import {
  closeSessionAction,
  createAgentAndKeyAction,
  getAgentSessionsAction,
  getApiKeysAction,
  updateAgentAction,
} from "@/app/(dashboard)/settings/actions";

const auth = {
  type: "user",
  companyUuid: "company-uuid-1",
  actorUuid: "owner-uuid-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetServerAuthContext.mockResolvedValue(auth);
});

describe("settings actions", () => {
  it("returns api key lastUsed timestamps", async () => {
    const lastUsed = new Date("2026-03-28T01:00:00Z");
    mockListApiKeys.mockResolvedValue({
      apiKeys: [
        {
          uuid: "key-1",
          keyPrefix: "syn_abc",
          name: "Primary key",
          lastUsed,
          expiresAt: null,
          createdAt: new Date("2026-03-27T01:00:00Z"),
          agent: {
            uuid: "agent-1",
            name: "Agent One",
            roles: ["researcher_agent"],
            persona: null,
          },
        },
      ],
    });

    const result = await getApiKeysAction();

    expect(result.success).toBe(true);
    expect(result.data?.[0].lastUsed).toBe(lastUsed.toISOString());
    expect(mockListApiKeys).toHaveBeenCalledWith(auth.companyUuid, 0, 100, auth.actorUuid);
  });

  it("trims and deduplicates create-agent input", async () => {
    mockCreateAgent.mockResolvedValue({ uuid: "agent-1" });
    mockCreateApiKey.mockResolvedValue({ key: "syn_test_key" });

    const result = await createAgentAndKeyAction({
      name: "  New Agent  ",
      roles: ["research", "research"],
      persona: "  Helpful  ",
    });

    expect(result.success).toBe(true);
    expect(mockCreateAgent).toHaveBeenCalledWith({
      companyUuid: auth.companyUuid,
      name: "New Agent",
      roles: ["research"],
      ownerUuid: auth.actorUuid,
      persona: "Helpful",
    });
    expect(mockCreateApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New Agent" }),
    );
  });

  it("rejects invalid roles before creating an agent", async () => {
    const result = await createAgentAndKeyAction({
      name: "Bad Agent",
      roles: ["super_admin"],
      persona: null,
    });

    expect(result).toEqual({ success: false, error: "Invalid agent role" });
    expect(mockCreateAgent).not.toHaveBeenCalled();
    expect(mockCreateApiKey).not.toHaveBeenCalled();
  });

  it("blocks session listing for agents the current user does not own", async () => {
    mockGetAgentByUuid.mockResolvedValue(null);

    const result = await getAgentSessionsAction("foreign-agent");

    expect(result).toEqual({ success: false, error: "Agent not found" });
    expect(mockListAgentSessions).not.toHaveBeenCalled();
  });

  it("blocks session closing when the session belongs to another user's agent", async () => {
    mockGetSession.mockResolvedValue({
      uuid: "session-1",
      agentUuid: "foreign-agent",
    });
    mockGetAgentByUuid.mockResolvedValue(null);

    const result = await closeSessionAction("session-1");

    expect(result).toEqual({ success: false, error: "Session not found" });
    expect(mockCloseSession).not.toHaveBeenCalled();
  });

  it("blocks agent updates when the current user does not own the agent", async () => {
    mockGetAgentByUuid.mockResolvedValue(null);

    const result = await updateAgentAction({
      agentUuid: "foreign-agent",
      name: "Updated",
      roles: ["research"],
      persona: null,
    });

    expect(result).toEqual({ success: false, error: "Agent not found" });
    expect(mockUpdateAgent).not.toHaveBeenCalled();
    expect(mockSyncApiKeyNames).not.toHaveBeenCalled();
  });
});
