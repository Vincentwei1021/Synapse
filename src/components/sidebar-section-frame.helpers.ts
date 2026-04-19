import { getAgentColor } from "@/lib/agent-colors";
import type { AgentSummary } from "@/services/agent-activity.service";

export function getSidebarSectionFrameGlowColors(agents: AgentSummary[]) {
  const leadAgent = agents[0];
  if (!leadAgent) {
    return null;
  }

  const { primary, light } = getAgentColor(leadAgent.uuid, leadAgent.color);
  return { primary, light };
}
