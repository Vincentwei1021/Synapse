"use client";

import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Toast {
  id: string;
  category: string;
  color: string;
  message: string;
  createdAt: number;
}

type ToastInput = Pick<Toast, "category" | "color" | "message">;

interface ToastContextType {
  addToast: (input: ToastInput) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 5000;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToastContext = createContext<ToastContextType | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface ToastProviderProps {
  children: ReactNode;
}

/** Internal state separates visible toasts from a FIFO overflow queue. */
export function ToastProvider({ children }: ToastProviderProps) {
  const [visible, setVisible] = useState<Toast[]>([]);
  const [exiting, setExiting] = useState<Set<string>>(new Set());
  const queueRef = useRef<Toast[]>([]);
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // -- Promote queued toasts into visible slots ------------------------------
  const promote = useCallback(() => {
    setVisible((prev) => {
      const active = prev.length;
      if (active >= MAX_VISIBLE || queueRef.current.length === 0) return prev;
      const slots = MAX_VISIBLE - active;
      const promoted = queueRef.current.splice(0, slots);
      return [...prev, ...promoted];
    });
  }, []);

  // -- Dismiss (exit animation then remove) ---------------------------------
  const dismiss = useCallback(
    (id: string) => {
      // Clear auto-dismiss timer if still pending
      const timer = timersRef.current.get(id);
      if (timer) {
        clearTimeout(timer);
        timersRef.current.delete(id);
      }

      // Start exit animation
      setExiting((prev) => new Set(prev).add(id));

      // After exit animation completes, remove from visible and promote queue
      setTimeout(() => {
        setExiting((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setVisible((prev) => prev.filter((t) => t.id !== id));
        // Promote on next tick so visible count is accurate
        setTimeout(promote, 0);
      }, 300); // matches toast-exit duration
    },
    [promote]
  );

  // Wire dismiss into scheduleDismiss (breaks the circular dep)
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  // Override scheduleDismiss to use ref
  const scheduleAutoDismiss = useCallback((id: string) => {
    const timer = setTimeout(() => {
      dismissRef.current(id);
    }, AUTO_DISMISS_MS);
    timersRef.current.set(id, timer);
  }, []);

  // -- Add a new toast -------------------------------------------------------
  const addToast = useCallback(
    (input: ToastInput) => {
      const toast: Toast = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
      };

      setVisible((prev) => {
        if (prev.length >= MAX_VISIBLE) {
          queueRef.current.push(toast);
          return prev;
        }
        return [...prev, toast];
      });
    },
    []
  );

  // -- Schedule auto-dismiss whenever visible set gains new toasts -----------
  const prevIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const currentIds = new Set(visible.map((t) => t.id));
    for (const t of visible) {
      if (!prevIdsRef.current.has(t.id)) {
        scheduleAutoDismiss(t.id);
      }
    }
    prevIdsRef.current = currentIds;
  }, [visible, scheduleAutoDismiss]);

  // -- Cleanup timers on unmount --------------------------------------------
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const contextValue = useMemo(() => ({ addToast }), [addToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer
        toasts={visible}
        exitingIds={exiting}
        onDismiss={dismiss}
      />
    </ToastContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

interface ToastContainerProps {
  toasts: Toast[];
  exitingIds: Set<string>;
  onDismiss: (id: string) => void;
}

function ToastContainer({ toasts, exitingIds, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-[9999] flex flex-col-reverse gap-2"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastCard
          key={toast.id}
          toast={toast}
          isExiting={exitingIds.has(toast.id)}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

interface ToastCardProps {
  toast: Toast;
  isExiting: boolean;
  onDismiss: (id: string) => void;
}

function ToastCard({ toast, isExiting, onDismiss }: ToastCardProps) {
  const animation = isExiting
    ? "toast-exit 300ms cubic-bezier(0.55, 0, 1, 0.45) forwards"
    : "toast-enter 500ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards";

  return (
    <button
      type="button"
      onClick={() => onDismiss(toast.id)}
      className="flex items-start gap-3 rounded-xl border border-white/10 bg-zinc-900/95 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur-sm transition-transform min-w-[280px] max-w-xs cursor-pointer text-left"
      style={{ animation }}
    >
      {/* Left column: dot + category */}
      <div className="flex flex-col items-center gap-1 pt-0.5">
        <span
          className="block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: toast.color, boxShadow: `0 0 6px ${toast.color}` }}
        />
        <span
          className="text-[11px] font-semibold leading-tight"
          style={{ color: toast.color }}
        >
          {toast.category}
        </span>
      </div>

      {/* Message */}
      <span className="text-[13px] leading-snug text-white/90">
        {toast.message}
      </span>
    </button>
  );
}
