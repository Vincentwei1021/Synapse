"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";
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

interface CompleteProjectButtonProps {
  projectUuid: string;
  status?: string | null;
}

export function CompleteProjectButton({ projectUuid, status }: CompleteProjectButtonProps) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isCompleted = status === "completed";
  const endpoint = isCompleted ? "restart" : "complete";

  const submit = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await authFetch(`/api/research-projects/${projectUuid}/${endpoint}`, {
        method: "POST",
      });

      if (!response.ok) {
        setError(isCompleted ? t("restartProjectFailed") : t("completeProjectFailed"));
        return;
      }

      setOpen(false);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  const triggerClass = isCompleted
    ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20 dark:hover:text-amber-100"
    : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 hover:text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20 dark:hover:text-emerald-100";

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className={triggerClass}>
          {isCompleted ? (
            <RotateCcw className="mr-2 h-4 w-4" />
          ) : (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          )}
          {isCompleted ? t("restartProject") : t("completeProject")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isCompleted ? t("restartProjectTitle") : t("completeProjectTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isCompleted ? t("restartProjectDescription") : t("completeProjectDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>
            {isCompleted ? t("restartProjectCancel") : t("completeProjectCancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void submit();
            }}
            disabled={isSubmitting}
          >
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isCompleted ? t("restartProjectConfirm") : t("completeProjectConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
