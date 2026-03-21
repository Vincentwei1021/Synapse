"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { createIdeaAction } from "./actions";

interface IdeaCreateFormProps {
  projectUuid: string;
}

export function IdeaCreateForm({ projectUuid }: IdeaCreateFormProps) {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError(t("ideas.titleRequired"));
      return;
    }

    startTransition(async () => {
      try {
        const result = await createIdeaAction({
          projectUuid,
          title: title.trim(),
          content: content.trim() || undefined,
        });

        if (result.success) {
          setTitle("");
          setContent("");
          router.refresh();
        } else {
          setError(result.error || t("ideas.createFailed"));
        }
      } catch {
        setError(t("common.genericError"));
      }
    });
  };

  return (
    <Card className="border-[#E5E0D8] rounded-2xl py-5">
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="idea-title" className="text-[13px] font-medium text-[#2C2C2C]">
                {t("ideas.titleLabel")}
              </Label>
              <Input
                id="idea-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("ideas.whatIsYourIdea")}
                className="border-[#E5E0D8] text-sm"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="idea-content" className="text-[13px] font-medium text-[#2C2C2C]">
                {t("common.content")}
              </Label>
              <Textarea
                id="idea-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t("ideas.addMoreDetails")}
                rows={2}
                className="border-[#E5E0D8] text-sm resize-none"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={isPending || !title.trim()}
              size="sm"
              className="bg-[#C67A52] hover:bg-[#B56A42] text-white"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("common.creating")}
                </>
              ) : (
                t("ideas.submit")
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
