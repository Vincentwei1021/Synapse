import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { logger } from "./logger";

const log = logger.child({ module: "prisma" });

const connectionString =
  process.env.DATABASE_URL ||
  (process.env.DB_HOST
    ? `postgresql://${process.env.DB_USERNAME}:${encodeURIComponent(process.env.DB_PASSWORD || "")}@${process.env.DB_HOST}:${process.env.DB_PORT || "5432"}/${process.env.DB_NAME || "synapse"}`
    : undefined);

const isPglite = process.env.SYNAPSE_PGLITE === "1";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: pg.Pool | undefined;
};

const pool =
  globalForPrisma.pool ??
  new pg.Pool({
    connectionString,
    max: isPglite ? 5 : undefined,
    idleTimeoutMillis: isPglite ? 10_000 : undefined,
    ...(process.env.DB_HOST ? { ssl: { rejectUnauthorized: false } } : {}),
  });

const adapter = new PrismaPg(pool);

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

export const prisma: PrismaClient = isPglite
  ? basePrisma.$extends({
      query: {
        async $allOperations({ args, query }) {
          const MAX_RETRIES = 3;
          for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
              return await query(args);
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              const isConnectionError =
                message.includes("P1017") ||
                message.includes("Connection terminated") ||
                message.includes("Connection refused");
              if (!isConnectionError || attempt === MAX_RETRIES - 1) throw err;
              log.warn(
                { attempt: attempt + 1, err: message },
                "PGlite connection error, retrying",
              );
            }
          }
          throw new Error("unreachable");
        },
      },
    }) as unknown as PrismaClient
  : basePrisma;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = basePrisma;
  globalForPrisma.pool = pool;
}
