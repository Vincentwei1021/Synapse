"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Plus, Trash2, Wrench } from "lucide-react";
import { ComputeNodeForm } from "@/components/compute-node-form";
import { ComputePoolForm } from "@/components/compute-pool-form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { authFetch } from "@/lib/auth-client";
import type { ComputePoolSnapshot } from "@/services/compute.service";

function formatAccess(node: {
  sshHost: string | null;
  sshUser: string | null;
  sshPort: number | null;
  sshKeyName?: string | null;
  sshKeySource?: string | null;
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
  } else if (node.sshKeySource && node.sshKeySource !== "manual_path") {
    parts.push(node.sshKeySource);
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

function inferAwsRegionFromHost(host: string | null) {
  if (!host) {
    return null;
  }

  const normalized = host.toLowerCase();
  const directMatch = normalized.match(/\.([a-z]{2}(?:-gov)?-[a-z-]+-\d)\.compute\.amazonaws\.com$/);
  if (directMatch?.[1]) {
    return directMatch[1];
  }

  if (normalized.endsWith(".compute-1.amazonaws.com")) {
    return "us-east-1";
  }

  return null;
}

function getInstanceTypeDisplay(node: ComputePoolSnapshot["nodes"][number]) {
  if (node.instanceType) {
    return node.instanceType;
  }

  if (/^[a-z]+\d[\w.-]*$/i.test(node.label)) {
    return node.label;
  }

  return null;
}

function getRegionDisplay(node: ComputePoolSnapshot["nodes"][number]) {
  return node.region || inferAwsRegionFromHost(node.sshHost);
}

type DeleteTarget =
  | {
      type: "pool";
      uuid: string;
      name: string;
    }
  | {
      type: "node";
      uuid: string;
      name: string;
      poolName: string;
    };

export function ComputePageClient({
  locale,
  pools,
}: {
  locale: string;
  pools: ComputePoolSnapshot[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [createPoolOpen, setCreatePoolOpen] = useState(false);
  const [managePoolsOpen, setManagePoolsOpen] = useState(false);
  const [addMachinePool, setAddMachinePool] = useState<{ uuid: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  const nodes = pools.flatMap((pool) => pool.nodes);
  const gpus = nodes.flatMap((node) => node.gpus);
  const busyGpus = gpus.filter((gpu) => gpu.computedStatus === "busy").length;
  const idleGpus = gpus.filter((gpu) => gpu.computedStatus === "available").length;

  async function handleDeleteConfirm() {
    if (!deleteTarget) {
      return;
    }

    setIsDeleting(true);
    setManageError(null);

    try {
      const endpoint =
        deleteTarget.type === "pool"
          ? `/api/compute-pools/${deleteTarget.uuid}`
          : `/api/compute-nodes/${deleteTarget.uuid}`;
      const response = await authFetch(endpoint, { method: "DELETE" });
      const json = await response.json().catch(() => null);

      if (!response.ok || !json?.success) {
        throw new Error(json?.error || t("common.genericError"));
      }

      setDeleteTarget(null);
      router.refresh();
    } catch (error) {
      setManageError(
        error instanceof Error && error.message
          ? error.message
          : t("common.genericError")
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <div className="space-y-6">
        <div className="rounded-[32px] border border-border bg-card p-7 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t("compute.header.eyebrow")}
              </p>
              <h1 className="mt-3 text-[28px] font-semibold tracking-tight text-foreground">
                {t("compute.header.title")}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t("compute.header.description")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => setManagePoolsOpen(true)}
              >
                <Wrench className="mr-2 h-4 w-4" />
                {t("compute.actions.managePools")}
              </Button>
              <Button className="rounded-xl" onClick={() => setCreatePoolOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                {t("compute.actions.createPool")}
              </Button>
            </div>
          </div>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label={t("compute.metrics.pools")} value={pools.length} />
          <Metric label={t("compute.metrics.machines")} value={nodes.length} />
          <Metric label={t("compute.metrics.idleGpus")} value={idleGpus} />
          <Metric label={t("compute.metrics.busyGpus")} value={busyGpus} />
        </section>

        <section className="space-y-4">
          {pools.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-border bg-card px-6 py-8 text-sm leading-7 text-muted-foreground">
              {t("compute.empty")}
            </div>
          ) : (
            pools.map((pool) => (
              <article key={pool.uuid} className="rounded-[28px] border border-border bg-card p-6 shadow-sm">
                <div className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{pool.name}</h2>
                    {pool.description ? (
                      <p className="mt-1 text-sm text-muted-foreground">{pool.description}</p>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">{t("compute.pool.noDescription")}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
                      {pool.nodes.length} {t("compute.metrics.machines")} ·{" "}
                      {pool.nodes.reduce((sum, node) => sum + node.availableGpuCount, 0)}/{pool.nodes.reduce((sum, node) => sum + node.gpuCount, 0)} GPUs {t("compute.metrics.available")}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => setAddMachinePool({ uuid: pool.uuid, name: pool.name })}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      {t("compute.actions.addMachine")}
                    </Button>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  {pool.nodes.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border bg-secondary/40 px-4 py-5 text-sm text-muted-foreground">
                      {t("compute.pool.emptyMachines")}
                    </div>
                  ) : (
                    pool.nodes.map((node) => (
                      <div key={node.uuid} className="rounded-[24px] border border-border bg-secondary/40 p-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-base font-semibold text-foreground">{node.label}</p>
                              <label className="flex cursor-pointer items-center gap-2">
                                <Switch
                                  checked={node.telemetryEnabled}
                                  onCheckedChange={async (checked) => {
                                    await fetch(`/api/compute-nodes/${node.uuid}`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ telemetryEnabled: checked }),
                                    });
                                    router.refresh();
                                  }}
                                />
                                <span className="text-xs text-muted-foreground">{t("compute.telemetry")}</span>
                              </label>
                            </div>
                            <div className="grid gap-x-6 gap-y-1 text-sm text-muted-foreground md:grid-cols-2">
                              <p>{t("compute.machine.instanceType")}: {getInstanceTypeDisplay(node) ?? t("compute.machine.pending")}</p>
                              <p>{t("compute.machine.region")}: {getRegionDisplay(node) ?? t("compute.machine.pending")}</p>
                              <p>{t("compute.machine.lastProbe")}: {formatTimestamp(node.lastReportedAt, locale, t("compute.machine.waitingProbe"))}</p>
                              <p>{t("compute.machine.connection")}: {formatAccess(node) || t("compute.machine.noAccess")}</p>
                            </div>
                          </div>
                          <div className="rounded-2xl bg-background px-4 py-3 text-sm text-muted-foreground shadow-sm">
                            <p className="font-medium text-foreground">
                              {node.gpuCount > 0
                                ? `${node.availableGpuCount}/${node.gpuCount} ${t("compute.machine.idleNow")}`
                                : t("compute.machine.inventoryPending")}
                            </p>
                            {node.notes ? (
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">{node.notes}</p>
                            ) : null}
                          </div>
                        </div>

                        {node.gpuCount === 0 ? (
                          <div className="mt-4 rounded-2xl border border-dashed border-border bg-background px-4 py-4 text-sm leading-6 text-muted-foreground">
                            {t("compute.machine.inventoryHint")}
                          </div>
                        ) : (
                          <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-background">
                            <div className="grid grid-cols-[92px_minmax(180px,1.1fr)_130px_130px_120px_170px] border-b border-border bg-secondary/50 px-4 py-3 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
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
                                className="grid grid-cols-[92px_minmax(180px,1.1fr)_130px_130px_120px_170px] items-center px-4 py-3 text-sm text-foreground [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border"
                              >
                                <span className="font-medium">GPU {gpu.slotIndex}</span>
                                <div>
                                  <p>{gpu.model}</p>
                                  {gpu.notes ? <p className="text-xs text-muted-foreground">{gpu.notes}</p> : null}
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
                                        ? "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300"
                                        : gpu.computedStatus === "available"
                                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                                          : "bg-secondary text-muted-foreground"
                                    }`}
                                  >
                                    {gpu.activeReservation
                                      ? t("compute.status.occupied")
                                      : t(`compute.status.${gpu.computedStatus}`)}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
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

      <Dialog open={createPoolOpen} onOpenChange={setCreatePoolOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t("compute.pool.title")}</DialogTitle>
            <DialogDescription>{t("compute.pool.description")}</DialogDescription>
          </DialogHeader>
          <ComputePoolForm
            embedded
            onSuccess={() => {
              setCreatePoolOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(addMachinePool)}
        onOpenChange={(open) => {
          if (!open) {
            setAddMachinePool(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("compute.register.title")}</DialogTitle>
            <DialogDescription>
              {addMachinePool
                ? t("compute.register.addingToPool", { pool: addMachinePool.name })
                : t("compute.register.description")}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[68vh] pr-4">
            <ComputeNodeForm
              pools={pools.map((pool) => ({ uuid: pool.uuid, name: pool.name }))}
              defaultPoolUuid={addMachinePool?.uuid}
              hidePoolSelect={Boolean(addMachinePool)}
              embedded
              onSuccess={() => {
                setAddMachinePool(null);
              }}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={managePoolsOpen} onOpenChange={setManagePoolsOpen}>
        <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("compute.manage.title")}</DialogTitle>
            <DialogDescription>{t("compute.manage.description")}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[68vh] pr-4">
            <div className="space-y-3">
              {manageError ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {manageError}
                </div>
              ) : null}
              {pools.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-secondary/30 px-4 py-6 text-sm text-muted-foreground">
                  {t("compute.manage.empty")}
                </div>
              ) : (
                pools.map((pool) => (
                  <ManagePoolItem
                    key={pool.uuid}
                    pool={pool}
                    onDeletePool={() =>
                      setDeleteTarget({
                        type: "pool",
                        uuid: pool.uuid,
                        name: pool.name,
                      })}
                    onDeleteNode={(nodeUuid, nodeLabel) =>
                      setDeleteTarget({
                        type: "node",
                        uuid: nodeUuid,
                        name: nodeLabel,
                        poolName: pool.name,
                      })}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => {
        if (!open) {
          setDeleteTarget(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.type === "pool"
                ? t("compute.manage.deletePoolTitle")
                : t("compute.manage.deleteMachineTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "pool"
                ? t("compute.manage.deletePoolDescription", { name: deleteTarget.name })
                : t("compute.manage.deleteMachineDescription", {
                    name: deleteTarget?.name ?? "",
                    pool: deleteTarget?.type === "node" ? deleteTarget.poolName : "",
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteConfirm();
              }}
            >
              {isDeleting ? t("common.processing") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ManagePoolItem({
  pool,
  onDeletePool,
  onDeleteNode,
}: {
  pool: ComputePoolSnapshot;
  onDeletePool: () => void;
  onDeleteNode: (nodeUuid: string, nodeLabel: string) => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="rounded-2xl border-border bg-card p-0 shadow-none">
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <CollapsibleTrigger className="flex flex-1 items-center gap-3 text-left">
            {open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{pool.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {pool.nodes.length} {t("compute.metrics.machines")} ·{" "}
                {pool.nodes.reduce((sum, node) => sum + node.gpuCount, 0)} GPUs
              </p>
            </div>
          </CollapsibleTrigger>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onDeletePool}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            {t("compute.manage.deletePool")}
          </Button>
        </div>

        <CollapsibleContent>
          <div className="border-t border-border px-4 py-3">
            {pool.nodes.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("compute.pool.emptyMachines")}</p>
            ) : (
              <div className="space-y-2">
                {pool.nodes.map((node) => (
                  <div
                    key={node.uuid}
                    className="flex flex-col gap-3 rounded-xl border border-border bg-secondary/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{node.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {node.gpuCount} GPUs · {node.sshHost ?? node.ssmTarget ?? t("compute.machine.noAccess")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => onDeleteNode(node.uuid, node.label)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      {t("compute.manage.deleteMachine")}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[118px] rounded-[22px] border border-border bg-card px-4 py-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-[28px] font-semibold leading-none text-foreground">{value}</p>
    </div>
  );
}
