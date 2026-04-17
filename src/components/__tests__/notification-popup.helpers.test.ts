import { describe, expect, it } from "vitest";

import {
  formatNotificationEntityLine,
  getNotificationCardClassName,
  getNotificationStatusLine,
} from "@/components/notification-popup.helpers";

describe("notification-popup helpers", () => {
  const labels = {
    paper: "Paper",
    researchQuestion: "RQ",
    experiment: "Experiment",
    document: "Document",
    relatedWork: "Paper",
    experimentRun: "Run",
    experimentDesign: "Design",
  };

  it("formats the entity line with a compact entity label", () => {
    expect(
      formatNotificationEntityLine(
        { entityType: "related_work", entityTitle: "Attention Is All You Need" },
        labels,
      ),
    ).toBe("Paper: Attention Is All You Need");
  });

  it("uses the translated action line without appending relative time", () => {
    expect(getNotificationStatusLine("experiment_progress", (key) => key)).toBe(
      "types.experiment_progress",
    );
  });

  it("returns the fixed-size theme-aware card classes", () => {
    const className = getNotificationCardClassName({ unread: true });

    expect(className).toContain("h-24");
    expect(className).toContain("bg-white");
    expect(className).toContain("dark:bg-black");
    expect(className).toContain("hover:bg-white/95");
    expect(className).toContain("dark:hover:bg-black/90");
  });
});
