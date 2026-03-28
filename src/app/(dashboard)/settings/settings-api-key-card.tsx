"use client";

import { useTranslations } from "next-intl";
import {
  Activity,
  Check,
  ChevronDown,
  ChevronRight,
  Key,
  Pencil,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SessionResponse } from "@/services/session.service";
import type { ApiKey } from "./settings-shared";

interface SettingsApiKeyCardProps {
  apiKey: ApiKey;
  expanded: boolean;
  sessions?: SessionResponse[];
  loadingSessions: boolean;
  onCloseSession: (sessionUuid: string, agentUuid: string) => void;
  onDelete: (uuid: string) => void;
  onEdit: (apiKey: ApiKey) => void;
  onReopenSession: (sessionUuid: string, agentUuid: string) => void;
  onToggleSessions: (agentUuid: string) => void;
}

export function SettingsApiKeyCard({
  apiKey,
  expanded,
  sessions,
  loadingSessions,
  onCloseSession,
  onDelete,
  onEdit,
  onReopenSession,
  onToggleSessions,
}: SettingsApiKeyCardProps) {
  const t = useTranslations();
  const isAdmin = apiKey.roles.includes("pi_agent");

  return (
    <div
      className={`rounded-xl border p-5 ${
        isAdmin
          ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/50"
          : "border-border bg-card"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${
              isAdmin
                ? "bg-red-100 dark:bg-red-900"
                : apiKey.roles.includes("researcher_agent")
                  ? "bg-green-100"
                  : "bg-primary/10"
            }`}
          >
            {isAdmin ? (
              <ShieldAlert className="h-[18px] w-[18px] text-red-600 dark:text-red-400" />
            ) : (
              <Key
                className={`h-[18px] w-[18px] ${
                  apiKey.roles.includes("researcher_agent")
                    ? "text-green-600"
                    : "text-primary"
                }`}
              />
            )}
          </div>
          <div>
            <div className="text-sm font-medium text-foreground">
              {apiKey.name || `${apiKey.keyPrefix}...`}
            </div>
            <div className="text-xs text-muted-foreground">
              {apiKey.keyPrefix}... · {t("settings.created")}{" "}
              {new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(new Date(apiKey.createdAt))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(apiKey)}
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            {t("settings.editAgent")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(apiKey.uuid)}
            className="text-destructive hover:text-destructive"
          >
            {t("common.delete")}
          </Button>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <span className="text-xs text-muted-foreground">{t("settings.roles")}</span>
        {[
          { id: "researcher_agent", label: t("settings.developerAgent"), activeClass: "bg-primary", textClass: "text-foreground" },
          { id: "research_lead_agent", label: t("settings.pmAgent"), activeClass: "bg-primary", textClass: "text-foreground" },
          { id: "pi_agent", label: t("settings.adminAgent"), activeClass: "bg-red-500", textClass: "font-medium text-red-600 dark:text-red-400" },
        ].map((role) => (
          <div key={role.id} className="flex items-center gap-2">
            <div
              className={`flex h-[18px] w-[18px] items-center justify-center rounded ${
                apiKey.roles.includes(role.id)
                  ? role.activeClass
                  : role.id === "pi_agent"
                    ? "border-2 border-border"
                    : "border-2 border-border"
              }`}
            >
              {apiKey.roles.includes(role.id) && (
                <Check
                  className={`h-3 w-3 ${role.id === "pi_agent" ? "text-white" : "text-primary-foreground"}`}
                  strokeWidth={3}
                />
              )}
            </div>
            <span
              className={`text-xs ${
                apiKey.roles.includes(role.id) ? role.textClass : "text-muted-foreground"
              }`}
            >
              {role.label}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <button
          onClick={() => onToggleSessions(apiKey.agentUuid)}
          className="flex w-full items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          <Activity className="h-3.5 w-3.5" />
          <span>{t("sessions.title")}</span>
          {sessions && (
            <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">
              {sessions.filter((session) => session.status === "active").length}
            </Badge>
          )}
        </button>

        {expanded && (
          <div className="mt-2 space-y-2">
            {loadingSessions ? (
              <div className="py-2 text-xs text-muted-foreground">{t("common.loading")}</div>
            ) : !sessions?.length ? (
              <div className="py-2 text-xs italic text-muted-foreground">{t("sessions.noSessions")}</div>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.uuid}
                  className={`flex items-center justify-between rounded-lg p-2.5 text-xs ${
                    session.status === "closed"
                      ? "bg-muted/50 text-muted-foreground"
                      : "bg-secondary"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <div
                      className={`h-2 w-2 flex-shrink-0 rounded-full ${
                        session.status === "active"
                          ? "bg-green-500"
                          : session.status === "inactive"
                            ? "bg-yellow-500"
                            : "bg-gray-400"
                      }`}
                    />
                    <span className="truncate font-medium">{session.name}</span>
                    <Badge
                      variant="outline"
                      className={`h-4 px-1 text-[10px] ${
                        session.status === "active"
                          ? "border-green-300 text-green-700"
                          : session.status === "inactive"
                            ? "border-yellow-300 text-yellow-700"
                            : "border-gray-300 text-gray-500"
                      }`}
                    >
                      {t(`sessions.status${session.status.charAt(0).toUpperCase() + session.status.slice(1)}`)}
                    </Badge>
                    <span className="text-muted-foreground">
                      {t("sessions.checkins", { count: session.checkins.length })}
                    </span>
                  </div>
                  {session.status === "closed" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] text-green-600 hover:text-green-700"
                      onClick={() => onReopenSession(session.uuid, apiKey.agentUuid)}
                    >
                      {t("sessions.reopen")}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] text-destructive hover:text-destructive"
                      onClick={() => onCloseSession(session.uuid, apiKey.agentUuid)}
                    >
                      {t("sessions.close")}
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
