"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRealtimeEvent } from "@/contexts/realtime-context";
import type { AgentActivitySummary, AgentSummary } from "@/services/agent-activity.service";

const EMPTY: AgentActivitySummary = {
  relatedWorks: [],
  experiments: [],
  researchQuestions: [],
  insights: [],
  documents: [],
};

export function useAgentActivity(projectUuid: string | null | undefined): AgentActivitySummary {
  const [state, setState] = useState<AgentActivitySummary>(EMPTY);
  const prevProjectUuid = useRef(projectUuid);

  // Reset only when switching to a different project (not on navigation within same project)
  useEffect(() => {
    if (projectUuid !== prevProjectUuid.current) {
      if (!projectUuid) setState(EMPTY);
      prevProjectUuid.current = projectUuid;
    }
  }, [projectUuid]);

  const refetch = useCallback(async () => {
    if (!projectUuid) return;
    try {
      const res = await fetch(`/api/research-projects/${projectUuid}/agent-activity`);
      if (!res.ok) return;
      const json = await res.json();
      if (json?.success && json.data) {
        setState(json.data as AgentActivitySummary);
      }
    } catch {
      // network hiccup — keep last state
    }
  }, [projectUuid]);

  // Subscribe to project SSE — fires on mount and on every event
  useRealtimeEvent(() => {
    void refetch();
  });

  // Polling fallback every 15s
  useEffect(() => {
    if (!projectUuid) return;
    const id = setInterval(() => { void refetch(); }, 15000);
    return () => clearInterval(id);
  }, [projectUuid, refetch]);

  return state;
}

export type { AgentActivitySummary, AgentSummary };
