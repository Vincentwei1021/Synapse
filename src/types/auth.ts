// src/types/auth.ts
// 认证相关类型定义 (ARCHITECTURE.md §6)

export type ActorType = "user" | "agent";
export type AgentRole = "pm" | "developer";

// 当前请求的认证上下文
export interface AuthContext {
  type: ActorType;
  companyId: number;
  actorId: number; // User ID 或 Agent ID
  uuid: string;
  roles?: AgentRole[]; // Agent 角色列表
  ownerId?: number; // Agent 的 Owner User ID
}

// User 认证上下文
export interface UserAuthContext extends AuthContext {
  type: "user";
  email?: string;
  name?: string;
}

// Agent 认证上下文
export interface AgentAuthContext extends AuthContext {
  type: "agent";
  roles: AgentRole[];
  ownerId?: number;
  agentName: string;
}

// API Key 验证结果
export interface ApiKeyValidationResult {
  valid: boolean;
  agent?: {
    id: number;
    uuid: string;
    companyId: number;
    name: string;
    roles: string[];
    ownerId: number | null;
  };
  apiKey?: {
    id: number;
    uuid: string;
  };
  error?: string;
}
