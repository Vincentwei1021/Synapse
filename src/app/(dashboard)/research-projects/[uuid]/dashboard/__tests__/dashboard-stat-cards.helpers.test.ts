import { describe, expect, it } from "vitest";

import { getDashboardCardAgents } from "@/app/(dashboard)/research-projects/[uuid]/dashboard/dashboard-stat-cards.helpers";
import type { AgentActivitySummary } from "@/services/agent-activity.service";

describe("dashboard stat card helpers", () => {
  const activity: AgentActivitySummary = {
    relatedWorks: [{ uuid: "agent-paper", name: "Paper Scout", color: "cyan" }],
    experiments: [{ uuid: "agent-exp", name: "Runner", color: "emerald" }],
    researchQuestions: [{ uuid: "agent-rq", name: "Questioner", color: "orange" }],
    insights: [],
    documents: [{ uuid: "agent-doc", name: "Writer", color: "violet" }],
  };

  it("maps related works cards to the related works activity lane", () => {
    expect(
      getDashboardCardAgents(`/research-projects/test-project/related-works`, activity),
    ).toEqual(activity.relatedWorks);
  });

  it("maps research questions and document cards to their matching lanes", () => {
    expect(
      getDashboardCardAgents(`/research-projects/test-project/research-questions`, activity),
    ).toEqual(activity.researchQuestions);

    expect(
      getDashboardCardAgents(`/research-projects/test-project/documents`, activity),
    ).toEqual(activity.documents);
  });
});
