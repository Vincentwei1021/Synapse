"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Check, Server, HardDrive, Upload } from "lucide-react";
import { authFetch } from "@/lib/auth-client";
import type { ComputeNodeSnapshot } from "@/services/compute.service";

interface Props {
  onComplete: (poolUuid: string) => void;
  onSkip: () => void;
}

type Phase = "pool" | "machine" | "done";

type ProbeResponse = {
  success: boolean;
  data?: {
    node?: ComputeNodeSnapshot;
  };
  error?: string | { message?: string };
};

export function OnboardingStep3({ onComplete, onSkip }: Props) {
  const t = useTranslations("onboarding.step3");
  const tCommon = useTranslations("onboarding");
  const tComputeMachine = useTranslations("compute.machine");
  const tComputeRegister = useTranslations("compute.register");
  const [phase, setPhase] = useState<Phase>("pool");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pool form
  const [poolName, setPoolName] = useState("");
  const [poolDesc, setPoolDesc] = useState("");
  const [poolUuid, setPoolUuid] = useState<string | null>(null);

  // Machine form
  const [machineLabel, setMachineLabel] = useState("");
  const [host, setHost] = useState("");
  const [sshUser, setSshUser] = useState("ubuntu");
  const [sshPort, setSshPort] = useState("22");
  const [sshKey, setSshKey] = useState("");
  const [pemFile, setPemFile] = useState<File | null>(null);
  const [probedNode, setProbedNode] = useState<ComputeNodeSnapshot | null>(null);

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
    setProbedNode(null);

    try {
      const formData = new FormData();
      formData.append("poolUuid", poolUuid);
      formData.append("sshHost", host.trim());
      formData.append("sshUser", sshUser.trim() || "ubuntu");
      formData.append("sshPort", sshPort || "22");
      formData.append("label", machineLabel.trim() || host.trim());
      formData.append("waitForProbe", "true");
      formData.append("rollbackOnProbeError", "true");
      formData.append("enableTelemetryOnSuccess", "true");

      if (pemFile) {
        formData.append("pemFile", pemFile);
        formData.append("sshKeySource", "upload");
      } else if (sshKey.trim()) {
        const keyBlob = new Blob([sshKey], { type: "application/x-pem-file" });
        const keyFile = new File([keyBlob], `${host.trim()}.pem`, { type: "application/x-pem-file" });
        formData.append("pemFile", keyFile);
        formData.append("sshKeySource", "upload");
      }

      const res = await authFetch("/api/compute-nodes", {
        method: "POST",
        body: formData,
      });
      const json = (await res.json()) as ProbeResponse;
      if (res.ok && json.success && json.data?.node) {
        setProbedNode(json.data.node);
        setPhase("done");
      } else {
        setError(typeof json.error === "string" ? json.error : json.error?.message || tCommon("genericError"));
      }
    } catch {
      setError(tCommon("genericError"));
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

          {/* Machine label (optional) */}
          <div>
            <Label htmlFor="machine-label">{t("machineLabelField")}</Label>
            <Input
              id="machine-label"
              value={machineLabel}
              onChange={(e) => setMachineLabel(e.target.value)}
              placeholder={t("machineLabelPlaceholder")}
              className="mt-1.5"
            />
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

          <div className="space-y-2">
            <Label>{t("authKey")}</Label>
            <p className="text-xs text-muted-foreground">{t("keyOnlyHint")}</p>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border p-3 transition-colors hover:bg-muted/50">
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {pemFile ? pemFile.name : t("keyUpload")}
              </span>
              <input
                type="file"
                accept=".pem,.key,.pub,.id_rsa,.id_ed25519"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setPemFile(file);
                    setSshKey("");
                  }
                }}
              />
            </label>
            <Textarea
              value={sshKey}
              onChange={(e) => {
                setSshKey(e.target.value);
                setPemFile(null);
              }}
              placeholder={t("keyPlaceholder")}
              rows={4}
              className="font-mono text-xs"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {submitting && (
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{t("probing")}</p>
              <p className="mt-1">{t("probingHint")}</p>
            </div>
          )}

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
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-green-200 bg-green-50/80 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                <Check className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-green-800">{t("probeSuccess")}</p>
                <p className="mt-1 text-sm text-green-700">{t("probeSuccessHint")}</p>
              </div>
            </div>
          </div>

          {probedNode ? (
            <>
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("connectionDetails")}
                </p>
                <div className="mt-3 grid gap-3 text-sm text-foreground md:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">{t("hostSummary")}</p>
                    <p className="font-medium">{probedNode.sshHost ?? host.trim()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("userSummary")}</p>
                    <p className="font-medium">{probedNode.sshUser ?? (sshUser.trim() || "ubuntu")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("portSummary")}</p>
                    <p className="font-medium">{probedNode.sshPort ?? Number(sshPort || "22")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("syncedAt")}</p>
                    <p className="font-medium">
                      {probedNode.lastReportedAt
                        ? new Date(probedNode.lastReportedAt).toLocaleString()
                        : "-"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("detectedInventory")}
                </p>
                <div className="mt-3 grid gap-3 text-sm text-foreground md:grid-cols-3">
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{tComputeMachine("instanceType")}</p>
                    <p className="mt-1 font-medium">{probedNode.instanceType || t("instanceTypePending")}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{tComputeMachine("region")}</p>
                    <p className="mt-1 font-medium">{probedNode.region || t("regionPending")}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{tComputeRegister("ec2InstanceId")}</p>
                    <p className="mt-1 font-medium">{probedNode.ec2InstanceId || t("instanceIdPending")}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4">
                  <p className="text-sm font-medium text-foreground">
                    {t("gpuDetected", { count: probedNode.gpuCount })}
                  </p>
                  <div className="mt-3 space-y-2">
                    {probedNode.gpus.map((gpu) => (
                      <div
                        key={gpu.uuid}
                        className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      >
                        <div>
                          <p className="font-medium">GPU {gpu.slotIndex}</p>
                          <p className="text-xs text-muted-foreground">{gpu.model}</p>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {gpu.memoryGb ? `${gpu.memoryGb} GB` : "-"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : null}

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => {
                if (poolUuid) {
                  onComplete(poolUuid);
                }
              }}
              className="bg-primary text-primary-foreground"
            >
              {t("finishSetup")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
