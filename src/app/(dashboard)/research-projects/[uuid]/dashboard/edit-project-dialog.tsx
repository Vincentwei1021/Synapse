"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface EditProjectDialogProps {
  projectUuid: string;
  initialData: {
    name: string;
    description: string | null;
    datasets: string[] | null;
    evaluationMethods: string[] | null;
  };
}

export function EditProjectDialog({
  projectUuid,
  initialData,
}: EditProjectDialogProps) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(initialData.name);
  const [description, setDescription] = useState(
    initialData.description || ""
  );
  const [datasets, setDatasets] = useState(
    (initialData.datasets || []).join("\n")
  );
  const [evaluationMethods, setEvaluationMethods] = useState(
    (initialData.evaluationMethods || []).join("\n")
  );

  function resetForm() {
    setName(initialData.name);
    setDescription(initialData.description || "");
    setDatasets((initialData.datasets || []).join("\n"));
    setEvaluationMethods((initialData.evaluationMethods || []).join("\n"));
  }

  async function handleSave() {
    const response = await fetch(`/api/research-projects/${projectUuid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || null,
        datasets: datasets
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        evaluationMethods: evaluationMethods
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    });

    if (response.ok) {
      setOpen(false);
      router.refresh();
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      resetForm();
    }
    setOpen(nextOpen);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => handleOpenChange(true)}>
        <Pencil className="mr-2 h-4 w-4" />
        {t("common.edit")}
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("researchProjects.editProject")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("researchProjects.projectName")}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("researchProjects.description")}</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("researchProjects.datasets")}</Label>
              <Textarea
                value={datasets}
                onChange={(e) => setDatasets(e.target.value)}
                rows={3}
                placeholder={t("projectGroups.datasetsPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("researchProjects.evaluationMethods")}</Label>
              <Textarea
                value={evaluationMethods}
                onChange={(e) => setEvaluationMethods(e.target.value)}
                rows={3}
                placeholder={t("projectGroups.evaluationMethodsPlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => startTransition(() => { void handleSave(); })}
              disabled={isPending || !name.trim()}
            >
              {isPending ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
