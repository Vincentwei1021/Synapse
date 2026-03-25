"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { KeyRound, Server, Upload } from "lucide-react";

type SshConfigHost = {
  alias: string;
  hostName?: string;
  user?: string;
  port?: number;
  identityFile?: string;
};

type SourceMode = "ssh_config" | "upload" | "manual_path";

export function ComputeNodeForm({
  pools,
}: {
  pools: Array<{ uuid: string; name: string }>;
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
  const [manualKeyPath, setManualKeyPath] = useState("");
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
    payload.set("notes", String(formData.get("notes") || "").trim());
    payload.set("ssmTarget", String(formData.get("ssmTarget") || "").trim());
    payload.set("lifecycle", String(formData.get("lifecycle") || "idle"));

    if (sourceMode === "ssh_config" && selectedHost) {
      payload.set("label", String(formData.get("label") || "").trim() || selectedHost.alias);
      payload.set("sshHost", selectedHost.hostName || "");
      payload.set("sshUser", selectedHost.user || "ubuntu");
      payload.set("sshPort", String(selectedHost.port ?? 22));
      payload.set("sshKeyPath", selectedHost.identityFile || "");
      payload.set("sshKeySource", "ssh_config");
    } else {
      payload.set("sshHost", manualHost);
      payload.set("sshUser", manualUser || "ubuntu");
      payload.set("sshPort", manualPort || "22");

      if (sourceMode === "manual_path") {
        payload.set("sshKeyPath", manualKeyPath);
        payload.set("sshKeySource", "manual_path");
      }

      if (sourceMode === "upload" && selectedPem) {
        payload.set("pemFile", selectedPem);
      }
    }

    const response = await fetch("/api/compute-nodes", {
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
    setManualKeyPath("");
    setSelectedPem(null);
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
    {
      mode: "manual_path",
      title: t("compute.register.manualPath"),
      description: t("compute.register.manualPathDesc"),
      icon: KeyRound,
    },
  ];

  return (
    <form
      action={(formData) => startTransition(() => { void handleSubmit(formData); })}
      className="space-y-5 rounded-[28px] border border-[#E7DECF] bg-white p-6 shadow-sm"
    >
      <div className="space-y-1">
        <p className="text-base font-semibold text-[#2C2C2C]">{t("compute.register.title")}</p>
        <p className="text-sm leading-6 text-[#7E7469]">{t("compute.register.description")}</p>
      </div>

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
                  ? "border-[#C67A52] bg-[#FFF7F1]"
                  : "border-[#E7DECF] bg-[#FBF8F3]"
              } ${card.disabled ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-white p-2 shadow-sm">
                  <Icon className="h-4 w-4 text-[#C67A52]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#2C2C2C]">{card.title}</p>
                  <p className="mt-1 text-xs leading-5 text-[#7E7469]">{card.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="text-[#5F564B]">{t("compute.register.pool")}</span>
          <select
            name="poolUuid"
            required
            defaultValue={pools[0]?.uuid}
            className="w-full rounded-2xl border border-[#E7DECF] bg-[#FBF8F3] px-3 py-2.5 text-sm text-[#2C2C2C] outline-none"
          >
            {pools.map((pool) => (
              <option key={pool.uuid} value={pool.uuid}>
                {pool.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span className="text-[#5F564B]">{t("compute.register.label")}</span>
          <input
            name="label"
            placeholder={t("compute.register.labelPlaceholder")}
            className="w-full rounded-2xl border border-[#E7DECF] bg-[#FBF8F3] px-3 py-2.5 text-sm text-[#2C2C2C] outline-none placeholder:text-[#A49B90]"
          />
        </label>
      </div>

      {sourceMode === "ssh_config" && selectedHost ? (
        <div className="rounded-2xl border border-[#E7DECF] bg-[#FBF8F3] p-4 text-sm leading-6 text-[#5F564B]">
          <p className="font-medium text-[#2C2C2C]">{selectedHost.alias}</p>
          <div className="mt-2 grid gap-x-6 gap-y-1 md:grid-cols-2">
            <p>{t("compute.register.host")}: {selectedHost.hostName || "-"}</p>
            <p>{t("compute.register.user")}: {selectedHost.user || "ubuntu"}</p>
            <p>{t("compute.register.port")}: {selectedHost.port ?? 22}</p>
            <p>{t("compute.register.key")}: {selectedHost.identityFile || t("compute.register.noKeyInConfig")}</p>
          </div>
          <label className="mt-3 block space-y-2">
            <span className="text-sm text-[#5F564B]">{t("compute.register.configAlias")}</span>
            <select
              value={selectedAlias}
              onChange={(event) => setSelectedAlias(event.target.value)}
              className="w-full rounded-2xl border border-[#E7DECF] bg-white px-3 py-2.5 text-sm text-[#2C2C2C] outline-none"
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

      {(sourceMode === "upload" || sourceMode === "manual_path") ? (
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="text-[#5F564B]">{t("compute.register.host")}</span>
            <input
              value={manualHost}
              onChange={(event) => setManualHost(event.target.value)}
              placeholder={t("compute.register.hostPlaceholder")}
              className="w-full rounded-2xl border border-[#E7DECF] bg-[#FBF8F3] px-3 py-2.5 text-sm text-[#2C2C2C] outline-none placeholder:text-[#A49B90]"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-[#5F564B]">{t("compute.register.user")}</span>
            <input
              value={manualUser}
              onChange={(event) => setManualUser(event.target.value)}
              placeholder="ubuntu"
              className="w-full rounded-2xl border border-[#E7DECF] bg-[#FBF8F3] px-3 py-2.5 text-sm text-[#2C2C2C] outline-none placeholder:text-[#A49B90]"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-[#5F564B]">{t("compute.register.port")}</span>
            <input
              value={manualPort}
              onChange={(event) => setManualPort(event.target.value)}
              placeholder="22"
              className="w-full rounded-2xl border border-[#E7DECF] bg-[#FBF8F3] px-3 py-2.5 text-sm text-[#2C2C2C] outline-none placeholder:text-[#A49B90]"
            />
          </label>

          {sourceMode === "manual_path" ? (
            <label className="space-y-2 text-sm">
              <span className="text-[#5F564B]">{t("compute.register.keyPath")}</span>
              <input
                value={manualKeyPath}
                onChange={(event) => setManualKeyPath(event.target.value)}
                placeholder="~/.ssh/id_rsa"
                className="w-full rounded-2xl border border-[#E7DECF] bg-[#FBF8F3] px-3 py-2.5 text-sm text-[#2C2C2C] outline-none placeholder:text-[#A49B90]"
              />
            </label>
          ) : (
            <div className="space-y-2 text-sm md:col-span-1">
              <span className="block text-[#5F564B]">{t("compute.register.pemFile")}</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-between rounded-2xl border border-dashed border-[#D8CEBF] bg-[#FBF8F3] px-4 py-3 text-left"
              >
                <span className="text-sm text-[#2C2C2C]">
                  {selectedPem?.name || t("compute.register.choosePem")}
                </span>
                <Upload className="h-4 w-4 text-[#8E8478]" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pem"
                className="hidden"
                onChange={(event) => setSelectedPem(event.target.files?.[0] || null)}
              />
            </div>
          )}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="text-[#5F564B]">{t("compute.register.ssmTarget")}</span>
          <input
            name="ssmTarget"
            placeholder={t("compute.register.ssmTargetPlaceholder")}
            className="w-full rounded-2xl border border-[#E7DECF] bg-[#FBF8F3] px-3 py-2.5 text-sm text-[#2C2C2C] outline-none placeholder:text-[#A49B90]"
          />
        </label>

        <label className="space-y-2 text-sm">
          <span className="text-[#5F564B]">{t("compute.register.lifecycle")}</span>
          <select
            name="lifecycle"
            defaultValue="idle"
            className="w-full rounded-2xl border border-[#E7DECF] bg-[#FBF8F3] px-3 py-2.5 text-sm text-[#2C2C2C] outline-none"
          >
            <option value="idle">{t("compute.lifecycle.idle")}</option>
            <option value="offline">{t("compute.lifecycle.offline")}</option>
            <option value="maintenance">{t("compute.lifecycle.maintenance")}</option>
          </select>
        </label>
      </div>

      <label className="space-y-2 text-sm">
        <span className="text-[#5F564B]">{t("compute.register.notes")}</span>
        <textarea
          name="notes"
          rows={3}
          placeholder={t("compute.register.notesPlaceholder")}
          className="w-full rounded-2xl border border-[#E7DECF] bg-[#FBF8F3] px-3 py-2.5 text-sm text-[#2C2C2C] outline-none placeholder:text-[#A49B90]"
        />
      </label>

      {error ? <p className="text-sm text-[#B94C4C]">{error}</p> : null}

      <button
        type="submit"
        disabled={isPending || pools.length === 0}
        className="rounded-full bg-[#C67A52] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#B56A42] disabled:opacity-60"
      >
        {isPending ? t("compute.register.creating") : t("compute.register.submit")}
      </button>
    </form>
  );
}
