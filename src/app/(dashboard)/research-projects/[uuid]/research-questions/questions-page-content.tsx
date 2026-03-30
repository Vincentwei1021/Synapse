// src/app/(dashboard)/research-projects/[uuid]/research-questions/ideas-page-content.tsx
// Server Component — shared by both /ideas and /research-questions/[questionUuid] pages

import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Lightbulb } from "lucide-react";
import { getServerAuthContext } from "@/lib/auth-server";
import { listResearchQuestions } from "@/services/research-question.service";
import { researchProjectExists } from "@/services/research-project.service";
import { checkResearchQuestionsAvailability } from "@/services/experiment-design.service";
import { batchCommentCounts } from "@/services/comment.service";
import { IdeaCreateForm } from "./question-create-form";
import { IdeasList } from "./questions-list";

// Filter tab statuses (simplified lifecycle)
const filterStatuses = ["open", "elaborating", "proposal_created"] as const;

// Status to i18n key mapping
const statusI18nKeys: Record<string, string> = {
  open: "open",
  elaborating: "elaborating",
  proposal_created: "proposal_created",
  completed: "completed",
  closed: "closed",
};

interface IdeasPageContentProps {
  projectUuid: string;
  filter: string;
  isAssignedToMeFilter: boolean;
  initialSelectedIdeaUuid?: string;
}

export async function IdeasPageContent({
  projectUuid,
  filter,
  isAssignedToMeFilter,
  initialSelectedIdeaUuid,
}: IdeasPageContentProps) {
  const auth = await getServerAuthContext();
  if (!auth) {
    redirect("/login");
  }

  const t = await getTranslations();

  // Validate project exists
  const exists = await researchProjectExists(auth.companyUuid, projectUuid);
  if (!exists) {
    redirect("/research-projects");
  }

  // Get all Ideas (for counting)
  const { researchQuestions: allIdeas } = await listResearchQuestions({
    companyUuid: auth.companyUuid,
    researchProjectUuid: projectUuid,
    skip: 0,
    take: 1000,
  });

  // Get Ideas assigned to me (for counting)
  const { researchQuestions: myIdeas } = await listResearchQuestions({
    companyUuid: auth.companyUuid,
    researchProjectUuid: projectUuid,
    skip: 0,
    take: 1000,
    assignedToMe: true,
    actorUuid: auth.actorUuid,
    actorType: auth.type,
  });

  // Calculate count per status
  const statusCounts = allIdeas.reduce((acc: Record<string, number>, idea: { status: string }) => {
    acc[idea.status] = (acc[idea.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const pendingReviewCount = allIdeas.filter((idea) => idea.reviewStatus === "pending").length;

  // Get availability of all Ideas (whether already used by a Proposal)
  const allIdeaUuids = allIdeas.map((idea: { uuid: string }) => idea.uuid);
  const availabilityCheck = allIdeaUuids.length > 0
    ? await checkResearchQuestionsAvailability(auth.companyUuid, allIdeaUuids)
    : { usedResearchQuestions: [] };
  const usedIdeaUuids = availabilityCheck.usedResearchQuestions.map((u: { uuid: string }) => u.uuid);
  // idea UUID -> proposal UUID mapping
  const ideaProposalMap: Record<string, string> = {};
  for (const u of availabilityCheck.usedResearchQuestions) {
    ideaProposalMap[u.uuid] = u.experimentDesignUuid;
  }

  // Batch get comment counts
  const commentCounts = allIdeaUuids.length > 0
    ? await batchCommentCounts(auth.companyUuid, "research_question", allIdeaUuids)
    : {};

  // Filter by selected status
  let filteredIdeas = allIdeas;

  // First apply assignedToMe filter if active
  if (isAssignedToMeFilter) {
    filteredIdeas = myIdeas;
  }

  // Then apply status filter if not "all"
  if (filter !== "all") {
    filteredIdeas = filteredIdeas.filter((idea) => idea.status === filter);
  }

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">{t("ideas.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("ideas.subtitle")}
        </p>
        <p className="mt-2 text-xs text-[#C67A52]">
          {pendingReviewCount} idea(s) currently waiting for human review.
        </p>
      </div>

      {/* Inline Create Form */}
      <div className="mb-6">
        <IdeaCreateForm projectUuid={projectUuid} />
      </div>

      {/* Filter Tabs */}
      <div className="mb-6 flex gap-2 overflow-x-auto border-b border-border pb-4">
        <Link href={`/research-projects/${projectUuid}/research-questions`}>
          <Button variant={filter === "all" && !isAssignedToMeFilter ? "default" : "ghost"} size="sm">
            {t("ideas.all")} ({allIdeas.length})
          </Button>
        </Link>
        <Link href={`/research-projects/${projectUuid}/research-questions?assignedToMe=true`}>
          <Button variant={isAssignedToMeFilter && filter === "all" ? "default" : "ghost"} size="sm">
            {t("ideas.assignedToMe")} ({myIdeas.length})
          </Button>
        </Link>
        {filterStatuses.map((status) => {
          const count = statusCounts[status] || 0;
          return (
            <Link key={status} href={`/research-projects/${projectUuid}/research-questions?status=${status}${isAssignedToMeFilter ? "&assignedToMe=true" : ""}`}>
              <Button variant={filter === status ? "default" : "ghost"} size="sm">
                {t(`status.${statusI18nKeys[status]}`)} ({count})
              </Button>
            </Link>
          );
        })}
      </div>

      {/* Ideas List */}
      {filteredIdeas.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Lightbulb className="h-8 w-8 text-primary" />
          </div>
          <h3 className="mb-2 text-lg font-medium text-foreground">
            {filter === "all" ? t("ideas.noIdeas") : t("ideas.noIdeasWithStatus", { status: t(`status.${statusI18nKeys[filter] || filter}`) })}
          </h3>
          <p className="mb-6 max-w-sm text-sm text-muted-foreground">
            {filter === "all"
              ? t("ideas.startByAdding")
              : t("ideas.ideasWithStatus")}
          </p>
        </Card>
      ) : (
        <IdeasList
          ideas={filteredIdeas.map(idea => ({
            ...idea,
            commentCount: commentCounts[idea.uuid] || 0,
          }))}
          projectUuid={projectUuid}
          currentUserUuid={auth.actorUuid}
          usedIdeaUuids={usedIdeaUuids}
          ideaProposalMap={ideaProposalMap}
          initialSelectedIdeaUuid={initialSelectedIdeaUuid}
        />
      )}
    </div>
  );
}
