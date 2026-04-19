"use client";

import Link from "next/link";
import { BookOpen, FileText, FlaskConical, Lightbulb } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SidebarSectionFrame } from "@/components/sidebar-section-frame";
import { useAgentActivity } from "@/hooks/use-agent-activity";
import { getDashboardCardAgents } from "./dashboard-stat-cards.helpers";

type IconName = "relatedWorks" | "researchQuestions" | "experiments" | "documents";

const ICONS = {
  relatedWorks: BookOpen,
  researchQuestions: Lightbulb,
  experiments: FlaskConical,
  documents: FileText,
} as const;

interface DashboardStatCardProps {
  projectUuid: string;
  href: string;
  title: string;
  value: number;
  helper: string;
  icon: IconName;
  iconBg: string;
  iconColor: string;
}

export function DashboardStatCard({
  projectUuid,
  href,
  title,
  value,
  helper,
  icon,
  iconBg,
  iconColor,
}: DashboardStatCardProps) {
  const activity = useAgentActivity(projectUuid);
  const agents = getDashboardCardAgents(href, activity);
  const Icon = ICONS[icon];

  return (
    <SidebarSectionFrame agents={agents} appearance="glow" className="h-full rounded-[28px]">
      <Link href={href} className="block h-full">
        <Card
          className={`h-full rounded-[28px] bg-card p-5 transition hover:border-primary/30 hover:shadow-sm ${
            agents.length > 0 ? "border-transparent" : "border-border"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-semibold text-foreground">{title}</p>
              <p className="mt-3 text-[30px] font-semibold leading-none text-foreground">{value}</p>
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{helper}</p>
            </div>
            <div className={`rounded-2xl p-3 ${iconBg}`}>
              <Icon className={`h-5 w-5 ${iconColor}`} />
            </div>
          </div>
        </Card>
      </Link>
    </SidebarSectionFrame>
  );
}
