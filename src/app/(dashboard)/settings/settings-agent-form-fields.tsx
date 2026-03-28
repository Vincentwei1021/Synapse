"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, Check, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getAvailablePersonas } from "./settings-shared";

interface SettingsAgentFormFieldsProps {
  adminConfirmId: string;
  nameInputId: string;
  name: string;
  roles: string[];
  persona: string;
  adminConfirmed: boolean;
  showAdminConfirmation: boolean;
  onAdminConfirmedChange: (checked: boolean) => void;
  onNameChange: (value: string) => void;
  onPersonaChange: (value: string) => void;
  onRoleToggle: (role: string) => void;
}

export function SettingsAgentFormFields({
  adminConfirmId,
  nameInputId,
  name,
  roles,
  persona,
  adminConfirmed,
  showAdminConfirmation,
  onAdminConfirmedChange,
  onNameChange,
  onPersonaChange,
  onRoleToggle,
}: SettingsAgentFormFieldsProps) {
  const t = useTranslations();
  const availablePersonas = getAvailablePersonas(roles);

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={nameInputId} className="text-[13px]">
          {t("settings.name")}
        </Label>
        <Input
          id={nameInputId}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={t("settings.namePlaceholder")}
          className="border-[#E5E0D8]"
          required
        />
      </div>

      <div className="space-y-3">
        <Label className="text-[13px]">{t("settings.agentRoles")}</Label>
        <p className="text-xs text-muted-foreground">
          {t("settings.agentRolesDesc")}
        </p>
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onRoleToggle("researcher_agent")}
            className={`flex h-auto w-full items-start justify-start gap-3 rounded-lg border p-3 text-left transition-colors ${
              roles.includes("researcher_agent")
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary"
            }`}
          >
            <div
              className={`mt-0.5 flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded ${
                roles.includes("researcher_agent")
                  ? "bg-primary"
                  : "border-2 border-border"
              }`}
            >
              {roles.includes("researcher_agent") && (
                <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
              )}
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">
                {t("settings.developerAgent")}
              </div>
              <div className="text-xs font-normal text-muted-foreground">
                {t("settings.developerAgentDesc")}
              </div>
            </div>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onRoleToggle("research_lead_agent")}
            className={`flex h-auto w-full items-start justify-start gap-3 rounded-lg border p-3 text-left transition-colors ${
              roles.includes("research_lead_agent")
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary"
            }`}
          >
            <div
              className={`mt-0.5 flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded ${
                roles.includes("research_lead_agent")
                  ? "bg-primary"
                  : "border-2 border-border"
              }`}
            >
              {roles.includes("research_lead_agent") && (
                <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
              )}
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">
                {t("settings.pmAgent")}
              </div>
              <div className="text-xs font-normal text-muted-foreground">
                {t("settings.pmAgentDesc")}
              </div>
            </div>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onRoleToggle("pi_agent")}
            className={`flex h-auto w-full items-start justify-start gap-3 rounded-lg border p-3 text-left transition-colors ${
              roles.includes("pi_agent")
                ? "border-red-500 bg-red-50 dark:bg-red-950"
                : "border-border hover:border-red-400"
            }`}
          >
            <div
              className={`mt-0.5 flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded ${
                roles.includes("pi_agent")
                  ? "bg-red-500"
                  : "border-2 border-red-300"
              }`}
            >
              {roles.includes("pi_agent") && (
                <Check className="h-3 w-3 text-white" strokeWidth={3} />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400">
                <ShieldAlert className="h-4 w-4" />
                {t("settings.adminAgent")}
              </div>
              <div className="text-xs font-normal text-red-500/80 dark:text-red-400/80">
                {t("settings.adminAgentDesc")}
              </div>
            </div>
          </Button>
        </div>

        {showAdminConfirmation && (
          <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
              <div className="space-y-2">
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                  {t("settings.adminWarningTitle")}
                </p>
                <p className="text-xs text-red-600 dark:text-red-400">
                  {t("settings.adminWarningDesc")}
                </p>
                <ul className="list-inside list-disc space-y-1 text-xs text-red-600 dark:text-red-400">
                  <li>{t("settings.adminWarningItem1")}</li>
                  <li>{t("settings.adminWarningItem2")}</li>
                  <li>{t("settings.adminWarningItem3")}</li>
                  <li>{t("settings.adminWarningItem4")}</li>
                </ul>
                <div className="mt-3 flex cursor-pointer items-center gap-2">
                  <Checkbox
                    id={adminConfirmId}
                    checked={adminConfirmed}
                    onCheckedChange={(checked) => onAdminConfirmedChange(checked === true)}
                    className="border-red-300 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                  />
                  <Label
                    htmlFor={adminConfirmId}
                    className="cursor-pointer text-xs font-medium text-red-700 dark:text-red-300"
                  >
                    {t("settings.adminConfirmCheckbox")}
                  </Label>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <Label className="text-[13px]">{t("settings.agentPersona")}</Label>
        <p className="text-xs text-muted-foreground">
          {roles.length > 0
            ? t("settings.agentPersonaDesc")
            : t("settings.agentPersonaDescNoRoles")}
        </p>

        {roles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {availablePersonas.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                variant={persona === t(preset.descKey) ? "default" : "outline"}
                size="sm"
                onClick={() => onPersonaChange(t(preset.descKey))}
                className="rounded-full"
              >
                {t(preset.labelKey)}
              </Button>
            ))}
          </div>
        )}

        <Textarea
          value={persona}
          onChange={(e) => onPersonaChange(e.target.value)}
          placeholder={t("settings.personaPlaceholder")}
          rows={4}
        />
        <p className="text-[11px] text-muted-foreground">
          {roles.length > 0
            ? t("settings.personaHint")
            : t("settings.personaHintNoRoles")}
        </p>
      </div>
    </>
  );
}
