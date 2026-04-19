"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { authFetch } from "@/lib/auth-client";
import { useToast } from "@/contexts/toast-context";

interface NotificationContextType {
  unreadCount: number;
  refreshNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

interface NotificationProviderProps {
  children: ReactNode;
}

const TOAST_MAP: Record<string, { category: string; color: string }> = {
  auto_search_started: { category: "Search", color: "#3b82f6" },
  auto_search_completed: { category: "Search", color: "#3b82f6" },
  related_work_added: { category: "Papers", color: "#22c55e" },
  auto_search_failed: { category: "Search", color: "#ef4444" },
  deep_research_requested: { category: "Research", color: "#a855f7" },
  deep_research_completed: { category: "Research", color: "#a855f7" },
  deep_research_failed: { category: "Research", color: "#ef4444" },
  experiment_created: { category: "Experiment", color: "#818cf8" },
  experiment_status_changed: { category: "Experiment", color: "#818cf8" },
  experiment_progress: { category: "Experiment", color: "#818cf8" },
  experiment_completed: { category: "Experiment", color: "#818cf8" },
  autonomous_loop_triggered: { category: "Loop", color: "#f59e0b" },
  experiment_auto_proposed: { category: "Loop", color: "#22c55e" },
  synthesis_updated: { category: "Loop", color: "#06b6d4" },
};

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [unreadCount, setUnreadCount] = useState(0);
  const subscribersRef = useRef<Set<() => void>>(new Set());
  const { addToast } = useToast();

  const notify = useCallback(() => {
    subscribersRef.current.forEach((cb) => cb());
  }, []);

  // Fetch initial unread count from REST API
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await authFetch("/api/notifications?readFilter=unread&take=0");
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setUnreadCount(data.data.unreadCount);
        }
      }
    } catch {
      // Silently fail — will retry on next SSE event or visibility change
    }
  }, []);

  const refreshNotifications = useCallback(() => {
    fetchUnreadCount();
    notify();
  }, [fetchUnreadCount, notify]);

  useEffect(() => {
    let es: EventSource | null = null;
    let debounceTimer: NodeJS.Timeout;

    function connect() {
      disconnect();
      es = new EventSource("/api/events/notifications");

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (typeof data.unreadCount === "number") {
            setUnreadCount(data.unreadCount);
          }
          // Fire toast for mapped notification actions
          if (data.action && data.message) {
            const toastConfig = TOAST_MAP[data.action];
            if (toastConfig) {
              addToast({
                category: toastConfig.category,
                color: toastConfig.color,
                message: data.message,
                projectName: data.projectName,
                entityTitle: data.entityTitle,
              });
            }
          }
        } catch {
          // Ignore parse errors
        }
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(notify, 300);
      };

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
        fetchUnreadCount();
      } else {
        disconnect();
      }
    }

    // Initial connection and data fetch
    connect();
    fetchUnreadCount();

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      disconnect();
      clearTimeout(debounceTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchUnreadCount, notify, addToast]);

  const contextValue = useMemo(
    () => ({ unreadCount, refreshNotifications }),
    [unreadCount, refreshNotifications]
  );

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
}

/**
 * Access notification context (unreadCount + refreshNotifications).
 * Returns null values gracefully if called outside NotificationProvider.
 */
export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    return { unreadCount: 0, refreshNotifications: () => {} };
  }
  return context;
}
