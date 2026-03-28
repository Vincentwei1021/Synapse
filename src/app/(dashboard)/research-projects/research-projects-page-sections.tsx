"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Droppable,
  Draggable,
} from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  Folder,
  FolderOpen,
  Lightbulb,
  Plus,
} from "lucide-react";
import type {
  GroupStats,
  ProjectData,
  ProjectGroupData,
} from "./research-projects-page-shared";
import {
  getAvatarColor,
  getProjectInitials,
  UNGROUPED_DROPPABLE_ID,
} from "./research-projects-page-shared";

function useRelativeDate() {
  const t = useTranslations("time");

  return (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return t("justNow");
    if (diffMinutes < 60) return t("minutesAgo", { minutes: diffMinutes });
    if (diffHours < 24) return t("hoursAgo", { hours: diffHours });
    if (diffDays === 0) return t("today");
    if (diffDays === 1) return t("yesterday");

    return t("daysAgo", { days: diffDays });
  };
}

function ProjectCard({ project }: { project: ProjectData }) {
  const t = useTranslations();
  const formatRelative = useRelativeDate();
  const initials = getProjectInitials(project.name);
  const avatarColor = getAvatarColor(project.name);
  const progress = project.counts.tasks > 0
    ? Math.round((project.counts.doneTasks / project.counts.tasks) * 100)
    : 0;

  return (
    <Card className="group cursor-pointer rounded-2xl border-border bg-card p-6 shadow-none transition-all hover:border-primary/50 hover:shadow-md">
      <div className="mb-3 flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
          style={{ backgroundColor: avatarColor }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-foreground group-hover:text-primary">
              {project.name}
            </h3>
            <Badge
              variant="success"
              className="gap-1 border-0 bg-emerald-500/15 text-[10px] text-emerald-600 dark:text-emerald-400"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {t("status.active")}
            </Badge>
          </div>
          {project.description && (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
              {project.description}
            </p>
          )}
        </div>
      </div>

      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {t("projects.taskProgress")}
          </span>
          <span className="text-[11px] font-medium text-foreground">
            {progress}%
          </span>
        </div>
        <Progress value={progress} />
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <div className="flex flex-wrap gap-3">
          <span className="flex items-center gap-1">
            <ClipboardList className="h-3 w-3" />
            {project.counts.tasks} {t("projects.tasks")}
          </span>
          <span className="flex items-center gap-1">
            <Lightbulb className="h-3 w-3" />
            {project.counts.ideas} {t("projects.ideas")}
          </span>
          <span className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {project.counts.documents} {t("projects.docs")}
          </span>
        </div>
        <span>
          {t("projects.updated")} {formatRelative(project.updatedAt)}
        </span>
      </div>
    </Card>
  );
}

function ProjectsGrid({ projects }: { projects: ProjectData[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {projects.map((project, index) => (
        <Draggable
          key={project.uuid}
          draggableId={project.uuid}
          index={index}
        >
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.draggableProps}
              {...provided.dragHandleProps}
            >
              <Link
                href={`/research-projects/${project.uuid}/dashboard`}
                draggable={false}
                onClick={(event) => {
                  if (snapshot.isDragging) event.preventDefault();
                }}
              >
                <div className={snapshot.isDragging ? "rotate-2 opacity-90 shadow-lg" : ""}>
                  <ProjectCard project={project} />
                </div>
              </Link>
            </div>
          )}
        </Draggable>
      ))}
    </div>
  );
}

export function ProjectsPageHeader({ onCreateGroup }: { onCreateGroup: () => void }) {
  const t = useTranslations();

  return (
    <div className="mb-6 flex flex-col gap-3 md:mb-8 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          {t("projects.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("projects.subtitle")}
        </p>
      </div>
      <Button
        className="rounded-xl bg-primary px-5 text-primary-foreground hover:bg-primary/90"
        onClick={onCreateGroup}
      >
        <Plus className="mr-2 h-4 w-4" />
        {t("projectGroups.newProjectGroup")}
      </Button>
    </div>
  );
}

export function ProjectsEmptyState() {
  const t = useTranslations();

  return (
    <Card className="flex flex-col items-center justify-center border-border bg-card p-12 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
        <FolderOpen className="h-8 w-8 text-primary" />
      </div>
      <h3 className="mb-2 text-lg font-medium text-foreground">
        {t("projects.noProjects")}
      </h3>
      <p className="mb-6 max-w-sm text-sm text-muted-foreground">
        {t("projects.noProjectsDesc")}
      </p>
      <Link href="/research-projects/new">
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
          {t("projects.createFirst")}
        </Button>
      </Link>
    </Card>
  );
}

