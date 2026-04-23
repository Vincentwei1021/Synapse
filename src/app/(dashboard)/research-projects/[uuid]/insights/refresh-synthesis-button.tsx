"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RefreshSynthesisButton({ projectUuid }: { projectUuid: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleRefresh() {
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      await fetch(`/api/research-projects/${projectUuid}/synthesis/refresh`, {
        method: "POST",
      });
      startTransition(() => {
        router.refresh();
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Button
      onClick={() => {
        void handleRefresh();
      }}
      disabled={isSubmitting || isPending}
      className="gap-2"
    >
      {isSubmitting || isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Sparkles className="h-4 w-4" />
      )}
      {isSubmitting || isPending ? t("insights.refreshing") : t("insights.refresh")}
    </Button>
  );
}
