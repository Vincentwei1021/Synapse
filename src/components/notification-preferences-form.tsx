"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface NotificationPreferences {
  taskAssigned: boolean;
  taskStatusChanged: boolean;
  taskVerified: boolean;
  taskReopened: boolean;
  proposalSubmitted: boolean;
  proposalApproved: boolean;
  proposalRejected: boolean;
  ideaClaimed: boolean;
  commentAdded: boolean;
  elaborationRequested: boolean;
  elaborationAnswered: boolean;
  experimentCompleted: boolean;
  experimentAutoProposed: boolean;
  experimentStatusChanged: boolean;
  experimentProgress: boolean;
  synthesisUpdated: boolean;
  autoSearchCompleted: boolean;
  deepResearchCompleted: boolean;
  autonomousLoopTriggered: boolean;
  mentioned: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  taskAssigned: true,
  taskStatusChanged: true,
  taskVerified: true,
  taskReopened: true,
  proposalSubmitted: true,
  proposalApproved: true,
  proposalRejected: true,
  ideaClaimed: true,
  commentAdded: true,
  elaborationRequested: true,
  elaborationAnswered: true,
  experimentCompleted: true,
  experimentAutoProposed: true,
  experimentStatusChanged: true,
  experimentProgress: true,
  synthesisUpdated: true,
  autoSearchCompleted: true,
  deepResearchCompleted: true,
  autonomousLoopTriggered: true,
  mentioned: true,
};

type PreferenceKey = keyof NotificationPreferences;

interface PreferenceGroup {
  labelKey: string;
  placeholder?: boolean;
  items: { key: PreferenceKey; labelKey: string }[];
}

const PREFERENCE_GROUPS: PreferenceGroup[] = [
  {
    labelKey: "preResearch",
    items: [
      { key: "autoSearchCompleted", labelKey: "autoSearchCompleted" },
      { key: "deepResearchCompleted", labelKey: "deepResearchCompleted" },
    ],
  },
  {
    labelKey: "research",
    items: [
      { key: "ideaClaimed", labelKey: "researchQuestionClaimed" },
      {
        key: "elaborationRequested",
        labelKey: "hypothesisFormulationRequested",
      },
      { key: "elaborationAnswered", labelKey: "hypothesisFormulationAnswered" },
    ],
  },
  {
    labelKey: "experiment",
    items: [
      { key: "taskAssigned", labelKey: "experimentAssigned" },
      { key: "taskStatusChanged", labelKey: "experimentStatusChanged" },
      { key: "taskVerified", labelKey: "experimentVerified" },
      { key: "taskReopened", labelKey: "experimentReopened" },
      { key: "proposalSubmitted", labelKey: "designSubmitted" },
      { key: "proposalApproved", labelKey: "designApproved" },
      { key: "proposalRejected", labelKey: "designRejected" },
      { key: "experimentCompleted", labelKey: "experimentCompleted" },
      { key: "experimentStatusChanged", labelKey: "prefExperimentStatusChanged" },
      { key: "experimentProgress", labelKey: "prefExperimentProgress" },
      { key: "experimentAutoProposed", labelKey: "prefExperimentAutoProposed" },
      { key: "autonomousLoopTriggered", labelKey: "prefAutonomousLoopTriggered" },
    ],
  },
  {
    labelKey: "report",
    items: [
      { key: "synthesisUpdated", labelKey: "prefSynthesisUpdated" },
    ],
  },
  {
    labelKey: "general",
    items: [
      { key: "commentAdded", labelKey: "commentAdded" },
      { key: "mentioned", labelKey: "mentioned" },
    ],
  },
];

export function NotificationPreferencesForm() {
  const t = useTranslations("notifications.preferences");
  const [preferences, setPreferences] =
    useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function fetchPreferences() {
      try {
        const res = await fetch("/api/notifications/preferences");
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            const d = json.data;
            setPreferences({
              taskAssigned: d.taskAssigned ?? true,
              taskStatusChanged: d.taskStatusChanged ?? true,
              taskVerified: d.taskVerified ?? true,
              taskReopened: d.taskReopened ?? true,
              proposalSubmitted: d.proposalSubmitted ?? true,
              proposalApproved: d.proposalApproved ?? true,
              proposalRejected: d.proposalRejected ?? true,
              ideaClaimed: d.ideaClaimed ?? true,
              commentAdded: d.commentAdded ?? true,
              elaborationRequested: d.elaborationRequested ?? true,
              elaborationAnswered: d.elaborationAnswered ?? true,
              experimentCompleted: d.experimentCompleted ?? true,
              experimentAutoProposed: d.experimentAutoProposed ?? true,
              experimentStatusChanged: d.experimentStatusChanged ?? true,
              experimentProgress: d.experimentProgress ?? true,
              synthesisUpdated: d.synthesisUpdated ?? true,
              autoSearchCompleted: d.autoSearchCompleted ?? true,
              deepResearchCompleted: d.deepResearchCompleted ?? true,
              autonomousLoopTriggered: d.autonomousLoopTriggered ?? true,
              mentioned: d.mentioned ?? true,
            });
          }
        }
      } catch (error) {
        console.error("Failed to fetch notification preferences:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchPreferences();
  }, []);

  const savePreferences = useCallback(
    (updated: NotificationPreferences) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(async () => {
        try {
          await fetch("/api/notifications/preferences", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updated),
          });
        } catch (error) {
          console.error("Failed to save notification preferences:", error);
        }
      }, 500);
    },
    []
  );

  const handleToggle = (key: PreferenceKey, checked: boolean) => {
    const updated = { ...preferences, [key]: checked };
    setPreferences(updated);
    savePreferences(updated);
  };

  if (loading) {
    return null;
  }

  return (
    <div className="space-y-6">
      {PREFERENCE_GROUPS.map((group) => (
        <div key={group.labelKey} className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">
            {t(group.labelKey)}
          </h3>
          {group.placeholder ? (
            <p className="text-xs text-muted-foreground">{t("comingSoon")}</p>
          ) : (
            <div className="space-y-3">
              {group.items.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between"
                >
                  <Label
                    htmlFor={item.key}
                    className="text-sm text-muted-foreground cursor-pointer"
                  >
                    {t(item.labelKey)}
                  </Label>
                  <Switch
                    id={item.key}
                    checked={preferences[item.key]}
                    onCheckedChange={(checked) =>
                      handleToggle(item.key, checked)
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
