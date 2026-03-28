"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Globe, Bell, Moon, Sun, Monitor } from "lucide-react";
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
