import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

// Use DATABASE_URL if set, otherwise build from individual env vars (ECS Secrets Manager)
const connectionString =
  process.env.DATABASE_URL ||
  (process.env.DB_HOST
    ? `postgresql://${process.env.DB_USERNAME}:${encodeURIComponent(process.env.DB_PASSWORD || "")}@${process.env.DB_HOST}:${process.env.DB_PORT || "5432"}/${process.env.DB_NAME || "chorus"}`
    : undefined);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: pg.Pool | undefined;
};

// Create connection pool (ssl required for Aurora PostgreSQL)
const pool =
  globalForPrisma.pool ??
  new pg.Pool({
    connectionString,
    ...(process.env.DB_HOST ? { ssl: { rejectUnauthorized: false } } : {}),
  });

// Create adapter
const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pool = pool;
}
