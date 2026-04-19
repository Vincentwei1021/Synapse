import { describe, expect, it } from "vitest";

import { getRelatedWorksTaskUiState } from "../related-works-state";

describe("getRelatedWorksTaskUiState", () => {
  const agents = [
    { uuid: "agent-a", name: "Agent A" },
    { uuid: "agent-b", name: "Agent B" },
  ];

  it("treats any active agent as running", () => {
    expect(
      getRelatedWorksTaskUiState({
        activeAgentUuid: "agent-a",
        selectedAgentUuid: "",
        isSubmitting: false,
        agents,
      }),
    ).toMatchObject({
      isRunning: true,
      activeAgentUuid: "agent-a",
      selectedAgentUuid: "agent-a",
      activeAgentName: "Agent A",
    });
  });

  it("falls back to the manually selected agent when nothing is active", () => {
    expect(
      getRelatedWorksTaskUiState({
        activeAgentUuid: null,
        selectedAgentUuid: "agent-b",
        isSubmitting: false,
        agents,
      }),
    ).toMatchObject({
      isRunning: false,
      activeAgentUuid: "",
      selectedAgentUuid: "agent-b",
      activeAgentName: "",
    });
  });

  it("shows running state immediately while a request is being submitted", () => {
    expect(
      getRelatedWorksTaskUiState({
        activeAgentUuid: null,
        selectedAgentUuid: "agent-b",
        isSubmitting: true,
        agents,
      }),
    ).toMatchObject({
      isRunning: true,
      activeAgentUuid: "agent-b",
      selectedAgentUuid: "agent-b",
      activeAgentName: "Agent B",
    });
  });
});
