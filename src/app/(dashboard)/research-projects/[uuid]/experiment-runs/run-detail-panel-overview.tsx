"use client";

import { Bot, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { RunSessionInfo } from "@/services/session.service";
import type { ProposalSource } from "./[runUuid]/source-actions";
import { formatRelativeTime, type TaskDetail } from "./run-detail-panel-shared";

interface RunDetailOverviewProps {
  activeWorkers: RunSessionInfo[];
  projectUuid: string;
  source: ProposalSource | null;
  task: TaskDetail;
}

export function RunDetailOverview({
  activeWorkers,
  projectUuid,
  source,
  task,
}: RunDetailOverviewProps) {
  const t = useTranslations();

  return (
    <>
      <div>
        <label className="text-[11px] font-medium uppercase tracking-wide text-[#9A9A9A]">
          {t("common.assignee")}
        </label>
        <div className="mt-2 flex items-center gap-2.5 rounded-lg bg-[#FAF8F4] p-3">
          {task.assignee ? (
            <>
              <Avatar className="h-7 w-7">
                <AvatarFallback
                  className={
                    task.assignee.type === "agent"
                      ? "bg-[#C67A52] text-white"
                      : "bg-[#E5E0D8] text-[#6B6B6B]"
                  }
                >
                  {task.assignee.type === "agent" ? (
                    <Bot className="h-3.5 w-3.5" />
                  ) : (
                    task.assignee.name.charAt(0).toUpperCase()
                  )}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="text-sm font-medium text-[#2C2C2C]">{task.assignee.name}</div>
                <div className="text-xs text-[#6B6B6B]">
                  {task.assignee.type === "agent"
                    ? `${t("common.agent")} • ${
                        task.assignee.assignedAt
                          ? new Date(task.assignee.assignedAt).toLocaleDateString()
                          : ""
                      }`
                    : t("common.user")}
                </div>
              </div>
            </>
          ) : (
            <span className="text-sm text-[#9A9A9A]">{t("common.unassigned")}</span>
          )}
        </div>
      </div>

      {activeWorkers.length > 0 && (
        <div className="mt-5">
          <label className="text-[11px] font-medium uppercase tracking-wide text-[#9A9A9A]">
            {t("sessions.activeWorkers")}
          </label>
          <div className="mt-2 space-y-1.5">
            {activeWorkers.map((worker) => (
              <div
                key={worker.sessionUuid}
                className="flex items-center gap-2.5 rounded-lg bg-[#FAF8F4] p-2.5"
              >
                <div className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-[#2C2C2C]">
                    {worker.sessionName}
                  </div>
                  <div className="text-[10px] text-[#9A9A9A]">
                    {worker.agentName} · {formatRelativeTime(worker.checkinAt, t)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5">
        <label className="text-[11px] font-medium uppercase tracking-wide text-[#9A9A9A]">
          {t("common.description")}
        </label>
        <div className="mt-2">
          {task.description ? (
            <div className="prose prose-sm max-w-none text-[13px] leading-relaxed text-[#2C2C2C]">
              <Streamdown plugins={{ code }}>{task.description}</Streamdown>
            </div>
          ) : (
            <p className="text-sm italic text-[#9A9A9A]">{t("common.noDescription")}</p>
          )}
        </div>
      </div>

      {task.acceptanceCriteria &&
        !(task.acceptanceCriteriaItems && task.acceptanceCriteriaItems.length > 0) && (
          <div className="mt-5">
            <label className="text-[11px] font-medium uppercase tracking-wide text-[#9A9A9A]">
              {t("tasks.acceptanceCriteria")}
            </label>
            <div className="mt-2">
              <div className="prose prose-sm max-w-none text-[13px] leading-relaxed text-[#2C2C2C]">
                <Streamdown plugins={{ code }}>{task.acceptanceCriteria}</Streamdown>
              </div>
            </div>
          </div>
        )}

      {source && (
        <div className="mt-5">
          <label className="text-[11px] font-medium uppercase tracking-wide text-[#9A9A9A]">
            {t("common.source")}
          </label>
          <a
            href={`/research-projects/${projectUuid}/experiment-designs/${source.uuid}`}
            className="mt-2 flex items-center justify-between rounded-lg bg-[#FAF8F4] p-3 transition-colors hover:bg-[#F0EDE5]"
          >
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-[#C67A52]" />
              <span className="text-xs text-[#2C2C2C]">{source.title}</span>
            </div>
          </a>
        </div>
      )}
    </>
  );
}
