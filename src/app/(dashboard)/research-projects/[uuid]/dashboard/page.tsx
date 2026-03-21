// src/app/(dashboard)/projects/[uuid]/dashboard/page.tsx
// Server Component — Project Dashboard (Industrial Humanist design)

import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Lightbulb,
  LayoutGrid,
  ClipboardList,
  FileText,
  Plus,
  CircleCheck,
} from "lucide-react";
import { getServerAuthContext } from "@/lib/auth-server";
import { getProject, getProjectStats } from "@/services/project.service";
import { listActivitiesWithActorNames } from "@/services/activity.service";
import { ProjectSettingsModal } from "./project-settings-modal";

interface PageProps {
  params: Promise<{ uuid: string }>;
}

const pipelineColors = [
  { key: "todo", bg: "#E65100", light: "bg-[#E6510020]", text: "text-[#E65100]" },
  { key: "inProgress", bg: "#5A9E6F", light: "bg-[#5A9E6F20]", text: "text-[#5A9E6F]" },
  { key: "toVerify", bg: "#7B1FA2", light: "bg-[#7B1FA220]", text: "text-[#7B1FA2]" },
  { key: "done", bg: "#00796B", light: "bg-[#00796B20]", text: "text-[#00796B]" },
] as const;

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function DashboardPage({ params }: PageProps) {
  const auth = await getServerAuthContext();
  if (!auth) {
    redirect("/login");
  }

  const { uuid: projectUuid } = await params;
  const t = await getTranslations();

  const project = await getProject(auth.companyUuid, projectUuid);
  if (!project) {
    redirect("/projects");
  }

  const [stats, { activities }] = await Promise.all([
    getProjectStats(auth.companyUuid, projectUuid),
    listActivitiesWithActorNames({
      companyUuid: auth.companyUuid,
      projectUuid,
      skip: 0,
      take: 5,
    }),
  ]);

  // Recent tasks (last 4 with status)
  const prisma = (await import("@/lib/prisma")).prisma;
  const recentTasks = await prisma.task.findMany({
    where: { projectUuid, companyUuid: auth.companyUuid },
    orderBy: { updatedAt: "desc" },
    take: 4,
    select: { uuid: true, title: true, status: true },
  });

  const taskStatusStyle: Record<string, { bg: string; text: string; label: string }> = {
    open: { bg: "bg-[#E6510020]", text: "text-[#E65100]", label: t("status.todo") },
    assigned: { bg: "bg-[#E6510020]", text: "text-[#E65100]", label: t("status.todo") },
    in_progress: { bg: "bg-[#5A9E6F20]", text: "text-[#5A9E6F]", label: t("status.inProgress") },
    to_verify: { bg: "bg-[#7B1FA220]", text: "text-[#7B1FA2]", label: t("status.toVerify") },
    done: { bg: "bg-[#00796B20]", text: "text-[#00796B]", label: t("status.done") },
    closed: { bg: "bg-[#00796B20]", text: "text-[#00796B]", label: t("status.done") },
  };

  const taskStatusDot: Record<string, string> = {
    open: "bg-[#E65100]",
    assigned: "bg-[#E65100]",
    in_progress: "bg-[#5A9E6F]",
    to_verify: "bg-[#7B1FA2]",
    done: "bg-[#00796B]",
    closed: "bg-[#00796B]",
  };

  const activityDotColors: Record<string, string> = {
    idea: "bg-[#C67A52]",
    task: "bg-[#5A9E6F]",
    proposal: "bg-[#1976D2]",
    document: "bg-[#9A9A9A]",
  };

  const statCards = [
    {
      label: t("nav.ideas"),
      value: stats.ideas.total,
      badge: stats.ideas.open > 0 ? `${stats.ideas.open} ${t("status.open")}` : null,
      badgeStyle: "bg-[#C67A5220] text-[#C67A52]",
      href: `/projects/${projectUuid}/ideas`,
      iconBg: "bg-[#FFF3E0]",
      icon: <Lightbulb className="h-5 w-5 text-[#E65100]" />,
    },
    {
      label: t("nav.tasks"),
      value: stats.tasks.total,
      badge: stats.tasks.inProgress > 0 ? `${stats.tasks.inProgress} ${t("status.active")}` : null,
      badgeStyle: "bg-[#5A9E6F20] text-[#5A9E6F]",
      href: `/projects/${projectUuid}/tasks`,
      iconBg: "bg-[#E3F2FD]",
      icon: <LayoutGrid className="h-5 w-5 text-[#1976D2]" />,
    },
    {
      label: t("nav.proposals"),
      value: stats.proposals.total,
      badge: stats.proposals.pending > 0 ? `${stats.proposals.pending} ${t("status.pending")}` : null,
      badgeStyle: "bg-[#C67A5220] text-[#C67A52]",
      href: `/projects/${projectUuid}/proposals`,
      iconBg: "bg-[#F3E5F5]",
      icon: <ClipboardList className="h-5 w-5 text-[#7B1FA2]" />,
    },
    {
      label: t("nav.documents"),
      value: stats.documents.total,
      badge: null,
      badgeStyle: "",
      href: `/projects/${projectUuid}/documents`,
      iconBg: "bg-[#E8F5E9]",
      icon: <FileText className="h-5 w-5 text-[#5A9E6F]" />,
    },
  ];

  const pipelineCounts = [stats.tasks.todo, stats.tasks.inProgress, stats.tasks.toVerify, stats.tasks.done];
  const pipelineTotal = stats.tasks.total;

  return (
    <div className="flex h-full flex-col gap-7 p-5 md:p-7 lg:p-9">
      {/* Title Section */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-[#2C2C2C]">
            {project.name}
          </h1>
          {project.description && (
            <p className="mt-1.5 text-[13px] text-[#6B6B6B]">{project.description}</p>
          )}
        </div>
        <ProjectSettingsModal
          projectUuid={projectUuid}
          projectName={project.name}
          projectDescription={project.description ?? null}
        />
      </div>

      {/* Quick Actions Row */}
      <div className="flex flex-wrap gap-2.5">
        <Link href={`/projects/${projectUuid}/ideas`}>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-lg border-[#E5E2DC] bg-white text-[12px] font-medium text-[#2C2C2C] hover:border-[#C67A52] hover:bg-white">
            <Plus className="h-3.5 w-3.5 text-[#C67A52]" />
            {t("dashboard.addNewIdea")}
          </Button>
        </Link>
        <Link href={`/projects/${projectUuid}/proposals`}>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-lg border-[#E5E2DC] bg-white text-[12px] font-medium text-[#2C2C2C] hover:border-[#C67A52] hover:bg-white">
            <CircleCheck className="h-3.5 w-3.5 text-[#C67A52]" />
            {t("dashboard.reviewProposals")}
          </Button>
        </Link>
        <Link href={`/projects/${projectUuid}/tasks`}>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-lg border-[#E5E2DC] bg-white text-[12px] font-medium text-[#2C2C2C] hover:border-[#C67A52] hover:bg-white">
            <LayoutGrid className="h-3.5 w-3.5 text-[#C67A52]" />
            {t("dashboard.viewTaskBoard")}
          </Button>
        </Link>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="cursor-pointer rounded-2xl border-0 bg-white p-3 shadow-none transition-all hover:shadow-md md:p-5">
              <div className="mb-2 flex items-center justify-between md:mb-3.5">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg md:h-10 md:w-10 md:rounded-xl ${stat.iconBg}`}>
                  {stat.icon}
                </div>
                {stat.badge && (
                  <span className={`hidden rounded-lg px-2.5 py-1 text-[11px] font-medium sm:inline ${stat.badgeStyle}`}>
                    {stat.badge}
                  </span>
                )}
              </div>
              <div className="text-2xl font-semibold leading-none tracking-tight text-[#2C2C2C] md:text-[32px]">
                {stat.value}
              </div>
              <div className="mt-0.5 text-[12px] text-[#6B6B6B] md:text-[13px]">{stat.label}</div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Bottom Row: Task Pipeline + Recent Activity */}
      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-2">
        {/* Task Pipeline Card */}
        <Card className="flex flex-col rounded-2xl border-0 bg-white p-6 shadow-none">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-[16px] font-semibold text-[#2C2C2C]">{t("dashboard.taskPipeline")}</h2>
            <span className="text-[12px] text-[#9A9A9A]">{t("dashboard.totalTasks", { count: pipelineTotal })}</span>
          </div>

          {/* Progress Bar */}
          {pipelineTotal > 0 ? (
            <>
              <div className="mb-5 flex h-3 w-full overflow-hidden rounded-md">
                {pipelineCounts.map((count, i) =>
                  count > 0 ? (
                    <div
                      key={pipelineColors[i].key}
                      className="h-full"
                      style={{
                        width: `${(count / pipelineTotal) * 100}%`,
                        backgroundColor: pipelineColors[i].bg,
                      }}
                    />
                  ) : null
                )}
              </div>

              {/* Legend */}
              <div className="mb-5 flex flex-wrap gap-5">
                {[
                  { label: t("dashboard.todoCount", { count: stats.tasks.todo }), color: "#E65100" },
                  { label: t("dashboard.inProgressCount", { count: stats.tasks.inProgress }), color: "#5A9E6F" },
                  { label: t("dashboard.toVerifyCount", { count: stats.tasks.toVerify }), color: "#7B1FA2" },
                  { label: t("dashboard.doneCount", { count: stats.tasks.done }), color: "#00796B" },
                ].map((item) => (
                  <div key={item.color} className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
                    <span className="text-[12px] text-[#6B6B6B]">{item.label}</span>
                  </div>
                ))}
              </div>

              <Separator className="mb-4 bg-[#F5F2EC]" />

              {/* Recent Tasks */}
              <div className="flex flex-col">
                {recentTasks.map((task, i) => {
                  const style = taskStatusStyle[task.status] || taskStatusStyle.open;
                  const dotColor = taskStatusDot[task.status] || "bg-[#9A9A9A]";
                  return (
                    <Link key={task.uuid} href={`/projects/${projectUuid}/tasks/${task.uuid}`}>
                      <div className={`flex items-center gap-3 py-2.5 ${i < recentTasks.length - 1 ? "border-b border-[#F5F2EC]" : ""}`}>
                        <div className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
                        <span className="flex-1 truncate text-[13px] text-[#2C2C2C]">{task.title}</span>
                        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium ${style.bg} ${style.text}`}>
                          {style.label}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-[13px] text-[#9A9A9A]">
              {t("dashboard.noRecentTasks")}
            </div>
          )}
        </Card>

        {/* Recent Activity Card */}
        <Card className="flex flex-col rounded-2xl border-0 bg-white p-6 shadow-none">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[16px] font-semibold text-[#2C2C2C]">{t("dashboard.recentActivity")}</h2>
            <Link href={`/projects/${projectUuid}/activity`} className="text-[12px] font-medium text-[#C67A52] hover:underline">
              {t("dashboard.viewAll")}
            </Link>
          </div>

          {activities.length > 0 ? (
            <div className="flex flex-col">
              {activities.map((activity, i) => {
                const dotColor = activityDotColors[activity.targetType] || "bg-[#9A9A9A]";
                return (
                  <div key={activity.uuid} className={`flex items-start gap-3 py-3 ${i < activities.length - 1 ? "border-b border-[#F5F2EC]" : ""}`}>
                    <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-[#2C2C2C]">
                        {activity.actorName} {activity.action}
                      </p>
                      <span className="text-[11px] text-[#9A9A9A]">
                        {formatRelativeTime(activity.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center text-[13px] text-[#9A9A9A]">
              {t("dashboard.noRecentActivity")}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
