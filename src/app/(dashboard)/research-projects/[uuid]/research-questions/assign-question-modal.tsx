"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { X, Bot, User, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  claimIdeaAction,
  claimIdeaToAgentAction,
  claimIdeaToUserAction,
  releaseIdeaAction,
  getPmAgentsAction,
} from "./[ideaUuid]/actions";

interface Idea {
  uuid: string;
  title: string;
  content: string | null;
  status: string;
  assignee: {
    type: string;
    uuid: string;
    name: string;
  } | null;
}

interface Agent {
  uuid: string;
  name: string;
  roles: string[];
  ownerUuid: string | null;
}

interface CompanyUser {
  uuid: string;
  name: string | null;
  email: string | null;
}

interface AssignIdeaModalProps {
  idea: Idea;
  projectUuid: string;
  currentUserUuid: string;
  onClose: () => void;
}

type AssignOption = "self" | "agent" | "user" | "release";

export function AssignIdeaModal({
  idea,
  projectUuid,
  currentUserUuid,
  onClose,
}: AssignIdeaModalProps) {
  const t = useTranslations();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedOption, setSelectedOption] = useState<AssignOption>("self");
  const [selectedAgentUuid, setSelectedAgentUuid] = useState<string>("");
  const [selectedUserUuid, setSelectedUserUuid] = useState<string>("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const isAssigned = !!idea.assignee;

  // Load PM agents and users
  useEffect(() => {
    async function loadData() {
      setIsLoadingData(true);
      const result = await getPmAgentsAction();
      setAgents(result.agents || []);
      setUsers((result.users || []).filter((u: CompanyUser) => u.uuid !== currentUserUuid));
      setIsLoadingData(false);
    }
    loadData();
  }, [currentUserUuid]);

  const handleSubmit = async () => {
    setIsLoading(true);
    let result;

    if (selectedOption === "self") {
      result = await claimIdeaAction(idea.uuid);
    } else if (selectedOption === "agent" && selectedAgentUuid) {
      result = await claimIdeaToAgentAction(idea.uuid, selectedAgentUuid);
    } else if (selectedOption === "user" && selectedUserUuid) {
      result = await claimIdeaToUserAction(idea.uuid, selectedUserUuid);
    } else if (selectedOption === "release") {
      result = await releaseIdeaAction(idea.uuid);
    } else {
      setIsLoading(false);
      return;
    }

    setIsLoading(false);
    if (result?.success) {
      router.refresh();
      onClose();
    }
  };

  const canSubmit =
    selectedOption === "self" ||
    (selectedOption === "agent" && selectedAgentUuid) ||
    (selectedOption === "user" && selectedUserUuid) ||
    (selectedOption === "release" && isAssigned);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 z-50 w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-xl border border-[#E5E0D8]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E5E0D8] px-6 py-5">
          <h2 className="text-base font-semibold text-[#2C2C2C]">
            {t("ideas.assignIdea")}
          </h2>
          <button
            onClick={onClose}
            className="text-[#9A9A9A] hover:text-[#6B6B6B] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Idea Info */}
          <div className="rounded-lg bg-[#FAF8F4] p-3">
            <p className="text-[13px] font-medium text-[#2C2C2C]">{idea.title}</p>
            {idea.content && (
              <p className="mt-1 text-[11px] text-[#6B6B6B] line-clamp-2">
                {idea.content}
              </p>
            )}
          </div>

          {/* Current Assignee (if assigned) */}
          {isAssigned && (
            <div className="rounded-lg bg-[#E3F2FD] p-3">
              <p className="text-xs text-[#1976D2]">
                {t("common.currentAssignee")}: <span className="font-medium">{idea.assignee?.name}</span>
              </p>
            </div>
          )}

          <p className="text-[13px] text-[#6B6B6B]">
            {t("ideas.selectIdeaAssignee")}
          </p>

          {isLoadingData ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[#9A9A9A]" />
            </div>
          ) : (
            <RadioGroup
              value={selectedOption}
              onValueChange={(value) => setSelectedOption(value as AssignOption)}
              className="space-y-3"
            >
              {/* Option 1: Assign to myself */}
              <div
                className={`rounded-[10px] p-4 transition-colors cursor-pointer ${
                  selectedOption === "self"
                    ? "bg-[#FDF8F6] border-2 border-[#C67A52]"
                    : "bg-white border border-[#E5E0D8] hover:border-[#C67A52]/50"
                }`}
                onClick={() => setSelectedOption("self")}
              >
                <div className="flex items-center gap-2.5">
                  <RadioGroupItem value="self" id="idea-self" className="border-[#C67A52] text-[#C67A52]" />
                  <Label htmlFor="idea-self" className="text-sm font-medium text-[#2C2C2C] cursor-pointer">
                    {t("assign.assignToMyself")}
                  </Label>
                </div>
                <p className="mt-2 ml-6 text-xs text-[#6B6B6B] leading-relaxed">
                  {t("ideas.assignToMyselfIdeaDesc")}
                </p>
              </div>

              {/* Option 2: Assign to specific PM Agent */}
              <div
                className={`rounded-[10px] p-4 transition-colors ${
                  selectedOption === "agent"
                    ? "bg-[#FDF8F6] border-2 border-[#C67A52]"
                    : "bg-white border border-[#E5E0D8]"
                }`}
              >
                <div
                  className="flex items-center gap-2.5 cursor-pointer"
                  onClick={() => setSelectedOption("agent")}
                >
                  <RadioGroupItem value="agent" id="idea-agent" className="border-[#C67A52] text-[#C67A52]" />
                  <Label htmlFor="idea-agent" className="text-sm font-medium text-[#2C2C2C] cursor-pointer">
                    {t("ideas.orAssignToPmAgent")}
                  </Label>
                </div>
                <p className="mt-2 ml-6 text-xs text-[#6B6B6B] leading-relaxed">
                  {t("ideas.onlySelectedPmAgentCanWork")}
                </p>

                {selectedOption === "agent" && (
                  <div className="mt-3 ml-6">
                    <Select
                      value={selectedAgentUuid}
                      onValueChange={setSelectedAgentUuid}
                    >
                      <SelectTrigger className="w-full border-[#E5E0D8]">
                        <SelectValue placeholder={t("ideas.selectPmAgent")} />
                      </SelectTrigger>
                      <SelectContent>
                        {agents.length > 0 ? (
                          agents.map((agent) => (
                            <SelectItem key={agent.uuid} value={agent.uuid}>
                              <div className="flex items-center gap-2">
                                <Bot className="h-4 w-4 text-[#C67A52]" />
                                <span>{agent.name}</span>
                              </div>
                            </SelectItem>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-xs text-[#9A9A9A]">
                            {t("ideas.noPmAgentsAvailable")}
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Option 3: Assign to another user */}
              <div
                className={`rounded-[10px] p-4 transition-colors ${
                  selectedOption === "user"
                    ? "bg-[#FDF8F6] border-2 border-[#C67A52]"
                    : "bg-white border border-[#E5E0D8]"
                }`}
              >
                <div
                  className="flex items-center gap-2.5 cursor-pointer"
                  onClick={() => setSelectedOption("user")}
                >
                  <RadioGroupItem value="user" id="idea-user" className="border-[#C67A52] text-[#C67A52]" />
                  <Label htmlFor="idea-user" className="text-sm font-medium text-[#2C2C2C] cursor-pointer">
                    {t("assign.orAssignToUser")}
                  </Label>
                </div>

                {selectedOption === "user" && (
                  <div className="mt-3 ml-6">
                    <Select
                      value={selectedUserUuid}
                      onValueChange={setSelectedUserUuid}
                    >
                      <SelectTrigger className="w-full border-[#E5E0D8]">
                        <SelectValue placeholder={t("tasks.selectUser")} />
                      </SelectTrigger>
                      <SelectContent>
                        {users.length > 0 ? (
                          users.map((user) => (
                            <SelectItem key={user.uuid} value={user.uuid}>
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-[#6B6B6B]" />
                                <span>{user.name || user.email}</span>
                              </div>
                            </SelectItem>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-xs text-[#9A9A9A]">
                            {t("tasks.noUsersAvailable")}
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Option 4: Release (Clear Assignee) */}
              {isAssigned && (
                <div
                  className={`rounded-[10px] p-4 transition-colors cursor-pointer ${
                    selectedOption === "release"
                      ? "bg-[#FDF8F6] border-2 border-[#C67A52]"
                      : "bg-white border border-[#E5E0D8] hover:border-[#C67A52]/50"
                  }`}
                  onClick={() => setSelectedOption("release")}
                >
                  <div className="flex items-center gap-2.5">
                    <RadioGroupItem value="release" id="idea-release" className="border-[#C67A52] text-[#C67A52]" />
                    <Label htmlFor="idea-release" className="text-sm font-medium text-[#2C2C2C] cursor-pointer">
                      {t("assign.releaseAssignee")}
                    </Label>
                  </div>
                  <p className="mt-2 ml-6 text-xs text-[#6B6B6B] leading-relaxed">
                    {t("ideas.releaseIdeaAssigneeDesc")}
                  </p>
                </div>
              )}
            </RadioGroup>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-4 rounded-b-2xl bg-white px-6 py-6 border-t border-[#E5E0D8]">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="border-[#E5E0D8]"
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !canSubmit}
            className="bg-[#C67A52] hover:bg-[#B56A42] text-white"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : selectedOption === "release" ? (
              t("common.release")
            ) : (
              t("common.assign")
            )}
          </Button>
        </div>
      </div>
    </>
  );
}
