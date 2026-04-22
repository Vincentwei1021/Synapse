"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Bot, Loader2, Send, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { MentionEditor, type MentionEditorRef } from "@/components/mention-editor";
import { ContentWithMentions } from "@/components/mention-renderer";
import { useRealtimeEntityEvent } from "@/contexts/realtime-context";
import type { CommentResponse } from "@/services/comment.service";

function formatRelativeTime(dateString: string, t: ReturnType<typeof useTranslations>) {
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

export function ExperimentComments({
  experimentUuid,
  currentActorType,
}: {
  experimentUuid: string;
  currentActorType: "user" | "agent";
}) {
  const t = useTranslations();
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<CommentResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const editorRef = useRef<MentionEditorRef>(null);

  const loadComments = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/comments?targetType=experiment&targetUuid=${encodeURIComponent(experimentUuid)}&pageSize=100`
      );
      const data = await response.json();
      if (response.ok) {
        setComments(data.data ?? []);
      } else {
        setComments([]);
      }
    } catch {
      setComments([]);
    } finally {
      setIsLoading(false);
    }
  }, [experimentUuid]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  useRealtimeEntityEvent("experiment", experimentUuid, () => {
    void loadComments();
  });

  async function handleSubmit() {
    if (!comment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: "experiment",
          targetUuid: experimentUuid,
          content: comment.trim(),
        }),
      });
      const data = await response.json();
      if (response.ok && data.data) {
        setComments((prev) => [...prev, data.data as CommentResponse]);
        setComment("");
        editorRef.current?.clear();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{t("comments.title")}</h3>
      <Card className="rounded-2xl border-border bg-card p-4 shadow-none">
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">{t("comments.noComments")}</p>
          ) : (
            <div className="space-y-4">
              {comments.map((item) => (
                <div key={item.uuid} className="flex gap-3">
                  <Avatar className="mt-0.5 h-7 w-7 shrink-0">
                    <AvatarFallback className={item.author.type === "agent" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground text-[10px]"}>
                      {item.author.type === "agent" ? <Bot className="h-3.5 w-3.5" /> : item.author.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground">{item.author.name}</span>
                      <span className="text-[11px] text-muted-foreground">{formatRelativeTime(item.createdAt, t)}</span>
                    </div>
                    <div className="mt-1 text-sm leading-6 text-muted-foreground">
                      <ContentWithMentions>{item.content}</ContentWithMentions>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Separator />

          <div className="flex items-start gap-3">
            <Avatar className="mt-1 h-7 w-7">
              <AvatarFallback className="bg-primary text-primary-foreground text-[10px]">
                {currentActorType === "agent" ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <MentionEditor
                ref={editorRef}
                value={comment}
                onChange={setComment}
                onSubmit={handleSubmit}
                placeholder={t("comments.addComment")}
                className="border-none bg-secondary/60 text-sm"
                disabled={isSubmitting}
              />
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="mt-1 h-8 w-8 shrink-0"
              disabled={!comment.trim() || isSubmitting}
              onClick={() => {
                void handleSubmit();
              }}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <Send className="h-4 w-4 text-primary" />
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
