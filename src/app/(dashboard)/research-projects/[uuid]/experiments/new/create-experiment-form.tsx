"use client";

import { useRef, useState, useTransition } from "react";
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
  researchQuestions,
}: {
  projectUuid: string;
  researchQuestions: Array<{ uuid: string; title: string }>;
}) {
  const t = useTranslations();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  async function handleSubmit(formData: FormData) {
    setError(null);

    const payload = new FormData();
    payload.set("title", String(formData.get("title") || ""));
    payload.set("description", String(formData.get("description") || ""));
    payload.set("priority", String(formData.get("priority") || "medium"));
    payload.set("computeBudgetHours", String(formData.get("computeBudgetHours") || ""));
    payload.set("researchQuestionUuid", String(formData.get("researchQuestionUuid") || ""));
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
      <Card className="space-y-5 rounded-3xl border-[#E5DED3] p-6">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="title">{t("experiments.fields.title")}</Label>
            <Input id="title" name="title" required placeholder={t("experiments.fields.titlePlaceholder")} />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="description">{t("experiments.fields.description")}</Label>
            <Textarea
              id="description"
              name="description"
              rows={5}
              placeholder={t("experiments.fields.descriptionPlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="researchQuestionUuid">{t("experiments.fields.question")}</Label>
            <select
              id="researchQuestionUuid"
              name="researchQuestionUuid"
              className="w-full rounded-xl border border-[#E5DED3] bg-[#FBF8F3] px-3 py-2 text-sm text-[#2C2C2C]"
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
            <Label htmlFor="priority">{t("experiments.fields.priority")}</Label>
            <select
              id="priority"
              name="priority"
              defaultValue="medium"
              className="w-full rounded-xl border border-[#E5DED3] bg-[#FBF8F3] px-3 py-2 text-sm text-[#2C2C2C]"
            >
              <option value="immediate">{t("priority.immediate")}</option>
              <option value="low">{t("priority.low")}</option>
              <option value="medium">{t("priority.medium")}</option>
              <option value="high">{t("priority.high")}</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="computeBudgetHours">{t("experiments.fields.computeBudgetHours")}</Label>
            <Input id="computeBudgetHours" name="computeBudgetHours" type="number" min="0" step="0.5" />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>{t("experiments.fields.attachments")}</Label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-[#D8CEBF] bg-[#FBF8F3] px-4 py-4 text-left"
            >
              <Upload className="h-5 w-5 text-[#8E8478]" />
              <div>
                <p className="text-sm text-[#2C2C2C]">{t("experiments.fields.attachmentsHelp")}</p>
                <p className="text-xs text-[#8E8478]">.md .txt .markdown .pdf .docx</p>
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
              <div className="space-y-1 text-xs text-[#6B6B6B]">
                {selectedFiles.map((file) => (
                  <p key={`${file.name}-${file.size}`}>{file.name}</p>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {error ? <p className="text-sm text-[#B94C4C]">{error}</p> : null}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={isPending} className="bg-[#C67A52] text-white hover:bg-[#B56A42]">
            {isPending ? t("common.creating") : t("experiments.create")}
          </Button>
        </div>
      </Card>
    </form>
  );
}
