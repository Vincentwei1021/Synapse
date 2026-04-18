interface AgentOption {
  uuid: string;
  name: string;
}

export function getRelatedWorksTaskUiState({
  activeAgentUuid,
  selectedAgentUuid,
  isSubmitting = false,
  agents,
}: {
  activeAgentUuid: string | null;
  selectedAgentUuid: string;
  isSubmitting?: boolean;
  agents: AgentOption[];
}) {
  const resolvedActiveAgentUuid = activeAgentUuid || (isSubmitting ? selectedAgentUuid : "") || "";
  const resolvedSelectedAgentUuid = selectedAgentUuid || resolvedActiveAgentUuid;

  return {
    isRunning: Boolean(resolvedActiveAgentUuid),
    activeAgentUuid: resolvedActiveAgentUuid,
    selectedAgentUuid: resolvedSelectedAgentUuid,
    activeAgentName:
      agents.find((agent) => agent.uuid === resolvedActiveAgentUuid)?.name ?? "",
  };
}
