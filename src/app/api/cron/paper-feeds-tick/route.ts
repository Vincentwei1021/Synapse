import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  triggerPaperFeedRun,
  reapStalePaperFeedRuns,
} from "@/services/paper-feed.service";

export async function POST(request: NextRequest) {
  const token = request.headers.get("X-Synapse-Cron-Token");
  if (!token || token !== process.env.SYNAPSE_CRON_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const reaped = await reapStalePaperFeedRuns();

  // feedDate = today − 1 day (UTC), as YYYY-MM-DD
  const now = new Date();
  const yesterdayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
  const feedDate = yesterdayUtc.toISOString().slice(0, 10);

  const projects = await prisma.researchProject.findMany({
    where: { paperFeedEnabled: true, paperFeedAgentUuid: { not: null }, status: "active" },
    select: { uuid: true, companyUuid: true },
  });

  let triggered = 0;
  let skipped = 0;
  for (const p of projects) {
    const result = await triggerPaperFeedRun({
      companyUuid: p.companyUuid,
      researchProjectUuid: p.uuid,
      triggeredBy: "cron",
      feedDate,
    });
    if (result.reused) skipped++;
    else triggered++;
  }

  return NextResponse.json({ triggered, skipped, reaped });
}
