interface AgentOption {
  uuid: string;
  name: string;
}

export function getRelatedWorksTaskUiState({
  activeAgentUuid,
  selectedAgentUuid,
  agents,
}: {
  activeAgentUuid: string | null;
  selectedAgentUuid: string;
  agents: AgentOption[];
}) {
  const resolvedActiveAgentUuid = activeAgentUuid ?? "";
  const resolvedSelectedAgentUuid = selectedAgentUuid || resolvedActiveAgentUuid;

  return {
    isRunning: Boolean(resolvedActiveAgentUuid),
    activeAgentUuid: resolvedActiveAgentUuid,
    selectedAgentUuid: resolvedSelectedAgentUuid,
    activeAgentName:
      agents.find((agent) => agent.uuid === resolvedActiveAgentUuid)?.name ?? "",
  };
}
