// src/app/(dashboard)/research-projects/[uuid]/experiment-designs/new/page.tsx
// Server Component - Create New Proposal

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getServerAuthContext } from "@/lib/auth-server";
import { researchProjectExists } from "@/services/research-project.service";
import { listResearchQuestions } from "@/services/research-question.service";
import { CreateProposalForm } from "./create-design-form";

interface PageProps {
  params: Promise<{ uuid: string }>;
  searchParams: Promise<{ questionUuid?: string }>;
}

export default async function NewProposalPage({ params, searchParams }: PageProps) {
  const auth = await getServerAuthContext();
  if (!auth) {
    redirect("/login");
  }

  const { uuid: projectUuid } = await params;
  const { questionUuid } = await searchParams;
  const t = await getTranslations();

  // Validate project exists
  const exists = await researchProjectExists(auth.companyUuid, projectUuid);
  if (!exists) {
    redirect("/research-projects");
  }

  // Get user's claimed Ideas (only assignees can create Proposals)
  const { researchQuestions: ideas } = await listResearchQuestions({
    companyUuid: auth.companyUuid,
    researchProjectUuid: projectUuid,
    skip: 0,
    take: 100,
    assignedToMe: true,
    actorUuid: auth.actorUuid,
    actorType: auth.type,
  });

  // All ideas with resolved elaboration are available (ideas can be reused across proposals)
  const availableIdeas = ideas;

  return (
    <div className="p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-2xl font-semibold text-[#2C2C2C]">
          {t("proposals.createExperimentDesign")}
        </h1>
        <CreateProposalForm
          projectUuid={projectUuid}
          availableIdeas={availableIdeas}
          preselectedIdeaUuid={questionUuid}
        />
      </div>
    </div>
  );
}
