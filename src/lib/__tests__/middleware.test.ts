import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockJwtVerify = vi.hoisted(() => vi.fn());

vi.mock("jose", async () => {
  const actual = await vi.importActual<typeof import("jose")>("jose");
  return {
    ...actual,
    jwtVerify: mockJwtVerify,
  };
});

import { middleware } from "@/middleware";

function createJwtPayloadToken(payload: Record<string, unknown>) {
  const encoded = Buffer.from(JSON.stringify(payload))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return `header.${encoded}.signature`;
}

function createRequest(cookieHeader?: string) {
  return new NextRequest("http://localhost:3000/research-projects/test-project/dashboard", {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
}

describe("middleware default-auth handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_SECRET = "test-secret";
  });

  it("redirects to /login when user_session is expired and no refresh token exists", async () => {
    const expiredToken = createJwtPayloadToken({
      exp: Math.floor(Date.now() / 1000) - 30,
      userUuid: "user-1",
      companyUuid: "company-1",
      email: "admin@example.com",
      oidcSub: "default-auth-user",
    });

    const response = await middleware(
      createRequest(`user_session=${expiredToken}`),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("redirects to /login when user_session is expired and refresh token verification fails", async () => {
    const expiredToken = createJwtPayloadToken({
      exp: Math.floor(Date.now() / 1000) - 30,
      userUuid: "user-1",
      companyUuid: "company-1",
      email: "admin@example.com",
      oidcSub: "default-auth-user",
    });

    mockJwtVerify.mockRejectedValueOnce(new Error("invalid refresh"));

    const response = await middleware(
      createRequest(`user_session=${expiredToken}; user_refresh=bad-refresh-token`),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("allows the request through when user_session is still valid", async () => {
    const validToken = createJwtPayloadToken({
      exp: Math.floor(Date.now() / 1000) + 3600,
      userUuid: "user-1",
      companyUuid: "company-1",
      email: "admin@example.com",
      oidcSub: "default-auth-user",
    });

    const response = await middleware(
      createRequest(`user_session=${validToken}`),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
