"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, CornerUpLeft, FlaskConical, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useRealtimeRefresh } from "@/contexts/realtime-context";
import type { ResearchQuestionResponse } from "@/services/research-question.service";
import {
  reviewResearchQuestionAction,
  setResearchQuestionStatusAction,
} from "./actions";

const columns = [
  { id: "open", labelKey: "open" },
  { id: "elaborating", labelKey: "elaborating" },
  { id: "experiment_created", labelKey: "experimentCreated" },
  { id: "completed", labelKey: "completed" },
] as const;

export function ResearchQuestionsBoard({
  projectUuid,
  researchQuestions,
}: {
  projectUuid: string;
  researchQuestions: ResearchQuestionResponse[];
}) {
  const t = useTranslations();
  const [isPending, startTransition] = useTransition();
  useRealtimeRefresh();

  const grouped = Object.fromEntries(
    columns.map((column) => [
      column.id,
      researchQuestions.filter((question) => question.status === column.id),
    ]),
  ) as Record<(typeof columns)[number]["id"], ResearchQuestionResponse[]>;

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((column) => (
        <section
          key={column.id}
          className="flex w-[320px] flex-shrink-0 flex-col rounded-3xl bg-[#F7F2EB] p-4"
        >
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[#2C2C2C]">{t(`ideas.columns.${column.labelKey}`)}</h2>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs text-[#6B6B6B]">
              {grouped[column.id].length}
            </span>
          </div>

          <div className="space-y-3">
            {grouped[column.id].length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#DCCFBE] bg-white/70 px-4 py-6 text-center text-sm text-[#9A8F81]">
                {t("ideas.emptyColumn")}
              </div>
            ) : (
              grouped[column.id].map((question) => (
                <Card key={question.uuid} className="space-y-3 rounded-2xl border-[#E5DED3] p-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-[#2C2C2C]">{question.title}</h3>
                      <Badge variant="outline" className="border-[#E8DDCF] bg-[#FBF8F3] text-[#7B7063]">
                        {question.sourceType === "agent" ? t("ideas.agentGenerated") : t("ideas.humanCreated")}
                      </Badge>
                    </div>
                    {question.content ? (
                      <p className="line-clamp-4 text-xs leading-5 text-[#6B6B6B]">{question.content}</p>
                    ) : null}
                  </div>

                  <div className="space-y-1 text-xs text-[#7C7368]">
                    <p>
                      {t("ideas.card.review")}:{" "}
                      {question.reviewStatus === "pending"
                        ? t("ideas.pendingReview")
                        : question.reviewStatus === "accepted"
                          ? t("ideas.accepted")
                          : t("ideas.rejected")}
                    </p>
                    <p>
                      {t("common.assignee")}: {question.assignee?.name || t("common.unassigned")}
                    </p>
                  </div>

                  {question.reviewStatus === "pending" ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        className="bg-[#C67A52] text-white hover:bg-[#B56A42]"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(() => {
                            void reviewResearchQuestionAction({
                              projectUuid,
                              questionUuid: question.uuid,
                              reviewStatus: "accepted",
                            });
                          })
                        }
                      >
                        <Check className="mr-2 h-4 w-4" />
                        {t("common.approve")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(() => {
                            void reviewResearchQuestionAction({
                              projectUuid,
                              questionUuid: question.uuid,
                              reviewStatus: "rejected",
                            });
                          })
                        }
                      >
                        {t("common.reject")}
                      </Button>
                    </div>
                  ) : null}

                  {question.reviewStatus === "accepted" && question.status === "open" ? (
                    <Button
                      size="sm"
                      className="w-full bg-[#C67A52] text-white hover:bg-[#B56A42]"
                      disabled={isPending}
                      onClick={() =>
                        startTransition(() => {
                          void setResearchQuestionStatusAction({
                            projectUuid,
                            questionUuid: question.uuid,
                            status: "elaborating",
                          });
                        })
                      }
                    >
                      <PlayCircle className="mr-2 h-4 w-4" />
                      {t("ideas.actions.startElaboration")}
                    </Button>
                  ) : null}

                  {question.reviewStatus === "accepted" && question.status === "elaborating" ? (
                    <Button
                      size="sm"
                      className="w-full bg-[#2F7D5D] text-white hover:bg-[#27674d]"
                      disabled={isPending}
                      onClick={() =>
                        startTransition(() => {
                          void setResearchQuestionStatusAction({
                            projectUuid,
                            questionUuid: question.uuid,
                            status: "experiment_created",
                          });
                        })
                      }
                    >
                      <FlaskConical className="mr-2 h-4 w-4" />
                      {t("ideas.actions.markExperimentCreated")}
                    </Button>
                  ) : null}

                  {question.reviewStatus === "accepted" && question.status === "experiment_created" ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(() => {
                            void setResearchQuestionStatusAction({
                              projectUuid,
                              questionUuid: question.uuid,
                              status: "elaborating",
                            });
                          })
                        }
                      >
                        <CornerUpLeft className="mr-2 h-4 w-4" />
                        {t("ideas.actions.backToElaboration")}
                      </Button>
                      <Button
                        size="sm"
                        className="bg-[#2F7D5D] text-white hover:bg-[#27674d]"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(() => {
                            void setResearchQuestionStatusAction({
                              projectUuid,
                              questionUuid: question.uuid,
                              status: "completed",
                            });
                          })
                        }
                      >
                        <Check className="mr-2 h-4 w-4" />
                        {t("ideas.actions.markCompleted")}
                      </Button>
                    </div>
                  ) : null}
                </Card>
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
