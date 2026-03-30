"use client";

import { FlaskConical, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { ExperimentRegistry } from "@/generated/prisma/client";
import { JsonKeyValue, type TaskDetail } from "./run-detail-panel-shared";

interface RunDetailConfigProps {
  registryData: ExperimentRegistry | null;
  task: TaskDetail;
}

export function RunDetailConfig({ registryData, task }: RunDetailConfigProps) {
  if (!task.experimentConfig) {
    return null;
  }

  return (
    <div className="mt-5">
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-[#C67A52]" />
          <span className="text-[13px] font-semibold text-[#2C2C2C]">
            Experiment Configuration
          </span>
        </div>

        <div className="mb-3">
          <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-[#9A9A9A]">
            Configuration
          </label>
          <JsonKeyValue data={task.experimentConfig} />
        </div>

        {task.experimentResults && (
          <div className="mb-3">
            <Separator className="my-3 bg-[#F5F2EC]" />
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-[#9A9A9A]">
              Results
            </label>
            <JsonKeyValue data={task.experimentResults} />
          </div>
        )}

        {task.outcome && (
          <>
            <Separator className="my-3 bg-[#F5F2EC]" />
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-[#9A9A9A]">Outcome:</span>
              <Badge
                className={
                  task.outcome === "accepted"
                    ? "bg-green-50 text-green-700"
                    : task.outcome === "rejected"
                      ? "bg-red-50 text-red-700"
                      : "bg-yellow-50 text-yellow-700"
                }
              >
                {task.outcome}
              </Badge>
            </div>
          </>
        )}

        {registryData && (
          <>
            <Separator className="my-3 bg-[#F5F2EC]" />
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-[#9A9A9A]">
              Registry
            </label>

            {registryData.environment && typeof registryData.environment === "object" && (
              <div className="mb-2">
                <span className="text-[11px] font-medium text-[#6B6B6B]">Environment</span>
                <div className="mt-1">
                  <JsonKeyValue data={registryData.environment as Record<string, unknown>} />
                </div>
              </div>
            )}

            {registryData.seed !== null && registryData.seed !== undefined && (
              <div className="mb-2 flex items-center gap-2 text-[13px]">
                <span className="font-medium text-[#6B6B6B]">Seed</span>
                <span className="text-[#2C2C2C]">{registryData.seed}</span>
              </div>
            )}

            <div className="mb-2 flex items-center gap-2">
              <Shield className="h-3.5 w-3.5 text-[#6B6B6B]" />
              <span className="text-[11px] font-medium text-[#6B6B6B]">Reproducibility:</span>
              {registryData.reproducible ? (
                <Badge className="bg-green-50 text-[10px] text-green-700">Verified</Badge>
              ) : (
                <Badge className="bg-[#F5F5F5] text-[10px] text-[#9A9A9A]">Unverified</Badge>
              )}
            </div>

            <div className="space-y-1 text-[11px] text-[#6B6B6B]">
              <div>Started: {new Date(registryData.startedAt).toLocaleString()}</div>
              {registryData.completedAt && (
                <div>Completed: {new Date(registryData.completedAt).toLocaleString()}</div>
              )}
              <div>Registered: {new Date(registryData.createdAt).toLocaleString()}</div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
