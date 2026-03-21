// src/app/(dashboard)/projects/[uuid]/ideas/[ideaUuid]/page.tsx
// Server Component — renders list + panel for the selected idea

import { IdeasPageContent } from "../ideas-page-content";

interface PageProps {
  params: Promise<{ uuid: string; ideaUuid: string }>;
  searchParams: Promise<{ status?: string; assignedToMe?: string }>;
}

export default async function IdeaDetailPage({ params, searchParams }: PageProps) {
  const { uuid: projectUuid, ideaUuid } = await params;
  const { status: filter = "all", assignedToMe } = await searchParams;

  return (
    <IdeasPageContent
      projectUuid={projectUuid}
      filter={filter}
      isAssignedToMeFilter={assignedToMe === "true"}
      initialSelectedIdeaUuid={ideaUuid}
    />
  );
}
