"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

interface DocumentActionsProps {
  documentUuid: string;
  projectUuid: string;
}

export function DocumentActions({ }: DocumentActionsProps) {
  const t = useTranslations();
  const router = useRouter();

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        className="border-border text-muted-foreground"
        onClick={() => router.back()}
      >
        {t("common.back")}
      </Button>
    </div>
  );
}