export function GroupSection({
  group,
  projects,
  stats,
}: {
  group: ProjectGroupData;
  projects: ProjectData[];
  stats: GroupStats;
}) {
  const t = useTranslations();
  const [isOpen, setIsOpen] = useState(false);
  const completionRate =
    stats.totalTasks > 0
      ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
      : 0;

  return (
    <Droppable droppableId={group.uuid}>
      {(provided, snapshot) => (
        <div ref={provided.innerRef} {...provided.droppableProps}>
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <Card
              className={`rounded-2xl border-border bg-card p-0 shadow-none transition-colors hover:border-primary/40 ${
                snapshot.isDraggingOver ? "border-primary bg-primary/5" : ""
              }`}
            >
              <div className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6 md:py-4">
                <CollapsibleTrigger className="flex flex-1 cursor-pointer items-center gap-3 text-left">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15">
                    <Folder className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-base font-semibold text-foreground">
                        {group.name}
                      </h2>
                      <Badge
                        variant="secondary"
                        className="shrink-0 border-0 bg-secondary text-[11px] font-medium text-muted-foreground"
                      >
                        {projects.length} {t("projectGroups.projectCount")}
                      </Badge>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span>
                        {stats.totalTasks} {t("projects.tasks")} &middot; {completionRate}% {t("projectGroups.complete")}
                      </span>
                      <span>
                        {stats.openIdeas} {t("projectGroups.openIdeas")}
                      </span>
                    </div>
                  </div>
                  {isOpen ? (
                    <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </CollapsibleTrigger>
                <div className={`grid grid-cols-2 gap-2 md:flex md:items-center ${isOpen ? "grid" : "hidden md:flex"}`}>
                  <Link href={`/project-groups/${group.uuid}`} className="md:w-auto">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs text-primary hover:text-primary/80"
                    >
                      {t("projectGroups.viewDashboard")}
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-border text-xs md:w-auto"
                    asChild
                  >
                    <Link href="/research-projects/new">
                      <Plus className="mr-1 h-3 w-3" />
                      {t("projects.newProject")}
                    </Link>
                  </Button>
                </div>
              </div>

              <CollapsibleContent>
                <div className="border-t border-border px-4 pb-4 pt-3 md:px-6 md:pb-5 md:pt-4">
                  {projects.length === 0 && !snapshot.isDraggingOver ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      {t("projectGroups.noProjectsInGroup")}
                    </p>
                  ) : (
                    <ProjectsGrid projects={projects} />
                  )}
                  {provided.placeholder}
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </div>
      )}
    </Droppable>
  );
}

export function UngroupedSection({
  projects,
}: {
  projects: ProjectData[];
}) {
  const t = useTranslations();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Droppable droppableId={UNGROUPED_DROPPABLE_ID}>
      {(provided, snapshot) => {
        if (projects.length === 0 && !snapshot.isDraggingOver) {
          return (
            <div ref={provided.innerRef} {...provided.droppableProps} className="hidden">
              {provided.placeholder}
            </div>
          );
        }

        return (
          <div ref={provided.innerRef} {...provided.droppableProps}>
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
              <Card
                className={`rounded-2xl border-border bg-card p-0 shadow-none transition-colors hover:border-primary/40 ${
                  snapshot.isDraggingOver ? "border-primary bg-primary/5" : ""
                }`}
              >
                <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4">
                  <CollapsibleTrigger className="flex flex-1 cursor-pointer items-center gap-3 text-left">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-foreground">
                        {t("projectGroups.ungrouped")}
                      </h2>
                      <Badge
                        variant="secondary"
                        className="shrink-0 border-0 bg-secondary text-[11px] font-medium text-muted-foreground"
                      >
                        {projects.length} {t("projectGroups.projectCount")}
                      </Badge>
                    </div>
                    {isOpen ? (
                      <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </CollapsibleTrigger>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`ml-2 shrink-0 border-border text-xs md:inline-flex ${isOpen ? "inline-flex" : "hidden"}`}
                    asChild
                  >
                    <Link href="/research-projects/new">
                      <Plus className="mr-1 h-3 w-3" />
                      {t("projects.newProject")}
                    </Link>
                  </Button>
                </div>

                <CollapsibleContent>
                  <div className="border-t border-border px-4 pb-4 pt-3 md:px-6 md:pb-5 md:pt-4">
                    {projects.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        {t("projectGroups.noProjectsInGroup")}
                      </p>
                    ) : (
                      <ProjectsGrid projects={projects} />
                    )}
                    {provided.placeholder}
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </div>
        );
      }}
    </Droppable>
  );
}
