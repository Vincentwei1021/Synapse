// src/lib/auth.ts
// Authentication middleware and utility functions (ARCHITECTURE.md §6)
// UUID-Based Architecture: All IDs are UUIDs

import { NextRequest, NextResponse } from "next/server";
import { extractApiKey, validateApiKey } from "./api-key";
import { errors } from "./api-response";
import type {
  AuthContext,
  AgentAuthContext,
  UserAuthContext,
  SuperAdminAuthContext,
  AgentRole,
} from "@/types/auth";
import { getSuperAdminFromRequest } from "./super-admin";
import { getUserSessionFromRequest } from "./user-session";
import { verifyOidcAccessToken, isOidcToken } from "./oidc-auth";

// Get auth context from request (UUID-based)
export async function getAuthContext(
  request: NextRequest
): Promise<AuthContext | null> {
  const authHeader = request.headers.get("authorization");

  // 1. Try Bearer Token authentication
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.substring(7).trim();

    // 1a. API Key authentication (Agent) - API Key starts with "syn_"
    if (token.startsWith("syn_")) {
      const result = await validateApiKey(token);
      if (result.valid && result.agent) {
        const agentContext: AgentAuthContext = {
          type: "agent",
          companyUuid: result.agent.companyUuid,
          actorUuid: result.agent.uuid,
          roles: result.agent.roles as AgentRole[],
          ownerUuid: result.agent.ownerUuid ?? undefined,
          agentName: result.agent.name,
        };
        return agentContext;
      }
    }

    // 1b. OIDC Access Token authentication (regular user)
    if (isOidcToken(token)) {
      const userContext = await verifyOidcAccessToken(token);
      if (userContext) {
        return userContext;
      }
    }

    // 1c. Synapse JWT Token authentication (SuperAdmin or legacy compatibility)
    const userSession = await getUserSessionFromRequest(request);
    if (userSession) {
      return userSession;
    }
  }

  // 2. Try Session Cookie authentication -- when no Authorization header
  const userSession = await getUserSessionFromRequest(request);
  if (userSession) {
    return userSession;
  }

  // 3. Try OIDC Access Token Cookie authentication (for scenarios like EventSource that cannot send Authorization headers)
  const oidcCookieToken = request.cookies.get("oidc_access_token")?.value;
  if (oidcCookieToken && isOidcToken(oidcCookieToken)) {
    const oidcContext = await verifyOidcAccessToken(oidcCookieToken);
    if (oidcContext) {
      return oidcContext;
    }
  }

  return null;
}

// Check if context is Agent
export function isAgent(ctx: AuthContext): ctx is AgentAuthContext {
  return ctx.type === "agent";
}

// Check if context is User
export function isUser(ctx: AuthContext): ctx is UserAuthContext {
  return ctx.type === "user";
}

// Check if Agent has a specific role
export function hasRole(ctx: AuthContext, role: AgentRole): boolean {
  if (!isAgent(ctx)) return false;
  return ctx.roles.includes(role);
}

// Check if Research Lead Agent (supports both "research_lead" and "research_lead_agent" roles)
export function isResearchLead(ctx: AuthContext): boolean {
  return hasRole(ctx, "research_lead") || hasRole(ctx, "research_lead_agent");
}

// Check if Researcher Agent (supports both "researcher" and "researcher_agent" roles)
export function isResearcher(ctx: AuthContext): boolean {
  return hasRole(ctx, "researcher") || hasRole(ctx, "researcher_agent");
}

// Check if PI Agent (supports both "pi" and "pi_agent" roles)
export function isPi(ctx: AuthContext): boolean {
  return hasRole(ctx, "pi") || hasRole(ctx, "pi_agent");
}

// Require authentication decorator factory
export function requireAuth<T>(
  handler: (
    request: NextRequest,
    context: { params: Promise<T> },
    auth: AuthContext
  ) => Promise<NextResponse>
) {
  return async (
    request: NextRequest,
    context: { params: Promise<T> }
  ): Promise<NextResponse> => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }
    return handler(request, context, auth);
  };
}

// Require user authentication
export function requireUser<T>(
  handler: (
    request: NextRequest,
    context: { params: Promise<T> },
    auth: UserAuthContext
  ) => Promise<NextResponse>
) {
  return async (
    request: NextRequest,
    context: { params: Promise<T> }
  ): Promise<NextResponse> => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }
    if (!isUser(auth)) {
      return errors.forbidden("This operation requires user authentication");
    }
    return handler(request, context, auth);
  };
}

// Require specific Agent role
export function requireAgentRole<T>(
  role: AgentRole,
  handler: (
    request: NextRequest,
    context: { params: Promise<T> },
    auth: AgentAuthContext
  ) => Promise<NextResponse>
) {
  return async (
    request: NextRequest,
    context: { params: Promise<T> }
  ): Promise<NextResponse> => {
    const auth = await getAuthContext(request);
    if (!auth) {
      return errors.unauthorized();
    }
    if (!isAgent(auth)) {
      return errors.forbidden("This operation requires agent authentication");
    }
    if (!hasRole(auth, role)) {
      return errors.forbidden(`This operation requires ${role} role`);
    }
    return handler(request, context, auth);
  };
}

// Check if context is the assignee of a resource (UUID-based)
export function isAssignee(
  ctx: AuthContext,
  assigneeType: string | null,
  assigneeUuid: string | null
): boolean {
  if (!assigneeType || !assigneeUuid) return false;

  if (isUser(ctx)) {
    // Direct user match
    if (assigneeType === "user" && assigneeUuid === ctx.actorUuid) {
      return true;
    }
  }

  if (isAgent(ctx)) {
    // Direct Agent match
    if (assigneeType === "agent" && assigneeUuid === ctx.actorUuid) {
      return true;
    }
    // Agent's Owner claim ("Assign to myself")
    if (
      assigneeType === "user" &&
      ctx.ownerUuid &&
      assigneeUuid === ctx.ownerUuid
    ) {
      return true;
    }
  }

  return false;
}

// Check if Super Admin
export function isSuperAdmin(
  ctx: AuthContext | SuperAdminAuthContext
): ctx is SuperAdminAuthContext {
  return ctx.type === "super_admin";
}

// Require Super Admin authentication
export function requireSuperAdmin<T>(
  handler: (
    request: NextRequest,
    context: { params: Promise<T> },
    auth: SuperAdminAuthContext
  ) => Promise<NextResponse>
) {
  return async (
    request: NextRequest,
    context: { params: Promise<T> }
  ): Promise<NextResponse> => {
    const auth = await getSuperAdminFromRequest(request);
    if (!auth) {
      return errors.unauthorized("Super Admin authentication required");
    }
    return handler(request, context, auth);
  };
}
