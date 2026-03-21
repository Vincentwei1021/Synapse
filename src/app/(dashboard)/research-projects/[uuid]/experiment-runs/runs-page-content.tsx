// src/app/(dashboard)/research-projects/[uuid]/experiment-runs/tasks-page-content.tsx
// Server Component — shared by both /tasks and /experiment-runs/[runUuid] pages

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Clock } from "lucide-react";
import { getServerAuthContext } from "@/lib/auth-server";
import { listExperimentRuns } from "@/services/experiment-run.service";
import { researchProjectExists } from "@/services/research-project.service";
import { TaskViewToggle } from "./run-view-toggle";

interface TasksPageContentProps {
  projectUuid: string;
  initialSelectedTaskUuid?: string;
}

export async function TasksPageContent({
  projectUuid,
  initialSelectedTaskUuid,
}: TasksPageContentProps) {
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

  // Get all Tasks
  const { tasks } = await listExperimentRuns({
    companyUuid: auth.companyUuid,
    researchProjectUuid: projectUuid,
    skip: 0,
    take: 1000,
  });

  const totalHours = tasks.reduce((sum, task) => sum + (task.computeBudgetHours || 0), 0);

  return (
    <div className="flex h-full flex-col p-4 md:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#2C2C2C]">{t("tasks.title")}</h1>
          <div className="mt-1 flex items-center gap-4">
            <p className="text-sm text-[#6B6B6B]">
              {t("tasks.subtitle")}
            </p>
            {totalHours > 0 && (
              <div className="flex items-center gap-1.5 rounded-full bg-[#F5F2EC] px-3 py-1">
                <Clock className="h-3.5 w-3.5 text-[#C67A52]" />
                <span className="text-xs font-medium text-[#6B6B6B]">
                  <span className="text-[#2C2C2C]">{totalHours.toFixed(1)}</span> {t("tasks.agentHours")}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Task Views: Kanban / DAG */}
      <TaskViewToggle projectUuid={projectUuid} initialTasks={tasks} currentUserUuid={auth.actorUuid} initialSelectedTaskUuid={initialSelectedTaskUuid} />
    </div>
  );
}
