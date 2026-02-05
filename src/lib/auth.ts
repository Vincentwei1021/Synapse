// src/lib/auth.ts
// 认证中间件和工具函数 (ARCHITECTURE.md §6)

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

// 从请求获取认证上下文
export async function getAuthContext(
  request: NextRequest
): Promise<AuthContext | null> {
  // 尝试 API Key 认证（Agent）
  const authHeader = request.headers.get("authorization");
  const apiKey = extractApiKey(authHeader);

  if (apiKey) {
    const result = await validateApiKey(apiKey);
    if (result.valid && result.agent) {
      const agentContext: AgentAuthContext = {
        type: "agent",
        companyId: result.agent.companyId,
        actorId: result.agent.id,
        uuid: result.agent.uuid,
        roles: result.agent.roles as AgentRole[],
        ownerId: result.agent.ownerId ?? undefined,
        agentName: result.agent.name,
      };
      return agentContext;
    }
  }

  // TODO: 尝试 Session 认证（User）
  // 在 MVP 阶段，暂时使用 Header 模拟用户认证
  const userIdHeader = request.headers.get("x-user-id");
  const companyIdHeader = request.headers.get("x-company-id");

  if (userIdHeader && companyIdHeader) {
    const userContext: UserAuthContext = {
      type: "user",
      companyId: parseInt(companyIdHeader, 10),
      actorId: parseInt(userIdHeader, 10),
      uuid: request.headers.get("x-user-uuid") || "",
      email: request.headers.get("x-user-email") || undefined,
      name: request.headers.get("x-user-name") || undefined,
    };
    return userContext;
  }

  return null;
}

// 检查是否为 Agent
export function isAgent(ctx: AuthContext): ctx is AgentAuthContext {
  return ctx.type === "agent";
}

// 检查是否为 User
export function isUser(ctx: AuthContext): ctx is UserAuthContext {
  return ctx.type === "user";
}

// 检查 Agent 是否有特定角色
export function hasRole(ctx: AuthContext, role: AgentRole): boolean {
  if (!isAgent(ctx)) return false;
  return ctx.roles.includes(role);
}

// 检查是否为 PM Agent
export function isPmAgent(ctx: AuthContext): boolean {
  return hasRole(ctx, "pm");
}

// 检查是否为 Developer Agent
export function isDeveloperAgent(ctx: AuthContext): boolean {
  return hasRole(ctx, "developer");
}

// 要求认证的装饰器工厂
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

// 要求用户认证
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

// 要求特定 Agent 角色
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

// 检查是否是资源的认领者
export function isAssignee(
  ctx: AuthContext,
  assigneeType: string | null,
  assigneeId: number | null
): boolean {
  if (!assigneeType || !assigneeId) return false;

  if (isUser(ctx)) {
    // 用户直接匹配
    if (assigneeType === "user" && assigneeId === ctx.actorId) {
      return true;
    }
  }

  if (isAgent(ctx)) {
    // Agent 直接匹配
    if (assigneeType === "agent" && assigneeId === ctx.actorId) {
      return true;
    }
    // Agent 的 Owner 认领（"Assign to myself"）
    if (
      assigneeType === "user" &&
      ctx.ownerId &&
      assigneeId === ctx.ownerId
    ) {
      return true;
    }
  }

  return false;
}

// 检查是否为 Super Admin
export function isSuperAdmin(
  ctx: AuthContext | SuperAdminAuthContext
): ctx is SuperAdminAuthContext {
  return ctx.type === "super_admin";
}

// 要求 Super Admin 认证
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
