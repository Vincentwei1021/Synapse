// src/app/(dashboard)/projects/[uuid]/ideas/page.tsx
// Server Component — list view (no panel selected)
// Legacy ?idea={id} redirect is handled by middleware (HTTP 307)

import { IdeasPageContent } from "./ideas-page-content";

interface PageProps {
  params: Promise<{ uuid: string }>;
  searchParams: Promise<{ status?: string; assignedToMe?: string }>;
}

export default async function IdeasPage({ params, searchParams }: PageProps) {
  const { uuid: projectUuid } = await params;
  const { status: filter = "all", assignedToMe } = await searchParams;

  return (
    <IdeasPageContent
      projectUuid={projectUuid}
      filter={filter}
      isAssignedToMeFilter={assignedToMe === "true"}
    />
  );
}
