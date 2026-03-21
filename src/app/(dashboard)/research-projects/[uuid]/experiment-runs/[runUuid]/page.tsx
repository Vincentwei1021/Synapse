// src/app/(dashboard)/research-projects/[uuid]/experiment-runs/[runUuid]/page.tsx
// Server Component — renders task list + panel for the selected task

import { TasksPageContent } from "../runs-page-content";

interface PageProps {
  params: Promise<{ uuid: string; runUuid: string }>;
}

export default async function TaskDetailPage({ params }: PageProps) {
  const { uuid: projectUuid, runUuid } = await params;

  return <TasksPageContent projectUuid={projectUuid} initialSelectedTaskUuid={runUuid} />;
}
