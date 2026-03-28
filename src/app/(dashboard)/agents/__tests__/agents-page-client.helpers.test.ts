import { describe, expect, it } from "vitest";
import { formatAgentApiKeyCreatedAt } from "@/app/(dashboard)/agents/agents-page-client.helpers";

describe("agents page helpers", () => {
  it("formats API key created dates using the active locale", () => {
    const date = "2026-03-28T00:00:00.000Z";

    const english = formatAgentApiKeyCreatedAt(date, "en-US");
    const chinese = formatAgentApiKeyCreatedAt(date, "zh-CN");

    expect(english).toMatch(/Mar/);
    expect(chinese).toMatch(/2026.*3.*28/);
    expect(chinese).not.toEqual(english);
  });
});
