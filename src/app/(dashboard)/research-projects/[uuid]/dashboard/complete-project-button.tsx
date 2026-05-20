"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth-client";

export function CompleteProjectButton({ projectUuid }: { projectUuid: string }) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);

  const completeProject = async () => {
    setError(null);
    setIsCompleting(true);
    try {
      const response = await authFetch(`/api/research-projects/${projectUuid}/complete`, {
        method: "POST",
      });

      if (!response.ok) {
        setError(t("completeProjectFailed"));
        return;
      }

      setOpen(false);
      router.refresh();
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="border-border bg-background">
          <CheckCircle2 className="mr-2 h-4 w-4" />
          {t("completeProject")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("completeProjectTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("completeProjectDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isCompleting}>{t("completeProjectCancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void completeProject();
            }}
            disabled={isCompleting}
          >
            {isCompleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("completeProjectConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
