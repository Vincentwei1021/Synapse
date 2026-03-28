import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetCompanyStats = vi.fn();

vi.mock("@/lib/api-handler", () => ({
  withErrorHandler: <T>(handler: T) => handler,
}));

vi.mock("@/lib/auth", () => ({
  requireSuperAdmin: <T>(handler: T) => handler,
}));

vi.mock("@/services/company.service", () => ({
  getCompanyStats: (...args: unknown[]) => mockGetCompanyStats(...args),
}));

import { GET } from "@/app/api/admin/stats/route";

describe("GET /api/admin/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCompanyStats.mockResolvedValue({
      totalCompanies: 3,
      totalUsers: 12,
      totalAgents: 5,
    });
  });

  it("returns aggregated company stats", async () => {
    const response = await GET(new NextRequest(new URL("/api/admin/stats", "http://localhost:3000")), { params: Promise.resolve({}) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      totalCompanies: 3,
      totalUsers: 12,
      totalAgents: 5,
    });
    expect(mockGetCompanyStats).toHaveBeenCalledTimes(1);
  });
});
