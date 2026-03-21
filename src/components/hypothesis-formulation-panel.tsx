"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, Check, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type {
  ElaborationResponse,
  ElaborationRoundResponse,
  ElaborationQuestionResponse,
  AnswerInput,
} from "@/types/elaboration";
import { submitElaborationAnswersAction } from "@/app/(dashboard)/projects/[uuid]/ideas/[ideaUuid]/elaboration-actions";

// Other option id prefix (when user picks "Other" and provides custom text)
const OTHER_OPTION_ID = "__other__";

// Category i18n key mapping
const categoryI18nKeys: Record<string, string> = {
  functional: "functional",
  non_functional: "nonFunctional",
  business_context: "businessContext",
  technical_context: "technicalContext",
  user_scenario: "userScenario",
  scope: "scope",
};

// Category background color mapping
const categoryBgColors: Record<string, string> = {
  functional: "bg-[#E8F5E9] text-[#2E7D32]",
  non_functional: "bg-[#E3F2FD] text-[#1565C0]",
  business_context: "bg-[#FFF3E0] text-[#E65100]",
  technical_context: "bg-[#F3E5F5] text-[#7B1FA2]",
  user_scenario: "bg-[#E0F2F1] text-[#00796B]",
  scope: "bg-[#FBE9E7] text-[#BF360C]",
};

interface ElaborationPanelProps {
  ideaUuid: string;
  elaboration: ElaborationResponse | null;
  onRefresh?: () => void;
}

export function ElaborationPanel({
  ideaUuid,
  elaboration,
  onRefresh,
}: ElaborationPanelProps) {
  const t = useTranslations("elaboration");
  const router = useRouter();

  if (!elaboration || elaboration.rounds.length === 0) {
    return null;
  }

  const { summary, rounds } = elaboration;

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-medium uppercase tracking-wide text-[#9A9A9A]">
          {t("title")}
        </label>
        <span className="text-xs font-medium text-[#C67A52]">
          {t("answeredCounter", {
            answered: summary.answeredQuestions,
            total: summary.totalQuestions,
          })}
        </span>
      </div>

      {/* Round cards */}
      <div className="space-y-2.5">
        {rounds.map((round) => (
          <RoundCard
            key={round.uuid}
            round={round}
            ideaUuid={ideaUuid}
            onAnswered={() => { onRefresh?.(); router.refresh(); }}
          />
        ))}
      </div>
    </div>
  );
}

// ===== Round Card =====

interface RoundCardProps {
  round: ElaborationRoundResponse;
  ideaUuid: string;
  onAnswered: () => void;
}

