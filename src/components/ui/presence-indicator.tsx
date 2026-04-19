"use client";

import { usePresence } from "@/hooks/use-presence";

interface PresenceIndicatorProps {
  entityType: string;
  entityUuid: string;
  children: React.ReactNode;
}

export function PresenceIndicator({ entityType, entityUuid, children }: PresenceIndicatorProps) {
  // Keep the subscription alive so the backend presence stream stays wired up
  // and other consumers of usePresence continue receiving updates. Visual
  // rendering is intentionally omitted — the experiment card shows agent
  // identity via its own top-right badge.
  const { getPresence } = usePresence();
  void getPresence(entityType, entityUuid);
  return <>{children}</>;
}
