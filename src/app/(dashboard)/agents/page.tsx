import { redirect } from "next/navigation";
import { getServerAuthContext } from "@/lib/auth-server";
import { listAgents } from "@/services/agent.service";
import { AgentsPageClient } from "./agents-page-client";

export default async function AgentsPage() {
  const auth = await getServerAuthContext();
  if (!auth) redirect("/login");
  const { agents } = await listAgents({
    companyUuid: auth.companyUuid,
    skip: 0,
    take: 100,
    ownerUuid: auth.actorUuid,
  });
  return (
    <div className="space-y-6 p-4 md:p-8">
      <AgentsPageClient initialAgents={agents} />
    </div>
  );
}
