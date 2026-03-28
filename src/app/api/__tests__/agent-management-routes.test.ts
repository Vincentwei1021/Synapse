import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
const mockListAgents = vi.fn();
const mockCreateAgent = vi.fn();
const mockGetAgent = vi.fn();
const mockGetAgentByUuid = vi.fn();
const mockUpdateAgent = vi.fn();
const mockDeleteAgent = vi.fn();
const mockListApiKeys = vi.fn();
const mockCreateApiKey = vi.fn();
const mockGetApiKey = vi.fn();
const mockRevokeApiKey = vi.fn();
const mockListAgentSessions = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
  isUser: vi.fn(() => true),
}));

vi.mock("@/services/agent.service", () => ({
  listAgents: (...args: unknown[]) => mockListAgents(...args),
  createAgent: (...args: unknown[]) => mockCreateAgent(...args),
  getAgent: (...args: unknown[]) => mockGetAgent(...args),
  getAgentByUuid: (...args: unknown[]) => mockGetAgentByUuid(...args),
  updateAgent: (...args: unknown[]) => mockUpdateAgent(...args),
  deleteAgent: (...args: unknown[]) => mockDeleteAgent(...args),
  listApiKeys: (...args: unknown[]) => mockListApiKeys(...args),
  createApiKey: (...args: unknown[]) => mockCreateApiKey(...args),
  getApiKey: (...args: unknown[]) => mockGetApiKey(...args),
  revokeApiKey: (...args: unknown[]) => mockRevokeApiKey(...args),
}));

vi.mock("@/services/session.service", () => ({
  listAgentSessions: (...args: unknown[]) => mockListAgentSessions(...args),
}));

import { GET as listAgentsRoute, POST as createAgentRoute } from "@/app/api/agents/route";
import {
  DELETE as deleteAgentRoute,
  GET as getAgentRoute,
  PATCH as updateAgentRoute,
} from "@/app/api/agents/[uuid]/route";
import { GET as listAgentSessionsRoute } from "@/app/api/agents/[uuid]/sessions/route";
import { GET as listApiKeysRoute, POST as createApiKeyRoute } from "@/app/api/api-keys/route";
import { DELETE as revokeApiKeyRoute } from "@/app/api/api-keys/[uuid]/route";

const companyUuid = "company-0000-0000-0000-000000000001";
const agentUuid = "agent-0000-0000-0000-000000000001";
const apiKeyUuid = "apikey-0000-0000-0000-000000000001";
const now = new Date("2026-03-28T00:00:00Z");
const mockAuth = { type: "user", companyUuid, actorUuid: "user-uuid-1" };

function makeRequest(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(new URL(url, "http://localhost:3000"), init);
}

function makeContext(uuid: string) {
  return { params: Promise.resolve({ uuid }) };
}

