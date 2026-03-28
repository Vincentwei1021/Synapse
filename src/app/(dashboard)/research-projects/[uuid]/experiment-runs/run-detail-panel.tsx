"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { X, Pencil, Bot, FileText, FlaskConical, Shield, GitBranch, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { updateExperimentRunStatusAction, createExperimentRunAction, updateExperimentRunFieldsAction, deleteExperimentRunAction } from "./[runUuid]/actions";
import {
  getExperimentRunCommentsAction,
  createExperimentRunCommentAction,
} from "./[runUuid]/comment-actions";
import { getRunActivitiesAction } from "./[runUuid]/activity-actions";
import {
  getRunSourceAction,
  type ProposalSource,
} from "./[runUuid]/source-actions";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import type { MentionEditorRef } from "@/components/mention-editor";
import { AssignTaskModal } from "./assign-run-modal";
import {
  getExperimentRunDependenciesAction,
  addRunDependencyAction,
  removeRunDependencyAction,
  getProjectTasksForDependencyAction,
} from "./[runUuid]/dependency-actions";
import { getExperimentRunSessionsAction } from "./session-actions";
import type { RunSessionInfo } from "@/services/session.service";
import { useRealtimeEntityEvent } from "@/contexts/realtime-context";
import { getExperimentRegistryAction } from "./[runUuid]/registry-actions";
import type { ExperimentRegistry } from "@/generated/prisma/client";
import { RunDetailActivity } from "./run-detail-panel-activity";
import { RunDetailComments } from "./run-detail-panel-comments";
import { RunDetailCriteria } from "./run-detail-panel-criteria";
import { RunDetailDependencies } from "./run-detail-panel-dependencies";
import { RunDetailFooter } from "./run-detail-panel-footer";
import {
  JsonKeyValue,
  formatRelativeTime,
  priorityColors,
  priorityI18nKeys,
  statusColors,
  statusI18nKeys,
  type DependencyTask,
  type TaskDetail,
} from "./run-detail-panel-shared";

interface TaskDetailPanelProps {
  task: TaskDetail | null;
  projectUuid: string;
  currentUserUuid: string;
  onClose: () => void;
  onCreated?: () => void;
  onDependencyChange?: () => void;
}

