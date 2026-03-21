// src/app/(dashboard)/research-projects/[uuid]/experiment-runs/page.tsx
// Server Component — task list view (no panel selected)
// Legacy ?task={id} redirect is handled by middleware (HTTP 307)

import { TasksPageContent } from "./runs-page-content";

interface PageProps {
  params: Promise<{ uuid: string }>;
}

export default async function TasksPage({ params }: PageProps) {
  const { uuid: projectUuid } = await params;

  return <TasksPageContent projectUuid={projectUuid} />;
}
