import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", async (o) => ({ ...(await (o as any)()), getAuthContext: mockAuth }));

const mockInterrupt = vi.hoisted(() => vi.fn());
const NoAgent = vi.hoisted(() => class NoAgentAssigneeError extends Error {});
const NotFound = vi.hoisted(() => class ExperimentNotFoundError extends Error {});
vi.mock("@/services/experiment-control.service", () => ({
  requestInterrupt: mockInterrupt,
  NoAgentAssigneeError: NoAgent,
  ExperimentNotFoundError: NotFound,
}));

import { POST } from "@/app/api/experiments/[uuid]/interrupt/route";

function req() {
  return new Request("http://localhost/api/experiments/exp-1/interrupt", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer x" },
  }) as any;
}
const ctx = { params: Promise.resolve({ uuid: "exp-1" }) } as any;

beforeEach(() => vi.clearAllMocks());

describe("POST interrupt", () => {
  it("401 unauth", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await POST(req(), ctx)).status).toBe(401);
  });

  it("403 non-user", async () => {
    mockAuth.mockResolvedValue({ type: "agent", companyUuid: "c", actorUuid: "a" });
    expect((await POST(req(), ctx)).status).toBe(403);
  });

  it("409 no agent assignee", async () => {
    mockAuth.mockResolvedValue({ type: "user", companyUuid: "c", actorUuid: "u", name: "U" });
    mockInterrupt.mockRejectedValue(new NoAgent());
    expect((await POST(req(), ctx)).status).toBe(409);
  });

  it("404 experiment not found", async () => {
    mockAuth.mockResolvedValue({ type: "user", companyUuid: "c", actorUuid: "u", name: "U" });
    mockInterrupt.mockRejectedValue(new NotFound());
    expect((await POST(req(), ctx)).status).toBe(404);
  });

  it("200 success calls requestInterrupt with company+experiment+actor", async () => {
    mockAuth.mockResolvedValue({ type: "user", companyUuid: "c", actorUuid: "u", name: "U" });
    mockInterrupt.mockResolvedValue({ notificationUuid: "n1" });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    expect(mockInterrupt).toHaveBeenCalledWith(
      expect.objectContaining({
        companyUuid: "c",
        experimentUuid: "exp-1",
        actorUuid: "u",
      }),
    );
  });
});
