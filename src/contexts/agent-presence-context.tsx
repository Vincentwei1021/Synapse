"use client";
import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { onlineAgentCount as countOnline, parseConnectionsResponse, type ConnectionViewLite } from "@/lib/presence-format";

export interface AgentPresenceValue {
  connections: ConnectionViewLite[];
  onlineAgentCount: number;
  loading: boolean;
  error: boolean;
  refresh: () => void;
}

const Ctx = createContext<AgentPresenceValue | null>(null);

export function AgentPresenceProvider({
  children,
  pollMs = 15_000,
  fetchImpl,
}: {
  children: React.ReactNode;
  pollMs?: number;
  fetchImpl?: typeof fetch;
}) {
  const doFetch = fetchImpl ?? fetch;
  const [connections, setConnections] = useState<ConnectionViewLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await doFetch("/api/agent-connections", { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      if (!mounted.current) return;
      setConnections(parseConnectionsResponse(json));
      setError(false);
    } catch {
      if (!mounted.current) return;
      setError(true); // keep last good `connections`
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [doFetch]);

  useEffect(() => {
    mounted.current = true;
    load();
    const id = setInterval(load, pollMs);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [load, pollMs]);

  const value: AgentPresenceValue = {
    connections,
    onlineAgentCount: countOnline(connections),
    loading,
    error,
    refresh: load,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAgentPresence(): AgentPresenceValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAgentPresence must be used within AgentPresenceProvider");
  return v;
}

export function useAgentConnections(agentUuid: string): ConnectionViewLite[] {
  return useAgentPresence().connections.filter((c) => c.agentUuid === agentUuid);
}
