"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { X, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { RunDetailEditForm } from "./run-detail-panel-edit-form";
import { RunDetailFooter } from "./run-detail-panel-footer";
import { RunDetailOverview } from "./run-detail-panel-overview";
import { RunDetailConfig } from "./run-detail-panel-config";
import {
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
              <RunDetailEditForm
                availableDepsForCreate={availableDepsForCreate}
                editAcceptanceCriteria={editAcceptanceCriteria}
                editDescription={editDescription}
                editError={editError}
                editPriority={editPriority}
                editStoryPoints={editStoryPoints}
                editTitle={editTitle}
                isCreateMode={isCreateMode}
                onAcceptanceCriteriaChange={setEditAcceptanceCriteria}
                onAddPendingDependency={(uuid) => {
                  const found = allProjectTasks.find((task) => task.uuid === uuid);
                  if (found) {
                    setPendingDeps((prev) => [...prev, found]);
                  }
                }}
                onDescriptionChange={setEditDescription}
                onPriorityChange={setEditPriority}
                onRemovePendingDependency={(uuid) => {
                  setPendingDeps((prev) => prev.filter((dep) => dep.uuid !== uuid));
                }}
                onStoryPointsChange={setEditStoryPoints}
                onTitleChange={setEditTitle}
                pendingDeps={pendingDeps}
              />
            ) : task ? (
              <>
                <RunDetailOverview
                  activeWorkers={activeWorkers}
                  projectUuid={projectUuid}
                  source={source}
                  task={task}
                />

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

                <RunDetailConfig registryData={registryData} task={task} />

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
