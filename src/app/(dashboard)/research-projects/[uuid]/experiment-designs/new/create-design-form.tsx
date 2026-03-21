"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { createExperimentDesignAction } from "../actions";

interface Idea {
  uuid: string;
  title: string;
  status: string;
  assignee: { uuid: string; name: string } | null;
}

interface CreateProposalFormProps {
  projectUuid: string;
  availableIdeas: Idea[];
  preselectedIdeaUuid?: string;
}

export function CreateProposalForm({
  projectUuid,
  availableIdeas,
  preselectedIdeaUuid,
}: CreateProposalFormProps) {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedIdeaUuids, setSelectedIdeaUuids] = useState<string[]>(
    preselectedIdeaUuid ? [preselectedIdeaUuid] : []
  );
  const [error, setError] = useState<string | null>(null);

  const toggleIdeaSelection = (uuid: string) => {
    setSelectedIdeaUuids((prev) =>
      prev.includes(uuid)
        ? prev.filter((id) => id !== uuid)
        : [...prev, uuid]
    );
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      setError(t("proposals.titleRequired"));
      return;
    }
    if (selectedIdeaUuids.length === 0) {
      setError(t("proposals.selectAtLeastOneIdea"));
      return;
    }

    setError(null);

    startTransition(async () => {
      const result = await createExperimentDesignAction(projectUuid, {
        title: title.trim(),
        description: description.trim() || undefined,
        inputType: "research_question",
        inputUuids: selectedIdeaUuids,
      });

      if (result.success && result.proposal) {
        router.push(`/research-projects/${projectUuid}/experiment-designs/${result.proposal.uuid}`);
      } else {
        setError(result.error || t("proposals.createFailed"));
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <Card className="border-[#E5E0D8] p-6">
        <h2 className="mb-4 text-lg font-medium text-[#2C2C2C]">
          {t("proposals.basicInfo")}
        </h2>
        <div className="space-y-4">
          <div>
            <Label className="mb-2 block text-[#6B6B6B]">
              {t("proposals.title")} *
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("proposals.titlePlaceholder")}
              className="border-[#E5E0D8]"
            />
          </div>
          <div>
            <Label className="mb-2 block text-[#6B6B6B]">
              {t("common.description")}
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("proposals.descriptionPlaceholder")}
              className="h-24 resize-none border-[#E5E0D8]"
            />
          </div>
        </div>
      </Card>

      {/* Source Ideas */}
      <Card className="border-[#E5E0D8] p-6">
        <h2 className="mb-4 text-lg font-medium text-[#2C2C2C]">
          {t("proposals.selectSourceIdeas")} *
        </h2>
        {availableIdeas.length === 0 ? (
          <p className="text-sm text-[#9A9A9A]">{t("proposals.noAvailableIdeas")}</p>
        ) : (
          <div className="space-y-2">
            {availableIdeas.map((idea) => (
              <div
                key={idea.uuid}
                onClick={() => toggleIdeaSelection(idea.uuid)}
                className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors ${
                  selectedIdeaUuids.includes(idea.uuid)
                    ? "border-[#C67A52] bg-[#FFFBF8]"
                    : "border-[#E5E0D8] hover:border-[#C67A52]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded border ${
                      selectedIdeaUuids.includes(idea.uuid)
                        ? "border-[#C67A52] bg-[#C67A52] text-white"
                        : "border-[#E5E0D8]"
                    }`}
                  >
                    {selectedIdeaUuids.includes(idea.uuid) && (
                      <Check className="h-3 w-3" strokeWidth={3} />
                    )}
                  </div>
                  <span className="font-medium text-[#2C2C2C]">{idea.title}</span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {idea.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Error Message */}
      {error && (
        <div className="rounded-lg bg-[#FFEBEE] p-3 text-sm text-[#D32F2F]">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
          className="border-[#E5E0D8]"
        >
          {t("common.cancel")}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isPending}
          className="bg-[#C67A52] hover:bg-[#B56A42] text-white"
        >
          {isPending ? t("common.creating") : t("proposals.createAndEdit")}
        </Button>
      </div>
    </div>
  );
}
