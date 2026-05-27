"use client";

import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { getAgentColor } from "@/lib/agent-colors";

export interface PaperFeedsAgentOption {
  uuid: string;
  name: string;
  type: string;
  color: string | null;
}

interface PaperFeedsAgentPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: PaperFeedsAgentOption[];
  selectedAgentUuid: string;
  onSelectAgent: (uuid: string) => void;
  onConfirm: () => void;
  submitting: boolean;
}

export function PaperFeedsAgentPicker({
  open,
  onOpenChange,
  agents,
  selectedAgentUuid,
  onSelectAgent,
  onConfirm,
  submitting,
}: PaperFeedsAgentPickerProps) {
  const t = useTranslations("paperFeeds");
  const noAgents = agents.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("agentPicker.title")}</DialogTitle>
          <DialogDescription>{t("agentPicker.description")}</DialogDescription>
        </DialogHeader>
        {noAgents ? (
          <p className="text-muted-foreground text-sm">
            {t("agentPicker.description")}
          </p>
        ) : (
          <RadioGroup
            value={selectedAgentUuid}
            onValueChange={onSelectAgent}
            className="gap-2"
          >
            {agents.map((agent) => {
              const color = getAgentColor(agent.uuid, agent.color).primary;
              return (
                <Label
                  key={agent.uuid}
                  htmlFor={`paper-feeds-agent-${agent.uuid}`}
                  className="hover:bg-muted flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2"
                >
                  <RadioGroupItem
                    id={`paper-feeds-agent-${agent.uuid}`}
                    value={agent.uuid}
                  />
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-sm font-medium">{agent.name}</span>
                </Label>
              );
            })}
          </RadioGroup>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("agentPicker.cancel")}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={submitting || noAgents || !selectedAgentUuid}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("agentPicker.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
