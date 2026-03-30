"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createResearchQuestionAction, updateResearchQuestionAction } from "./actions";

interface IdeaCreateFormProps {
  projectUuid: string;
  researchQuestions?: Array<{ uuid: string; title: string }>;
  trigger?: React.ReactNode;
  buttonLabel?: string;
  defaultParentQuestionUuid?: string | null;
  mode?: "create" | "edit";
  questionUuid?: string;
  initialTitle?: string;
  initialContent?: string | null;
  initialParentQuestionUuid?: string | null;
  onSuccess?: () => void;
}

export function IdeaCreateForm({
  projectUuid,
  researchQuestions = [],
  trigger,
  buttonLabel,
  defaultParentQuestionUuid = null,
  mode = "create",
  questionUuid,
  initialTitle = "",
  initialContent = "",
  initialParentQuestionUuid = null,
  onSuccess,
}: IdeaCreateFormProps) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent ?? "");
  const [parentQuestionUuid, setParentQuestionUuid] = useState<string>(
    initialParentQuestionUuid ?? defaultParentQuestionUuid ?? "",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setContent(initialContent ?? "");
      setParentQuestionUuid(initialParentQuestionUuid ?? defaultParentQuestionUuid ?? "");
      setError(null);
      return;
    }

    setTitle(initialTitle);
    setContent(initialContent ?? "");
    setParentQuestionUuid(initialParentQuestionUuid ?? defaultParentQuestionUuid ?? "");
  }, [defaultParentQuestionUuid, initialContent, initialParentQuestionUuid, initialTitle, open]);

  const hasQuestions = researchQuestions.length > 0;
  const selectableQuestions = useMemo(
    () => researchQuestions.filter((question) => question.uuid !== questionUuid),
    [questionUuid, researchQuestions],
  );
  const defaultTrigger = useMemo(
    () => (
      <Button className="bg-[#C67A52] text-white hover:bg-[#B56A42]">
        <Plus className="mr-2 h-4 w-4" />
        {buttonLabel || (mode === "edit" ? t("ideas.editQuestion") : t("ideas.createRoot"))}
      </Button>
    ),
    [buttonLabel, mode, t],
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError(t("ideas.titleRequired"));
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          const result =
            mode === "edit" && questionUuid
              ? await updateResearchQuestionAction({
                  projectUuid,
                  questionUuid,
                  title: title.trim(),
                  content: content.trim() || null,
                  parentQuestionUuid: parentQuestionUuid || null,
                })
              : await createResearchQuestionAction({
                  projectUuid,
                  title: title.trim(),
                  content: content.trim() || undefined,
                  parentQuestionUuid: parentQuestionUuid || null,
                });

          if (!result.success) {
            setError(result.error || (mode === "edit" ? t("ideas.updateFailed") : t("ideas.createFailed")));
            return;
          }

          setOpen(false);
          onSuccess?.();
          router.refresh();
        } catch {
          setError(t("common.genericError"));
        }
      })();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
      <DialogContent className="max-w-2xl rounded-3xl border-[#E5DED3] p-0 shadow-2xl">
        <form onSubmit={handleSubmit} className="overflow-hidden rounded-3xl bg-background">
          <DialogHeader className="border-b border-border px-6 py-5 text-left">
            <DialogTitle className="text-lg font-semibold text-foreground">
              {buttonLabel || (mode === "edit" ? t("ideas.editQuestion") : t("ideas.createRoot"))}
            </DialogTitle>
            <DialogDescription className="text-sm leading-6 text-muted-foreground">
              {mode === "edit" ? t("ideas.editHint") : t("ideas.canvasHint")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 px-6 py-5">
            {error ? (
              <div className="rounded-2xl border border-destructive/15 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="idea-title" className="text-[13px] font-medium text-foreground">
                {t("ideas.titleLabel")}
              </Label>
              <Input
                id="idea-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("ideas.whatIsYourIdea")}
                className="h-11 rounded-2xl border-[#E5DED3] bg-card"
                required
              />
            </div>

            {hasQuestions ? (
              <div className="space-y-2">
                <Label htmlFor="idea-parent" className="text-[13px] font-medium text-foreground">
                  {t("ideas.parentLabel")}
                </Label>
                <select
                  id="idea-parent"
                  value={parentQuestionUuid}
                  onChange={(event) => setParentQuestionUuid(event.target.value)}
                  className="h-11 w-full rounded-2xl border border-[#E5DED3] bg-card px-3 text-sm text-foreground outline-none focus:border-[#C67A52]"
                >
                  <option value="">{t("ideas.noParent")}</option>
                  {selectableQuestions.map((question) => (
                    <option key={question.uuid} value={question.uuid}>
                      {question.title}
                    </option>
                  ))}
                </select>
                <p className="text-xs leading-5 text-muted-foreground">{t("ideas.parentHint")}</p>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="idea-content" className="text-[13px] font-medium text-foreground">
                {t("common.content")}
              </Label>
              <Textarea
                id="idea-content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder={t("ideas.addMoreDetails")}
                rows={5}
                className="min-h-[132px] rounded-2xl border-[#E5DED3] bg-card resize-none"
              />
            </div>
          </div>

          <DialogFooter className="border-t border-border px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isPending || !title.trim()}
              className="bg-[#C67A52] text-white hover:bg-[#B56A42]"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {mode === "edit" ? t("common.saving") : t("common.creating")}
                </>
              ) : (
                buttonLabel || (mode === "edit" ? t("ideas.saveChanges") : t("ideas.submit"))
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
