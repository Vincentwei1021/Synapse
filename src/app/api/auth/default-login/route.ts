// src/app/api/auth/default-login/route.ts
// Default user password login API

import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler, parseBody } from "@/lib/api-handler";
import { errors } from "@/lib/api-response";
import {
  isDefaultAuthEnabled,
  getDefaultUserEmail,
  verifyDefaultPassword,
} from "@/lib/default-auth";
import {
  createUserAccessToken,
  createUserRefreshToken,
  setUserSessionCookies,
  UserSessionPayload,
} from "@/lib/user-session";
import { getCookieOptions } from "@/lib/cookie-utils";
import { findOrCreateDefaultUser } from "@/services/user.service";

interface DefaultLoginRequest {
  email: string;
  password: string;
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  // Check if default auth is enabled
  if (!isDefaultAuthEnabled()) {
    return errors.badRequest("Default auth is not enabled");
  }

  const body = await parseBody<DefaultLoginRequest>(request);

  // Validate input
  if (!body.email || typeof body.email !== "string") {
    return errors.validationError({ email: "Email is required" });
  }
  if (!body.password || typeof body.password !== "string") {
    return errors.validationError({ password: "Password is required" });
  }

  const email = body.email.trim().toLowerCase();
  const defaultEmail = getDefaultUserEmail();

  // Verify email matches DEFAULT_USER (case-insensitive)
  if (email !== defaultEmail) {
    return errors.unauthorized("Invalid credentials");
  }

  // Verify password
  const isValid = await verifyDefaultPassword(body.password);
  if (!isValid) {
    return errors.unauthorized("Invalid credentials");
  }

  // Auto-provision company + user
  const user = await findOrCreateDefaultUser(email);

  // Create JWT session
  const sessionPayload: UserSessionPayload = {
    type: "user",
    userUuid: user.uuid,
    companyUuid: user.companyUuid,
    email: user.email ?? email,
    name: user.name ?? undefined,
    oidcSub: user.oidcSub,
  };

  const [accessToken, refreshToken] = await Promise.all([
    createUserAccessToken(sessionPayload),
    createUserRefreshToken(sessionPayload),
  ]);

  // Create response and set cookies
  const response = NextResponse.json({
    success: true,
    data: {
      user: {
        uuid: user.uuid,
        email: user.email,
        name: user.name,
        companyUuid: user.companyUuid,
        companyName: user.company.name,
      },
      redirectTo: "/",
    },
  });

  // Switching from SSO to default auth should clear any stale OIDC cookies so
  // the next navigation cannot mix two auth modes.
  const expireOpts = getCookieOptions(0);
  response.cookies.set("oidc_access_token", "", expireOpts);
  response.cookies.set("oidc_refresh_token", "", expireOpts);
  response.cookies.set("oidc_client_id", "", expireOpts);
  response.cookies.set("oidc_issuer", "", expireOpts);

  setUserSessionCookies(response, accessToken, refreshToken);

  return response;
});
