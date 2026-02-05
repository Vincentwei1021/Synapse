// src/services/agent.service.ts
// Agent 服务层 (ARCHITECTURE.md §3.1 Service Layer)

import { prisma } from "@/lib/prisma";
import { generateApiKey } from "@/lib/api-key";

export interface AgentListParams {
  companyId: number;
  skip: number;
  take: number;
}

export interface AgentCreateParams {
  companyId: number;
  name: string;
  roles: string[];
  ownerId: number;
  persona?: string | null;
  systemPrompt?: string | null;
}

export interface AgentUpdateParams {
  name?: string;
  roles?: string[];
  persona?: string | null;
  systemPrompt?: string | null;
}

export interface ApiKeyCreateParams {
  companyId: number;
  agentId: number;
  name?: string | null;
  expiresAt?: Date | null;
}

// Agents 列表查询
export async function listAgents({ companyId, skip, take }: AgentListParams) {
  const [agents, total] = await Promise.all([
    prisma.agent.findMany({
      where: { companyId },
      skip,
      take,
      orderBy: { createdAt: "desc" },
      select: {
        uuid: true,
        name: true,
        roles: true,
        persona: true,
        ownerId: true,
        lastActiveAt: true,
        createdAt: true,
        _count: { select: { apiKeys: true } },
      },
    }),
    prisma.agent.count({ where: { companyId } }),
  ]);

  return { agents, total };
}

// 获取 Agent 详情
export async function getAgent(companyId: number, uuid: string) {
  return prisma.agent.findFirst({
    where: { uuid, companyId },
    include: {
      apiKeys: {
        where: { revokedAt: null },
        select: {
          uuid: true,
          keyPrefix: true,
          name: true,
          lastUsed: true,
          expiresAt: true,
          createdAt: true,
        },
      },
    },
  });
}

// 通过 ID 获取 Agent（验证用）
export async function getAgentById(companyId: number, id: number) {
  return prisma.agent.findFirst({
    where: { id, companyId },
    select: { id: true, uuid: true, name: true, roles: true },
  });
}

// 通过 UUID 获取 Agent ID
export async function getAgentIdByUuid(companyId: number, uuid: string) {
  const agent = await prisma.agent.findFirst({
    where: { uuid, companyId },
    select: { id: true },
  });
  return agent?.id ?? null;
}

// 创建 Agent
export async function createAgent({
  companyId,
  name,
  roles,
  ownerId,
  persona,
  systemPrompt,
}: AgentCreateParams) {
  return prisma.agent.create({
    data: { companyId, name, roles, ownerId, persona, systemPrompt },
    select: {
      uuid: true,
      name: true,
      roles: true,
      persona: true,
      systemPrompt: true,
      ownerId: true,
      createdAt: true,
    },
  });
}

// 更新 Agent
export async function updateAgent(id: number, data: AgentUpdateParams) {
  return prisma.agent.update({
    where: { id },
    data,
    select: {
      uuid: true,
      name: true,
      roles: true,
      persona: true,
      systemPrompt: true,
      ownerId: true,
      lastActiveAt: true,
      createdAt: true,
    },
  });
}

// 删除 Agent
export async function deleteAgent(id: number) {
  return prisma.agent.delete({ where: { id } });
}

// 列出 API Keys
export async function listApiKeys(companyId: number, skip: number, take: number) {
  const where = { companyId, revokedAt: null };

  const [apiKeys, total] = await Promise.all([
    prisma.apiKey.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        agent: { select: { uuid: true, name: true, roles: true } },
      },
    }),
    prisma.apiKey.count({ where }),
  ]);

  return { apiKeys, total };
}

// 创建 API Key
export async function createApiKey({
  companyId,
  agentId,
  name,
  expiresAt,
}: ApiKeyCreateParams) {
  const { key, hash, prefix } = generateApiKey();

  const apiKey = await prisma.apiKey.create({
    data: {
      companyId,
      agentId,
      keyHash: hash,
      keyPrefix: prefix,
      name,
      expiresAt,
    },
    select: {
      uuid: true,
      keyPrefix: true,
      name: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  // 返回明文 key（只有创建时能看到）
  return { ...apiKey, key };
}

// 获取 API Key 详情
export async function getApiKey(companyId: number, uuid: string) {
  return prisma.apiKey.findFirst({
    where: { uuid, companyId },
    select: { id: true, revokedAt: true },
  });
}

// 撤销 API Key
export async function revokeApiKey(id: number) {
  return prisma.apiKey.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
}
