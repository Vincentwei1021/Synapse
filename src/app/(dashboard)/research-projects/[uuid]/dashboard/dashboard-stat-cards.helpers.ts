import type { AgentActivitySummary, AgentSummary } from "@/services/agent-activity.service";

export function getDashboardCardAgents(
  href: string,
  activity: AgentActivitySummary,
): AgentSummary[] {
  if (href.endsWith("/related-works")) return activity.relatedWorks;
  if (href.endsWith("/research-questions")) return activity.researchQuestions;
  if (href.endsWith("/experiments")) return activity.experiments;
  if (href.endsWith("/documents")) return activity.documents;
  return [];
}

