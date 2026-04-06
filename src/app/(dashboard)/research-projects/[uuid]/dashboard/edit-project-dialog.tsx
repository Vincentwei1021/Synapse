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
    repoUrl: string | null;
    githubUsername: string | null;
    githubConfigured: boolean;
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
  const [repoUrl, setRepoUrl] = useState(initialData.repoUrl || "");
  const [githubUsername, setGithubUsername] = useState(initialData.githubUsername || "");
  const [githubToken, setGithubToken] = useState("");

  function resetForm() {
    setName(initialData.name);
    setDescription(initialData.description || "");
    setDatasets((initialData.datasets || []).join("\n"));
    setEvaluationMethods((initialData.evaluationMethods || []).join("\n"));
    setRepoUrl(initialData.repoUrl || "");
    setGithubUsername(initialData.githubUsername || "");
    setGithubToken("");
  }

  async function handleSave() {
    const body: Record<string, unknown> = {
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
      repoUrl: repoUrl.trim() || null,
      githubUsername: githubUsername.trim() || null,
    };
    if (githubToken.trim()) {
      body.githubToken = githubToken.trim();
    }
    const response = await fetch(`/api/research-projects/${projectUuid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
            <div className="space-y-2">
              <Label>{t("projectSettings.repoUrl")}</Label>
              <Input
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder={t("projectSettings.repoUrlPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("projectSettings.githubUsername")}</Label>
              <Input
                value={githubUsername}
                onChange={(e) => setGithubUsername(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("projectSettings.githubToken")}</Label>
              <Input
                type="password"
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder={initialData.githubConfigured ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : t("projectSettings.githubTokenPlaceholder")}
              />
              <p className="text-xs text-muted-foreground">
                {initialData.githubConfigured ? t("projectSettings.githubConfigured") + ". " : t("projectSettings.githubNotConfigured") + ". "}
                {t("projectSettings.githubTokenHint")}
              </p>
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
