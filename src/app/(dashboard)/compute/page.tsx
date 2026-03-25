import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ComputeNodeForm } from "@/components/compute-node-form";
import { ComputePoolForm } from "@/components/compute-pool-form";
import { LiveDataRefresher } from "@/components/live-data-refresher";
import { getServerAuthContext } from "@/lib/auth-server";
import { listComputePools } from "@/services/compute.service";

export const dynamic = "force-dynamic";

function formatAccess(node: {
  sshHost: string | null;
  sshUser: string | null;
  sshPort: number | null;
  sshKeyName?: string | null;
  sshKeyPath: string | null;
  ssmTarget: string | null;
}) {
  const parts: string[] = [];
  if (node.sshHost) {
    parts.push(`${node.sshUser ?? "ubuntu"}@${node.sshHost}:${node.sshPort ?? 22}`);
  }
  if (node.ssmTarget) {
    parts.push(`SSM ${node.ssmTarget}`);
  }
  if (node.sshKeyName) {
    parts.push(node.sshKeyName);
  } else if (node.sshKeyPath) {
    parts.push(node.sshKeyPath);
  }
  return parts.join(" · ");
}

function formatTimestamp(value: string | null, locale: string, fallback: string) {
  if (!value) {
    return fallback;
  }

  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export default async function ComputePage() {
  const auth = await getServerAuthContext();
  if (!auth) {
    redirect("/login");
  }

  const t = await getTranslations();
  const locale = await getLocale();
  const pools = await listComputePools(auth.companyUuid);
  const nodes = pools.flatMap((pool) => pool.nodes);
  const gpus = nodes.flatMap((node) => node.gpus);
  const busyGpus = gpus.filter((gpu) => gpu.computedStatus === "busy").length;
  const idleGpus = gpus.filter((gpu) => gpu.computedStatus === "available").length;

  return (
    <div className="space-y-6 p-4 md:p-8">
      <LiveDataRefresher intervalMs={10_000} />

      <div className="rounded-[32px] border border-[#E4DBD0] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,244,238,0.96))] p-7 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#A39787]">
              {t("compute.header.eyebrow")}
            </p>
            <h1 className="mt-3 text-[28px] font-semibold tracking-tight text-[#2C2C2C]">
              {t("compute.header.title")}
            </h1>
            <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">{t("compute.header.description")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label={t("compute.metrics.pools")} value={pools.length} />
            <Metric label={t("compute.metrics.machines")} value={nodes.length} />
            <Metric label={t("compute.metrics.idleGpus")} value={idleGpus} />
            <Metric label={t("compute.metrics.busyGpus")} value={busyGpus} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-6">
          <ComputePoolForm />
          <ComputeNodeForm pools={pools.map((pool) => ({ uuid: pool.uuid, name: pool.name }))} />
        </div>

        <section className="space-y-4">
          {pools.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-[#D8CEBF] bg-white px-6 py-8 text-sm leading-7 text-[#6B6B6B]">
              {t("compute.empty")}
            </div>
          ) : (
            pools.map((pool) => (
              <article key={pool.uuid} className="rounded-[28px] border border-[#E5DED3] bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 border-b border-[#EEE5DA] pb-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-[#2C2C2C]">{pool.name}</h2>
                    {pool.description ? (
                      <p className="mt-1 text-sm text-[#6B6B6B]">{pool.description}</p>
                    ) : (
                      <p className="mt-1 text-sm text-[#8E8478]">{t("compute.pool.noDescription")}</p>
                    )}
                  </div>
                  <div className="rounded-full bg-[#F5F2EC] px-3 py-1 text-xs text-[#6B6B6B]">
                    {pool.nodes.length} {t("compute.metrics.machines")} ·{" "}
                    {pool.nodes.reduce((sum, node) => sum + node.gpuCount, 0)} GPUs
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  {pool.nodes.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#D8CEBF] bg-[#FBF8F3] px-4 py-5 text-sm text-[#6B6B6B]">
                      {t("compute.pool.emptyMachines")}
                    </div>
                  ) : (
                    pool.nodes.map((node) => (
                      <div key={node.uuid} className="rounded-[24px] border border-[#ECE3D8] bg-[#FCFAF6] p-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-base font-semibold text-[#2C2C2C]">{node.label}</p>
                              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] text-[#7D7468]">
                                {t(`compute.lifecycle.${node.lifecycle}`)}
                              </span>
                            </div>
                            <div className="grid gap-x-6 gap-y-1 text-sm text-[#6B6B6B] md:grid-cols-2">
                              <p>{t("compute.machine.instanceType")}: {node.instanceType ?? t("compute.machine.pending")}</p>
                              <p>{t("compute.machine.region")}: {node.region ?? t("compute.machine.pending")}</p>
                              <p>{t("compute.machine.lastProbe")}: {formatTimestamp(node.lastReportedAt, locale, t("compute.machine.waitingProbe"))}</p>
                              <p>{t("compute.machine.connection")}: {formatAccess(node) || t("compute.machine.noAccess")}</p>
                            </div>
                          </div>
                          <div className="rounded-2xl bg-white px-4 py-3 text-sm text-[#6B6B6B] shadow-sm">
                            <p className="font-medium text-[#2C2C2C]">
                              {node.gpuCount > 0
                                ? `${node.availableGpuCount}/${node.gpuCount} ${t("compute.machine.idleNow")}`
                                : t("compute.machine.inventoryPending")}
                            </p>
                            {node.notes ? <p className="mt-1 text-xs leading-5 text-[#8E8478]">{node.notes}</p> : null}
                          </div>
                        </div>

                        {node.gpuCount === 0 ? (
                          <div className="mt-4 rounded-2xl border border-dashed border-[#D8CEBF] bg-white px-4 py-4 text-sm leading-6 text-[#6B6B6B]">
                            {t("compute.machine.inventoryHint")}
                          </div>
                        ) : (
                          <div className="mt-4 overflow-hidden rounded-2xl border border-[#E8DFD3] bg-white">
                            <div className="grid grid-cols-[92px_minmax(180px,1.1fr)_130px_130px_120px_170px] border-b border-[#F0E8DE] bg-[#FBF8F3] px-4 py-3 text-xs font-medium uppercase tracking-[0.12em] text-[#9A8F81]">
                              <span>{t("compute.table.gpu")}</span>
                              <span>{t("compute.table.model")}</span>
                              <span>{t("compute.table.memory")}</span>
                              <span>{t("compute.table.utilization")}</span>
                              <span>{t("compute.table.temperature")}</span>
                              <span>{t("compute.table.status")}</span>
                            </div>
                            {node.gpus.map((gpu) => (
                              <div
                                key={gpu.uuid}
                                className="grid grid-cols-[92px_minmax(180px,1.1fr)_130px_130px_120px_170px] items-center px-4 py-3 text-sm text-[#2C2C2C] [&:not(:last-child)]:border-b [&:not(:last-child)]:border-[#F5EEE6]"
                              >
                                <span className="font-medium">GPU {gpu.slotIndex}</span>
                                <div>
                                  <p>{gpu.model}</p>
                                  {gpu.notes ? <p className="text-xs text-[#8E8478]">{gpu.notes}</p> : null}
                                </div>
                                <span>
                                  {gpu.memoryGb
                                    ? `${gpu.memoryUsedGb ?? 0} / ${gpu.memoryGb} GB`
                                    : t("compute.machine.pending")}
                                </span>
                                <span>
                                  {gpu.utilizationPercent !== null
                                    ? `${gpu.utilizationPercent}%`
                                    : t("compute.machine.pending")}
                                </span>
                                <span>
                                  {gpu.temperatureC !== null
                                    ? `${gpu.temperatureC}°C`
                                    : t("compute.machine.pending")}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                      gpu.activeReservation
                                        ? "bg-[#FFF3E0] text-[#E65100]"
                                        : gpu.computedStatus === "available"
                                          ? "bg-[#E8F5E9] text-[#5A9E6F]"
                                          : "bg-[#F0ECE6] text-[#7D7468]"
                                    }`}
                                  >
                                    {gpu.activeReservation
                                      ? t("compute.status.occupied")
                                      : t(`compute.status.${gpu.computedStatus}`)}
                                  </span>
                                  <span className="text-xs text-[#6B6B6B]">
                                    {gpu.activeReservation?.itemTitle || t("compute.status.idleLabel")}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[118px] rounded-[22px] border border-[#E7E0D5] bg-white/90 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#A39787]">{label}</p>
      <p className="mt-2 text-[28px] font-semibold leading-none text-[#2C2C2C]">{value}</p>
    </div>
  );
}
