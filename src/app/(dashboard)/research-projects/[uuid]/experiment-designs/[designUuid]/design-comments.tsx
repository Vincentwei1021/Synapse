"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Bot, User, Send, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MentionEditor, type MentionEditorRef } from "@/components/mention-editor";
import {
  getProposalCommentsAction,
  createProposalCommentAction,
} from "./comment-actions";
import type { CommentResponse } from "@/services/comment.service";
import { ContentWithMentions } from "@/components/mention-renderer";
import { useRealtimeEntityEvent } from "@/contexts/realtime-context";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatRelativeTime(dateString: string, t: any): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t("time.justNow");
  if (diffMins < 60) return t("time.minutesAgo", { minutes: diffMins });
  if (diffHours < 24) return t("time.hoursAgo", { hours: diffHours });
  if (diffDays < 7) return t("time.daysAgo", { days: diffDays });
  return date.toLocaleDateString();
}

interface ProposalCommentsProps {
  proposalUuid: string;
  currentUserUuid?: string;
}

export function ProposalComments({ proposalUuid, currentUserUuid }: ProposalCommentsProps) {
  const t = useTranslations();
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<CommentResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const editorRef = useRef<MentionEditorRef>(null);

  // Auto-refresh comments when another user adds a comment
  useRealtimeEntityEvent("proposal", proposalUuid, (event) => {
    if (currentUserUuid && event.actorUuid === currentUserUuid) return;
    getProposalCommentsAction(proposalUuid).then((result) => {
      setComments(result.comments);
    });
  });

  useEffect(() => {
    async function loadComments() {
      setIsLoading(true);
      const result = await getProposalCommentsAction(proposalUuid);
      setComments(result.comments);
      setIsLoading(false);
    }
    loadComments();
  }, [proposalUuid]);

  const handleSubmit = async () => {
    if (!comment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const result = await createProposalCommentAction(proposalUuid, comment);
    setIsSubmitting(false);

    if (result.success && result.comment) {
      setComments((prev) => [...prev, result.comment!]);
      setComment("");
      editorRef.current?.clear();
    }
  };

  return (
    <Card className="border-[#E5E0D8] p-4">
      <h3 className="mb-3 text-sm font-medium text-[#6B6B6B]">
        {t("comments.title")}
      </h3>

      {/* Comments List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-[#9A9A9A]" />
          </div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-[#9A9A9A] italic">{t("comments.noComments")}</p>
        ) : (
          comments.map((c) => (
            <div key={c.uuid} className="flex gap-2.5">
              <Avatar className="h-6 w-6">
                <AvatarFallback
                  className={
                    c.author.type === "agent"
                      ? "bg-[#C67A52] text-white"
                      : "bg-[#E5E0D8] text-[#6B6B6B] text-[10px]"
                  }
                >
                  {c.author.type === "agent" ? (
                    <Bot className="h-3 w-3" />
                  ) : (
                    c.author.name.charAt(0).toUpperCase()
                  )}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[#2C2C2C]">
                    {c.author.name}
                  </span>
                  <span className="text-[10px] text-[#9A9A9A]">
                    {formatRelativeTime(c.createdAt, t)}
                  </span>
                </div>
                <div className="mt-1 text-xs leading-relaxed text-[#2C2C2C]">
                  <ContentWithMentions>{c.content}</ContentWithMentions>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <Separator className="my-3 bg-[#F5F2EC]" />
      <div className="flex items-start gap-2.5">
        <Avatar className="mt-1.5 h-6 w-6">
          <AvatarFallback className="bg-[#C67A52] text-white text-[10px]">
            <User className="h-3 w-3" />
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <MentionEditor
            ref={editorRef}
            value={comment}
            onChange={setComment}
            onSubmit={handleSubmit}
            placeholder={t("comments.addComment")}
            className="border-none bg-[#FAF8F4] text-sm"
            disabled={isSubmitting}
          />
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="mt-1 h-7 w-7"
          disabled={!comment.trim() || isSubmitting}
          onClick={handleSubmit}
        >
          {isSubmitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#9A9A9A]" />
          ) : (
            <Send className="h-3.5 w-3.5 text-[#C67A52]" />
          )}
        </Button>
      </div>
    </Card>
  );
}
