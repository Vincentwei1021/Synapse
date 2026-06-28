import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAuthContext = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", async (orig) => {
  const actual = await (orig as any)();
  return { ...actual, getAuthContext: mockGetAuthContext };
});
const mockRecordHeartbeat = vi.hoisted(() => vi.fn());
vi.mock("@/services/agent-connection.service", () => ({
  recordHeartbeat: mockRecordHeartbeat,
}));

import { POST } from "@/app/api/agent-connections/heartbeat/route";

function req(body: unknown) {
  return new Request("http://localhost/api/agent-connections/heartbeat", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer syn_x" },
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/agent-connections/heartbeat", () => {
  it("401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await POST(req({ host: "h", cwd: "/c" }));
    expect(res.status).toBe(401);
  });

  it("403 when caller is a user, not an agent", async () => {
    mockGetAuthContext.mockResolvedValue({ type: "user", companyUuid: "c", actorUuid: "u" });
    const res = await POST(req({ host: "h", cwd: "/c" }));
    expect(res.status).toBe(403);
  });

  it("400 when host or cwd missing", async () => {
    mockGetAuthContext.mockResolvedValue({ type: "agent", companyUuid: "c", actorUuid: "a" });
    const res = await POST(req({ host: "h" }));
    expect(res.status).toBe(400);
  });

  it("records heartbeat from agent auth context", async () => {
    mockGetAuthContext.mockResolvedValue({ type: "agent", companyUuid: "c", actorUuid: "a" });
    mockRecordHeartbeat.mockResolvedValue({ connectionKey: "a::box::/c" });
    const res = await POST(req({ host: "box", cwd: "/c", pid: 42, clientType: "openclaw" }));
    expect(res.status).toBe(200);
    expect(mockRecordHeartbeat).toHaveBeenCalledWith(
      expect.objectContaining({ companyUuid: "c", agentUuid: "a", host: "box", cwd: "/c", pid: 42, clientType: "openclaw" }),
    );
  });
});