export function TaskDetailPanel({
  task,
  projectUuid,
  currentUserUuid,
  onClose,
  onCreated,
  onDependencyChange,
}: TaskDetailPanelProps) {
  const t = useTranslations();
  const router = useRouter();

  // Track whether the initial slide-in animation has completed
  const [hasAnimated, setHasAnimated] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setHasAnimated(true), 300);
    return () => clearTimeout(timer);
  }, []);

  const [isLoading, setIsLoading] = useState(false);
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<Awaited<ReturnType<typeof getExperimentRunCommentsAction>>["comments"]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const editorRef = useRef<MentionEditorRef>(null);
  const [activities, setActivities] = useState<Awaited<ReturnType<typeof getRunActivitiesAction>>["activities"]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(true);
  const [source, setSource] = useState<ProposalSource | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);

  // Dependency state
  const [dependsOn, setDependsOn] = useState<DependencyTask[]>([]);
  const [dependedBy, setDependedBy] = useState<DependencyTask[]>([]);
  const [isLoadingDeps, setIsLoadingDeps] = useState(false);
  const [allProjectTasks, setAllProjectTasks] = useState<DependencyTask[]>([]);
  const [depError, setDepError] = useState<string | null>(null);

  // Active workers (sessions)
  const [activeWorkers, setActiveWorkers] = useState<RunSessionInfo[]>([]);

  // Experiment registry data
  const [registryData, setRegistryData] = useState<ExperimentRegistry | null>(null);

  // Auto-refresh comments when another user adds a comment
  useRealtimeEntityEvent("experiment_run", task?.uuid ?? "", (event) => {
    if (event.actorUuid === currentUserUuid) return;
    if (!task) return;
    getExperimentRunCommentsAction(task.uuid).then((result) => {
      setComments(result.comments);
    });
  });

  // Pending dependencies for create mode (stored locally until task is created)
  const [pendingDeps, setPendingDeps] = useState<DependencyTask[]>([]);

  // Edit / Create mode state
  const isCreateMode = task === null;
  const [isEditing, setIsEditing] = useState(isCreateMode);
  const [editTitle, setEditTitle] = useState(task?.title || "");
  const [editDescription, setEditDescription] = useState(task?.description || "");
  const [editPriority, setEditPriority] = useState(task?.priority || "medium");
  const [editStoryPoints, setEditStoryPoints] = useState<string>(
    task?.computeBudgetHours != null ? String(task.computeBudgetHours) : ""
  );
  const [editAcceptanceCriteria, setEditAcceptanceCriteria] = useState(
    task?.acceptanceCriteria || ""
  );
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const isAssignedToMe = task?.assignee?.uuid === currentUserUuid;
  const canStart = isAssignedToMe && task?.status === "assigned";
  const canMarkToVerify = isAssignedToMe && task?.status === "in_progress";
  const canMarkDone = task?.status === "to_verify";

  // Load comments, activities, and source
  useEffect(() => {
    if (!task) return;

    async function loadComments() {
      setIsLoadingComments(true);
      const result = await getExperimentRunCommentsAction(task!.uuid);
      setComments(result.comments);
      setIsLoadingComments(false);
    }
    async function loadActivities() {
      setIsLoadingActivities(true);
      const result = await getRunActivitiesAction(task!.uuid);
      setActivities(result.activities);
      setIsLoadingActivities(false);
    }
    async function loadSource() {
      if (task!.experimentDesignUuid) {
        const result = await getRunSourceAction(task!.experimentDesignUuid);
        setSource(result);
      }
    }
    async function loadDependencies() {
      setIsLoadingDeps(true);
      const [depsResult, projectTasksResult] = await Promise.all([
        getExperimentRunDependenciesAction(task!.uuid),
        getProjectTasksForDependencyAction(projectUuid),
      ]);
      setDependsOn(depsResult.dependsOn);
      setDependedBy(depsResult.dependedBy);
      setAllProjectTasks(projectTasksResult.tasks);
      setIsLoadingDeps(false);
    }
    async function loadActiveWorkers() {
      const result = await getExperimentRunSessionsAction(task!.uuid);
      if (result.success && result.data) {
        setActiveWorkers(result.data);
      }
    }
    async function loadRegistryData() {
      const result = await getExperimentRegistryAction(task!.uuid);
      setRegistryData(result);
    }
    loadComments();
    loadActivities();
    loadSource();
    loadDependencies();
    loadActiveWorkers();
    loadRegistryData();
  }, [projectUuid, task]);

  // Load project tasks for dependency picker in create mode
  useEffect(() => {
    if (!isCreateMode) return;
    async function loadProjectTasks() {
      const result = await getProjectTasksForDependencyAction(projectUuid);
      setAllProjectTasks(result.tasks);
    }
    loadProjectTasks();
  }, [isCreateMode, projectUuid]);

  // Reset edit state when task changes
  useEffect(() => {
    if (task) {
      setIsEditing(false);
      setEditTitle(task.title);
      setEditDescription(task.description || "");
      setEditPriority(task.priority);
      setEditStoryPoints(task.computeBudgetHours != null ? String(task.computeBudgetHours) : "");
      setEditAcceptanceCriteria(task.acceptanceCriteria || "");
      setEditError(null);
    }
  }, [task]);

  const handleStatusChange = async (newStatus: string) => {
    if (!task) return;
    setIsLoading(true);
    const result = await updateExperimentRunStatusAction(task.uuid, newStatus);
    setIsLoading(false);
    if (result.success) {
      onClose();
      router.refresh();
    }
  };

  const handleSubmitComment = async () => {
    if (!task || !comment.trim() || isSubmittingComment) return;

    setIsSubmittingComment(true);
    const result = await createExperimentRunCommentAction(task.uuid, comment);
    setIsSubmittingComment(false);

    if (result.success && result.comment) {
      setComments((prev) => [...prev, result.comment!]);
      setComment("");
      editorRef.current?.clear();
    }
  };

  const handleStartEdit = () => {
    if (!task) return;
    setEditTitle(task.title);
    setEditDescription(task.description || "");
    setEditPriority(task.priority);
    setEditStoryPoints(task.computeBudgetHours != null ? String(task.computeBudgetHours) : "");
    setEditAcceptanceCriteria(task.acceptanceCriteria || "");
    setEditError(null);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    if (isCreateMode) {
      onClose();
      return;
    }
    setIsEditing(false);
    if (task) {
      setEditTitle(task.title);
      setEditDescription(task.description || "");
      setEditPriority(task.priority);
      setEditStoryPoints(task.computeBudgetHours != null ? String(task.computeBudgetHours) : "");
      setEditAcceptanceCriteria(task.acceptanceCriteria || "");
    }
    setEditError(null);
  };

  const handleSaveEdit = async () => {
    if (!editTitle.trim()) {
      setEditError(t("tasks.titleRequired"));
      return;
    }

    setIsSaving(true);
    setEditError(null);

    const computeBudgetHoursValue = editStoryPoints.trim() ? parseFloat(editStoryPoints) : null;

    if (isCreateMode) {
      const result = await createExperimentRunAction({
        projectUuid,
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        priority: editPriority,
        computeBudgetHours: computeBudgetHoursValue,
        acceptanceCriteria: editAcceptanceCriteria.trim() || null,
      });

      setIsSaving(false);

      if (result.success) {
        // Add pending dependencies after task creation
        if (pendingDeps.length > 0 && result.runUuid) {
          await Promise.all(
            pendingDeps.map((dep) => addRunDependencyAction(result.runUuid!, dep.uuid))
          );
          onDependencyChange?.();
        }
        onCreated?.();
        onClose();
        router.refresh();
      } else {
        setEditError(result.error || t("tasks.createFailed"));
      }
    } else {
      const result = await updateExperimentRunFieldsAction({
        runUuid: task!.uuid,
        projectUuid,
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        priority: editPriority,
        computeBudgetHours: computeBudgetHoursValue,
        acceptanceCriteria: editAcceptanceCriteria.trim() || null,
      });

      setIsSaving(false);

      if (result.success) {
        setIsEditing(false);
        router.refresh();
      } else {
        setEditError(result.error || t("tasks.updateFailed"));
      }
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    setIsDeleting(true);
    const result = await deleteExperimentRunAction(task.uuid, projectUuid);
    setIsDeleting(false);

    if (result.success) {
      onClose();
      router.refresh();
    }
  };

  const handleAddDependency = async (dependsOnUuid: string) => {
    if (!task) return;
    setDepError(null);
    const result = await addRunDependencyAction(task.uuid, dependsOnUuid);
    if (result.success) {
      const addedTask = allProjectTasks.find(t => t.uuid === dependsOnUuid);
      if (addedTask) {
        setDependsOn(prev => [...prev, addedTask]);
      }
      onDependencyChange?.();
    } else {
      setDepError(result.error || t("tasks.failedToAddDep"));
    }
  };

  const handleRemoveDependency = async (dependsOnUuid: string) => {
    if (!task) return;
    setDepError(null);
    const result = await removeRunDependencyAction(task.uuid, dependsOnUuid);
    if (result.success) {
      setDependsOn(prev => prev.filter(d => d.uuid !== dependsOnUuid));
      onDependencyChange?.();
    } else {
      setDepError(result.error || t("tasks.failedToRemoveDep"));
    }
  };

  const handleRemoveDependedBy = async (runUuid: string) => {
    if (!task) return;
    setDepError(null);
    // Reverse: the other task depends on us, so remove from the other task's perspective
    const result = await removeRunDependencyAction(runUuid, task.uuid);
    if (result.success) {
      setDependedBy(prev => prev.filter(d => d.uuid !== runUuid));
      onDependencyChange?.();
    } else {
      setDepError(result.error || t("tasks.failedToRemoveDep"));
    }
  };

  // Available tasks for dependency dropdown (filter out self and already-dependent tasks)
  const availableDepsForAdd = allProjectTasks.filter(
    t => t.uuid !== task?.uuid && !dependsOn.some(d => d.uuid === t.uuid)
  );

  // Available tasks for create mode dependency picker
  const availableDepsForCreate = allProjectTasks.filter(
    t => !pendingDeps.some(d => d.uuid === t.uuid)
  );

  // Render the edit/create form
  const renderEditForm = () => (
    <div className="space-y-5">
      {editError && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {editError}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="edit-title" className="text-[13px] font-medium text-[#2C2C2C]">
          {t("tasks.titleLabel")}
        </Label>
        <Input
          id="edit-title"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="border-[#E5E0D8] text-sm focus-visible:ring-[#C67A52]"
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="edit-description" className="text-[13px] font-medium text-[#2C2C2C]">
          {t("tasks.descriptionLabel")}
        </Label>
        <Textarea
          id="edit-description"
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          rows={4}
          className="border-[#E5E0D8] text-sm resize-none focus-visible:ring-[#C67A52]"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="edit-priority" className="text-[13px] font-medium text-[#2C2C2C]">
          {t("tasks.priorityLabel")}
        </Label>
        <Select value={editPriority} onValueChange={setEditPriority}>
          <SelectTrigger className="border-[#E5E0D8] text-sm focus:ring-[#C67A52]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">{t("priority.low")}</SelectItem>
            <SelectItem value="medium">{t("priority.medium")}</SelectItem>
            <SelectItem value="high">{t("priority.high")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="edit-story-points" className="text-[13px] font-medium text-[#2C2C2C]">
          {t("tasks.computeBudgetHoursLabel")}
        </Label>
        <Input
          id="edit-story-points"
          type="number"
          min="0"
          step="0.5"
          value={editStoryPoints}
          onChange={(e) => setEditStoryPoints(e.target.value)}
          className="border-[#E5E0D8] text-sm focus-visible:ring-[#C67A52]"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="edit-acceptance-criteria" className="text-[13px] font-medium text-[#2C2C2C]">
          {t("tasks.acceptanceCriteriaLabel")}
        </Label>
        <Textarea
          id="edit-acceptance-criteria"
          value={editAcceptanceCriteria}
          onChange={(e) => setEditAcceptanceCriteria(e.target.value)}
          rows={4}
          className="border-[#E5E0D8] text-sm resize-none focus-visible:ring-[#C67A52]"
        />
      </div>

      {/* Dependency picker for create mode */}
      {isCreateMode && (
        <div className="space-y-2">
          <Label className="text-[13px] font-medium text-[#2C2C2C]">
            {t("tasks.dependencies")}
          </Label>

          {/* Selected pending deps */}
          {pendingDeps.length > 0 && (
            <div className="space-y-1.5">
              {pendingDeps.map((dep) => (
                <div
                  key={dep.uuid}
                  className="group flex items-center justify-between rounded-lg bg-[#FAF8F4] p-2.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <GitBranch className="h-3.5 w-3.5 shrink-0 text-[#C67A52]" />
                    <span className="text-xs text-[#2C2C2C] truncate">{dep.title}</span>
                    <Badge className={`shrink-0 text-[10px] ${statusColors[dep.status] || ""}`}>
                      {t(`status.${statusI18nKeys[dep.status] || dep.status}`)}
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0"
                    onClick={() => setPendingDeps(prev => prev.filter(d => d.uuid !== dep.uuid))}
                  >
                    <X className="h-3.5 w-3.5 text-[#9A9A9A] hover:text-[#D32F2F]" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add dependency select */}
          {availableDepsForCreate.length > 0 && (
            <Select
              key={pendingDeps.length}
              onValueChange={(uuid) => {
                const found = allProjectTasks.find(t => t.uuid === uuid);
                if (found) {
                  setPendingDeps(prev => [...prev, found]);
                }
              }}
            >
              <SelectTrigger className="h-8 border-[#E5E0D8] text-xs text-[#6B6B6B] focus:ring-[#C67A52]">
                <div className="flex items-center gap-1.5">
                  <Plus className="h-3 w-3" />
                  <SelectValue placeholder={t("tasks.addDependency")} />
                </div>
              </SelectTrigger>
              <SelectContent>
                {availableDepsForCreate.map((t) => (
                  <SelectItem key={t.uuid} value={t.uuid}>
                    <span className="truncate">{t.title}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
      />

      {/* Panel */}
      <div className={`fixed right-0 top-14 md:top-0 z-50 flex h-[calc(100%-3.5rem)] md:h-full w-full md:w-[480px] flex-col bg-white shadow-xl border-l border-[#E5E0D8] ${hasAnimated ? "" : "animate-in slide-in-from-right duration-300"}`}>
        {/* Panel Header */}
        <div className="flex items-center justify-between border-b border-[#F5F2EC] px-6 py-5">
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <h2 className="text-base font-semibold text-[#2C2C2C]">
                {isCreateMode ? t("tasks.createExperimentRunTitle") : t("tasks.editTask")}
              </h2>
            ) : task ? (
              <>
                <h2 className="text-base font-semibold text-[#2C2C2C] truncate">
                  {task.title}
                </h2>
                <div className="mt-1.5 flex items-center gap-2">
                  <Badge className={statusColors[task.status] || ""}>
                    {t(`status.${statusI18nKeys[task.status] || task.status}`)}
                  </Badge>
                  <Badge className={priorityColors[task.priority] || ""}>
                    {t(`priority.${priorityI18nKeys[task.priority] || task.priority}`)}
                  </Badge>
                  {task.computeBudgetHours && (
                    <span className="rounded bg-[#F5F2EC] px-2 py-0.5 text-xs font-medium text-[#6B6B6B]">
                      {task.computeBudgetHours}h
                    </span>
                  )}
                </div>
              </>
            ) : null}
          </div>

          <div className="flex items-center gap-2 ml-4">
            {task && !isEditing && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 border-[#E5E0D8] text-[#2C2C2C]"
                onClick={handleStartEdit}
              >
                <Pencil className="h-3.5 w-3.5 text-[#6B6B6B]" />
                <span className="text-xs">{t("common.edit")}</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-[#E5E0D8]"
              onClick={isEditing && !isCreateMode ? handleCancelEdit : onClose}
            >
              <X className="h-4 w-4 text-[#6B6B6B]" />
            </Button>
          </div>
        </div>

        {/* Panel Body - Scrollable */}
        <ScrollArea className="flex-1 min-h-0 [&_[data-slot=scroll-area-viewport]>div]:!block">
          <div className="flex min-h-full flex-col px-6 py-5">
            {isEditing ? (
              renderEditForm()
            ) : task ? (
              <>
                {/* Assignee Section */}
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wide text-[#9A9A9A]">
                    {t("common.assignee")}
                  </label>
                  <div className="mt-2 flex items-center gap-2.5 rounded-lg bg-[#FAF8F4] p-3">
                    {task.assignee ? (
                      <>
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className={task.assignee.type === "agent" ? "bg-[#C67A52] text-white" : "bg-[#E5E0D8] text-[#6B6B6B]"}>
                            {task.assignee.type === "agent" ? (
                              <Bot className="h-3.5 w-3.5" />
                            ) : (
                              task.assignee.name.charAt(0).toUpperCase()
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="text-sm font-medium text-[#2C2C2C]">
                            {task.assignee.name}
                          </div>
                          <div className="text-xs text-[#6B6B6B]">
                            {task.assignee.type === "agent"
                              ? `${t("common.agent")} • ${task.assignee.assignedAt ? new Date(task.assignee.assignedAt).toLocaleDateString() : ''}`
                              : t("common.user")}
                          </div>
                        </div>
                      </>
                    ) : (
                      <span className="text-sm text-[#9A9A9A]">{t("common.unassigned")}</span>
                    )}
                  </div>
                </div>

                {/* Active Workers Section */}
                {activeWorkers.length > 0 && (
                  <div className="mt-5">
                    <label className="text-[11px] font-medium uppercase tracking-wide text-[#9A9A9A]">
                      {t("sessions.activeWorkers")}
                    </label>
                    <div className="mt-2 space-y-1.5">
                      {activeWorkers.map((worker) => (
                        <div
                          key={worker.sessionUuid}
                          className="flex items-center gap-2.5 rounded-lg bg-[#FAF8F4] p-2.5"
                        >
                          <div className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-[#2C2C2C] truncate">
                              {worker.sessionName}
                            </div>
                            <div className="text-[10px] text-[#9A9A9A]">
                              {worker.agentName} · {formatRelativeTime(worker.checkinAt, t)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Description Section */}
                <div className="mt-5">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-[#9A9A9A]">
                    {t("common.description")}
                  </label>
                  <div className="mt-2">
                    {task.description ? (
                      <div className="prose prose-sm max-w-none text-[13px] leading-relaxed text-[#2C2C2C]">
                        <Streamdown plugins={{ code }}>{task.description}</Streamdown>
                      </div>
                    ) : (
                      <p className="text-sm italic text-[#9A9A9A]">{t("common.noDescription")}</p>
                    )}
                  </div>
                </div>

                {/* Acceptance Criteria Section - legacy only (structured criteria shown below dependencies) */}
                {task.acceptanceCriteria && !(task.acceptanceCriteriaItems && task.acceptanceCriteriaItems.length > 0) && (
                  <div className="mt-5">
                    <label className="text-[11px] font-medium uppercase tracking-wide text-[#9A9A9A]">
                      {t("tasks.acceptanceCriteria")}
                    </label>
                    <div className="mt-2">
                      <div className="prose prose-sm max-w-none text-[13px] leading-relaxed text-[#2C2C2C]">
                        <Streamdown plugins={{ code }}>{task.acceptanceCriteria}</Streamdown>
                      </div>
                    </div>
                  </div>
                )}

                {/* Source Section - only show if from proposal */}
                {source && (
                  <div className="mt-5">
                    <label className="text-[11px] font-medium uppercase tracking-wide text-[#9A9A9A]">
                      {t("common.source")}
                    </label>
                    <a
                      href={`/research-projects/${projectUuid}/experiment-designs/${source.uuid}`}
                      className="mt-2 flex items-center justify-between rounded-lg bg-[#FAF8F4] p-3 hover:bg-[#F0EDE5] transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-[#C67A52]" />
                        <span className="text-xs text-[#2C2C2C]">{source.title}</span>
                      </div>
                    </a>
                  </div>
                )}

                <RunDetailDependencies
                  availableDepsForAdd={availableDepsForAdd}
                  dependedBy={dependedBy}
                  dependsOn={dependsOn}
                  error={depError}
                  isLoading={isLoadingDeps}
                  onAddDependency={handleAddDependency}
                  onRemoveDependency={handleRemoveDependency}
                  onRemoveDependedBy={handleRemoveDependedBy}
                />

                {/* Experiment Configuration Section */}
                {task.experimentConfig && (
                  <div className="mt-5">
                    <Card className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <FlaskConical className="h-4 w-4 text-[#C67A52]" />
                        <span className="text-[13px] font-semibold text-[#2C2C2C]">Experiment Configuration</span>
                      </div>

                      {/* Configuration table */}
                      <div className="mb-3">
                        <label className="text-[10px] font-medium uppercase tracking-wide text-[#9A9A9A] mb-1.5 block">
                          Configuration
                        </label>
                        <JsonKeyValue data={task.experimentConfig} />
                      </div>

                      {/* Results table */}
                      {task.experimentResults && (
                        <div className="mb-3">
                          <Separator className="my-3 bg-[#F5F2EC]" />
                          <label className="text-[10px] font-medium uppercase tracking-wide text-[#9A9A9A] mb-1.5 block">
                            Results
                          </label>
                          <JsonKeyValue data={task.experimentResults} />
                        </div>
                      )}

                      {/* Outcome badge */}
                      {task.outcome && (
                        <>
                          <Separator className="my-3 bg-[#F5F2EC]" />
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-medium text-[#9A9A9A]">Outcome:</span>
                            <Badge className={
                              task.outcome === "accepted" ? "bg-green-50 text-green-700" :
                              task.outcome === "rejected" ? "bg-red-50 text-red-700" :
                              "bg-yellow-50 text-yellow-700"
                            }>
                              {task.outcome}
                            </Badge>
                          </div>
                        </>
                      )}

                      {/* Registry info */}
                      {registryData && (
                        <>
                          <Separator className="my-3 bg-[#F5F2EC]" />
                          <label className="text-[10px] font-medium uppercase tracking-wide text-[#9A9A9A] mb-1.5 block">
                            Registry
                          </label>

                          {/* Environment */}
                          {registryData.environment && typeof registryData.environment === "object" && (
                            <div className="mb-2">
                              <span className="text-[11px] font-medium text-[#6B6B6B]">Environment</span>
                              <div className="mt-1">
                                <JsonKeyValue data={registryData.environment as Record<string, unknown>} />
                              </div>
                            </div>
                          )}

                          {/* Seed */}
                          {registryData.seed !== null && registryData.seed !== undefined && (
                            <div className="flex items-center gap-2 mb-2 text-[13px]">
                              <span className="font-medium text-[#6B6B6B]">Seed</span>
                              <span className="text-[#2C2C2C]">{registryData.seed}</span>
                            </div>
                          )}

                          {/* Reproducibility */}
                          <div className="flex items-center gap-2 mb-2">
                            <Shield className="h-3.5 w-3.5 text-[#6B6B6B]" />
                            <span className="text-[11px] font-medium text-[#6B6B6B]">Reproducibility:</span>
                            {registryData.reproducible ? (
                              <Badge className="bg-green-50 text-green-700 text-[10px]">Verified</Badge>
                            ) : (
                              <Badge className="bg-[#F5F5F5] text-[#9A9A9A] text-[10px]">Unverified</Badge>
                            )}
                          </div>

                          {/* Timestamps */}
                          <div className="space-y-1 text-[11px] text-[#6B6B6B]">
                            <div>Started: {new Date(registryData.startedAt).toLocaleString()}</div>
                            {registryData.completedAt && (
                              <div>Completed: {new Date(registryData.completedAt).toLocaleString()}</div>
                            )}
                            <div>Registered: {new Date(registryData.createdAt).toLocaleString()}</div>
                          </div>
                        </>
                      )}
                    </Card>
                  </div>
                )}

                <RunDetailCriteria task={task} />

                <RunDetailActivity
                  activities={activities}
                  isLoading={isLoadingActivities}
                />

                <RunDetailComments
                  comment={comment}
                  comments={comments}
                  editorRef={editorRef}
                  isLoading={isLoadingComments}
                  isSubmitting={isSubmittingComment}
                  onCommentChange={setComment}
                  onSubmit={handleSubmitComment}
                />
              </>
            ) : null}
          </div>
        </ScrollArea>

        <RunDetailFooter
          canMarkDone={canMarkDone}
          canMarkToVerify={canMarkToVerify}
          canStart={canStart}
          editTitle={editTitle}
          isCreateMode={isCreateMode}
          isDeleting={isDeleting}
          isEditing={isEditing}
          isLoading={isLoading}
          isSaving={isSaving}
          onCancelEdit={handleCancelEdit}
          onDelete={handleDelete}
          onOpenAssign={() => setShowAssignModal(true)}
          onSaveEdit={handleSaveEdit}
          onStatusChange={handleStatusChange}
          task={task}
        />
      </div>

      {/* Assign Task Modal */}
      {task && showAssignModal && (
        <AssignTaskModal
          task={task}
          projectUuid={projectUuid}
          currentUserUuid={currentUserUuid}
          onClose={() => setShowAssignModal(false)}
        />
      )}
    </>
  );
}
