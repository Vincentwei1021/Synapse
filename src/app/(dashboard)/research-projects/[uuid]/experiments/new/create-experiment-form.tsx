"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function CreateExperimentForm({
  projectUuid,
  hasRepo,
  researchQuestions,
  existingExperiments,
}: {
  projectUuid: string;
  hasRepo?: boolean;
  researchQuestions: Array<{ uuid: string; title: string }>;
  existingExperiments: Array<{ uuid: string; title: string; description: string | null }>;
}) {
  const t = useTranslations();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [description, setDescription] = useState("");
  const [branches, setBranches] = useState<Array<{ name: string; sha: string }>>([]);
  const [baseBranch, setBaseBranch] = useState<string>("");
  const [branchesLoading, setBranchesLoading] = useState(false);

  useEffect(() => {
    if (!hasRepo) return;
    setBranchesLoading(true);
    fetch(`/api/research-projects/${projectUuid}/github/branches`)
      .then((res) => res.json())
      .then((data: { branches?: Array<{ name: string; sha: string }> }) => {
        const list = data.branches ?? [];
        setBranches(list);
        const mainBranch = list.find((b) => b.name === "main") ?? list[0];
        if (mainBranch) setBaseBranch(mainBranch.name);
      })
      .catch(() => setBranches([]))
      .finally(() => setBranchesLoading(false));
  }, [hasRepo, projectUuid]);

  async function handleSubmit(formData: FormData) {
    setError(null);

    const payload = new FormData();
    payload.set("title", String(formData.get("title") || ""));
    payload.set("description", String(formData.get("description") || ""));
    payload.set("status", String(formData.get("status") || "pending_start"));
    payload.set("priority", String(formData.get("priority") || "medium"));
    payload.set("computeBudgetHours", String(formData.get("computeBudgetHours") || ""));
    payload.set("researchQuestionUuid", String(formData.get("researchQuestionUuid") || ""));
    if (baseBranch) payload.set("baseBranch", baseBranch);
    selectedFiles.forEach((file) => payload.append("attachments", file));

    const response = await fetch(`/api/research-projects/${projectUuid}/experiments`, {
      method: "POST",
      body: payload,
    });

    if (!response.ok) {
      setError(t("experiments.createFailed"));
      return;
    }

    router.push(`/research-projects/${projectUuid}/experiments`);
    router.refresh();
  }

  return (
    <form action={(formData) => startTransition(() => { void handleSubmit(formData); })} className="space-y-6">
      <Card className="space-y-5 rounded-3xl border-border p-6">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="title">{t("experiments.fields.title")}</Label>
            <Input id="title" name="title" required placeholder={t("experiments.fields.titlePlaceholder")} />
          </div>

          {existingExperiments.length > 0 && (
            <div className="space-y-2 md:col-span-2">
              <Label>{t("experiments.fields.copyFromExperiment")}</Label>
              <select
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                onChange={(e) => {
                  const exp = existingExperiments.find((ex) => ex.uuid === e.target.value);
                  if (exp?.description) {
                    setDescription(exp.description);
                  }
                }}
                defaultValue=""
              >
                <option value="">{t("experiments.fields.writeYourOwn")}</option>
                {existingExperiments.map((exp) => (
                  <option key={exp.uuid} value={exp.uuid}>
                    {exp.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="description">{t("experiments.fields.description")}</Label>
            <Textarea
              id="description"
              name="description"
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("experiments.fields.descriptionPlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="researchQuestionUuid">{t("experiments.fields.question")}</Label>
            <select
              id="researchQuestionUuid"
              name="researchQuestionUuid"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
              defaultValue=""
            >
              <option value="">{t("experiments.fields.noQuestion")}</option>
              {researchQuestions.map((question) => (
                <option key={question.uuid} value={question.uuid}>
                  {question.title}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">{t("experiments.fields.status")}</Label>
            <select
              id="status"
              name="status"
              defaultValue="pending_start"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="pending_start">{t("experiments.columns.pendingStart")}</option>
              <option value="pending_review">{t("experiments.columns.pendingReview")}</option>
              <option value="draft">{t("experiments.columns.draft")}</option>
            </select>
            <p className="text-xs text-muted-foreground">{t("experiments.fields.statusHelp")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority">{t("experiments.fields.priority")}</Label>
            <select
              id="priority"
              name="priority"
              defaultValue="medium"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="low">{t("priority.low")}</option>
              <option value="medium">{t("priority.medium")}</option>
              <option value="high">{t("priority.high")}</option>
              <option value="immediate">{t("priority.immediate")}</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="computeBudgetHours">{t("experiments.fields.computeBudgetHours")}</Label>
            <Input
              id="computeBudgetHours"
              name="computeBudgetHours"
              type="number"
              min="0"
              step="0.5"
              placeholder={t("experiments.fields.computeBudgetHoursPlaceholder")}
            />
            <p className="text-xs text-muted-foreground">{t("experiments.fields.computeBudgetHoursHelp")}</p>
          </div>

          {hasRepo && (
            <div className="space-y-2">
              <Label htmlFor="baseBranch">{t("experiments.fields.baseBranch")}</Label>
              <select
                id="baseBranch"
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
                disabled={branchesLoading}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                {branchesLoading ? (
                  <option value="">{t("experiments.fields.baseBranchPlaceholder")}</option>
                ) : branches.length === 0 ? (
                  <option value="">{t("experiments.fields.baseBranchPlaceholder")}</option>
                ) : (
                  branches.map((b) => (
                    <option key={b.name} value={b.name}>{b.name}</option>
                  ))
                )}
              </select>
              <p className="text-xs text-muted-foreground">{t("experiments.fields.baseBranchHint")}</p>
            </div>
          )}

          <div className="space-y-2 md:col-span-2">
            <Label>{t("experiments.fields.attachments")}</Label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border bg-background px-4 py-4 text-left"
            >
              <Upload className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-foreground">{t("experiments.fields.attachmentsHelp")}</p>
                <p className="text-xs text-muted-foreground">.md .txt .markdown .pdf .docx</p>
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt,.markdown,.pdf,.docx"
              multiple
              className="hidden"
              onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))}
            />
            {selectedFiles.length > 0 ? (
              <div className="space-y-1 text-xs text-muted-foreground">
                {selectedFiles.map((file) => (
                  <p key={`${file.name}-${file.size}`}>{file.name}</p>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={isPending} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {isPending ? t("common.creating") : t("experiments.create")}
          </Button>
        </div>
      </Card>
    </form>
  );
}
