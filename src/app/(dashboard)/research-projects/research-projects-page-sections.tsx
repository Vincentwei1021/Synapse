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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  Folder,
  FolderOpen,
  Lightbulb,
  Settings2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { authFetch } from "@/lib/auth-client";
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

export function ProjectsPageHeader({
  onCreateGroup,
  onManageProjects,
}: {
  onCreateGroup: () => void;
  onManageProjects: () => void;
}) {
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
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          className="rounded-xl"
          onClick={onManageProjects}
        >
          <Settings2 className="mr-2 h-4 w-4" />
          {t("projectGroups.manageProjects")}
        </Button>
        <Button
          className="rounded-xl bg-primary px-5 text-primary-foreground hover:bg-primary/90"
          onClick={onCreateGroup}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t("projectGroups.newProjectGroup")}
        </Button>
      </div>
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

function EditGroupDialog({
  open,
  onOpenChange,
  groupUuid,
  groupName,
  groupDescription,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupUuid: string;
  groupName: string;
  groupDescription: string | null;
  onUpdated: () => void;
}) {
  const t = useTranslations();
  const [name, setName] = useState(groupName);
  const [description, setDescription] = useState(groupDescription ?? "");
  const [saving, setSaving] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setName(groupName);
      setDescription(groupDescription ?? "");
    }
    onOpenChange(nextOpen);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/project-groups/${groupUuid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        onOpenChange(false);
        onUpdated();
      }
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    name.trim() !== groupName ||
    (description.trim() || "") !== (groupDescription ?? "");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t("projectGroups.editGroup")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t("projectGroups.groupName")}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("projectGroups.groupNamePlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              {t("projectGroups.groupDescription")}
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t("projectGroups.descriptionPlaceholder")}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !name.trim() || !hasChanges}
            >
              {saving ? t("projectGroups.saving") : t("projectGroups.saveChanges")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function GroupSection({
  group,
  projects,
  stats,
  onGroupUpdated,
}: {
  group: ProjectGroupData;
  projects: ProjectData[];
  stats: GroupStats;
  onGroupUpdated?: () => void;
}) {
  const t = useTranslations();
  const [isOpen, setIsOpen] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const completionRate =
    stats.totalTasks > 0
      ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
      : 0;

  return (
    <>
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
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowEditDialog(true);
                    }}
                  >
                    <Pencil className="mr-1 h-3 w-3" />
                    {t("projectGroups.editGroup")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-border text-xs md:w-auto"
                    asChild
                  >
                    <Link href={`/research-projects/new?groupUuid=${group.uuid}`}>
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

      <EditGroupDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        groupUuid={group.uuid}
        groupName={group.name}
        groupDescription={group.description}
        onUpdated={() => onGroupUpdated?.()}
      />
    </>
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

export function ManageProjectGroupsDialog({
  groups,
  onDeleted,
  onOpenChange,
  open,
}: {
  groups: ProjectGroupData[];
  onDeleted: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const t = useTranslations();
  const [deletingGroup, setDeletingGroup] = useState<ProjectGroupData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deletingGroup) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    try {
      const response = await authFetch(`/api/project-groups/${deletingGroup.uuid}`, {
        method: "DELETE",
      });
      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error || t("projectGroups.deleteFailed"));
      }

      setDeletingGroup(null);
      onDeleted();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error && deleteError.message
          ? deleteError.message
          : t("common.genericError")
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{t("projectGroups.manageProjects")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("projectGroups.manageProjectsDescription")}
            </p>

            {error ? (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {groups.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                {t("projectGroups.noGroupsToManage")}
              </div>
            ) : (
              <div className="space-y-2">
                {groups.map((group) => (
                  <div
                    key={group.uuid}
                    className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{group.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {group.projectCount} {t("projectGroups.projectCount")} ·{" "}
                        {t("projectGroups.deleteMovesToUngrouped")}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setDeletingGroup(group)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      {t("projectGroups.deleteGroup")}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deletingGroup !== null} onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setDeletingGroup(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("projectGroups.deleteGroup")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("projectGroups.deleteGroupDescription", {
                groupName: deletingGroup?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              {isDeleting ? t("common.processing") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
