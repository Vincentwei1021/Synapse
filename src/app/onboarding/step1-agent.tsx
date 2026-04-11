"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Terminal, Radio } from "lucide-react";
import { authFetch } from "@/lib/auth-client";

interface Props {
  onComplete: (agentUuid: string, agentName: string, agentType: string) => void;
  onSkip: () => void;
}

const ROLES = [
  { value: "pre_research", key: "rolePreResearch" },
  { value: "research", key: "roleResearch" },
  { value: "experiment", key: "roleExperiment" },
  { value: "report", key: "roleReport" },
  { value: "admin", key: "roleAdmin" },
] as const;

const DEFAULT_ROLES = ["pre_research", "research", "experiment"];

export function OnboardingStep1({ onComplete, onSkip }: Props) {
  const t = useTranslations("onboarding.step1");
  const tCommon = useTranslations("onboarding");
  const [name, setName] = useState("");
  const [type, setType] = useState("claude_code");
  const [roles, setRoles] = useState<string[]>(DEFAULT_ROLES);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleRole = (role: string) => {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await authFetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), type, roles }),
      });
      const json = await res.json();
      if (json.success) {
        onComplete(json.data.uuid, json.data.name, json.data.type);
      } else {
        setError(json.error || "Failed to create agent");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>

      <div className="mt-6 space-y-5">
        {/* Name */}
        <div>
          <Label htmlFor="agent-name">{t("nameLabel")}</Label>
          <Input
            id="agent-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            className="mt-1.5"
          />
        </div>

        {/* Type */}
        <div>
          <Label>{t("typeLabel")}</Label>
          <div className="mt-1.5 grid grid-cols-2 gap-3">
            {[
              { value: "claude_code", label: t("typeClaudeCode"), desc: t("typeClaudeCodeDesc"), icon: Terminal },
              { value: "openclaw", label: t("typeOpenClaw"), desc: t("typeOpenClawDesc"), icon: Radio },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                className={`flex flex-col items-start rounded-lg border p-3 text-left transition-colors ${
                  type === opt.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <opt.icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{opt.label}</span>
                </div>
                <span className="mt-1 text-xs text-muted-foreground">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Roles */}
        <div>
          <Label>{t("rolesLabel")}</Label>
          <div className="mt-1.5 space-y-2">
            {ROLES.map((role) => (
              <label key={role.value} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={roles.includes(role.value)}
                  onCheckedChange={() => toggleRole(role.value)}
                />
                <span className="text-foreground">{t(role.key)}</span>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </div>

      {/* Actions */}
      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground">
          {tCommon("skip")}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!name.trim() || roles.length === 0 || submitting}
          className="bg-primary text-primary-foreground"
        >
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("createAgent")}
        </Button>
      </div>
    </div>
  );
}
