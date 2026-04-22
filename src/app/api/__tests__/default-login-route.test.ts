import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockIsDefaultAuthEnabled = vi.fn();
const mockGetDefaultUserEmail = vi.fn();
const mockVerifyDefaultPassword = vi.fn();
const mockCreateUserAccessToken = vi.fn();
const mockCreateUserRefreshToken = vi.fn();
const mockFindOrCreateDefaultUser = vi.fn();

vi.mock("@/lib/default-auth", () => ({
  isDefaultAuthEnabled: (...args: unknown[]) => mockIsDefaultAuthEnabled(...args),
  getDefaultUserEmail: (...args: unknown[]) => mockGetDefaultUserEmail(...args),
  verifyDefaultPassword: (...args: unknown[]) => mockVerifyDefaultPassword(...args),
}));

vi.mock("@/lib/user-session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/user-session")>("@/lib/user-session");
  return {
    ...actual,
    createUserAccessToken: (...args: unknown[]) => mockCreateUserAccessToken(...args),
    createUserRefreshToken: (...args: unknown[]) => mockCreateUserRefreshToken(...args),
  };
});

vi.mock("@/services/user.service", () => ({
  findOrCreateDefaultUser: (...args: unknown[]) => mockFindOrCreateDefaultUser(...args),
}));

import { POST } from "@/app/api/auth/default-login/route";

describe("POST /api/auth/default-login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDefaultAuthEnabled.mockReturnValue(true);
    mockGetDefaultUserEmail.mockReturnValue("dev@synapse.local");
    mockVerifyDefaultPassword.mockResolvedValue(true);
    mockCreateUserAccessToken.mockResolvedValue("access-token");
    mockCreateUserRefreshToken.mockResolvedValue("refresh-token");
    mockFindOrCreateDefaultUser.mockResolvedValue({
      uuid: "user-uuid-1",
      email: "dev@synapse.local",
      name: "Dev User",
      oidcSub: "default-auth-user",
      companyUuid: "company-uuid-1",
      company: {
        name: "Synapse",
      },
    });
  });

  it("clears stale OIDC cookies and sets the default-auth session cookies", async () => {
    const response = await POST(
      new NextRequest(new URL("/api/auth/default-login", "http://localhost:3000"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "dev@synapse.local",
          password: "synapse123",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.cookies.get("oidc_access_token")?.value).toBe("");
    expect(response.cookies.get("oidc_refresh_token")?.value).toBe("");
    expect(response.cookies.get("oidc_client_id")?.value).toBe("");
    expect(response.cookies.get("oidc_issuer")?.value).toBe("");
    expect(response.cookies.get("user_session")?.value).toBe("access-token");
    expect(response.cookies.get("user_refresh")?.value).toBe("refresh-token");
  });
});
