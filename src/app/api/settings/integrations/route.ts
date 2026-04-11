import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, isUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clearDeepxivTokenCache } from "@/services/paper-search.service";

/**
 * GET /api/settings/integrations
 * Returns integration tokens for the current company (masked).
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth || !isUser(auth)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const company = await prisma.company.findUnique({
    where: { uuid: auth.companyUuid },
    select: { deepxivToken: true },
  });

  return NextResponse.json({
    deepxivToken: company?.deepxivToken ? maskToken(company.deepxivToken) : null,
    deepxivTokenSet: !!company?.deepxivToken,
  });
}

/**
 * PUT /api/settings/integrations
 * Update integration tokens for the current company.
 */
export async function PUT(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth || !isUser(auth)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { deepxivToken } = body as { deepxivToken?: string | null };

  // Allow setting to null (clear) or a non-empty string
  const tokenValue = deepxivToken === "" ? null : (deepxivToken ?? null);

  await prisma.company.update({
    where: { uuid: auth.companyUuid },
    data: { deepxivToken: tokenValue },
  });

  clearDeepxivTokenCache();

  return NextResponse.json({ ok: true });
}

/** Show only first 8 and last 4 chars of a token. */
function maskToken(token: string): string {
  if (token.length <= 12) return "••••••••";
  return token.slice(0, 8) + "••••" + token.slice(-4);
}
