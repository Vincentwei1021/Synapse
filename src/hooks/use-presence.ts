"use client";

import { useSyncExternalStore } from "react";
import { usePresenceSubscription, type PresenceEvent } from "@/contexts/realtime-context";

export interface PresenceEntry {
  agentUuid: string;
  agentName: string;
  action: "view" | "mutate";
  timestamp: number;
}

const PRESENCE_DURATION_MS = 3000;

// Module-level presence store — shared across all hook instances
const presenceMap = new Map<string, PresenceEntry[]>();
const dedupMap = new Map<string, number>();
const timers = new Map<string, NodeJS.Timeout>();
const storeListeners = new Set<() => void>();
let version = 0;

function presenceKey(entityType: string, entityUuid: string): string {
  return `${entityType}:${entityUuid}`;
}

function dedupKeyFor(entityType: string, entityUuid: string, agentUuid: string): string {
  return `${entityType}:${entityUuid}:${agentUuid}`;
}

function notifyListeners() {
  version++;
  storeListeners.forEach((l) => l());
}

function addPresence(event: PresenceEvent) {
  const pKey = presenceKey(event.entityType, event.entityUuid);
  const dKey = dedupKeyFor(event.entityType, event.entityUuid, event.agentUuid);

  // Frontend dedup: same agent+entity within 3s
  const lastTime = dedupMap.get(dKey);
  if (lastTime && Date.now() - lastTime < PRESENCE_DURATION_MS) {
    return;
  }
  dedupMap.set(dKey, Date.now());

  const entry: PresenceEntry = {
    agentUuid: event.agentUuid,
    agentName: event.agentName,
    action: event.action,
    timestamp: Date.now(),
  };

  // Add/replace entry for this agent on this entity
  const entries = presenceMap.get(pKey) ?? [];
  const filtered = entries.filter((e) => e.agentUuid !== event.agentUuid);
  filtered.push(entry);
  presenceMap.set(pKey, filtered);

  // Clear previous timer for this agent+entity
  const existingTimer = timers.get(dKey);
  if (existingTimer) clearTimeout(existingTimer);

  // Auto-clear after 3 seconds
  const timer = setTimeout(() => {
    const current = presenceMap.get(pKey);
    if (current) {
      const remaining = current.filter((e) => e.agentUuid !== event.agentUuid);
      if (remaining.length === 0) {
        presenceMap.delete(pKey);
      } else {
        presenceMap.set(pKey, remaining);
      }
    }
    dedupMap.delete(dKey);
    timers.delete(dKey);
    notifyListeners();
  }, PRESENCE_DURATION_MS);
  timers.set(dKey, timer);

  notifyListeners();
}

function getSnapshot(): number {
  return version;
}

function subscribeStore(callback: () => void): () => void {
  storeListeners.add(callback);
  return () => {
    storeListeners.delete(callback);
  };
}

/**
 * Hook to subscribe to agent presence events.
 * Returns getPresence to query active presences for a resource.
 */
export function usePresence() {
  useSyncExternalStore(subscribeStore, getSnapshot, getSnapshot);
  usePresenceSubscription(addPresence);

  const getPresence = (entityType: string, entityUuid: string): PresenceEntry[] => {
    return presenceMap.get(presenceKey(entityType, entityUuid)) ?? [];
  };

  return { getPresence };
}
