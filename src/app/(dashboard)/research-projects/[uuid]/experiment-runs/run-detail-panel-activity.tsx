"use client";

import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import type { ActivityResponse } from "@/services/activity.service";
import {
  formatActivityMessage,
  formatRelativeTime,
  getActivityDotColor,
} from "./run-detail-panel-shared";

interface RunDetailActivityProps {
  activities: ActivityResponse[];
  isLoading: boolean;
}

export function RunDetailActivity({ activities, isLoading }: RunDetailActivityProps) {
  const t = useTranslations();

  return (
    <div className="mt-5 flex-1">
      <label className="text-[11px] font-medium uppercase tracking-wide text-[#9A9A9A]">
        {t("common.activity")}
      </label>
      <div className="mt-2 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-[#9A9A9A]" />
          </div>
        ) : activities.length === 0 ? (
          <p className="text-sm text-[#9A9A9A] italic">{t("common.noActivity")}</p>
        ) : (
          activities.map((activity) => (
            <div key={activity.uuid} className="flex items-start gap-2.5">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#F5F2EC]">
                <div className={`h-2 w-2 rounded-full ${getActivityDotColor(activity.action)}`} />
              </div>
              <div className="flex-1">
                <p className="text-xs text-[#2C2C2C]">
                  {formatActivityMessage(activity, t)}
                </p>
                <p className="text-[10px] text-[#9A9A9A]">
                  {formatRelativeTime(activity.createdAt, t)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
