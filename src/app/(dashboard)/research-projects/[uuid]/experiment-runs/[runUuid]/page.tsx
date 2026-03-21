// src/app/(dashboard)/projects/[uuid]/tasks/[taskUuid]/page.tsx
// Server Component — renders task list + panel for the selected task

import { TasksPageContent } from "../tasks-page-content";

interface PageProps {
  params: Promise<{ uuid: string; taskUuid: string }>;
}

export default async function TaskDetailPage({ params }: PageProps) {
  const { uuid: projectUuid, taskUuid } = await params;

  return <TasksPageContent projectUuid={projectUuid} initialSelectedTaskUuid={taskUuid} />;
}