function RoundCard({ round, ideaUuid, onAnswered }: RoundCardProps) {
  const t = useTranslations("elaboration");
  const isPending = round.status === "pending_answers";
  const isValidated = round.status === "validated";
  const [isOpen, setIsOpen] = useState(isPending);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card
        className={`border-[#E5E0D8] overflow-hidden ${
          isPending ? "border-[#C67A52] border-[1.5px]" : ""
        }`}
      >
        {/* Collapsible header */}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#FAF8F4] transition-colors"
          >
            {/* Round number badge */}
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#C67A52] text-[11px] font-semibold text-white">
              {round.roundNumber}
            </span>

            {/* Label */}
            <span className="flex-1 text-sm font-medium text-[#2C2C2C]">
              {t("roundLabel", { number: round.roundNumber })}
            </span>

            {/* Status indicator */}
            {isValidated ? (
              <span className="flex items-center gap-1">
                <Check className="h-3.5 w-3.5 text-[#5A9E6F]" />
                <span className="text-[11px] font-medium text-[#5A9E6F]">
                  {t("validated")}
                </span>
              </span>
            ) : isPending ? (
              <Badge className="bg-[#FFF3E0] text-[#E65100] border-transparent text-[10px]">
                {t("pendingAnswers")}
              </Badge>
            ) : (
              <Badge className="bg-[#E3F2FD] text-[#1976D2] border-transparent text-[10px]">
                {t("statusAnswered")}
              </Badge>
            )}

            {/* Chevron */}
            <ChevronDown
              className={`h-4 w-4 text-[#9A9A9A] transition-transform ${
                isOpen ? "rotate-180" : ""
              }`}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-[#F5F2EC] px-4 py-3">
            {isPending ? (
              <PendingRoundContent
                round={round}
                ideaUuid={ideaUuid}
                onAnswered={onAnswered}
              />
            ) : (
              <AnsweredRoundContent round={round} />
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ===== Answered Round Content =====

interface AnsweredRoundContentProps {
  round: ElaborationRoundResponse;
}

function AnsweredRoundContent({ round }: AnsweredRoundContentProps) {
  const t = useTranslations("elaboration");

  return (
    <div className="space-y-3">
      {round.questions.map((question) => (
        <AnsweredQuestion key={question.uuid} question={question} t={t} />
      ))}
    </div>
  );
}

function AnsweredQuestion({
  question,
  t,
}: {
  question: ElaborationQuestionResponse;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  const selectedOption = question.answer?.selectedOptionId
    ? question.options.find((o) => o.id === question.answer?.selectedOptionId)
    : null;
  const categoryKey = categoryI18nKeys[question.category] || question.category;
  const categoryBg =
    categoryBgColors[question.category] || "bg-[#F5F5F5] text-[#6B6B6B]";

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-2">
        {/* Filled terracotta radio indicator */}
        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-[#C67A52]">
          <span className="h-2 w-2 rounded-full bg-[#C67A52]" />
        </span>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-[13px] leading-snug text-[#2C2C2C]">
              {question.text}
            </p>
            <Badge
              className={`shrink-0 border-transparent text-[9px] px-1.5 py-0 ${categoryBg}`}
            >
              {t(`category.${categoryKey}`)}
            </Badge>
          </div>
          {/* Answer text */}
          <p className="text-[12px] text-[#6B6B6B]">
            {question.answer?.customText
              ? question.answer.customText
              : selectedOption?.label || t("noAnswer")}
          </p>
        </div>
      </div>
    </div>
  );
}

// ===== Pending Round Content (interactive) =====

interface PendingRoundContentProps {
  round: ElaborationRoundResponse;
  ideaUuid: string;
  onAnswered: () => void;
}

function PendingRoundContent({
  round,
  ideaUuid,
  onAnswered,
}: PendingRoundContentProps) {
  const t = useTranslations("elaboration");
  const [answers, setAnswers] = useState<Record<string, AnswerInput>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOptionChange = useCallback(
    (questionId: string, optionId: string) => {
      setAnswers((prev) => ({
        ...prev,
        [questionId]: {
          questionId,
          selectedOptionId: optionId === OTHER_OPTION_ID ? null : optionId,
          customText:
            optionId === OTHER_OPTION_ID
              ? prev[questionId]?.customText || ""
              : null,
        },
      }));
    },
    []
  );

  const handleCustomTextChange = useCallback(
    (questionId: string, text: string) => {
      setAnswers((prev) => ({
        ...prev,
        [questionId]: {
          ...prev[questionId],
          questionId,
          selectedOptionId: null,
          customText: text,
        },
      }));
    },
    []
  );

  const getSelectedValue = (questionId: string): string => {
    const answer = answers[questionId];
    if (!answer) return "";
    if (
      answer.selectedOptionId === null &&
      answer.customText !== null &&
      answer.customText !== undefined
    ) {
      return OTHER_OPTION_ID;
    }
    return answer.selectedOptionId || "";
  };

  const allRequiredAnswered = round.questions
    .filter((q) => q.required)
    .every((q) => {
      const answer = answers[q.questionId];
      if (!answer) return false;
      if (answer.selectedOptionId) return true;
      if (answer.customText && answer.customText.trim()) return true;
      return false;
    });

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    const answerList: AnswerInput[] = Object.values(answers);
    const result = await submitElaborationAnswersAction(
      ideaUuid,
      round.uuid,
      answerList
    );

    setIsSubmitting(false);

    if (result.success) {
      onAnswered();
    } else {
      setError(result.error || t("submitFailed"));
    }
  };

  return (
    <div className="space-y-4">
      {round.questions.map((question) => {
        const categoryKey =
          categoryI18nKeys[question.category] || question.category;
        const categoryBg =
          categoryBgColors[question.category] || "bg-[#F5F5F5] text-[#6B6B6B]";
        const selectedValue = getSelectedValue(question.questionId);
        const isOtherSelected = selectedValue === OTHER_OPTION_ID;

        return (
          <div key={question.uuid} className="space-y-2">
            {/* Question text + category */}
            <div className="flex items-start gap-2">
              <p className="flex-1 text-[13px] font-medium leading-snug text-[#2C2C2C]">
                {question.text}
                {question.required && (
                  <span className="ml-0.5 text-[#C67A52]">*</span>
                )}
              </p>
              <Badge
                className={`shrink-0 border-transparent text-[9px] px-1.5 py-0 ${categoryBg}`}
              >
                {t(`category.${categoryKey}`)}
              </Badge>
            </div>

            {/* Radio options */}
            <RadioGroup
              value={selectedValue}
              onValueChange={(value) =>
                handleOptionChange(question.questionId, value)
              }
              className="gap-2 pl-1"
            >
              {question.options.map((option) => (
                <div key={option.id} className="flex items-start gap-2">
                  <RadioGroupItem
                    value={option.id}
                    id={`${question.uuid}-${option.id}`}
                    className="mt-0.5 border-[#C67A52] text-[#C67A52] data-[state=checked]:border-[#C67A52]"
                  />
                  <Label
                    htmlFor={`${question.uuid}-${option.id}`}
                    className="text-[12px] leading-snug text-[#2C2C2C] font-normal cursor-pointer"
                  >
                    {option.label}
                    {option.description && (
                      <span className="block text-[11px] text-[#6B6B6B]">
                        {option.description}
                      </span>
                    )}
                  </Label>
                </div>
              ))}
              {/* Other option */}
              <div className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <RadioGroupItem
                    value={OTHER_OPTION_ID}
                    id={`${question.uuid}-other`}
                    className="mt-0.5 border-[#C67A52] text-[#C67A52] data-[state=checked]:border-[#C67A52]"
                  />
                  <Label
                    htmlFor={`${question.uuid}-other`}
                    className="text-[12px] leading-snug text-[#2C2C2C] font-normal cursor-pointer"
                  >
                    {t("otherOption")}
                  </Label>
                </div>
                {isOtherSelected && (
                  <Input
                    value={answers[question.questionId]?.customText || ""}
                    onChange={(e) =>
                      handleCustomTextChange(
                        question.questionId,
                        e.target.value
                      )
                    }
                    placeholder={t("otherPlaceholder")}
                    className="ml-6 h-8 max-w-sm border-[#E5E0D8] text-[12px] focus-visible:ring-[#C67A52]"
                    autoFocus
                  />
                )}
              </div>
            </RadioGroup>
          </div>
        );
      })}

      {/* Error message */}
      {error && (
        <div className="rounded-lg bg-destructive/10 p-2.5 text-[12px] text-destructive">
          {error}
        </div>
      )}

      {/* Submit button */}
      <div className="flex justify-end pt-1">
        <Button
          onClick={handleSubmit}
          disabled={!allRequiredAnswered || isSubmitting}
          className="bg-[#C67A52] hover:bg-[#B56A42] text-white text-[13px]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              {t("submitting")}
            </>
          ) : (
            t("submitAnswers")
          )}
        </Button>
      </div>
    </div>
  );
}
