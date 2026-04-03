"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Server, Upload } from "lucide-react";
import { authFetch } from "@/lib/auth-client";

type SshConfigHost = {
  alias: string;
  hostName?: string;
  user?: string;
  port?: number;
};

type SourceMode = "ssh_config" | "upload";

export function ComputeNodeForm({
  pools,
  defaultPoolUuid,
  hidePoolSelect = false,
  embedded = false,
  onSuccess,
}: {
  pools: Array<{ uuid: string; name: string }>;
  defaultPoolUuid?: string;
  hidePoolSelect?: boolean;
  embedded?: boolean;
  onSuccess?: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sshHosts, setSshHosts] = useState<SshConfigHost[]>([]);
  const [sourceMode, setSourceMode] = useState<SourceMode>("ssh_config");
  const [selectedAlias, setSelectedAlias] = useState("");
  const [manualHost, setManualHost] = useState("");
  const [manualUser, setManualUser] = useState("ubuntu");
  const [manualPort, setManualPort] = useState("22");
  const [selectedPem, setSelectedPem] = useState<File | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadSshConfig() {
      const response = await fetch("/api/ssh-config");
      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as { data?: { hosts?: SshConfigHost[] } };
      const hosts = data.data?.hosts ?? [];

      if (!ignore) {
        setSshHosts(hosts);
        if (hosts[0]) {
          setSelectedAlias(hosts[0].alias);
          setSourceMode("ssh_config");
        } else {
          setSourceMode("upload");
        }
      }
    }

    loadSshConfig().catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, []);

  const selectedHost = useMemo(
    () => sshHosts.find((host) => host.alias === selectedAlias) ?? null,
    [selectedAlias, sshHosts],
  );

  async function handleSubmit(formData: FormData) {
    setError(null);

    const payload = new FormData();
    payload.set("poolUuid", String(formData.get("poolUuid") || ""));
    payload.set("label", String(formData.get("label") || "").trim());
    payload.set("ec2InstanceId", String(formData.get("ec2InstanceId") || "").trim());
    payload.set("instanceType", String(formData.get("instanceType") || "").trim());
    payload.set("region", String(formData.get("region") || "").trim());
    payload.set("notes", String(formData.get("notes") || "").trim());
    payload.set("ssmTarget", String(formData.get("ssmTarget") || "").trim());
    payload.set("lifecycle", String(formData.get("lifecycle") || "idle"));

    if (sourceMode === "ssh_config" && selectedHost) {
      // Only send alias — server resolves host/user/port/keyPath from SSH config
      payload.set("label", String(formData.get("label") || "").trim() || selectedHost.alias);
      payload.set("sshConfigAlias", selectedHost.alias);
      payload.set("sshHost", selectedHost.hostName || "");
      payload.set("sshUser", selectedHost.user || "ubuntu");
      payload.set("sshPort", String(selectedHost.port ?? 22));
      payload.set("sshKeySource", "ssh_config");
    } else {
      payload.set("sshHost", manualHost);
      payload.set("sshUser", manualUser || "ubuntu");
      payload.set("sshPort", manualPort || "22");

      if (sourceMode === "upload" && selectedPem) {
        payload.set("pemFile", selectedPem);
      }
    }

    const response = await authFetch("/api/compute-nodes", {
      method: "POST",
      body: payload,
    });

    if (!response.ok) {
      setError(t("compute.register.nodeError"));
      return;
    }

    setManualHost("");
    setManualUser("ubuntu");
    setManualPort("22");
    setSelectedPem(null);
    onSuccess?.();
    router.refresh();
  }

  const sourceCards: Array<{
    mode: SourceMode;
    title: string;
    description: string;
    icon: typeof Server;
    disabled?: boolean;
  }> = [
    {
      mode: "ssh_config",
      title: t("compute.register.sshConfig"),
      description: t("compute.register.sshConfigDesc"),
      icon: Server,
      disabled: sshHosts.length === 0,
    },
    {
      mode: "upload",
      title: t("compute.register.uploadPem"),
      description: t("compute.register.uploadPemDesc"),
      icon: Upload,
    },
    // manual_path removed — server-side key paths must not be exposed to frontend
  ];

  return (
    <form
      action={(formData) => startTransition(() => { void handleSubmit(formData); })}
      className={embedded ? "space-y-5" : "space-y-5 rounded-[28px] border border-border bg-card p-6 shadow-sm"}
    >
      {!embedded ? (
        <div className="space-y-1">
          <p className="text-base font-semibold text-foreground">{t("compute.register.title")}</p>
          <p className="text-sm leading-6 text-muted-foreground">{t("compute.register.description")}</p>
        </div>
      ) : null}

      <div className="grid gap-3">
        {sourceCards.map((card) => {
          const Icon = card.icon;
          const active = sourceMode === card.mode;

          return (
            <button
              key={card.mode}
              type="button"
              disabled={card.disabled}
              onClick={() => setSourceMode(card.mode)}
              className={`rounded-2xl border px-4 py-4 text-left transition ${
                active
                  ? "border-primary bg-primary/10"
                  : "border-border bg-secondary/40"
              } ${card.disabled ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-background p-2 shadow-sm">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{card.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{card.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {hidePoolSelect ? (
          <input type="hidden" name="poolUuid" value={defaultPoolUuid ?? pools[0]?.uuid ?? ""} />
        ) : (
          <label className="space-y-2 text-sm">
            <span className="text-muted-foreground">{t("compute.register.pool")}</span>
            <select
              name="poolUuid"
              required
              defaultValue={defaultPoolUuid ?? pools[0]?.uuid}
              className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none"
            >
              {pools.map((pool) => (
                <option key={pool.uuid} value={pool.uuid}>
                  {pool.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="space-y-2 text-sm">
          <span className="text-muted-foreground">{t("compute.register.label")}</span>
          <input
            name="label"
            placeholder={t("compute.register.labelPlaceholder")}
            className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="space-y-2 text-sm">
          <span className="text-muted-foreground">{t("compute.machine.instanceType")}</span>
          <input
            name="instanceType"
            placeholder={t("compute.register.instanceTypePlaceholder")}
            className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="text-muted-foreground">{t("compute.machine.region")}</span>
          <input
            name="region"
            placeholder={t("compute.register.regionPlaceholder")}
            className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="text-muted-foreground">{t("compute.register.ec2InstanceId")}</span>
          <input
            name="ec2InstanceId"
            placeholder={t("compute.register.ec2InstanceIdPlaceholder")}
            className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>

      {sourceMode === "ssh_config" && selectedHost ? (
        <div className="rounded-2xl border border-border bg-secondary/40 p-4 text-sm leading-6 text-muted-foreground">
          <p className="font-medium text-foreground">{selectedHost.alias}</p>
          <div className="mt-2 grid gap-x-6 gap-y-1 md:grid-cols-2">
            <p>{t("compute.register.host")}: {selectedHost.hostName || "-"}</p>
            <p>{t("compute.register.user")}: {selectedHost.user || "ubuntu"}</p>
            <p>{t("compute.register.port")}: {selectedHost.port ?? 22}</p>
            <p>{t("compute.register.key")}: {t("compute.register.serverResolvedKey")}</p>
          </div>
          <label className="mt-3 block space-y-2">
            <span className="text-sm text-muted-foreground">{t("compute.register.configAlias")}</span>
            <select
              value={selectedAlias}
              onChange={(event) => setSelectedAlias(event.target.value)}
              className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none"
            >
              {sshHosts.map((host) => (
                <option key={host.alias} value={host.alias}>
                  {host.alias}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {sourceMode === "upload" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="text-muted-foreground">{t("compute.register.host")}</span>
            <input
              value={manualHost}
              onChange={(event) => setManualHost(event.target.value)}
              placeholder={t("compute.register.hostPlaceholder")}
              className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-muted-foreground">{t("compute.register.user")}</span>
            <input
              value={manualUser}
              onChange={(event) => setManualUser(event.target.value)}
              placeholder="ubuntu"
              className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-muted-foreground">{t("compute.register.port")}</span>
            <input
              value={manualPort}
              onChange={(event) => setManualPort(event.target.value)}
              placeholder="22"
              className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>

          <div className="space-y-2 text-sm md:col-span-1">
            <span className="block text-muted-foreground">{t("compute.register.pemFile")}</span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center justify-between rounded-2xl border border-dashed border-border bg-background px-4 py-3 text-left"
            >
              <span className="text-sm text-foreground">
                {selectedPem?.name || t("compute.register.choosePem")}
              </span>
              <Upload className="h-4 w-4 text-muted-foreground" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pem"
              className="hidden"
              onChange={(event) => setSelectedPem(event.target.files?.[0] || null)}
            />
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="text-muted-foreground">{t("compute.register.ssmTarget")}</span>
          <input
            name="ssmTarget"
            placeholder={t("compute.register.ssmTargetPlaceholder")}
            className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>

        <label className="space-y-2 text-sm">
          <span className="text-muted-foreground">{t("compute.register.lifecycle")}</span>
          <select
            name="lifecycle"
            defaultValue="idle"
            className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none"
          >
            <option value="idle">{t("compute.lifecycle.idle")}</option>
            <option value="offline">{t("compute.lifecycle.offline")}</option>
            <option value="maintenance">{t("compute.lifecycle.maintenance")}</option>
          </select>
        </label>
      </div>

      <label className="space-y-2 text-sm">
        <span className="text-muted-foreground">{t("compute.register.notes")}</span>
        <textarea
          name="notes"
          rows={3}
          placeholder={t("compute.register.notesPlaceholder")}
          className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <button
        type="submit"
        disabled={isPending || pools.length === 0}
        className="rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
      >
        {isPending ? t("compute.register.creating") : t("compute.register.submit")}
      </button>
    </form>
  );
}
