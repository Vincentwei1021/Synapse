import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", async (o) => ({ ...(await (o as any)()), getAuthContext: mockAuth }));

const mockInject = vi.hoisted(() => vi.fn());
const NoAgent = vi.hoisted(() => class NoAgentAssigneeError extends Error {});
const NotFound = vi.hoisted(() => class ExperimentNotFoundError extends Error {});
vi.mock("@/services/experiment-control.service", () => ({
  injectInstruction: mockInject,
  NoAgentAssigneeError: NoAgent,
  ExperimentNotFoundError: NotFound,
}));

import { POST } from "@/app/api/experiments/[uuid]/instruction/route";

function req(body: unknown) {
  return new Request("http://localhost/api/experiments/exp-1/instruction", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer x" },
    body: JSON.stringify(body),
  }) as any;
}
const ctx = { params: Promise.resolve({ uuid: "exp-1" }) } as any;

beforeEach(() => vi.clearAllMocks());

describe("POST instruction", () => {
  it("401 unauth", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await POST(req({ message: "g" }), ctx)).status).toBe(401);
  });

  it("403 non-user", async () => {
    mockAuth.mockResolvedValue({ type: "agent", companyUuid: "c", actorUuid: "a" });
    expect((await POST(req({ message: "g" }), ctx)).status).toBe(403);
  });

  it("400 empty message", async () => {
    mockAuth.mockResolvedValue({ type: "user", companyUuid: "c", actorUuid: "u", name: "U" });
    expect((await POST(req({ message: "" }), ctx)).status).toBe(400);
  });

  it("409 no agent assignee", async () => {
    mockAuth.mockResolvedValue({ type: "user", companyUuid: "c", actorUuid: "u", name: "U" });
    mockInject.mockRejectedValue(new NoAgent());
    expect((await POST(req({ message: "g" }), ctx)).status).toBe(409);
  });

  it("404 experiment not found", async () => {
    mockAuth.mockResolvedValue({ type: "user", companyUuid: "c", actorUuid: "u", name: "U" });
    mockInject.mockRejectedValue(new NotFound());
    expect((await POST(req({ message: "g" }), ctx)).status).toBe(404);
  });

  it("200 success calls injectInstruction with company+experiment+message", async () => {
    mockAuth.mockResolvedValue({ type: "user", companyUuid: "c", actorUuid: "u", name: "U" });
    mockInject.mockResolvedValue({ notificationUuid: "n1" });
    const res = await POST(req({ message: "do it" }), ctx);
    expect(res.status).toBe(200);
    expect(mockInject).toHaveBeenCalledWith(
      expect.objectContaining({
        companyUuid: "c",
        experimentUuid: "exp-1",
        message: "do it",
        actorUuid: "u",
      }),
    );
  });
});
