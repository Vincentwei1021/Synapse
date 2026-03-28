"use client";

import { GitBranch, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  statusColors,
  statusI18nKeys,
  type DependencyTask,
} from "./run-detail-panel-shared";

interface RunDetailEditFormProps {
  availableDepsForCreate: DependencyTask[];
  editAcceptanceCriteria: string;
  editDescription: string;
  editError: string | null;
  editPriority: string;
  editStoryPoints: string;
  editTitle: string;
  isCreateMode: boolean;
  onAcceptanceCriteriaChange: (value: string) => void;
  onAddPendingDependency: (uuid: string) => void;
  onDescriptionChange: (value: string) => void;
  onPriorityChange: (value: string) => void;
  onRemovePendingDependency: (uuid: string) => void;
  onStoryPointsChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  pendingDeps: DependencyTask[];
}

export function RunDetailEditForm({
  availableDepsForCreate,
  editAcceptanceCriteria,
  editDescription,
  editError,
  editPriority,
  editStoryPoints,
  editTitle,
  isCreateMode,
  onAcceptanceCriteriaChange,
  onAddPendingDependency,
  onDescriptionChange,
  onPriorityChange,
  onRemovePendingDependency,
  onStoryPointsChange,
  onTitleChange,
  pendingDeps,
}: RunDetailEditFormProps) {
  const t = useTranslations();

  return (
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
          onChange={(e) => onTitleChange(e.target.value)}
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
          onChange={(e) => onDescriptionChange(e.target.value)}
          rows={4}
          className="resize-none border-[#E5E0D8] text-sm focus-visible:ring-[#C67A52]"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="edit-priority" className="text-[13px] font-medium text-[#2C2C2C]">
          {t("tasks.priorityLabel")}
        </Label>
        <Select value={editPriority} onValueChange={onPriorityChange}>
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
          onChange={(e) => onStoryPointsChange(e.target.value)}
          className="border-[#E5E0D8] text-sm focus-visible:ring-[#C67A52]"
        />
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="edit-acceptance-criteria"
          className="text-[13px] font-medium text-[#2C2C2C]"
        >
          {t("tasks.acceptanceCriteriaLabel")}
        </Label>
        <Textarea
          id="edit-acceptance-criteria"
          value={editAcceptanceCriteria}
          onChange={(e) => onAcceptanceCriteriaChange(e.target.value)}
          rows={4}
          className="resize-none border-[#E5E0D8] text-sm focus-visible:ring-[#C67A52]"
        />
      </div>

      {isCreateMode && (
        <div className="space-y-2">
          <Label className="text-[13px] font-medium text-[#2C2C2C]">
            {t("tasks.dependencies")}
          </Label>

          {pendingDeps.length > 0 && (
            <div className="space-y-1.5">
              {pendingDeps.map((dep) => (
                <div
                  key={dep.uuid}
                  className="group flex items-center justify-between rounded-lg bg-[#FAF8F4] p-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <GitBranch className="h-3.5 w-3.5 shrink-0 text-[#C67A52]" />
                    <span className="truncate text-xs text-[#2C2C2C]">{dep.title}</span>
                    <Badge className={`shrink-0 text-[10px] ${statusColors[dep.status] || ""}`}>
                      {t(`status.${statusI18nKeys[dep.status] || dep.status}`)}
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="ml-2 h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => onRemovePendingDependency(dep.uuid)}
                  >
                    <X className="h-3.5 w-3.5 text-[#9A9A9A] hover:text-[#D32F2F]" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {availableDepsForCreate.length > 0 && (
            <Select key={pendingDeps.length} onValueChange={onAddPendingDependency}>
              <SelectTrigger className="h-8 border-[#E5E0D8] text-xs text-[#6B6B6B] focus:ring-[#C67A52]">
                <div className="flex items-center gap-1.5">
                  <Plus className="h-3 w-3" />
                  <SelectValue placeholder={t("tasks.addDependency")} />
                </div>
              </SelectTrigger>
              <SelectContent>
                {availableDepsForCreate.map((task) => (
                  <SelectItem key={task.uuid} value={task.uuid}>
                    <span className="truncate">{task.title}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
    </div>
  );
}
