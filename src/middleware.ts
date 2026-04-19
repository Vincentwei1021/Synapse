// src/middleware.ts
// Edge Middleware for server-side token refresh
// Handles both OIDC tokens and user_session (Default Auth) tokens automatically

import { NextRequest, NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { ACCESS_TOKEN_EXPIRY, ACCESS_TOKEN_MAX_AGE } from "@/lib/user-session";
import { getCookieOptions } from "@/lib/cookie-utils";

// Pino does NOT work in Edge Runtime — use an inline edge logger
const edgeLog = {
  info(msg: string, ...args: unknown[]) { console.log(`[Synapse:middleware] ${msg}`, ...args); },
  error(msg: string, ...args: unknown[]) { console.error(`[Synapse:middleware] ${msg}`, ...args); },
};

// In-memory cache for OIDC discovery documents (per edge instance)
const discoveryCache = new Map<string, { tokenEndpoint: string; expiresAt: number }>();

// Decode JWT payload without verification (Edge Runtime compatible, no Buffer)
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    // Base64url → Base64 → decode
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Get JWT signing secret for user_session tokens
function getJwtSecret(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

// Get token endpoint from OIDC discovery, with 10-minute cache
async function getTokenEndpoint(issuer: string): Promise<string | null> {
  const cached = discoveryCache.get(issuer);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tokenEndpoint;
  }

  try {
    const wellKnownUrl = `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
    const response = await fetch(wellKnownUrl);
    if (!response.ok) return null;

    const doc = await response.json();
    const tokenEndpoint = doc.token_endpoint;
    if (!tokenEndpoint) return null;

    // Cache for 10 minutes
    discoveryCache.set(issuer, {
      tokenEndpoint,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    return tokenEndpoint;
  } catch {
    return null;
  }
}

// Clear all auth cookies and redirect to login
function clearAuthAndRedirect(request: NextRequest): NextResponse {
  const loginUrl = new URL("/login", request.url);
  const response = NextResponse.redirect(loginUrl);

  const expireOpts = getCookieOptions(0);
  response.cookies.set("oidc_access_token", "", expireOpts);
  response.cookies.set("oidc_refresh_token", "", expireOpts);
  response.cookies.set("oidc_client_id", "", expireOpts);
  response.cookies.set("oidc_issuer", "", expireOpts);
  response.cookies.set("user_session", "", expireOpts);
  response.cookies.set("user_refresh", "", expireOpts);

  return response;
}

// ─── User Session (Default Auth) refresh ────────────────────────────────────
// Default Auth users get a short-lived user_session JWT (access token) and a
// long-lived user_refresh JWT (refresh token). Unlike OIDC, both are self-signed
// with NEXTAUTH_SECRET so we can verify and re-sign entirely in Edge Runtime
// without calling any external endpoint.
async function handleUserSessionRefresh(request: NextRequest): Promise<NextResponse | null> {
  const userSession = request.cookies.get("user_session")?.value;

  if (!userSession) {
    return null; // No user_session cookie — not a Default Auth user
  }

  // Check expiry
  const payload = decodeJwtPayload(userSession);
  if (payload && typeof payload.exp === "number") {
    const now = Math.floor(Date.now() / 1000);
    // Still valid with comfortable margin — pass through
    if (payload.exp - now > 10) {
      return null;
    }
  }

  // Token expired or about to expire — try refresh
  const userRefresh = request.cookies.get("user_refresh")?.value;
  if (!userRefresh) {
    // No refresh token — cannot renew, let page-level auth handle redirect
    return null;
  }

  try {
    const secret = getJwtSecret();

    // Verify the refresh token (must not be expired, must be tokenType "refresh")
    const { payload: refreshPayload } = await jwtVerify(userRefresh, secret);
    if (refreshPayload.tokenType !== "refresh") {
      return null;
    }

    // Reconstruct the access token payload from the (possibly expired) access token.
    // The refresh token only carries userUuid + companyUuid, so we need the rest
    // (email, name, oidcSub) from the old access token payload.
    const newAccessToken = await new SignJWT({
      type: "user",
      tokenType: "access",
      userUuid: payload?.userUuid ?? refreshPayload.userUuid,
      companyUuid: payload?.companyUuid ?? refreshPayload.companyUuid,
      email: payload?.email,
      name: payload?.name,
      oidcSub: payload?.oidcSub,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(ACCESS_TOKEN_EXPIRY)
      .sign(secret);

    edgeLog.info("User session refreshed for", payload?.email || refreshPayload.userUuid);

    // Write the new access token to the request cookie so downstream Server Components read it
    request.cookies.set("user_session", newAccessToken);

    const response = NextResponse.next({
      request: { headers: request.headers },
    });

    // Write the new access token to the response cookie for the browser
    response.cookies.set("user_session", newAccessToken, getCookieOptions(ACCESS_TOKEN_MAX_AGE));

    return response;
  } catch (error) {
    edgeLog.error("User session refresh error:", error);
    return null; // Let page-level auth handle redirect
  }
}

// ─── Main middleware ─────────────────────────────────────────────────────────
export async function middleware(request: NextRequest) {
  // --- 0. Legacy URL redirects: ?research-question={id} → /research-questions/{id}, ?run={id} → /experiment-runs/{id} ---
  const { pathname, searchParams } = request.nextUrl;
  const questionsMatch = pathname.match(/^\/research-projects\/([^/]+)\/research-questions$/);
  if (questionsMatch && searchParams.has("research-question")) {
    const questionUuid = searchParams.get("research-question")!;
    const url = request.nextUrl.clone();
    url.pathname = `/research-projects/${questionsMatch[1]}/research-questions/${questionUuid}`;
    url.searchParams.delete("research-question");
    return NextResponse.redirect(url, 307);
  }
  const runsMatch = pathname.match(/^\/research-projects\/([^/]+)\/experiment-runs$/);
  if (runsMatch && searchParams.has("run")) {
    const runUuid = searchParams.get("run")!;
    const url = request.nextUrl.clone();
    url.pathname = `/research-projects/${runsMatch[1]}/experiment-runs/${runUuid}`;
    url.searchParams.delete("run");
    return NextResponse.redirect(url, 307);
  }

  // --- 1. Try user_session refresh (Default Auth) ---
  // Check this first because it's a quick local operation (no external fetch).
  const userSession = request.cookies.get("user_session")?.value;
  const userResult = await handleUserSessionRefresh(request);
  if (userResult) return userResult;

  if (userSession) {
    const payload = decodeJwtPayload(userSession);
    const now = Math.floor(Date.now() / 1000);

    // A malformed or expired default-auth access token should be cleared here
    // instead of being allowed to fall through to a later server-component redirect.
    if (!payload || typeof payload.exp !== "number" || payload.exp - now <= 10) {
      return clearAuthAndRedirect(request);
    }

    return NextResponse.next();
  }

  // --- 2. OIDC token refresh ---
  const accessToken = request.cookies.get("oidc_access_token")?.value;

  // No access token at all — check if we have refresh materials
  if (!accessToken) {
    const refreshToken = request.cookies.get("oidc_refresh_token")?.value;
    if (!refreshToken) {
      // No tokens at all — let the request through (page-level auth will handle redirect)
      return NextResponse.next();
    }
    // Fall through to refresh logic below
  }

  // If we have an access token, check expiry
  if (accessToken) {
    const payload = decodeJwtPayload(accessToken);
    if (payload && typeof payload.exp === "number") {
      const now = Math.floor(Date.now() / 1000);
      // If more than 30 seconds until expiry, let it through
      if (payload.exp - now > 30) {
        return NextResponse.next();
      }
    }
  }

  // Token is expired or about to expire — attempt refresh
  const refreshToken = request.cookies.get("oidc_refresh_token")?.value;
  const clientId = request.cookies.get("oidc_client_id")?.value;
  const issuer = request.cookies.get("oidc_issuer")?.value;

  if (!refreshToken || !clientId || !issuer) {
    // Missing refresh materials — cannot refresh, clear and redirect
    return clearAuthAndRedirect(request);
  }

  // Get the token endpoint
  const tokenEndpoint = await getTokenEndpoint(issuer);
  if (!tokenEndpoint) {
    edgeLog.error("Failed to discover token endpoint for issuer:", issuer);
    return clearAuthAndRedirect(request);
  }

  // Call the token endpoint
  try {
    const tokenResponse = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: refreshToken,
      }),
    });

    if (!tokenResponse.ok) {
      edgeLog.error("Token refresh failed:", tokenResponse.status);
      return clearAuthAndRedirect(request);
    }

    const tokenData = await tokenResponse.json();
    const newAccessToken = tokenData.access_token;

    if (!newAccessToken) {
      edgeLog.error("No access_token in refresh response");
      return clearAuthAndRedirect(request);
    }

    // Determine maxAge from expires_in or default to 3600
    const expiresIn = typeof tokenData.expires_in === "number" ? tokenData.expires_in : 3600;

    // Write the new access token to the request cookie so downstream Server Components can read it
    request.cookies.set("oidc_access_token", newAccessToken);

    const response = NextResponse.next({
      request: {
        headers: request.headers,
      },
    });

    // Write the new access token to the response cookie for the browser
    response.cookies.set("oidc_access_token", newAccessToken, getCookieOptions(expiresIn));

    // If the provider returned a new refresh token (token rotation), update it
    if (tokenData.refresh_token) {
      request.cookies.set("oidc_refresh_token", tokenData.refresh_token);
      response.cookies.set("oidc_refresh_token", tokenData.refresh_token, getCookieOptions(30 * 24 * 3600));
    }

    return response;
  } catch (error) {
    edgeLog.error("Token refresh error:", error);
    return clearAuthAndRedirect(request);
  }
}

export const config = {
  matcher: [
    // Match all paths except static assets, login, auth API, and special paths
    "/((?!_next|login|api/auth|skill|favicon\\.ico|.*\\.).*)",
  ],
};
