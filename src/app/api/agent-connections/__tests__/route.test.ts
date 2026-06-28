import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAuthContext = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, getAuthContext: mockGetAuthContext };
});
const mockListOwnerConnections = vi.hoisted(() => vi.fn());
vi.mock("@/services/agent-connection.service", () => ({
  listOwnerConnections: mockListOwnerConnections,
}));

import { GET } from "@/app/api/agent-connections/route";

function req() {
  return new Request("http://localhost/api/agent-connections", {
    headers: { authorization: "Bearer session" },
  }) as any;
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/agent-connections", () => {
  it("401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("403 when caller is an agent", async () => {
    mockGetAuthContext.mockResolvedValue({ type: "agent", companyUuid: "c", actorUuid: "a" });
    const res = await GET(req());
    expect(res.status).toBe(403);
  });

  it("returns owner-scoped connections for a user", async () => {
    mockGetAuthContext.mockResolvedValue({ type: "user", companyUuid: "c", actorUuid: "u" });
    mockListOwnerConnections.mockResolvedValue([{ connectionKey: "a::h::/c", agentUuid: "a" }]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(mockListOwnerConnections).toHaveBeenCalledWith(
      expect.objectContaining({ companyUuid: "c", ownerUuid: "u" }),
    );
  });
});
