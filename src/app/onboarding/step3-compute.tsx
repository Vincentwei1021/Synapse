"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Check, Server, HardDrive } from "lucide-react";
import { authFetch } from "@/lib/auth-client";

interface Props {
  onComplete: (poolUuid: string) => void;
  onSkip: () => void;
}

type Phase = "pool" | "machine" | "done";

export function OnboardingStep3({ onComplete, onSkip }: Props) {
  const t = useTranslations("onboarding.step3");
  const tCommon = useTranslations("onboarding");
  const [phase, setPhase] = useState<Phase>("pool");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pool form
  const [poolName, setPoolName] = useState("");
  const [poolDesc, setPoolDesc] = useState("");
  const [poolUuid, setPoolUuid] = useState<string | null>(null);

  // Machine form
  const [host, setHost] = useState("");
  const [sshUser, setSshUser] = useState("ubuntu");
  const [sshPort, setSshPort] = useState("22");
  const [authMethod, setAuthMethod] = useState<"password" | "key">("key");
  const [password, setPassword] = useState("");
  const [sshKey, setSshKey] = useState("");

  const handleCreatePool = async () => {
    if (!poolName.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await authFetch("/api/compute-pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: poolName.trim(), description: poolDesc.trim() || undefined }),
      });
      const json = await res.json();
      if (json.success) {
        setPoolUuid(json.data.pool.uuid);
        setPhase("machine");
      } else {
        setError(json.error || "Failed to create pool");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddMachine = async () => {
    if (!host.trim() || !poolUuid) return;
    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("poolUuid", poolUuid);
      formData.append("sshHost", host.trim());
      formData.append("sshUser", sshUser.trim() || "ubuntu");
      formData.append("sshPort", sshPort || "22");
      formData.append("label", host.trim());

      if (authMethod === "key" && sshKey.trim()) {
        const keyBlob = new Blob([sshKey], { type: "application/x-pem-file" });
        const keyFile = new File([keyBlob], `${host.trim()}.pem`, { type: "application/x-pem-file" });
        formData.append("pemFile", keyFile);
        formData.append("sshKeySource", "upload");
      }

      const res = await authFetch("/api/compute-nodes", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (json.success) {
        setPhase("done");
        onComplete(poolUuid);
      } else {
        setError(json.error || "Failed to add machine");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>

      {phase === "pool" && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-primary">
            <Server className="h-3.5 w-3.5" />
            {t("poolPhase")}
          </div>
          <div>
            <Label htmlFor="pool-name">{t("poolNameLabel")}</Label>
            <Input
              id="pool-name"
              value={poolName}
              onChange={(e) => setPoolName(e.target.value)}
              placeholder={t("poolNamePlaceholder")}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="pool-desc">{t("poolDescLabel")}</Label>
            <Input
              id="pool-desc"
              value={poolDesc}
              onChange={(e) => setPoolDesc(e.target.value)}
              placeholder={t("poolDescPlaceholder")}
              className="mt-1.5"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground">
              {tCommon("skip")}
            </Button>
            <Button onClick={handleCreatePool} disabled={!poolName.trim() || submitting} className="bg-primary text-primary-foreground">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("createPool")}
            </Button>
          </div>
        </div>
      )}

      {phase === "machine" && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-primary">
            <HardDrive className="h-3.5 w-3.5" />
            {t("machinePhase")}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <Label htmlFor="ssh-host">{t("hostLabel")}</Label>
              <Input
                id="ssh-host"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder={t("hostPlaceholder")}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="ssh-user">{t("userLabel")}</Label>
              <Input
                id="ssh-user"
                value={sshUser}
                onChange={(e) => setSshUser(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>

          <div className="w-24">
            <Label htmlFor="ssh-port">{t("portLabel")}</Label>
            <Input
              id="ssh-port"
              value={sshPort}
              onChange={(e) => setSshPort(e.target.value)}
              className="mt-1.5"
            />
          </div>

          {/* Auth method */}
          <div>
            <Label>{t("authLabel")}</Label>
            <div className="mt-1.5 flex gap-2">
              {(["key", "password"] as const).map((method) => (
                <Button
                  key={method}
                  type="button"
                  variant={authMethod === method ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setAuthMethod(method)}
                  className="text-xs"
                >
                  {method === "key" ? t("authKey") : t("authPassword")}
                </Button>
              ))}
            </div>
          </div>

          {authMethod === "password" ? (
            <div>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("passwordPlaceholder")}
              />
            </div>
          ) : (
            <div>
              <Textarea
                value={sshKey}
                onChange={(e) => setSshKey(e.target.value)}
                placeholder={t("keyPlaceholder")}
                rows={4}
                className="font-mono text-xs"
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground">
              {tCommon("skip")}
            </Button>
            <Button onClick={handleAddMachine} disabled={!host.trim() || submitting} className="bg-primary text-primary-foreground">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("addMachine")}
            </Button>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="mt-8 flex flex-col items-center gap-3 py-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <Check className="h-6 w-6 text-green-600" />
          </div>
          <p className="text-sm font-semibold text-green-700">{t("machinePhase")} — Done!</p>
        </div>
      )}
    </div>
  );
}
