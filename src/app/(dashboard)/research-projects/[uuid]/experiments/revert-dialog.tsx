"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface AgentOption {
  uuid: string;
  name: string;
}

interface RevertDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  currentAssigneeUuid: string | null;
  agents: AgentOption[];
  onSubmit: (payload: { reviewNote: string; assignedAgentUuid: string | null }) => Promise<void>;
}

export function RevertDialog({ open, onOpenChange, currentAssigneeUuid, agents, onSubmit }: RevertDialogProps) {
  const t = useTranslations();
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState<string>(currentAssigneeUuid ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await onSubmit({
        reviewNote: note.trim(),
        assignedAgentUuid: assignee === "" ? null : assignee,
      });
      setNote("");
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("experiments.reviewRevert.title")}</DialogTitle>
          <DialogDescription>{t("experiments.reviewRevert.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="revert-note">{t("experiments.reviewRevert.noteLabel")}</Label>
            <Textarea
              id="revert-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("experiments.reviewRevert.notePlaceholder")}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="revert-agent">{t("experiments.reviewRevert.agentLabel")}</Label>
            <select
              id="revert-agent"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="">{t("experiments.reviewRevert.agentNone")}</option>
              {agents.map((a) => (
                <option key={a.uuid} value={a.uuid}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            {t("experiments.reviewRevert.cancel")}
          </Button>
          <Button disabled={submitting} onClick={handleSubmit}>
            {t("experiments.reviewRevert.submit")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
