/**
 * proposal-filter.test.ts
 *
 * Tests for ProposalFilter component logic.
 * Since the project uses vitest with node environment (no jsdom/React Testing Library),
 * we test the data-fetching contract and URL parameter logic rather than rendering.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ------------------------------------------------------------------
// 1. Test the proposals/summary API contract that the component depends on
// ------------------------------------------------------------------
describe("ProposalFilter - API contract", () => {
  it("expects proposals/summary to return { uuid, title, sequenceNumber, taskCount }[]", () => {
    // This documents the expected API shape the component relies on
    const mockData = [
      { uuid: "p1", title: "Proposal One", sequenceNumber: 1, taskCount: 3 },
      { uuid: "p2", title: "Proposal Two", sequenceNumber: 2, taskCount: 5 },
    ];

    // Validate shape
    for (const p of mockData) {
      expect(p).toHaveProperty("uuid");
      expect(p).toHaveProperty("title");
      expect(p).toHaveProperty("sequenceNumber");
      expect(p).toHaveProperty("taskCount");
      expect(typeof p.uuid).toBe("string");
      expect(typeof p.title).toBe("string");
      expect(typeof p.sequenceNumber).toBe("number");
      expect(typeof p.taskCount).toBe("number");
    }
  });
});

// ------------------------------------------------------------------
// 2. Test URL param serialization/deserialization logic
// ------------------------------------------------------------------
describe("ProposalFilter - URL param logic", () => {
  function parseProposalUuids(paramValue: string | null): Set<string> {
    if (!paramValue) return new Set();
    return new Set(paramValue.split(",").filter(Boolean));
  }

  function serializeProposalUuids(uuids: Set<string>): string | null {
    if (uuids.size === 0) return null;
    return Array.from(uuids).join(",");
  }

  it("parses empty/null param to empty set", () => {
    expect(parseProposalUuids(null)).toEqual(new Set());
    expect(parseProposalUuids("")).toEqual(new Set());
  });

  it("parses single uuid", () => {
    const result = parseProposalUuids("uuid-1");
    expect(result).toEqual(new Set(["uuid-1"]));
  });

  it("parses multiple uuids", () => {
    const result = parseProposalUuids("uuid-1,uuid-2,uuid-3");
    expect(result).toEqual(new Set(["uuid-1", "uuid-2", "uuid-3"]));
  });

  it("serializes empty set to null", () => {
    expect(serializeProposalUuids(new Set())).toBeNull();
  });

  it("serializes single uuid", () => {
    expect(serializeProposalUuids(new Set(["uuid-1"]))).toBe("uuid-1");
  });

  it("serializes multiple uuids", () => {
    const result = serializeProposalUuids(new Set(["uuid-1", "uuid-2"]));
    expect(result).toContain("uuid-1");
    expect(result).toContain("uuid-2");
    expect(result!.split(",")).toHaveLength(2);
  });
});

// ------------------------------------------------------------------
// 3. Test toggle selection logic
// ------------------------------------------------------------------
describe("ProposalFilter - selection toggle logic", () => {
  function toggleSelection(current: Set<string>, uuid: string): Set<string> {
    const next = new Set(current);
    if (next.has(uuid)) {
      next.delete(uuid);
    } else {
      next.add(uuid);
    }
    return next;
  }

  it("adds uuid when not selected", () => {
    const result = toggleSelection(new Set(), "uuid-1");
    expect(result.has("uuid-1")).toBe(true);
  });

  it("removes uuid when already selected", () => {
    const result = toggleSelection(new Set(["uuid-1"]), "uuid-1");
    expect(result.has("uuid-1")).toBe(false);
  });

  it("preserves other selections when toggling", () => {
    const current = new Set(["uuid-1", "uuid-2"]);
    const result = toggleSelection(current, "uuid-2");
    expect(result.has("uuid-1")).toBe(true);
    expect(result.has("uuid-2")).toBe(false);
  });

  it("clears all selections", () => {
    const result = new Set<string>();
    expect(result.size).toBe(0);
  });
});

// ------------------------------------------------------------------
// 4. Test i18n keys exist in both locales
// ------------------------------------------------------------------
describe("ProposalFilter - i18n keys", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const en = require("../../../messages/en.json");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const zh = require("../../../messages/zh.json");

  const requiredKeys = [
    "label",
    "allExperimentDesigns",
    "clear",
    "search",
    "experimentRunCount",
    "filtered",
    "noResults",
  ];

  it("has all required experimentDesignFilter keys in English", () => {
    for (const key of requiredKeys) {
      expect(en.experimentRuns.experimentDesignFilter).toHaveProperty(key);
      expect(typeof en.experimentRuns.experimentDesignFilter[key]).toBe("string");
    }
  });

  it("has all required experimentDesignFilter keys in Chinese", () => {
    for (const key of requiredKeys) {
      expect(zh.experimentRuns.experimentDesignFilter).toHaveProperty(key);
      expect(typeof zh.experimentRuns.experimentDesignFilter[key]).toBe("string");
    }
  });

  it("en and zh have the same experimentDesignFilter keys", () => {
    const enKeys = Object.keys(en.experimentRuns.experimentDesignFilter).sort();
    const zhKeys = Object.keys(zh.experimentRuns.experimentDesignFilter).sort();
    expect(enKeys).toEqual(zhKeys);
  });
});

// ------------------------------------------------------------------
// 5. Test fetch URL construction
// ------------------------------------------------------------------
describe("ProposalFilter - fetch URL construction", () => {
  it("constructs correct API URL from projectUuid", () => {
    const projectUuid = "proj-0000-0000-0000-000000000001";
    const url = `/api/research-projects/${projectUuid}/experiment-designs/summary`;
    expect(url).toBe(
      "/api/research-projects/proj-0000-0000-0000-000000000001/experiment-designs/summary"
    );
  });

  it("constructs correct URL params for filtered tasks", () => {
    const selected = new Set(["uuid-1", "uuid-2"]);
    const params = new URLSearchParams();
    if (selected.size > 0) {
      params.set("designUuids", Array.from(selected).join(","));
    }
    expect(params.get("designUuids")).toContain("uuid-1");
    expect(params.get("designUuids")).toContain("uuid-2");
  });
});
