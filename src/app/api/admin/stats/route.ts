import { withErrorHandler } from "@/lib/api-handler";
import { success } from "@/lib/api-response";
import { requireSuperAdmin } from "@/lib/auth";
import { getCompanyStats } from "@/services/company.service";

export const GET = withErrorHandler(
  requireSuperAdmin(async () => {
    const stats = await getCompanyStats();
    return success(stats);
  }),
);
