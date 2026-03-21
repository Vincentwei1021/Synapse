// src/app/(dashboard)/research-projects/[uuid]/research-questions/[questionUuid]/page.tsx
// Server Component — renders list + panel for the selected idea

import { IdeasPageContent } from "../questions-page-content";

interface PageProps {
  params: Promise<{ uuid: string; questionUuid: string }>;
  searchParams: Promise<{ status?: string; assignedToMe?: string }>;
}

export default async function IdeaDetailPage({ params, searchParams }: PageProps) {
  const { uuid: projectUuid, questionUuid } = await params;
  const { status: filter = "all", assignedToMe } = await searchParams;

  return (
    <IdeasPageContent
      projectUuid={projectUuid}
      filter={filter}
      isAssignedToMeFilter={assignedToMe === "true"}
      initialSelectedIdeaUuid={questionUuid}
    />
  );
}