describe("agent management routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue(mockAuth);
    mockListAgents.mockResolvedValue({
      agents: [
        {
          uuid: agentUuid,
          name: "Test Agent",
          roles: ["researcher_agent"],
          persona: null,
          ownerUuid: "user-uuid-1",
          lastActiveAt: now,
          createdAt: now,
          _count: { apiKeys: 2 },
        },
      ],
      total: 1,
    });
    mockCreateAgent.mockResolvedValue({
      uuid: agentUuid,
      name: "Test Agent",
      roles: ["researcher_agent"],
      persona: null,
      systemPrompt: null,
      ownerUuid: "user-uuid-1",
      createdAt: now,
    });
    mockGetAgent.mockResolvedValue({
      uuid: agentUuid,
      name: "Test Agent",
      roles: ["researcher_agent"],
      persona: null,
      systemPrompt: null,
      ownerUuid: "user-uuid-1",
      lastActiveAt: now,
      createdAt: now,
      apiKeys: [
        {
          uuid: apiKeyUuid,
          keyPrefix: "syn_abc",
          name: "Primary key",
          lastUsed: null,
          expiresAt: null,
          createdAt: now,
        },
      ],
    });
    mockGetAgentByUuid.mockResolvedValue({
      uuid: agentUuid,
      name: "Test Agent",
      roles: ["researcher_agent"],
    });
    mockUpdateAgent.mockResolvedValue({
      uuid: agentUuid,
      name: "Renamed Agent",
      roles: ["research_lead_agent"],
      persona: "Helpful",
      systemPrompt: "Be precise",
      ownerUuid: "user-uuid-1",
      lastActiveAt: now,
      createdAt: now,
    });
    mockListApiKeys.mockResolvedValue({
      apiKeys: [
        {
          uuid: apiKeyUuid,
          keyPrefix: "syn_abc",
          name: "Primary key",
          lastUsed: null,
          expiresAt: null,
          createdAt: now,
          agent: {
            uuid: agentUuid,
            name: "Test Agent",
            roles: ["researcher_agent"],
          },
        },
      ],
      total: 1,
    });
    mockCreateApiKey.mockResolvedValue({
      uuid: apiKeyUuid,
      key: "syn_test_key",
      keyPrefix: "syn_abc",
      name: "Primary key",
      expiresAt: null,
      createdAt: now,
    });
    mockGetApiKey.mockResolvedValue({
      uuid: apiKeyUuid,
      agentUuid,
      revokedAt: null,
    });
    mockListAgentSessions.mockResolvedValue([{ uuid: "session-1", status: "running" }]);
  });

  it("GET /api/agents returns paginated agent data through service layer", async () => {
    const response = await listAgentsRoute(makeRequest("/api/agents?page=1&pageSize=20"), {
      params: Promise.resolve({}),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data[0]).toEqual(
      expect.objectContaining({
        uuid: agentUuid,
        apiKeyCount: 2,
      }),
    );
    expect(mockListAgents).toHaveBeenCalledWith({
      companyUuid,
      skip: 0,
      take: 20,
    });
  });

  it("POST /api/agents creates an agent through service layer", async () => {
    const response = await createAgentRoute(
      makeRequest("/api/agents", {
        method: "POST",
        body: JSON.stringify({
          name: " Test Agent ",
          roles: ["researcher_agent"],
          persona: " Helpful ",
          systemPrompt: " Be precise ",
        }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockCreateAgent).toHaveBeenCalledWith({
      companyUuid,
      name: "Test Agent",
      roles: ["researcher_agent"],
      persona: "Helpful",
      systemPrompt: "Be precise",
      ownerUuid: "user-uuid-1",
    });
  });

  it("GET /api/agents/[uuid] returns agent detail through service layer", async () => {
    const response = await getAgentRoute(makeRequest(`/api/agents/${agentUuid}`), makeContext(agentUuid));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.apiKeys[0].prefix).toBe("syn_abc");
    expect(mockGetAgent).toHaveBeenCalledWith(companyUuid, agentUuid);
  });

  it("PATCH /api/agents/[uuid] updates an agent through service layer", async () => {
    const response = await updateAgentRoute(
      makeRequest(`/api/agents/${agentUuid}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: " Renamed Agent ",
          roles: ["research_lead_agent"],
          persona: " Helpful ",
          systemPrompt: " Be precise ",
        }),
        headers: { "content-type": "application/json" },
      }),
      makeContext(agentUuid),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.name).toBe("Renamed Agent");
    expect(mockGetAgentByUuid).toHaveBeenCalledWith(companyUuid, agentUuid);
    expect(mockUpdateAgent).toHaveBeenCalledWith(agentUuid, {
      name: "Renamed Agent",
      roles: ["research_lead_agent"],
      persona: "Helpful",
      systemPrompt: "Be precise",
    });
  });

  it("DELETE /api/agents/[uuid] deletes an agent through service layer", async () => {
    const response = await deleteAgentRoute(
      makeRequest(`/api/agents/${agentUuid}`, { method: "DELETE" }),
      makeContext(agentUuid),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ deleted: true });
    expect(mockDeleteAgent).toHaveBeenCalledWith(agentUuid);
  });

  it("GET /api/agents/[uuid]/sessions verifies agent through service layer", async () => {
    const response = await listAgentSessionsRoute(
      makeRequest(`/api/agents/${agentUuid}/sessions?status=running`),
      makeContext(agentUuid),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([{ uuid: "session-1", status: "running" }]);
    expect(mockGetAgentByUuid).toHaveBeenCalledWith(companyUuid, agentUuid);
    expect(mockListAgentSessions).toHaveBeenCalledWith(companyUuid, agentUuid, "running");
  });

  it("GET /api/api-keys returns paginated API key data through service layer", async () => {
    const response = await listApiKeysRoute(makeRequest("/api/api-keys?page=1&pageSize=20"), {
      params: Promise.resolve({}),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data[0].agent.uuid).toBe(agentUuid);
    expect(mockListApiKeys).toHaveBeenCalledWith(companyUuid, 0, 20);
  });

  it("POST /api/api-keys creates a key through service layer", async () => {
    const response = await createApiKeyRoute(
      makeRequest("/api/api-keys", {
        method: "POST",
        body: JSON.stringify({
          agentUuid,
          name: " Primary key ",
          expiresAt: "2026-04-01T00:00:00.000Z",
        }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.key).toBe("syn_test_key");
    expect(mockGetAgentByUuid).toHaveBeenCalledWith(companyUuid, agentUuid);
    expect(mockCreateApiKey).toHaveBeenCalledWith({
      companyUuid,
      agentUuid,
      name: "Primary key",
      expiresAt: new Date("2026-04-01T00:00:00.000Z"),
    });
  });

  it("DELETE /api/api-keys/[uuid] revokes a key through service layer", async () => {
    const response = await revokeApiKeyRoute(
      makeRequest(`/api/api-keys/${apiKeyUuid}`, { method: "DELETE" }),
      makeContext(apiKeyUuid),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ revoked: true });
    expect(mockGetApiKey).toHaveBeenCalledWith(companyUuid, apiKeyUuid);
    expect(mockRevokeApiKey).toHaveBeenCalledWith(apiKeyUuid);
  });
});
