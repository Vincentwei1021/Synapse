"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Check, Copy, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { authFetch } from "@/lib/auth-client";

interface Props {
  agentUuid: string | null;
  agentName: string | null;
  agentType: string | null;
  onComplete: () => void;
  onSkip: () => void;
}

type Phase = "configure" | "waiting" | "connected" | "timeout";

const TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 5_000;

export function OnboardingStep2({ agentUuid, agentName, agentType, onComplete, onSkip }: Props) {
  const t = useTranslations("onboarding.step2");
  const tCommon = useTranslations("onboarding");
  const [phase, setPhase] = useState<Phase>("configure");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [endpointCopied, setEndpointCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  const endpoint = typeof window !== "undefined" ? `${window.location.origin}/api/mcp` : "/api/mcp";

  // Generate API key on mount if we have an agent
  useEffect(() => {
    if (!agentUuid) return;
    authFetch("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentUuid, name: "onboarding-key" }),
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setApiKey(json.data.key);
        } else {
          setError(json.error || "Failed to create API key");
        }
      })
      .catch(() => setError("Failed to create API key"));
  }, [agentUuid]);

  const copyToClipboard = (text: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const cleanup = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
  }, []);

  const handleConnected = useCallback(() => {
    cleanup();
    setPhase("connected");
    setTimeout(() => onComplete(), 2000);
  }, [cleanup, onComplete]);

  const startWaiting = useCallback(() => {
    setPhase("waiting");
    cleanup();

    // SSE listener (primary)
    const es = new EventSource("/api/events");
    sseRef.current = es;
    es.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data);
        if (
          event.entityType === "agent_session" &&
          event.action === "created" &&
          event.actorUuid === agentUuid
        ) {
          handleConnected();
        }
      } catch {
        // ignore
      }
    };

    // Polling fallback
    pollRef.current = setInterval(async () => {
      try {
        const res = await authFetch("/api/onboarding/status");
        const json = await res.json();
        if (json.success && json.data.hasAgentSession) {
          handleConnected();
        }
      } catch {
        // ignore
      }
    }, POLL_INTERVAL_MS);

    // Timeout
    timeoutRef.current = setTimeout(() => {
      cleanup();
      setPhase("timeout");
    }, TIMEOUT_MS);
  }, [agentUuid, cleanup, handleConnected]);

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup]);

  const claudeCodeConfig = apiKey
    ? `claude mcp add synapse \\
  --transport http \\
  --url ${endpoint} \\
  --header "Authorization: Bearer ${apiKey}"`
    : "";

  const synapseOrigin = typeof window !== "undefined" ? window.location.origin : "";

  const openClawInstall = "openclaw plugins install @vincentwei1021/synapse-openclaw-plugin";

  const openClawConfig = apiKey
    ? `{
  "synapse-openclaw-plugin": {
    "enabled": true,
    "config": {
      "synapseUrl": "${synapseOrigin}",
      "apiKey": "${apiKey}"
    }
  }
}`
    : "";

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>

      {phase === "configure" && (
        <div className="mt-6 space-y-4">
          {/* API Key */}
          {apiKey && (
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("apiKeyLabel")}
              </label>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs font-mono text-foreground break-all">
                  {apiKey}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => copyToClipboard(apiKey, setKeyCopied)}
                >
                  {keyCopied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <p className="mt-1 text-xs text-amber-600">{t("apiKeyWarning")}</p>
            </div>
          )}

          {/* Endpoint */}
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("endpointLabel")}
            </label>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs font-mono text-foreground">
                {endpoint}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => copyToClipboard(endpoint, setEndpointCopied)}
              >
                {endpointCopied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          {/* Config snippet */}
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("configTitle")}
            </label>
            {agentType === "openclaw" ? (
              <div className="mt-2 space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">{t("configOpenClawInstall")}</p>
                  <pre className="mt-1.5 rounded-lg border border-border bg-muted/50 p-3 text-xs font-mono text-foreground whitespace-pre-wrap break-all">
                    {openClawInstall}
                  </pre>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("configOpenClawJson")}</p>
                  <pre className="mt-1.5 rounded-lg border border-border bg-muted/50 p-3 text-xs font-mono text-foreground whitespace-pre-wrap break-all">
                    {openClawConfig}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground">{t("configClaudeCode")}</p>
                <pre className="mt-1.5 rounded-lg border border-border bg-muted/50 p-3 text-xs font-mono text-foreground whitespace-pre-wrap break-all">
                  {claudeCodeConfig}
                </pre>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground">
              {tCommon("skip")}
            </Button>
            <Button onClick={startWaiting} disabled={!apiKey} className="bg-primary text-primary-foreground">
              {t("testConnection")}
            </Button>
          </div>
        </div>
      )}

      {phase === "waiting" && (
        <div className="mt-8 flex flex-col items-center gap-3 py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-foreground">
            {t("waiting")}
          </p>
          <p className="text-xs text-muted-foreground text-center max-w-sm">
            {t("waitingHint")}
          </p>
          <Button variant="ghost" size="sm" onClick={onSkip} className="mt-4 text-muted-foreground">
            {tCommon("skip")}
          </Button>
        </div>
      )}

      {phase === "connected" && (
        <div className="mt-8 flex flex-col items-center gap-3 py-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <p className="text-sm font-semibold text-green-700">{t("connected")}</p>
          {agentName && (
            <p className="text-xs text-muted-foreground">{agentName}</p>
          )}
        </div>
      )}

      {phase === "timeout" && (
        <div className="mt-8 flex flex-col items-center gap-3 py-8">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <p className="text-sm font-medium text-foreground">{t("timeout")}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={startWaiting}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              {t("retry")}
            </Button>
            <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground">
              {tCommon("skip")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
