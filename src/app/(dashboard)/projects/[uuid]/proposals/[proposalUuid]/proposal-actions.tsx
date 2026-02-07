"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { approveProposalAction, rejectProposalAction, submitProposalAction } from "./actions";

interface ProposalActionsProps {
  proposalUuid: string;
  projectUuid: string;
  status: string;
}

export function ProposalActions({ proposalUuid, status }: ProposalActionsProps) {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);

  const handleSubmit = () => {
    startTransition(async () => {
      const result = await submitProposalAction(proposalUuid);
      if (result.success) {
        setSubmitDialogOpen(false);
        router.refresh();
      }
    });
  };

  const handleApprove = () => {
    startTransition(async () => {
      const result = await approveProposalAction(proposalUuid);
      if (result.success) {
        router.refresh();
      }
    });
  };

  const handleReject = () => {
    startTransition(async () => {
      const result = await rejectProposalAction(proposalUuid, rejectReason);
      if (result.success) {
        setRejectDialogOpen(false);
        setRejectReason("");
        router.refresh();
      }
    });
  };

  return (
    <>
      <div className="flex gap-2">
        {status === "draft" && (
          <Button
            onClick={() => setSubmitDialogOpen(true)}
            disabled={isPending}
            className="bg-[#C67A52] hover:bg-[#B56A42] text-white"
          >
            {isPending ? t("common.processing") : t("proposals.submitForReview")}
          </Button>
        )}
        {status === "pending" && (
          <>
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(true)}
              disabled={isPending}
              className="border-[#D32F2F] text-[#D32F2F] hover:bg-[#FFEBEE]"
            >
              {t("common.reject")}
            </Button>
            <Button
              onClick={handleApprove}
              disabled={isPending}
              className="bg-[#5A9E6F] hover:bg-[#4A8E5F] text-white"
            >
              {isPending ? t("common.processing") : t("common.approve")}
            </Button>
          </>
        )}
        <Button
          variant="outline"
          className="border-[#E5E0D8] text-[#6B6B6B]"
          onClick={() => router.back()}
        >
          {t("common.back")}
        </Button>
      </div>

      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("proposals.confirmSubmit")}</DialogTitle>
            <DialogDescription>{t("proposals.confirmSubmitDesc")}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setSubmitDialogOpen(false)}
              className="border-[#E5E0D8] text-[#6B6B6B]"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isPending}
              className="bg-[#C67A52] hover:bg-[#B56A42] text-white"
            >
              {isPending ? t("common.processing") : t("proposals.submitForReview")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("proposals.rejectProposal")}</DialogTitle>
            <DialogDescription>{t("proposals.rejectProposalDesc")}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={t("proposals.rejectReasonPlaceholder")}
            className="min-h-[100px] border-[#E5E0D8]"
          />
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
              className="border-[#E5E0D8] text-[#6B6B6B]"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleReject}
              disabled={isPending || !rejectReason.trim()}
              className="bg-[#D32F2F] hover:bg-[#B71C1C] text-white"
            >
              {isPending ? t("common.processing") : t("common.reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
