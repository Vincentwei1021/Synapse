"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Check, X, ArrowRight } from "lucide-react";
import { authFetch } from "@/lib/auth-client";

interface OnboardingStatus {
  hasAgent: boolean;
  hasComputeNode: boolean;
}

// Module-level cache — cleared by invalidateOnboardingCache()
let cachedStatus: OnboardingStatus | null = null;

/** Call after completing onboarding to force a re-fetch on next render */
export function invalidateOnboardingCache() {
  cachedStatus = null;
}

export function OnboardingProgress() {
  const t = useTranslations("onboarding.sidebar");
  const [status, setStatus] = useState<OnboardingStatus | null>(cachedStatus);

  useEffect(() => {
    // Use cache if available
    if (cachedStatus) {
      setStatus(cachedStatus);
      return;
    }
    authFetch("/api/onboarding/status")
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          cachedStatus = { hasAgent: json.data.hasAgent, hasComputeNode: json.data.hasComputeNode };
          setStatus(cachedStatus);
        }
      })
      .catch(() => {});
  }, []);

  // Don't render if status unknown or everything is set up
  if (!status || (status.hasAgent && status.hasComputeNode)) {
    return null;
  }

  const items = [
    { label: t("agentConfigured"), done: status.hasAgent },
    { label: t("computeConfigured"), done: status.hasComputeNode },
  ];

  return (
    <Link href="/onboarding">
      <div className="mx-3 mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 transition-colors hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/30 dark:hover:bg-amber-950/50 cursor-pointer">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            {t("setupProgress")}
          </span>
          <ArrowRight className="h-3 w-3 text-amber-600 dark:text-amber-500" />
        </div>
        <div className="mt-2 space-y-1">
          {items.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5 text-[11px]">
              {item.done ? (
                <Check className="h-3 w-3 text-green-600" />
              ) : (
                <X className="h-3 w-3 text-amber-500" />
              )}
              <span className={item.done ? "text-muted-foreground line-through" : "text-foreground"}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Link>
  );
}
