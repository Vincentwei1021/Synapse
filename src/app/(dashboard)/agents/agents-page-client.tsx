"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Activity,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Key,
  Plus,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  createAgentAndKeyAction,
  updateAgentAction,
  getApiKeysAction,
  deleteApiKeyAction,
  getAgentSessionsAction,
  closeSessionAction,
  reopenSessionAction,
} from "@/app/(dashboard)/settings/actions";
import { useLocale } from "@/contexts/locale-context";
import type { SessionResponse } from "@/services/session.service";
import { formatAgentApiKeyCreatedAt } from "./agents-page-client.helpers";

// ── Types ──────────────────────────────────────────────────────────────────────

interface AgentSummary {
  uuid: string;
  name: string;
  roles: string[];
  persona: string | null;
  ownerUuid: string | null;
  lastActiveAt: Date | null;
  createdAt: Date;
  _count: { apiKeys: number };
}

interface ApiKeyEntry {
  uuid: string;
  keyPrefix: string;
  name: string | null;
  lastUsed: string | null;
  expiresAt: string | null;
  createdAt: string;
  roles: string[];
  agentUuid: string;
  persona: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const ROLES = ["pre_research", "research", "experiment", "report"] as const;
type Role = (typeof ROLES)[number];

const ROLE_BADGE_CLASSES: Record<string, string> = {
  pre_research:
    "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  research:
    "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  experiment:
    "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  report:
    "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  // Legacy
  researcher_agent: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  researcher: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  research_lead_agent: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  research_lead: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  pi_agent: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  pi: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
};

const ROLE_I18N_KEY: Record<string, string> = {
  pre_research: "agents.permissions.preResearch",
  research: "agents.permissions.research",
  experiment: "agents.permissions.experiment",
  report: "agents.permissions.report",
  // Legacy role compatibility
  researcher_agent: "agents.permissions.experiment",
  researcher: "agents.permissions.experiment",
  research_lead_agent: "agents.permissions.research",
  research_lead: "agents.permissions.research",
  pi_agent: "agents.permissions.report",
  pi: "agents.permissions.report",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatRelativeTime(date: Date | string | null, t: ReturnType<typeof useTranslations>): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("agents.time.justNow");
  if (mins < 60) return t("agents.time.minsAgo", { mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("agents.time.hoursAgo", { hours });
  const days = Math.floor(hours / 24);
  return t("agents.time.daysAgo", { days });
}

// ── Component ──────────────────────────────────────────────────────────────────

export function AgentsPageClient({
  initialAgents,
}: {
  initialAgents: AgentSummary[];
}) {
  const t = useTranslations();
  const { locale } = useLocale();

  // Agent list
  const [agents, setAgents] = useState<AgentSummary[]>(initialAgents);

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createRoles, setCreateRoles] = useState<string[]>([]);
  const [createPersona, setCreatePersona] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Detail sheet
  const [selectedAgent, setSelectedAgent] = useState<AgentSummary | null>(null);
  const [editName, setEditName] = useState("");
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [editPersona, setEditPersona] = useState("");
  const [saving, setSaving] = useState(false);

  // API keys for detail panel
  const [agentApiKeys, setAgentApiKeys] = useState<ApiKeyEntry[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);

  // Sessions for detail panel
  const [agentSessions, setAgentSessions] = useState<SessionResponse[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionsExpanded, setSessionsExpanded] = useState(false);

  // Delete confirmation
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null);

  // ── Load detail data when an agent is selected ─────────────────────────

  useEffect(() => {
    if (!selectedAgent) {
      setAgentApiKeys([]);
      setAgentSessions([]);
      setSessionsExpanded(false);
      return;
    }

    setEditName(selectedAgent.name);
    // Filter out legacy roles — only keep values in ROLES
    setEditRoles(selectedAgent.roles.filter((r) => (ROLES as readonly string[]).includes(r)));
    setEditPersona(selectedAgent.persona || "");

    // Fetch API keys
    setLoadingKeys(true);
    getApiKeysAction().then((result) => {
      if (result.success && result.data) {
        setAgentApiKeys(
          result.data.filter((k) => k.agentUuid === selectedAgent.uuid),
        );
      }
      setLoadingKeys(false);
    });
  }, [selectedAgent]);

  const loadSessions = async (agentUuid: string) => {
    setLoadingSessions(true);
    const result = await getAgentSessionsAction(agentUuid);
    if (result.success && result.data) {
      setAgentSessions(result.data);
    }
    setLoadingSessions(false);
  };

  // ── Create ─────────────────────────────────────────────────────────────

  const toggleCreateRole = (role: string) => {
    setCreateRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim() || createRoles.length === 0) return;

    setSubmitting(true);
    try {
      const result = await createAgentAndKeyAction({
        name: createName.trim(),
        roles: createRoles,
        persona: createPersona.trim() || null,
      });

      if (result.success && result.key) {
        setCreatedKey(result.key);
        // Refresh agent list via server action data (lightweight approach)
        const res = await fetch("/api/agents?take=100");
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data?.data) {
            setAgents(
              json.data.data.map((a: Record<string, unknown>) => ({
                ...a,
                lastActiveAt: a.lastActiveAt
                  ? new Date(a.lastActiveAt as string)
                  : null,
                createdAt: new Date(a.createdAt as string),
                _count: { apiKeys: a.apiKeyCount as number },
              })),
            );
          }
        }
      }
    } catch (error) {
      console.error("Failed to create agent:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const resetCreate = () => {
    setCreateName("");
    setCreateRoles([]);
    setCreatePersona("");
    setCreatedKey(null);
    setCopied(false);
  };

  const closeCreate = () => {
    setShowCreate(false);
    resetCreate();
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  // ── Update ─────────────────────────────────────────────────────────────

  const toggleEditRole = (role: string) => {
    setEditRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  const handleUpdate = async () => {
    if (!selectedAgent || !editName.trim() || editRoles.length === 0) return;

    setSaving(true);
    try {
      const result = await updateAgentAction({
        agentUuid: selectedAgent.uuid,
        name: editName.trim(),
        roles: editRoles,
        persona: editPersona.trim() || null,
      });

      if (result.success) {
        setAgents((prev) =>
          prev.map((a) =>
            a.uuid === selectedAgent.uuid
              ? {
                  ...a,
                  name: editName.trim(),
                  roles: editRoles,
                  persona: editPersona.trim() || null,
                }
              : a,
          ),
        );
        setSelectedAgent((prev) =>
          prev
            ? {
                ...prev,
                name: editName.trim(),
                roles: editRoles,
                persona: editPersona.trim() || null,
              }
            : null,
        );
      }
    } catch (error) {
      console.error("Failed to update agent:", error);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete key ─────────────────────────────────────────────────────────

  const handleDeleteKey = async () => {
    if (!keyToDelete) return;
    try {
      const result = await deleteApiKeyAction(keyToDelete);
      if (result.success) {
        setAgentApiKeys((prev) => prev.filter((k) => k.uuid !== keyToDelete));
      }
    } catch (error) {
      console.error("Failed to delete API key:", error);
    } finally {
      setDeleteConfirmOpen(false);
      setKeyToDelete(null);
    }
  };

  // ── Session actions ────────────────────────────────────────────────────

  const handleCloseSession = async (sessionUuid: string) => {
    const result = await closeSessionAction(sessionUuid);
    if (result.success) {
      setAgentSessions((prev) =>
        prev.map((s) =>
          s.uuid === sessionUuid ? { ...s, status: "closed" } : s,
        ),
      );
    }
  };

  const handleReopenSession = async (sessionUuid: string) => {
    const result = await reopenSessionAction(sessionUuid);
    if (result.success) {
      setAgentSessions((prev) =>
        prev.map((s) =>
          s.uuid === sessionUuid
            ? { ...s, status: "active", lastActiveAt: new Date().toISOString() }
            : s,
        ),
      );
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {t("agents.title")}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t("agents.subtitle")}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("agents.create")}
        </Button>
      </div>

      {/* Agent Grid */}
      {agents.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
            <Bot className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">
            {t("agents.noAgents")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("agents.noAgentsDesc")}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Card
              key={agent.uuid}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => setSelectedAgent(agent)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <Bot className="h-[18px] w-[18px] text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {agent.name}
                      </div>
                      {agent.lastActiveAt && (
                        <div className="text-[11px] text-muted-foreground">
                          {t("agents.detail.lastActive")}{" "}
                          {formatRelativeTime(agent.lastActiveAt, t)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Key className="h-3 w-3" />
                    <span>{agent._count.apiKeys}</span>
                  </div>
                </div>

                {/* Role badges */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {agent.roles.map((role) => (
                    <span
                      key={role}
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        ROLE_BADGE_CLASSES[role as Role] ||
                        "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {t(ROLE_I18N_KEY[role as Role] || role)}
                    </span>
                  ))}
                </div>

                {/* Persona excerpt */}
                {agent.persona && (
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                    {agent.persona}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Create Agent Dialog ────────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25">
          <div className="max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-2xl bg-card shadow-xl">
            {createdKey ? (
              <div className="p-6">
                <div className="mb-4 flex items-center gap-2 text-green-600">
                  <Check className="h-5 w-5" />
                  <span className="font-medium">
                    {t("settings.apiKeyCreated")}
                  </span>
                </div>
                <p className="mb-4 text-sm text-muted-foreground">
                  {t("settings.apiKeyCreatedDesc")}
                </p>
                <div className="mb-4 flex items-center gap-2">
                  <code className="flex-1 rounded bg-foreground px-3 py-2 font-mono text-sm text-background">
                    {createdKey}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(createdKey)}
                  >
                    {copied ? t("common.copied") : t("common.copy")}
                  </Button>
                </div>
                <Button onClick={closeCreate} className="w-full">
                  {t("common.done")}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleCreate}>
                <div className="flex items-center justify-between border-b border-border px-6 py-5">
                  <h3 className="text-lg font-semibold text-foreground">
                    {t("agents.create")}
                  </h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={closeCreate}
                    className="h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-5 p-6">
                  {/* Name */}
                  <div className="space-y-2">
                    <Label htmlFor="agentName" className="text-[13px]">
                      {t("agents.fields.name")}
                    </Label>
                    <Input
                      id="agentName"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder={t("settings.namePlaceholder")}
                      required
                    />
                  </div>

                  {/* Permissions */}
                  <div className="space-y-3">
                    <Label className="text-[13px]">
                      {t("agents.fields.permissions")}
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      {ROLES.map((role) => (
                        <label
                          key={role}
                          className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 transition-colors ${
                            createRoles.includes(role)
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          <Checkbox
                            checked={createRoles.includes(role)}
                            onCheckedChange={() => toggleCreateRole(role)}
                          />
                          <span
                            className={`text-sm ${
                              createRoles.includes(role)
                                ? "font-medium text-foreground"
                                : "text-muted-foreground"
                            }`}
                          >
                            {t(ROLE_I18N_KEY[role])}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Persona */}
                  <div className="space-y-2">
                    <Label htmlFor="agentPersona" className="text-[13px]">
                      {t("agents.fields.persona")}
                    </Label>
                    <Textarea
                      id="agentPersona"
                      value={createPersona}
                      onChange={(e) => setCreatePersona(e.target.value)}
                      placeholder={t("agents.fields.personaPlaceholder")}
                      rows={3}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
                  <Button type="button" variant="outline" onClick={closeCreate}>
                    {t("common.cancel")}
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      !createName.trim() ||
                      createRoles.length === 0 ||
                      submitting
                    }
                  >
                    {submitting ? t("settings.creating") : t("agents.create")}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── Agent Detail Sheet ─────────────────────────────────────────────── */}
      <Sheet
        open={!!selectedAgent}
        onOpenChange={(open) => {
          if (!open) setSelectedAgent(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selectedAgent && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-primary" />
                  {selectedAgent.name}
                </SheetTitle>
                <SheetDescription>
                  {selectedAgent.lastActiveAt
                    ? `${t("agents.detail.lastActive")} ${formatRelativeTime(selectedAgent.lastActiveAt, t)}`
                    : ""}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Editable name */}
                <div className="space-y-2">
                  <Label className="text-[13px]">
                    {t("agents.fields.name")}
                  </Label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>

                {/* Permissions checkboxes */}
                <div className="space-y-3">
                  <Label className="text-[13px]">
                    {t("agents.fields.permissions")}
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    {ROLES.map((role) => (
                      <label
                        key={role}
                        className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 transition-colors ${
                          editRoles.includes(role)
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <Checkbox
                          checked={editRoles.includes(role)}
                          onCheckedChange={() => toggleEditRole(role)}
                        />
                        <span
                          className={`text-sm ${
                            editRoles.includes(role)
                              ? "font-medium text-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          {t(ROLE_I18N_KEY[role])}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Persona */}
                <div className="space-y-2">
                  <Label className="text-[13px]">
                    {t("agents.fields.persona")}
                  </Label>
                  <Textarea
                    value={editPersona}
                    onChange={(e) => setEditPersona(e.target.value)}
                    placeholder={t("agents.fields.personaPlaceholder")}
                    rows={3}
                  />
                </div>

                {/* Save button */}
                <Button
                  onClick={handleUpdate}
                  disabled={
                    !editName.trim() || editRoles.length === 0 || saving
                  }
                  className="w-full"
                >
                  {saving
                    ? t("settings.saving")
                    : t("settings.saveChanges")}
                </Button>

                <div className="border-t border-border" />

                {/* API Keys */}
                <div className="space-y-3">
                  <h3 className="text-[13px] font-semibold text-foreground">
                    {t("agents.detail.apiKeys")}
                  </h3>
                  {loadingKeys ? (
                    <p className="text-xs text-muted-foreground">
                      {t("common.loading")}
                    </p>
                  ) : agentApiKeys.length === 0 ? (
                    <p className="text-xs italic text-muted-foreground">
                      {t("settings.noApiKeys")}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {agentApiKeys.map((key) => (
                        <div
                          key={key.uuid}
                          className="flex items-center justify-between rounded-lg border border-border p-3"
                        >
                          <div className="flex items-center gap-2">
                            <Key className="h-3.5 w-3.5 text-muted-foreground" />
                            <div>
                              <div className="text-xs font-medium text-foreground">
                                {key.keyPrefix}...
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {t("settings.created")}{" "}
                                {formatAgentApiKeyCreatedAt(key.createdAt, locale)}
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => {
                              setKeyToDelete(key.uuid);
                              setDeleteConfirmOpen(true);
                            }}
                          >
                            {t("common.delete")}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-border" />

                {/* Sessions */}
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      const next = !sessionsExpanded;
                      setSessionsExpanded(next);
                      if (next && agentSessions.length === 0 && selectedAgent) {
                        loadSessions(selectedAgent.uuid);
                      }
                    }}
                    className="flex w-full items-center gap-2 text-[13px] font-semibold text-foreground"
                  >
                    {sessionsExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    <Activity className="h-3.5 w-3.5" />
                    {t("agents.detail.sessions")}
                    {agentSessions.length > 0 && (
                      <Badge
                        variant="secondary"
                        className="ml-1 h-4 px-1.5 text-[10px]"
                      >
                        {
                          agentSessions.filter((s) => s.status === "active")
                            .length
                        }
                      </Badge>
                    )}
                  </button>

                  {sessionsExpanded && (
                    <div className="space-y-2">
                      {loadingSessions ? (
                        <p className="py-2 text-xs text-muted-foreground">
                          {t("common.loading")}
                        </p>
                      ) : agentSessions.length === 0 ? (
                        <p className="py-2 text-xs italic text-muted-foreground">
                          {t("agents.detail.noSessions")}
                        </p>
                      ) : (
                        agentSessions.map((session) => (
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
                              <span className="truncate font-medium">
                                {session.name}
                              </span>
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
                                {t(
                                  `sessions.status${session.status.charAt(0).toUpperCase() + session.status.slice(1)}`,
                                )}
                              </Badge>
                            </div>
                            {session.status === "closed" ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px] text-green-600 hover:text-green-700"
                                onClick={() =>
                                  handleReopenSession(session.uuid)
                                }
                              >
                                {t("sessions.reopen")}
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px] text-destructive hover:text-destructive"
                                onClick={() =>
                                  handleCloseSession(session.uuid)
                                }
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
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Delete Key Confirmation ────────────────────────────────────────── */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.confirmDeleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.confirmDeleteDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteKey}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
