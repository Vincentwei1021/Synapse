import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRedisHealth } from "@/lib/redis";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "health" });

export async function GET() {
  const timestamp = new Date().toISOString();
  const redis = getRedisHealth();

  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;

    const redisActuallyFailed =
      redis.enabled &&
      redis.transport !== "redis" &&
      (redis.publisherStatus !== "not_initialized" || redis.subscriberStatus !== "not_initialized");
    return NextResponse.json({
      status: redisActuallyFailed ? "degraded" : "ok",
      timestamp,
      database: {
        status: "connected",
      },
      redis,
    });
  } catch (error) {
    log.error({ err: error }, "Health check failed");
    return NextResponse.json(
      {
        status: "error",
        timestamp,
        database: {
          status: "disconnected",
        },
        redis,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 }
    );
  }
}
