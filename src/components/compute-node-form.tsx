"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

type SshConfigHost = {
  alias: string;
  hostName?: string;
  user?: string;
  port?: number;
  identityFile?: string;
};

export function ComputeNodeForm({
  pools,
}: {
  pools: Array<{ uuid: string; name: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sshHosts, setSshHosts] = useState<SshConfigHost[]>([]);
  const [selectedAlias, setSelectedAlias] = useState<string>("manual");
  const [manualHost, setManualHost] = useState("");
  const [manualKeyPath, setManualKeyPath] = useState("");
  const [manualUser, setManualUser] = useState("ubuntu");
  const [manualPort, setManualPort] = useState("22");

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
        setSelectedAlias(hosts[0]?.alias ?? "manual");
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

    const sshHost = selectedAlias !== "manual" ? (selectedHost?.hostName || "") : manualHost;
    const sshKeyPath = selectedAlias !== "manual" ? (selectedHost?.identityFile || "") : manualKeyPath;
    const sshUser = selectedAlias !== "manual" ? (selectedHost?.user || "ubuntu") : manualUser || "ubuntu";
    const sshPort = selectedAlias !== "manual" ? String(selectedHost?.port ?? 22) : manualPort || "22";
    const label = String(formData.get("label") || "") || selectedHost?.alias || sshHost;

    const payload = {
      poolUuid: String(formData.get("poolUuid") || ""),
      label,
      lifecycle: String(formData.get("lifecycle") || "idle"),
      sshHost,
      sshUser,
      sshPort,
      sshKeyPath,
      ssmTarget: String(formData.get("ssmTarget") || ""),
      notes: String(formData.get("notes") || ""),
    };

    const response = await fetch("/api/compute-nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setError("Could not create the compute node.");
      return;
    }

    setManualHost("");
    setManualKeyPath("");
    router.refresh();
  }

  return (
    <form
      action={(formData) => startTransition(() => handleSubmit(formData))}
      className="space-y-4 rounded-[28px] border border-[#E5DED3] bg-white p-5"
    >
      <div>
        <p className="text-sm font-semibold text-[#2C2C2C]">Register machine access</p>
        <p className="text-xs leading-5 text-[#8E8478]">
          Start with host access only. Inventory, instance metadata, and GPU slots can be synced by the agent after first login.
        </p>
      </div>

      <select
        name="poolUuid"
        required
        defaultValue={pools[0]?.uuid}
        className="w-full rounded-2xl border border-[#E6DED2] bg-[#FBF8F3] px-3 py-2 text-sm text-[#2C2C2C] outline-none"
      >
        {pools.map((pool) => (
          <option key={pool.uuid} value={pool.uuid}>
            {pool.name}
          </option>
        ))}
      </select>

      {sshHosts.length > 0 ? (
        <div className="rounded-[22px] border border-[#E6DED2] bg-[#FBF8F3] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-[#2C2C2C]">Load from `.ssh/config`</p>
            <span className="text-[11px] uppercase tracking-[0.18em] text-[#9A9083]">{sshHosts.length} hosts</span>
          </div>
          <select
            value={selectedAlias}
            onChange={(event) => setSelectedAlias(event.target.value)}
            className="mt-3 w-full rounded-2xl border border-[#E6DED2] bg-white px-3 py-2 text-sm text-[#2C2C2C] outline-none"
          >
            <option value="manual">Manual entry</option>
            {sshHosts.map((host) => (
              <option key={host.alias} value={host.alias}>
                {host.alias}
              </option>
            ))}
          </select>

          {selectedHost ? (
            <div className="mt-3 rounded-[18px] bg-white px-4 py-3 text-xs leading-6 text-[#655F58]">
              <p>Host: {selectedHost.hostName}</p>
              <p>User: {selectedHost.user ?? "ubuntu"}</p>
              <p>Port: {selectedHost.port ?? 22}</p>
              <p>Key: {selectedHost.identityFile ?? "Not set in ssh config"}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-[22px] border border-[#E6DED2] bg-[#FBF8F3] p-4">
        <p className="text-sm font-medium text-[#2C2C2C]">Manual fallback</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            value={manualHost}
            onChange={(event) => setManualHost(event.target.value)}
            placeholder="SSH host"
            className="w-full rounded-2xl border border-[#E6DED2] bg-white px-3 py-2 text-sm text-[#2C2C2C] outline-none placeholder:text-[#A49B90]"
          />
          <input
            value={manualKeyPath}
            onChange={(event) => setManualKeyPath(event.target.value)}
            placeholder="SSH key path"
            className="w-full rounded-2xl border border-[#E6DED2] bg-white px-3 py-2 text-sm text-[#2C2C2C] outline-none placeholder:text-[#A49B90]"
          />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            value={manualUser}
            onChange={(event) => setManualUser(event.target.value)}
            placeholder="SSH user"
            className="w-full rounded-2xl border border-[#E6DED2] bg-white px-3 py-2 text-sm text-[#2C2C2C] outline-none placeholder:text-[#A49B90]"
          />
          <input
            value={manualPort}
            onChange={(event) => setManualPort(event.target.value)}
            placeholder="SSH port"
            className="w-full rounded-2xl border border-[#E6DED2] bg-white px-3 py-2 text-sm text-[#2C2C2C] outline-none placeholder:text-[#A49B90]"
          />
        </div>
      </div>

      <input
        name="label"
        placeholder="Display label (optional)"
        className="w-full rounded-2xl border border-[#E6DED2] bg-[#FBF8F3] px-3 py-2 text-sm text-[#2C2C2C] outline-none placeholder:text-[#A49B90]"
      />

      <input
        name="ssmTarget"
        placeholder="Optional SSM target"
        className="w-full rounded-2xl border border-[#E6DED2] bg-[#FBF8F3] px-3 py-2 text-sm text-[#2C2C2C] outline-none placeholder:text-[#A49B90]"
      />

      <select
        name="lifecycle"
        defaultValue="idle"
        className="w-full rounded-2xl border border-[#E6DED2] bg-[#FBF8F3] px-3 py-2 text-sm text-[#2C2C2C] outline-none"
      >
        {["idle", "offline", "maintenance"].map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>

      <input
        name="notes"
        placeholder="Optional notes"
        className="w-full rounded-2xl border border-[#E6DED2] bg-[#FBF8F3] px-3 py-2 text-sm text-[#2C2C2C] outline-none placeholder:text-[#A49B90]"
      />

      {error ? <p className="text-xs text-[#B94C4C]">{error}</p> : null}

      <button
        type="submit"
        disabled={isPending || pools.length === 0}
        className="rounded-full bg-[#1976D2] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#1565C0] disabled:opacity-60"
      >
        {isPending ? "Adding..." : "Add machine"}
      </button>
    </form>
  );
}
