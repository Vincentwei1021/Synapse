"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Globe, Bell, Moon, Sun, Monitor, Key, Check, Loader2 } from "lucide-react";
import { useLocale } from "@/contexts/locale-context";
import { useTheme } from "@/contexts/theme-context";
import { locales, localeNames, type Locale } from "@/i18n/config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NotificationPreferencesForm } from "@/components/notification-preferences-form";

export default function SettingsPage() {
  const t = useTranslations();
  const { locale, setLocale } = useLocale();
  const { theme, setTheme } = useTheme();

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

      {/* Integrations Section */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-muted-foreground" />
            <CardTitle>{t("settings.integrations")}</CardTitle>
          </div>
          <CardDescription>
            {t("settings.integrationsDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeepXivTokenField />
        </CardContent>
      </Card>

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
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeepXiv Token Field
// ---------------------------------------------------------------------------

function DeepXivTokenField() {
  const t = useTranslations("settings");
  const [maskedToken, setMaskedToken] = useState<string | null>(null);
  const [isSet, setIsSet] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Fetch current state
  useEffect(() => {
    fetch("/api/settings/integrations")
      .then((r) => r.json())
      .then((data) => {
        setMaskedToken(data.deepxivToken);
        setIsSet(data.deepxivTokenSet);
      })
      .catch(() => {});
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await fetch("/api/settings/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deepxivToken: inputValue }),
      });
      setIsSet(inputValue !== "");
      setMaskedToken(inputValue ? inputValue.slice(0, 8) + "••••" + inputValue.slice(-4) : null);
      setEditing(false);
      setInputValue("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [inputValue]);

  const handleClear = useCallback(async () => {
    setSaving(true);
    try {
      await fetch("/api/settings/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deepxivToken: null }),
      });
      setIsSet(false);
      setMaskedToken(null);
      setEditing(false);
      setInputValue("");
    } finally {
      setSaving(false);
    }
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{t("deepxivToken")}</p>
          <p className="text-xs text-muted-foreground">{t("deepxivTokenDesc")}</p>
        </div>
        {saved && (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <Check className="h-3 w-3" />
            {t("saved")}
          </span>
        )}
      </div>

      {editing ? (
        <div className="flex gap-2">
          <Input
            type="password"
            placeholder={t("deepxivTokenPlaceholder")}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="max-w-sm font-mono text-sm"
          />
          <Button size="sm" onClick={handleSave} disabled={saving || !inputValue.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("save")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setEditing(false); setInputValue(""); }}>
            {t("cancel")}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {isSet ? (
            <>
              <code className="rounded bg-muted px-2 py-1 text-xs">{maskedToken}</code>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                {t("change")}
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={handleClear} disabled={saving}>
                {t("clear")}
              </Button>
            </>
          ) : (
            <>
              <span className="text-xs text-muted-foreground">{t("deepxivTokenNotSet")}</span>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                {t("configure")}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
