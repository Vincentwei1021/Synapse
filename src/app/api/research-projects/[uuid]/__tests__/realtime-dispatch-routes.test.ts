import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
const mockPrisma = vi.hoisted(() => ({
  researchProject: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  agent: {
    findFirst: vi.fn(),
  },
}));
const mockCreateNotification = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
  isUser: vi.fn(() => true),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/services/notification.service", () => ({
  create: (...args: unknown[]) => mockCreateNotification(...args),
}));
vi.mock("@/services/agent-connection.service", () => ({
  agentHasLiveConnection: vi.fn(() => false),
}));
vi.mock("@/lib/event-bus", () => ({
  eventBus: { emitChange: vi.fn() },
}));

import { POST as autoSearch } from "@/app/api/research-projects/[uuid]/related-works/auto-search/route";
import { POST as deepResearch } from "@/app/api/research-projects/[uuid]/related-works/deep-research/route";
import { POST as triggerSynthesis } from "@/app/api/research-projects/[uuid]/synthesis/trigger/route";

const companyUuid = "company-0000-0000-0000-000000000001";
const projectUuid = "project-0000-0000-0000-000000000001";
const agentUuid = "agent-0000-0000-0000-000000000001";

function makeRequest() {
  return new NextRequest(new URL("http://localhost:3000/api/test"), {
    method: "POST",
    body: JSON.stringify({ agentUuid }),
    headers: { "content-type": "application/json" },
  });
}

function makeContext() {
  return { params: Promise.resolve({ uuid: projectUuid }) };
}

describe("realtime dispatch routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue({ type: "user", companyUuid, actorUuid: "user-uuid-1" });
    mockPrisma.researchProject.findFirst.mockResolvedValue({ name: "Project" });
    mockPrisma.agent.findFirst.mockResolvedValue({ type: "claude_code" });
  });

  it.each([
    ["auto search", autoSearch],
    ["deep research", deepResearch],
    ["synthesis", triggerSynthesis],
  ])("%s rejects non-live agents with Claude Code-aware guidance", async (_name, handler) => {
    const response = await handler(makeRequest(), makeContext());
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(JSON.stringify(body)).toContain("Select a connected OpenClaw or Claude Code agent.");
    expect(mockPrisma.researchProject.update).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});
