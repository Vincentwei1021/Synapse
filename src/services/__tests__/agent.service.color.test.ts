import { describe, it, expect, vi, beforeEach } from "vitest";

// ===== Prisma mock =====
const mockPrisma = vi.hoisted(() => ({
  agent: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/api-key", () => ({
  generateApiKey: () => ({ key: "k", hash: "h", prefix: "p" }),
}));

import { createAgent, updateAgent } from "@/services/agent.service";

const companyUuid = "test-company-color";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("agent.service color persistence", () => {
  it("createAgent stores the color key and returns it", async () => {
    mockPrisma.agent.create.mockResolvedValue({
      uuid: "agent-1",
      name: "Painter",
      roles: ["research"],
      type: "openclaw",
      persona: null,
      systemPrompt: null,
      ownerUuid: "owner-1",
      color: "violet",
      createdAt: new Date(),
    });

    const agent = await createAgent({
      companyUuid,
      name: "Painter",
      roles: ["research"],
      ownerUuid: "owner-1",
      color: "violet",
    });

    expect(agent.color).toBe("violet");
    expect(mockPrisma.agent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ color: "violet" }),
        select: expect.objectContaining({ color: true }),
      })
    );
  });

  it("updateAgent can change color to a new key", async () => {
    mockPrisma.agent.update.mockResolvedValue({
      uuid: "agent-2",
      name: "Chameleon",
      roles: ["research"],
      type: "openclaw",
      persona: null,
      systemPrompt: null,
      ownerUuid: "owner-2",
      color: "blue",
      lastActiveAt: null,
      createdAt: new Date(),
    });

    const updated = await updateAgent("agent-2", { color: "blue" });

    expect(updated.color).toBe("blue");
    expect(mockPrisma.agent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uuid: "agent-2" },
        data: expect.objectContaining({ color: "blue" }),
        select: expect.objectContaining({ color: true }),
      })
    );
  });

  it("updateAgent can clear color to null", async () => {
    mockPrisma.agent.update.mockResolvedValue({
      uuid: "agent-3",
      name: "Clearer",
      roles: ["research"],
      type: "openclaw",
      persona: null,
      systemPrompt: null,
      ownerUuid: "owner-3",
      color: null,
      lastActiveAt: null,
      createdAt: new Date(),
    });

    const cleared = await updateAgent("agent-3", { color: null });

    expect(cleared.color).toBeNull();
    expect(mockPrisma.agent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ color: null }),
      })
    );
  });
});
