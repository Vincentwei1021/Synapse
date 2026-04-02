import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { LiveDataRefresher } from "@/components/live-data-refresher";
import { getServerAuthContext } from "@/lib/auth-server";
import { listComputePools } from "@/services/compute.service";
import { ComputePageClient } from "./compute-page-client";

export const dynamic = "force-dynamic";

export default async function ComputePage() {
  const auth = await getServerAuthContext();
  if (!auth) {
    redirect("/login");
  }

  const locale = await getLocale();
  const pools = await listComputePools(auth.companyUuid);

  return (
    <div className="space-y-6 p-4 md:p-8">
      <LiveDataRefresher intervalMs={10_000} />
      <ComputePageClient locale={locale} pools={pools} />
    </div>
  );
}
