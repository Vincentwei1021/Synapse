"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

type Subscriber = () => void;

interface RealtimeEvent {
  companyUuid: string;
  projectUuid: string;
  entityType: string;
  entityUuid: string;
  action: string;
  actorUuid?: string;
}

type EntitySubscriber = (event: RealtimeEvent) => void;

export interface PresenceEvent {
  type: "presence";
  companyUuid: string;
  researchProjectUuid: string;
  entityType: string;
  entityUuid: string;
  agentUuid: string;
  agentName: string;
  action: "view" | "mutate";
  timestamp: number;
}

type PresenceSubscriber = (event: PresenceEvent) => void;

interface RealtimeContextType {
  subscribe: (callback: Subscriber) => () => void;
  subscribeEntity: (callback: EntitySubscriber) => () => void;
  subscribePresence: (callback: PresenceSubscriber) => () => void;
}

const RealtimeContext = createContext<RealtimeContextType | null>(null);

interface RealtimeProviderProps {
  projectUuid: string;
  children: ReactNode;
}

export function RealtimeProvider({ projectUuid, children }: RealtimeProviderProps) {
  const subscribersRef = useRef<Set<Subscriber>>(new Set());
  const entitySubscribersRef = useRef<Set<EntitySubscriber>>(new Set());
  const presenceSubscribersRef = useRef<Set<PresenceSubscriber>>(new Set());

  const notify = useCallback(() => {
    subscribersRef.current.forEach((cb) => cb());
  }, []);

  const notifyEntity = useCallback((event: RealtimeEvent) => {
    entitySubscribersRef.current.forEach((cb) => cb(event));
  }, []);

  const notifyPresence = useCallback((event: PresenceEvent) => {
    presenceSubscribersRef.current.forEach((cb) => cb(event));
  }, []);

  useEffect(() => {
    let es: EventSource | null = null;
    let debounceTimer: NodeJS.Timeout;

    let lastNotifyTime = 0;
    const THROTTLE_MS = 3000;  // At most 1 refresh every 3 seconds
    const DEBOUNCE_MS = 1000;  // Wait 1s of silence before refreshing

    function connect() {
      // Close any existing connection before opening a new one
      disconnect();
      es = new EventSource(`/api/events?projectUuid=${projectUuid}`);
      es.onmessage = (msg) => {
        // Parse event data for entity-specific subscribers
        let parsedEvent: RealtimeEvent | null = null;
        try {
          parsedEvent = JSON.parse(msg.data);
        } catch {
          // Non-JSON message (e.g. heartbeat) — ignore for entity subscribers
        }

        clearTimeout(debounceTimer);
        const now = Date.now();
        const elapsed = now - lastNotifyTime;

        if (elapsed >= THROTTLE_MS) {
          // Enough time has passed — refresh immediately
          lastNotifyTime = now;
          notify();
        } else {
          // Too soon — schedule a deferred refresh
          debounceTimer = setTimeout(() => {
            lastNotifyTime = Date.now();
            notify();
          }, Math.max(DEBOUNCE_MS, THROTTLE_MS - elapsed));
        }

        // Entity-specific events fire immediately (no throttle/debounce)
        if (parsedEvent) {
          notifyEntity(parsedEvent);
        }
      };
      es.addEventListener("presence", (msg) => {
        try {
          const event: PresenceEvent = JSON.parse(msg.data);
          notifyPresence(event);
        } catch {
          // ignore
        }
      });
      es.onerror = () => {
        // Browser EventSource auto-reconnects on error
      };
    }

    function disconnect() {
      if (es) {
        es.close();
        es = null;
      }
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        connect();
        notify();
      } else {
        disconnect();
      }
    }

    connect();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      disconnect();
      clearTimeout(debounceTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [projectUuid, notify, notifyEntity, notifyPresence]);

  const subscribe = useCallback((callback: Subscriber) => {
    subscribersRef.current.add(callback);
    return () => {
      subscribersRef.current.delete(callback);
    };
  }, []);

  const subscribeEntity = useCallback((callback: EntitySubscriber) => {
    entitySubscribersRef.current.add(callback);
    return () => {
      entitySubscribersRef.current.delete(callback);
    };
  }, []);

  const subscribePresence = useCallback((callback: PresenceSubscriber) => {
    presenceSubscribersRef.current.add(callback);
    return () => {
      presenceSubscribersRef.current.delete(callback);
    };
  }, []);

  // Memoize context value to avoid unnecessary re-renders of consumers
  const contextValue = useMemo(
    () => ({ subscribe, subscribeEntity, subscribePresence }),
    [subscribe, subscribeEntity, subscribePresence]
  );

  return (
    <RealtimeContext.Provider value={contextValue}>
      {children}
    </RealtimeContext.Provider>
  );
}

/**
 * Subscribe a callback to SSE events. The callback fires on mount (initial)
 * and on every subsequent SSE event from the project stream.
 * No-ops gracefully if called outside RealtimeProvider (e.g. during initial layout render).
 */
export function useRealtimeEvent(callback: () => void) {
  const context = useContext(RealtimeContext);

  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!context) return;
    const handler = () => callbackRef.current();
    // Fire on mount for initial data fetch
    handler();
    return context.subscribe(handler);
  }, [context]);
}

/**
 * Convenience hook: calls router.refresh() on every SSE event.
 */
export function useRealtimeRefresh() {
  const router = useRouter();
  useRealtimeEvent(() => {
    router.refresh();
  });
}

/**
 * Subscribe to SSE events for a specific entity. The callback fires only when
 * events match the given entityType and entityUuid. Does NOT fire on mount.
 * No-ops gracefully outside RealtimeProvider.
 */
export function useRealtimeEntityEvent(
  entityType: string,
  entityUuid: string,
  callback: (event: RealtimeEvent) => void
) {
  const context = useContext(RealtimeContext);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!context) return;
    const handler = (event: RealtimeEvent) => {
      if (event.entityType === entityType && event.entityUuid === entityUuid) {
        callbackRef.current(event);
      }
    };
    return context.subscribeEntity(handler);
  }, [context, entityType, entityUuid]);
}

/**
 * Subscribe to presence events from the SSE stream.
 * Fires immediately when a presence event arrives (no throttle/debounce).
 */
export function usePresenceSubscription(callback: (event: PresenceEvent) => void) {
  const context = useContext(RealtimeContext);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!context) return;
    const handler = (event: PresenceEvent) => callbackRef.current(event);
    return context.subscribePresence(handler);
  }, [context]);
}
