"use client";

import { useTranslations } from "next-intl";
import { Bot, Loader2, Send, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ContentWithMentions } from "@/components/mention-renderer";
import { MentionEditor, type MentionEditorRef } from "@/components/mention-editor";
import type { CommentResponse } from "@/services/comment.service";
import { formatRelativeTime } from "./run-detail-panel-shared";

interface RunDetailCommentsProps {
  comment: string;
  comments: CommentResponse[];
  editorRef: React.RefObject<MentionEditorRef | null>;
  isLoading: boolean;
  isSubmitting: boolean;
  onCommentChange: (value: string) => void;
  onSubmit: () => void;
}

export function RunDetailComments({
  comment,
  comments,
  editorRef,
  isLoading,
  isSubmitting,
  onCommentChange,
  onSubmit,
}: RunDetailCommentsProps) {
  const t = useTranslations();

  return (
    <div className="mt-5">
      <label className="text-[11px] font-medium uppercase tracking-wide text-[#9A9A9A]">
        {t("comments.title")}
      </label>
      <div className="mt-3 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-[#9A9A9A]" />
          </div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-[#9A9A9A] italic">{t("comments.noComments")}</p>
        ) : (
          comments.map((item) => (
            <div key={item.uuid} className="flex gap-2.5">
              <Avatar className="h-6 w-6 shrink-0">
                <AvatarFallback className={item.author.type === "agent" ? "bg-[#C67A52] text-white" : "bg-[#E5E0D8] text-[#6B6B6B] text-[10px]"}>
                  {item.author.type === "agent" ? (
                    <Bot className="h-3 w-3" />
                  ) : (
                    item.author.name.charAt(0).toUpperCase()
                  )}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[#2C2C2C]">{item.author.name}</span>
                  <span className="text-[10px] text-[#9A9A9A]">{formatRelativeTime(item.createdAt, t)}</span>
                </div>
                <div className="mt-1 text-xs leading-relaxed text-[#2C2C2C]">
                  <ContentWithMentions>{item.content}</ContentWithMentions>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

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
            onChange={onCommentChange}
            onSubmit={onSubmit}
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
          onClick={onSubmit}
        >
          {isSubmitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#9A9A9A]" />
          ) : (
            <Send className="h-3.5 w-3.5 text-[#C67A52]" />
          )}
        </Button>
      </div>
    </div>
  );
}
