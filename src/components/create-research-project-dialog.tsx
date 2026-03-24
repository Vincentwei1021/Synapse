"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupUuid: string | null;
  groupName: string;
  onCreated?: () => void;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  groupUuid,
  groupName,
  onCreated,
}: CreateProjectDialogProps) {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState("");
  const [datasets, setDatasets] = useState("");
  const [evaluationMethods, setEvaluationMethods] = useState("");
  const [error, setError] = useState<string | null>(null);

  const displayGroupName = groupName || t("projectGroups.ungrouped");

  const handleSubmit = () => {
    if (!title.trim()) return;
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/research-projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: title.trim(),
            description: description.trim() || undefined,
            goal: goal.trim() || undefined,
            datasets: datasets,
            evaluationMethods: evaluationMethods,
            groupUuid: groupUuid || undefined,
          }),
        });
        const data = await res.json();

        if (data.success) {
          setTitle("");
          setDescription("");
          setGoal("");
          setDatasets("");
          setEvaluationMethods("");
          onOpenChange(false);
          onCreated?.();
          router.refresh();
        } else {
          setError(data.error || t("projects.createFailed"));
        }
      } catch {
        setError(t("common.genericError"));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[480px] gap-0 p-0 rounded-[16px]"
        showCloseButton={false}
      >
        <DialogHeader className="flex flex-row items-center justify-between p-[20px_24px] border-b border-[#E5E2DC]">
          <div className="flex flex-col gap-1">
            <DialogTitle className="text-lg font-semibold tracking-[-0.3px] text-[#2C2C2C]">
              {t("projectGroups.newProjectTitle")}
            </DialogTitle>
            <p className="text-xs text-[#9A9A9A]">
              {t("projectGroups.creatingIn", { groupName: displayGroupName })}
            </p>
          </div>
        </DialogHeader>
        <DialogDescription className="sr-only">
          {t("projectGroups.newProjectTitle")}
        </DialogDescription>

        <div className="flex flex-col gap-5 p-6">
          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px] font-medium text-[#2C2C2C]">
              {t("projectGroups.projectTitle")}
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("projectGroups.projectTitlePlaceholder")}
              className="h-10 rounded-lg border-[#E5E2DC]"
              onKeyDown={(e) => {
                if (e.key === "Enter" && title.trim()) handleSubmit();
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px] font-medium text-[#2C2C2C]">
              {t("common.description")}
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("projectGroups.projectDescriptionPlaceholder")}
              className="min-h-[80px] rounded-lg border-[#E5E2DC]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-[13px] font-medium text-[#2C2C2C]">
              Research Goal
            </Label>
            <Textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What should the agent optimize for or prove?"
              className="min-h-[72px] rounded-lg border-[#E5E2DC]"
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[13px] font-medium text-[#2C2C2C]">
                Datasets
              </Label>
              <Textarea
                value={datasets}
                onChange={(e) => setDatasets(e.target.value)}
                placeholder="One dataset per line"
                className="min-h-[96px] rounded-lg border-[#E5E2DC]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-[13px] font-medium text-[#2C2C2C]">
                Evaluation Methods
              </Label>
              <Textarea
                value={evaluationMethods}
                onChange={(e) => setEvaluationMethods(e.target.value)}
                placeholder="One metric or protocol per line"
                className="min-h-[96px] rounded-lg border-[#E5E2DC]"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-[16px_24px] border-t border-[#E5E2DC]">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border-[#E5E2DC] text-[13px]"
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !title.trim()}
            className="rounded-lg bg-[#C67A52] hover:bg-[#B56A42] text-white text-[13px] gap-1.5"
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {isPending
              ? t("common.creating")
              : t("projectGroups.createResearchProject")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
