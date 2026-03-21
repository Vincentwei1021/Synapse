// src/app/(dashboard)/projects/[uuid]/tasks/page.tsx
// Server Component — task list view (no panel selected)
// Legacy ?task={id} redirect is handled by middleware (HTTP 307)

import { TasksPageContent } from "./tasks-page-content";

interface PageProps {
  params: Promise<{ uuid: string }>;
}

export default async function TasksPage({ params }: PageProps) {
  const { uuid: projectUuid } = await params;

  return <TasksPageContent projectUuid={projectUuid} />;
}
