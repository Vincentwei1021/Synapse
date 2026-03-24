import { redirect } from "next/navigation";
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
  sshKeyPath: string | null;
  ssmTarget: string | null;
}) {
  const parts: string[] = [];
  if (node.sshHost) {
    parts.push(`SSH ${node.sshUser ?? "ubuntu"}@${node.sshHost}:${node.sshPort ?? 22}`);
  }
  if (node.ssmTarget) {
    parts.push(`SSM ${node.ssmTarget}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "No access method configured";
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Waiting for first probe";
  }
  return new Intl.DateTimeFormat("en", {
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

  const pools = await listComputePools(auth.companyUuid);
  const nodes = pools.flatMap((pool) => pool.nodes);
  const gpus = nodes.flatMap((node) => node.gpus);
  const busyGpus = gpus.filter((gpu) => gpu.computedStatus === "busy").length;
  const availableGpus = gpus.filter((gpu) => gpu.computedStatus === "available").length;

  return (
    <div className="space-y-6 p-4 md:p-8">
      <LiveDataRefresher intervalMs={10_000} />

      <div className="rounded-[34px] border border-[#E4DBD0] bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(243,247,241,0.96))] p-7 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#A39787]">Research Compute</p>
        <h1 className="mt-3 text-[28px] font-semibold tracking-tight text-[#2C2C2C]">GPU Capacity Board</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6B6B6B]">
          Register EC2 machines, let agents discover per-GPU availability over MCP, and keep telemetry fresh with a
          backend `nvidia-smi` probe every 10 seconds.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Pools" value={pools.length} helper="Logical groups of research capacity" />
          <Metric label="Machines" value={nodes.length} helper="Reachable EC2 instances registered here" />
          <Metric label="Available GPUs" value={availableGpus} helper="Idle slices agents can reserve right now" />
          <Metric label="Busy GPUs" value={busyGpus} helper="Currently attached to active experiment runs" />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_380px_minmax(0,1fr)]">
        <div className="space-y-4">
          <ComputePoolForm />
          <div className="rounded-[28px] border border-[#E5DED3] bg-white p-6">
            <p className="text-sm font-semibold text-[#2C2C2C]">Operational notes</p>
            <div className="mt-4 space-y-3">
              {[
                "A single machine can expose multiple GPUs, and each GPU is tracked independently.",
                "You only need host access to register a machine. Inventory can be synced later by the agent.",
                "OpenClaw or Claude Code agents receive SSH or SSM details from MCP and choose where to execute.",
                "When a run starts, the platform marks only the selected GPUs as occupied instead of locking the whole machine.",
              ].map((note) => (
                <div key={note} className="rounded-[20px] bg-[#FBF8F3] px-4 py-3 text-sm leading-6 text-[#655F58]">
                  {note}
                </div>
              ))}
            </div>
          </div>
        </div>

        <ComputeNodeForm pools={pools.map((pool) => ({ uuid: pool.uuid, name: pool.name }))} />

        <section className="space-y-4">
          {pools.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-[#D8CEBF] bg-white px-6 py-8 text-sm leading-7 text-[#6B6B6B]">
              No compute pools registered yet. Add a pool and at least one machine to expose GPU inventory to your research agents.
            </div>
          ) : (
            pools.map((pool) => (
              <article key={pool.uuid} className="rounded-[28px] border border-[#E5DED3] bg-white p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-[#2C2C2C]">{pool.name}</h2>
                    {pool.description ? <p className="mt-1 text-sm text-[#6B6B6B]">{pool.description}</p> : null}
                  </div>
                  <span className="rounded-full bg-[#F5F2EC] px-3 py-1 text-xs text-[#6B6B6B]">
                    {pool.nodes.length} machines · {pool.nodes.reduce((sum, node) => sum + node.gpuCount, 0)} GPUs
                  </span>
                </div>

                <div className="mt-5 grid gap-3">
                  {pool.nodes.map((node) => (
                    <div key={node.uuid} className="rounded-[22px] border border-[#ECE3D8] bg-[#FBF8F3] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-[#2C2C2C]">{node.label}</p>
                          <p className="text-xs text-[#8E8478]">
                            {node.instanceType ?? "Type pending sync"} · {node.region ?? "Region pending sync"}
                          </p>
                        </div>
                        <div className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-[#7D7468]">
                          {node.gpuCount > 0 ? `${node.availableGpuCount}/${node.gpuCount} GPUs idle` : "Inventory pending"}
                        </div>
                      </div>

                      <div className="mt-3 space-y-1 text-xs text-[#6B6B6B]">
                        <p>{node.ec2InstanceId ?? "EC2 id pending sync"}</p>
                        <p>{formatAccess(node)}</p>
                        <p>Last probe: {formatTimestamp(node.lastReportedAt)}</p>
                        {node.sshKeyPath ? <p>SSH key: {node.sshKeyPath}</p> : null}
                      </div>

                      {node.gpuCount === 0 ? (
                        <div className="mt-4 rounded-[18px] border border-dashed border-[#D8CEBF] bg-white/80 px-4 py-4 text-sm leading-6 text-[#6B6B6B]">
                          No GPU inventory synced yet. After the agent logs into this machine, call `synapse_sync_node_inventory`
                          and then `synapse_report_gpu_status`.
                        </div>
                      ) : (
                        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {node.gpus.map((gpu) => (
                            <div key={gpu.uuid} className="rounded-[18px] border border-[#E5DED3] bg-white px-3 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs font-semibold text-[#2C2C2C]">GPU {gpu.slotIndex}</p>
                                  <p className="text-[11px] text-[#8E8478]">
                                    {gpu.model}
                                    {gpu.memoryGb ? ` · ${gpu.memoryGb}GB` : ""}
                                  </p>
                                </div>
                                <span
                                  className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${
                                    gpu.activeReservation
                                      ? "bg-[#FFF3E0] text-[#E65100]"
                                      : gpu.computedStatus === "available"
                                        ? "bg-[#E8F5E9] text-[#5A9E6F]"
                                        : "bg-[#F0ECE6] text-[#7D7468]"
                                  }`}
                                >
                                  {gpu.activeReservation ? "Occupied" : gpu.computedStatus}
                                </span>
                              </div>

                              <div className="mt-3 space-y-1 text-[11px] leading-5 text-[#6B6B6B]">
                                {gpu.activeReservation ? (
                                  <p>Occupied by {gpu.activeReservation.runTitle}</p>
                                ) : (
                                  <p>Idle</p>
                                )}
                                {gpu.utilizationPercent !== null ? <p>Utilization: {gpu.utilizationPercent}%</p> : null}
                                {gpu.memoryUsedGb !== null ? (
                                  <p>
                                    Memory: {gpu.memoryUsedGb}GB used
                                    {gpu.memoryGb ? ` / ${gpu.memoryGb}GB` : ""}
                                  </p>
                                ) : gpu.memoryGb ? (
                                  <p>Memory: 0GB used / {gpu.memoryGb}GB</p>
                                ) : null}
                                {gpu.temperatureC !== null ? <p>Temperature: {gpu.temperatureC}°C</p> : null}
                                <p>Last sample: {formatTimestamp(gpu.lastReportedAt)}</p>
                                {gpu.notes ? <p>{gpu.notes}</p> : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  helper,
}: {
  label: string;
  value: number;
  helper: string;
}) {
  return (
    <div className="rounded-[24px] border border-[#E7E0D5] bg-white/85 p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#A39787]">{label}</p>
      <p className="mt-3 text-[30px] font-semibold leading-none text-[#2C2C2C]">{value}</p>
      <p className="mt-3 text-xs leading-5 text-[#6B6B6B]">{helper}</p>
    </div>
  );
}
