"use client";

import { ArrowRight, GitBranch, Loader2, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  statusColors,
  statusI18nKeys,
  type DependencyTask,
} from "./run-detail-panel-shared";

interface RunDetailDependenciesProps {
  availableDepsForAdd: DependencyTask[];
  dependedBy: DependencyTask[];
  dependsOn: DependencyTask[];
  error: string | null;
  isLoading: boolean;
  onAddDependency: (dependsOnUuid: string) => void;
  onRemoveDependency: (dependsOnUuid: string) => void;
  onRemoveDependedBy: (runUuid: string) => void;
}

export function RunDetailDependencies({
  availableDepsForAdd,
  dependedBy,
  dependsOn,
  error,
  isLoading,
  onAddDependency,
  onRemoveDependency,
  onRemoveDependedBy,
}: RunDetailDependenciesProps) {
  const t = useTranslations();

  return (
    <div className="mt-5">
      <label className="text-[11px] font-medium uppercase tracking-wide text-[#9A9A9A]">
        {t("tasks.dependencies")}
      </label>

      {error && (
        <div className="mt-2 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="mt-2 flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-[#9A9A9A]" />
        </div>
      ) : (
        <>
          {dependsOn.length > 0 && (
            <div className="mt-2">
              <div className="mb-1.5 flex items-center gap-1.5">
                <ArrowRight className="h-3 w-3 text-[#9A9A9A]" />
                <span className="text-[10px] font-medium uppercase tracking-wide text-[#9A9A9A]">
                  {t("tasks.dependsOn")}
                </span>
              </div>
              <div className="space-y-1.5">
                {dependsOn.map((dep) => (
                  <div
                    key={dep.uuid}
                    className="group flex items-center justify-between rounded-lg bg-[#FAF8F4] p-3"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <GitBranch className="h-3.5 w-3.5 shrink-0 text-[#C67A52]" />
                      <span className="truncate text-xs text-[#2C2C2C]">{dep.title}</span>
                      <Badge className={`shrink-0 text-[10px] ${statusColors[dep.status] || ""}`}>
                        {t(`status.${statusI18nKeys[dep.status] || dep.status}`)}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-2 h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => onRemoveDependency(dep.uuid)}
                    >
                      <X className="h-3.5 w-3.5 text-[#9A9A9A] hover:text-[#D32F2F]" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dependedBy.length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 flex items-center gap-1.5">
                <ArrowRight className="h-3 w-3 rotate-180 text-[#9A9A9A]" />
                <span className="text-[10px] font-medium uppercase tracking-wide text-[#9A9A9A]">
                  {t("tasks.blockedByThis")}
                </span>
              </div>
              <div className="space-y-1.5">
                {dependedBy.map((dep) => (
                  <div
                    key={dep.uuid}
                    className="group flex items-center justify-between rounded-lg bg-[#FAF8F4] p-3"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <GitBranch className="h-3.5 w-3.5 shrink-0 text-[#6B6B6B]" />
                      <span className="truncate text-xs text-[#2C2C2C]">{dep.title}</span>
                      <Badge className={`shrink-0 text-[10px] ${statusColors[dep.status] || ""}`}>
                        {t(`status.${statusI18nKeys[dep.status] || dep.status}`)}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-2 h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => onRemoveDependedBy(dep.uuid)}
                    >
                      <X className="h-3.5 w-3.5 text-[#9A9A9A] hover:text-[#D32F2F]" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dependsOn.length === 0 && dependedBy.length === 0 && (
            <p className="mt-2 text-sm italic text-[#9A9A9A]">{t("tasks.noDependencies")}</p>
          )}

          {availableDepsForAdd.length > 0 && (
            <div className="mt-3">
              <Select
                key={dependsOn.length}
                onValueChange={onAddDependency}
              >
                <SelectTrigger className="h-8 border-[#E5E0D8] text-xs text-[#6B6B6B] focus:ring-[#C67A52]">
                  <div className="flex items-center gap-1.5">
                    <Plus className="h-3 w-3" />
                    <SelectValue placeholder={t("tasks.addDependency")} />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {availableDepsForAdd.map((task) => (
                    <SelectItem key={task.uuid} value={task.uuid}>
                      <span className="truncate">{task.title}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </>
      )}
    </div>
  );
}
