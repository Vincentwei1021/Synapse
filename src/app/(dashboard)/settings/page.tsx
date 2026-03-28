"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
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
import { Plus, Key, Check, X, Globe, Bell, Moon, Sun, Monitor } from "lucide-react";
import { useLocale } from "@/contexts/locale-context";
import { useTheme } from "@/contexts/theme-context";
import { getApiKeysAction, createAgentAndKeyAction, deleteApiKeyAction, getAgentSessionsAction, closeSessionAction, reopenSessionAction, updateAgentAction } from "./actions";
import { locales, localeNames, type Locale } from "@/i18n/config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NotificationPreferencesForm } from "@/components/notification-preferences-form";
import { SettingsAgentFormFields } from "./settings-agent-form-fields";
import { SettingsApiKeyCard } from "./settings-api-key-card";
import { hasAdminRole, type AgentSessionsByAgent, type ApiKey } from "./settings-shared";

export default function SettingsPage() {
  const t = useTranslations();
  const { locale, setLocale } = useLocale();
  const { theme, setTheme } = useTheme();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null);

  // Session state
  const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({});
  const [agentSessions, setAgentSessions] = useState<AgentSessionsByAgent>({});
  const [loadingSessions, setLoadingSessions] = useState<Record<string, boolean>>({});

  // Form state
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [customPersona, setCustomPersona] = useState("");
  const [adminConfirmed, setAdminConfirmed] = useState(false);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
  const [editName, setEditName] = useState("");
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [editPersona, setEditPersona] = useState("");
  const [editAdminConfirmed, setEditAdminConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    try {
      const result = await getApiKeysAction();
      if (result.success && result.data) {
        setApiKeys(result.data);
      }
    } catch (error) {
      console.error("Failed to fetch API keys:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleRole = (role: string) => {
    setSelectedRoles((prev) => {
      const newRoles = prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role];
      // Reset admin confirmation if admin role is deselected
      if (role === "pi_agent" && prev.includes(role)) {
        setAdminConfirmed(false);
      }
      return newRoles;
    });
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName || selectedRoles.length === 0) return;

    setSubmitting(true);
    try {
      const result = await createAgentAndKeyAction({
        name: newKeyName,
        roles: selectedRoles,
        persona: customPersona || null,
      });

      if (result.success && result.key) {
        setCreatedKey(result.key);
        fetchApiKeys();
      } else {
        console.error("Failed to create API key:", result.error);
      }
    } catch (error) {
      console.error("Failed to create API key:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const openDeleteConfirm = (uuid: string) => {
    setKeyToDelete(uuid);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteKey = async () => {
    if (!keyToDelete) return;

    try {
      const result = await deleteApiKeyAction(keyToDelete);
      if (result.success) {
        setApiKeys(apiKeys.filter((k) => k.uuid !== keyToDelete));
      } else {
        console.error("Failed to delete API key:", result.error);
      }
    } catch (error) {
      console.error("Failed to delete API key:", error);
    } finally {
      setDeleteConfirmOpen(false);
      setKeyToDelete(null);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  };

  const resetForm = () => {
    setNewKeyName("");
    setSelectedRoles([]);
    setCustomPersona("");
    setCreatedKey(null);
    setAdminConfirmed(false);
  };

  const closeModal = () => {
    setShowModal(false);
    resetForm();
  };

  const toggleSessions = async (agentUuid: string) => {
    const isExpanded = expandedSessions[agentUuid];
    setExpandedSessions((prev) => ({ ...prev, [agentUuid]: !isExpanded }));

    if (!isExpanded && !agentSessions[agentUuid]) {
      setLoadingSessions((prev) => ({ ...prev, [agentUuid]: true }));
      const result = await getAgentSessionsAction(agentUuid);
      if (result.success && result.data) {
        setAgentSessions((prev) => ({ ...prev, [agentUuid]: result.data! }));
      }
      setLoadingSessions((prev) => ({ ...prev, [agentUuid]: false }));
    }
  };

  const handleCloseSession = async (sessionUuid: string, agentUuid: string) => {
    const result = await closeSessionAction(sessionUuid);
    if (result.success) {
      setAgentSessions((prev) => ({
        ...prev,
        [agentUuid]: (prev[agentUuid] || []).map((s) =>
          s.uuid === sessionUuid ? { ...s, status: "closed" } : s
        ),
      }));
    }
  };

  const handleReopenSession = async (sessionUuid: string, agentUuid: string) => {
    const result = await reopenSessionAction(sessionUuid);
    if (result.success) {
      setAgentSessions((prev) => ({
        ...prev,
        [agentUuid]: (prev[agentUuid] || []).map((s) =>
          s.uuid === sessionUuid ? { ...s, status: "active", lastActiveAt: new Date().toISOString() } : s
        ),
      }));
    }
  };

  const createHasAdminRole = hasAdminRole(selectedRoles);

  // Edit modal helpers
  const openEditModal = (key: ApiKey) => {
    setEditingKey(key);
    setEditName(key.name || "");
    setEditRoles([...key.roles]);
    setEditPersona(key.persona || "");
    setEditAdminConfirmed(key.roles.includes("pi_agent"));
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingKey(null);
    setEditName("");
    setEditRoles([]);
    setEditPersona("");
    setEditAdminConfirmed(false);
  };

  const toggleEditRole = (role: string) => {
    setEditRoles((prev) => {
      const newRoles = prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role];
      if (role === "pi_agent" && prev.includes(role)) {
        setEditAdminConfirmed(false);
      }
      return newRoles;
    });
  };

  const handleUpdateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingKey || !editName || editRoles.length === 0) return;

    setSaving(true);
    try {
      const result = await updateAgentAction({
        agentUuid: editingKey.agentUuid,
        name: editName,
        roles: editRoles,
        persona: editPersona || null,
      });

      if (result.success) {
        // Update local state to reflect changes
        setApiKeys((prev) =>
          prev.map((k) =>
            k.agentUuid === editingKey.agentUuid
              ? { ...k, name: editName, roles: editRoles, persona: editPersona || null }
              : k
          )
        );
        closeEditModal();
      } else {
        console.error("Failed to update agent:", result.error);
      }
    } catch (error) {
      console.error("Failed to update agent:", error);
    } finally {
      setSaving(false);
    }
  };

  const editHasAdminRole = hasAdminRole(editRoles);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-[#6B6B6B]">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      {/* Breadcrumb */}
      <div className="mb-6 text-xs text-[#9A9A9A]">{t("settings.breadcrumb")}</div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#2C2C2C]">{t("settings.title")}</h1>
        <p className="mt-1 text-[13px] text-[#6B6B6B]">
          {t("settings.subtitle")}
        </p>
      </div>

      {/* Language Section */}
      <div className="mb-8 space-y-4">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground">{t("settings.language")}</h2>
        </div>
        <p className="text-[13px] text-muted-foreground">
          {t("settings.languageDesc")}
        </p>
        <div className="flex gap-3">
          {locales.map((loc) => (
            <Button
              key={loc}
              variant={locale === loc ? "default" : "outline"}
              size="sm"
              onClick={() => setLocale(loc as Locale)}
              className="min-w-[100px]"
            >
              {localeNames[loc]}
            </Button>
          ))}
        </div>
      </div>

      <div className="mb-8 space-y-4">
        <div className="flex items-center gap-2">
          <Moon className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground">{t("settings.theme")}</h2>
        </div>
        <p className="text-[13px] text-muted-foreground">
          {t("settings.themeDesc")}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            variant={theme === "light" ? "default" : "outline"}
            size="sm"
            onClick={() => setTheme("light")}
            className="min-w-[100px]"
          >
            <Sun className="mr-2 h-4 w-4" />
            {t("settings.light")}
          </Button>
          <Button
            variant={theme === "dark" ? "default" : "outline"}
            size="sm"
            onClick={() => setTheme("dark")}
            className="min-w-[100px]"
          >
            <Moon className="mr-2 h-4 w-4" />
            {t("settings.dark")}
          </Button>
          <Button
            variant={theme === "system" ? "default" : "outline"}
            size="sm"
            onClick={() => setTheme("system")}
            className="min-w-[100px]"
          >
            <Monitor className="mr-2 h-4 w-4" />
            {t("settings.systemTheme")}
          </Button>
        </div>
      </div>

      <div className="mb-8 border-t border-border" />

      {/* Agents Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{t("settings.agents")}</h2>
          <Button onClick={() => setShowModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("settings.createApiKey")}
          </Button>
        </div>

        <p className="text-[13px] text-muted-foreground">
          {t("settings.agentsDesc")}
        </p>

        {/* API Keys List */}
        {apiKeys.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
              <Key className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              {t("settings.noApiKeys")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {apiKeys.map((key) => (
              <SettingsApiKeyCard
                key={key.uuid}
                apiKey={key}
                expanded={expandedSessions[key.agentUuid] ?? false}
                sessions={agentSessions[key.agentUuid]}
                loadingSessions={loadingSessions[key.agentUuid] ?? false}
                onCloseSession={handleCloseSession}
                onDelete={openDeleteConfirm}
                onEdit={openEditModal}
                onReopenSession={handleReopenSession}
                onToggleSessions={toggleSessions}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mb-8 border-t border-border" />

      {/* Notifications Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <CardTitle>{t("notifications.preferences.title")}</CardTitle>
          </div>
          <CardDescription>
            {t("notifications.preferences.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationPreferencesForm />
        </CardContent>
      </Card>

      {/* Create API Key Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25">
          <div className="max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-2xl bg-card shadow-xl">
            {createdKey ? (
              // Success State
              <div className="p-6">
                <div className="mb-4 flex items-center gap-2 text-green-600">
                  <Check className="h-5 w-5" />
                  <span className="font-medium">{t("settings.apiKeyCreated")}</span>
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
                <Button onClick={closeModal} className="w-full">
                  {t("common.done")}
                </Button>
              </div>
            ) : (
              // Form State
              <form onSubmit={handleCreateKey}>
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b border-border px-6 py-5">
                  <h3 className="text-lg font-semibold text-foreground">
                    {t("settings.createApiKey")}
                  </h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={closeModal}
                    className="h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Modal Body */}
                <div className="space-y-5 p-6">
                  <SettingsAgentFormFields
                    adminConfirmId="adminConfirm"
                    nameInputId="keyName"
                    name={newKeyName}
                    roles={selectedRoles}
                    persona={customPersona}
                    adminConfirmed={adminConfirmed}
                    showAdminConfirmation={createHasAdminRole}
                    onAdminConfirmedChange={setAdminConfirmed}
                    onNameChange={setNewKeyName}
                    onPersonaChange={setCustomPersona}
                    onRoleToggle={toggleRole}
                  />
                </div>

                {/* Modal Footer */}
                <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeModal}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      !newKeyName || selectedRoles.length === 0 || submitting ||
                      (createHasAdminRole && !adminConfirmed)
                    }
                    className={createHasAdminRole ? "bg-red-600 hover:bg-red-700" : ""}
                  >
                    {submitting ? t("settings.creating") : t("settings.createApiKey")}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Edit Agent Modal */}
      {showEditModal && editingKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25">
          <div className="max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-2xl bg-card shadow-xl">
            <form onSubmit={handleUpdateAgent}>
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-border px-6 py-5">
                <h3 className="text-lg font-semibold text-foreground">
                  {t("settings.editAgent")}
                </h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={closeEditModal}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Modal Body */}
              <div className="space-y-5 p-6">
                <SettingsAgentFormFields
                  adminConfirmId="editAdminConfirm"
                  nameInputId="editName"
                  name={editName}
                  roles={editRoles}
                  persona={editPersona}
                  adminConfirmed={editAdminConfirmed}
                  showAdminConfirmation={editHasAdminRole && !editingKey.roles.includes("pi_agent")}
                  onAdminConfirmedChange={setEditAdminConfirmed}
                  onNameChange={setEditName}
                  onPersonaChange={setEditPersona}
                  onRoleToggle={toggleEditRole}
                />
              </div>

              {/* Modal Footer */}
              <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeEditModal}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={
                    !editName || editRoles.length === 0 || saving ||
                    (editHasAdminRole && !editingKey.roles.includes("pi_agent") && !editAdminConfirmed)
                  }
                  className={editHasAdminRole && !editingKey.roles.includes("pi_agent") ? "bg-red-600 hover:bg-red-700" : ""}
                >
                  {saving ? t("settings.saving") : t("settings.saveChanges")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.confirmDeleteTitle")}</AlertDialogTitle>
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
    </div>
  );
}
