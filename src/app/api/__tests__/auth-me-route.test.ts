import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetUserIdentity = vi.fn();

vi.mock("@/services/user.service", () => ({
  getUserIdentity: (...args: unknown[]) => mockGetUserIdentity(...args),
}));

import { GET } from "@/app/api/auth/me/route";

function createJwt(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.signature`;
}

describe("GET /api/auth/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns current user via userUuid lookup", async () => {
    mockGetUserIdentity.mockResolvedValue({
      uuid: "user-uuid-1",
      email: "dev@synapse.local",
      name: "Dev User",
      company: {
        uuid: "company-uuid-1",
        name: "Synapse",
      },
    });

    const token = createJwt({
      userUuid: "user-uuid-1",
      companyUuid: "company-uuid-1",
      email: "dev@synapse.local",
    });

    const response = await GET(
      new NextRequest(new URL("/api/auth/me", "http://localhost:3000"), {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.user.email).toBe("dev@synapse.local");
    expect(mockGetUserIdentity).toHaveBeenCalledWith({
      userUuid: "user-uuid-1",
      oidcSub: undefined,
    });
  });

  it("falls back to oidcSub lookup for raw OIDC-style token", async () => {
    mockGetUserIdentity.mockResolvedValue({
      uuid: "user-uuid-2",
      email: "oidc@synapse.local",
      name: "OIDC User",
      company: {
        uuid: "company-uuid-1",
        name: "Synapse",
      },
    });

    const token = createJwt({
      sub: "oidc-sub-1",
      email: "oidc@synapse.local",
    });

    const response = await GET(
      new NextRequest(new URL("/api/auth/me", "http://localhost:3000"), {
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(response.status).toBe(200);
    expect(mockGetUserIdentity).toHaveBeenCalledWith({
      userUuid: undefined,
      oidcSub: "oidc-sub-1",
    });
  });
});
