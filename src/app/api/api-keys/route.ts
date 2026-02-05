// src/app/api/api-keys/route.ts
// API Keys API - 列表和创建 (ARCHITECTURE.md §5.1, §9.1)

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler, parseBody, parsePagination } from "@/lib/api-handler";
import { success, paginated, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { generateApiKey } from "@/lib/api-key";

// GET /api/api-keys - API Key 列表
export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  // 只有用户可以查看 API Key 列表
  if (!isUser(auth)) {
    return errors.forbidden("Only users can view API keys");
  }

  const { page, pageSize, skip, take } = parsePagination(request);

  const where = {
    companyId: auth.companyId,
    revokedAt: null,
  };

  const [apiKeys, total] = await Promise.all([
    prisma.apiKey.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        agent: {
          select: {
            uuid: true,
            name: true,
            roles: true,
          },
        },
      },
    }),
    prisma.apiKey.count({ where }),
  ]);

  const data = apiKeys.map((k) => ({
    uuid: k.uuid,
    prefix: k.keyPrefix,
    name: k.name,
    agent: {
      uuid: k.agent.uuid,
      name: k.agent.name,
      roles: k.agent.roles,
    },
    lastUsed: k.lastUsed?.toISOString() || null,
    expiresAt: k.expiresAt?.toISOString() || null,
    createdAt: k.createdAt.toISOString(),
  }));

  return paginated(data, page, pageSize, total);
});

// POST /api/api-keys - 创建 API Key
export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  // 只有用户可以创建 API Key
  if (!isUser(auth)) {
    return errors.forbidden("Only users can create API keys");
  }

  const body = await parseBody<{
    agentId: number;
    name?: string;
    expiresAt?: string;
  }>(request);

  // 验证必填字段
  if (!body.agentId) {
    return errors.validationError({ agentId: "Agent ID is required" });
  }

  // 验证 Agent 存在
  const agent = await prisma.agent.findFirst({
    where: { id: body.agentId, companyId: auth.companyId },
    select: { id: true, uuid: true, name: true, roles: true },
  });

  if (!agent) {
    return errors.notFound("Agent");
  }

  // 生成 API Key
  const { key, hash, prefix } = generateApiKey();

  // 解析过期时间
  let expiresAt: Date | null = null;
  if (body.expiresAt) {
    expiresAt = new Date(body.expiresAt);
    if (isNaN(expiresAt.getTime())) {
      return errors.validationError({ expiresAt: "Invalid expiration date" });
    }
  }

  const apiKey = await prisma.apiKey.create({
    data: {
      companyId: auth.companyId,
      agentId: agent.id,
      keyHash: hash,
      keyPrefix: prefix,
      name: body.name?.trim() || null,
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

  // 只在创建时返回明文 key（之后无法恢复）
  return success({
    uuid: apiKey.uuid,
    key, // 只有这一次能看到完整的 key
    prefix: apiKey.keyPrefix,
    name: apiKey.name,
    agent: {
      uuid: agent.uuid,
      name: agent.name,
      roles: agent.roles,
    },
    lastUsed: null,
    expiresAt: apiKey.expiresAt?.toISOString() || null,
    createdAt: apiKey.createdAt.toISOString(),
  });
});
