"use client";

import {
  Check,
  CheckCircle,
  Eye,
  Loader2,
  Play,
  Trash2,
  User,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { TaskDetail } from "./run-detail-panel-shared";

interface RunDetailFooterProps {
  canMarkDone: boolean;
  canMarkToVerify: boolean;
  canStart: boolean;
  editTitle: string;
  isCreateMode: boolean;
  isDeleting: boolean;
  isEditing: boolean;
  isLoading: boolean;
  isSaving: boolean;
  onCancelEdit: () => void;
  onDelete: () => void;
  onOpenAssign: () => void;
  onSaveEdit: () => void;
  onStatusChange: (newStatus: string) => void;
  task: TaskDetail | null;
}

export function RunDetailFooter({
  canMarkDone,
  canMarkToVerify,
  canStart,
  editTitle,
  isCreateMode,
  isDeleting,
  isEditing,
  isLoading,
  isSaving,
  onCancelEdit,
  onDelete,
  onOpenAssign,
  onSaveEdit,
  onStatusChange,
  task,
}: RunDetailFooterProps) {
  const t = useTranslations();

  return (
    <div className="border-t border-[#F5F2EC] px-6 py-4">
      <div className="flex items-center gap-3">
        {isEditing ? (
          <>
            <Button
              variant="outline"
              className="border-[#E5E0D8]"
              onClick={onCancelEdit}
              disabled={isSaving}
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="bg-[#C67A52] text-white hover:bg-[#B56A42]"
              onClick={onSaveEdit}
              disabled={isSaving || !editTitle.trim()}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("common.saving")}
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  {isCreateMode ? t("common.create") : t("tasks.saveChanges")}
                </>
              )}
            </Button>
          </>
        ) : task ? (
          <>
            {task.status !== "done" && task.status !== "closed" && (
              <Button
                variant="outline"
                className="border-[#E5E0D8]"
                onClick={onOpenAssign}
                disabled={isLoading}
              >
                <User className="mr-2 h-4 w-4" />
                {t("common.assign")}
              </Button>
            )}
            {canStart && (
              <Button
                className="flex-1 bg-[#1976D2] text-white hover:bg-[#1565C0]"
                onClick={() => onStatusChange("in_progress")}
                disabled={isLoading}
              >
                <Play className="mr-2 h-4 w-4" />
                {t("tasks.startWork")}
              </Button>
            )}
            {canMarkToVerify && (
              <Button
                className="flex-1 bg-[#7B1FA2] text-white hover:bg-[#6A1B9A]"
                onClick={() => onStatusChange("to_verify")}
                disabled={isLoading}
              >
                <Eye className="mr-2 h-4 w-4" />
                {t("tasks.submitForReview")}
              </Button>
            )}
            {canMarkDone && (
              <Button
                className="flex-1 bg-[#22C55E] text-white hover:bg-[#16A34A]"
                onClick={() => onStatusChange("done")}
                disabled={isLoading}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                {t("tasks.markAsVerified")}
              </Button>
            )}
            {(task.status === "done" || task.status === "closed") && (
              <div className="w-full text-center text-sm text-[#9A9A9A]">
                {t("tasks.taskCompleted")}
              </div>
            )}
            <div className="ml-auto">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 border-[#E5E0D8] text-[#D32F2F] hover:border-[#D32F2F] hover:bg-[#FFEBEE] hover:text-[#D32F2F]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("tasks.deleteExperimentRun")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("tasks.deleteExperimentRunConfirm", { title: task.title })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={onDelete}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t("common.delete")}
                        </>
                      ) : (
                        t("common.delete")
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
