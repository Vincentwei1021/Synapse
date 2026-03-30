import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
const mockCreateComputeNode = vi.fn();
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockReadFile = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
  isUser: (auth: { type: string }) => auth.type === "user",
}));

vi.mock("@/services/compute.service", () => ({
  createComputeNode: (...args: unknown[]) => mockCreateComputeNode(...args),
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  },
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
}));

vi.mock("node:fs/promises", () => ({
  chmod: vi.fn(),
  mkdir: vi.fn(),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: vi.fn(),
}));

import { POST as createComputeNodeRoute } from "@/app/api/compute-nodes/route";
import { GET as sshConfigRoute } from "@/app/api/ssh-config/route";

const companyUuid = "company-0000-0000-0000-000000000001";

describe("compute routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue({
      type: "user",
      companyUuid,
      actorUuid: "user-uuid-1",
    });
    mockCreateComputeNode.mockResolvedValue({
      uuid: "node-uuid-1",
      label: "GPU Box",
      lifecycle: "idle",
    });
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(Buffer.from("pem-private-key"));
  });

  it("sanitizes SSH config responses so identityFile paths never reach the client", async () => {
    mockReadFileSync.mockReturnValue(`
Host gpu-box
  HostName gpu.example.com
  User ubuntu
  Port 2200
  IdentityFile ~/.ssh/gpu.pem
`);

    const response = await sshConfigRoute(
      new NextRequest(new URL("/api/ssh-config", "http://localhost:3000")),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.hosts).toEqual([
      {
        alias: "gpu-box",
        hostName: "gpu.example.com",
        user: "ubuntu",
        port: 2200,
      },
    ]);
    expect(body.data.hosts[0]).not.toHaveProperty("identityFile");
  });

  it("resolves SSH config aliases server-side when registering compute nodes", async () => {
    mockReadFileSync.mockReturnValue(`
Host gpu-box
  HostName gpu.example.com
  User ubuntu
  Port 2200
  IdentityFile ~/.ssh/gpu.pem
`);

    const formData = new FormData();
    formData.set("poolUuid", "pool-uuid-1");
    formData.set("label", "GPU Box");
    formData.set("sshConfigAlias", "gpu-box");
    formData.set("sshKeySource", "ssh_config");

    const response = await createComputeNodeRoute(
      new NextRequest(new URL("/api/compute-nodes", "http://localhost:3000"), {
        method: "POST",
        body: formData,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockCreateComputeNode).toHaveBeenCalledWith(
      expect.objectContaining({
        companyUuid,
        poolUuid: "pool-uuid-1",
        label: "GPU Box",
        sshHost: "gpu.example.com",
        sshUser: "ubuntu",
        sshPort: 2200,
        sshKeySource: "ssh_config",
        sshKeyName: "gpu.pem",
        sshKeyPath: expect.stringContaining(".ssh/gpu.pem"),
        sshKeyFingerprint: expect.any(String),
      }),
    );
    expect(body.data.key).toEqual({
      name: "gpu.pem",
      source: "ssh_config",
    });
    expect(body.data.key).not.toHaveProperty("path");
  });
});
