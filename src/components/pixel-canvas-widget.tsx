"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  PixelCanvas,
  type SlotData,
  type SlotState,
  type PixelCanvasEffect,
} from "@/components/pixel-canvas";
import { getProjectActiveSessionsAction } from "@/app/(dashboard)/research-projects/[uuid]/actions";
import { useRealtimeEvent } from "@/contexts/realtime-context";

interface PixelCanvasWidgetProps {
  projectUuid: string;
  projectName: string;
}

export function PixelCanvasWidget({ projectUuid, projectName }: PixelCanvasWidgetProps) {
  const t = useTranslations("pixelCanvas");
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<SlotData[]>(
    Array.from({ length: 7 }, () => ({ state: "empty" as SlotState }))
  );
  const [agentCount, setAgentCount] = useState(0);
  const [effects, setEffects] = useState<PixelCanvasEffect[]>([]);

  const fetchSessions = useCallback(async () => {
    const result = await getProjectActiveSessionsAction(projectUuid);
    if (!result.success || !result.data) return;

    const sessions = result.data;
    const newSlots: SlotData[] = Array.from({ length: 7 }, (_, i) => {
      const session = sessions[i];
      if (!session) return { state: "empty" as SlotState };
      return {
        state: "typing" as SlotState,
        sessionName: session.sessionName,
      };
    });

    setSlots(newSlots);
    setAgentCount(sessions.length);
  }, [projectUuid]);

  // Initial fetch + SSE-driven refresh via context
  useRealtimeEvent(fetchSessions);

  const handleEffectsConsumed = useCallback(() => {
    setEffects([]);
  }, []);

  return (
    <>
      {/* Floating GIF button — fixed bottom-right */}
      <div
        className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-40 cursor-pointer"
        onClick={() => setOpen(true)}
      >
        <div className="relative transition-transform hover:scale-105">
          <div className="overflow-hidden rounded-lg border-2 border-border bg-card shadow-lg hover:shadow-xl">
            <Image
              src="/typing-animation.gif"
              alt={t("title")}
              width={72}
              height={72}
              unoptimized
              className="block scale-[1.3]"
            />
          </div>
          {agentCount > 0 && (
            <span className="absolute -top-3 -right-3 flex h-7 min-w-7 items-center justify-center rounded-full bg-[#B87351] text-xs font-bold text-white shadow-md">
              {agentCount}
            </span>
          )}
        </div>
      </div>

      {/* Expanded Canvas Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl p-4">
          <DialogTitle className="text-sm">
            {projectName} — {t("title")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("title")}
          </DialogDescription>
          <div className="overflow-hidden rounded-lg border border-border">
            <PixelCanvas
              slots={slots}
              projectName={projectName}
              agentCount={agentCount}
              collapsed={!open}
              effects={effects}
              onEffectsConsumed={handleEffectsConsumed}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
