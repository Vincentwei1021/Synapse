// src/lib/api-key.ts
// API Key 验证 (ARCHITECTURE.md §6.2, §9.1)

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "./prisma";
import type { ApiKeyValidationResult } from "@/types/auth";

// API Key 前缀
const KEY_PREFIX = "cho_";

// 生成新的 API Key
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  // 生成 32 字节随机数据
  const randomPart = randomBytes(32).toString("base64url");
  const key = `${KEY_PREFIX}${randomPart}`;

  // 使用 SHA-256 哈希存储
  const hash = hashApiKey(key);

  // 前缀用于显示（如 "cho_abc...xyz"）
  const prefix = `${KEY_PREFIX}${randomPart.slice(0, 4)}...${randomPart.slice(-4)}`;

  return { key, hash, prefix };
}

// 哈希 API Key
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// 从 Authorization header 提取 API Key
export function extractApiKey(authHeader: string | null): string | null {
  if (!authHeader) return null;

  // 支持 "Bearer <key>" 格式
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // 也支持直接传递 key
  if (authHeader.startsWith(KEY_PREFIX)) {
    return authHeader;
  }

  return null;
}

// 验证 API Key
export async function validateApiKey(
  key: string
): Promise<ApiKeyValidationResult> {
  try {
    // 检查格式
    if (!key.startsWith(KEY_PREFIX)) {
      return { valid: false, error: "Invalid API key format" };
    }

    // 计算哈希
    const keyHash = hashApiKey(key);

    // 查找 API Key
    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: {
        agent: true,
      },
    });

    // Key 不存在
    if (!apiKey) {
      return { valid: false, error: "API key not found" };
    }

    // 检查是否已撤销
    if (apiKey.revokedAt) {
      return { valid: false, error: "API key has been revoked" };
    }

    // 检查是否已过期
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return { valid: false, error: "API key has expired" };
    }

    // 更新最后使用时间（异步，不等待）
    prisma.apiKey
      .update({
        where: { id: apiKey.id },
        data: { lastUsed: new Date() },
      })
      .catch(() => {
        // 忽略更新错误，不影响请求
      });

    return {
      valid: true,
      agent: {
        id: apiKey.agent.id,
        uuid: apiKey.agent.uuid,
        companyId: apiKey.agent.companyId,
        name: apiKey.agent.name,
        roles: apiKey.agent.roles,
        ownerId: apiKey.agent.ownerId,
      },
      apiKey: {
        id: apiKey.id,
        uuid: apiKey.uuid,
      },
    };
  } catch (error) {
    console.error("API key validation error:", error);
    return { valid: false, error: "Internal validation error" };
  }
}

// 时间安全的字符串比较（防止时序攻击）
export function secureCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);

    if (bufA.length !== bufB.length) {
      return false;
    }

    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
