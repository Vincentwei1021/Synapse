import { describe, expect, it } from "vitest";

// NOTE: The Synapse repo runs Vitest in `node` and does not have
// @testing-library/react / jsdom installed, so we cannot mount the React tree
// here. Instead we test the same three behaviors via the pure helpers in
// `paper-feeds-state.ts`, which the client component delegates to. The mapping
// from "what the spec asked for" to "what is asserted" is documented next to
// each test.
import {
  getLatestFailedRun,
  getPromoteButtonState,
  shouldShowEmptyState,
  type PaperFeedConfigState,
  type PaperFeedDayState,
  type PaperFeedRunState,
} from "../paper-feeds-state";

const baseConfig: PaperFeedConfigState = {
  paperFeedEnabled: false,
  paperFeedAgentUuid: null,
  paperFeedActiveAgentUuid: null,
  paperFeedStartedAt: null,
  paperFeedLastRunAt: null,
};

describe("PaperFeedsClient — empty state", () => {
  it("renders the empty state when disabled and no items have arrived", () => {
    // Mirrors: "Empty state when disabled and no runs."
    // The client renders the `emptyState.*` block iff this helper returns true.
    const itemsByDate: PaperFeedDayState[] = [];
    expect(shouldShowEmptyState(baseConfig, itemsByDate)).toBe(true);
  });

  it("does not render the empty state once items exist", () => {
    const itemsByDate: PaperFeedDayState[] = [
      { feedDate: "2026-05-26", items: [] },
    ];
    expect(shouldShowEmptyState(baseConfig, itemsByDate)).toBe(false);
  });

  it("does not render the empty state once the feed is enabled", () => {
    expect(
      shouldShowEmptyState({ ...baseConfig, paperFeedEnabled: true }, []),
    ).toBe(false);
  });
});

describe("PaperFeedsClient — failed-run banner", () => {
  it("returns the latest failed run so the banner is shown", () => {
    // Mirrors: "Failed-run banner when latest run is failed."
    // The client only renders the banner when this helper returns non-null.
    const runs: PaperFeedRunState[] = [
      {
        uuid: "run-failed",
        feedDate: "2026-05-26",
        status: "failed",
        paperCount: 0,
        errorMessage: "boom",
        triggeredBy: "cron",
        startedAt: "2026-05-26T01:00:00.000Z",
        completedAt: "2026-05-26T01:00:30.000Z",
      },
    ];
    const latestFailed = getLatestFailedRun(runs);
    expect(latestFailed).not.toBeNull();
    expect(latestFailed?.feedDate).toBe("2026-05-26");
    expect(latestFailed?.errorMessage).toBe("boom");
  });

  it("does not surface a banner when the latest run succeeded", () => {
    const runs: PaperFeedRunState[] = [
      {
        uuid: "run-ok",
        feedDate: "2026-05-26",
        status: "completed",
        paperCount: 3,
        errorMessage: null,
        triggeredBy: "cron",
        startedAt: "2026-05-26T01:00:00.000Z",
        completedAt: "2026-05-26T01:00:30.000Z",
      },
      {
        uuid: "run-old-failure",
        feedDate: "2026-05-25",
        status: "failed",
        paperCount: 0,
        errorMessage: "boom",
        triggeredBy: "cron",
        startedAt: "2026-05-25T01:00:00.000Z",
        completedAt: "2026-05-25T01:00:30.000Z",
      },
    ];
    expect(getLatestFailedRun(runs)).toBeNull();
  });
});

describe("PaperFeedsClient — Add to Related Works button", () => {
  it("disables the button and switches to the promoted label once a related work exists", () => {
    // Mirrors: '"Add to Related Works" button shows "Added" / disabled when promoted.'
    // The card uses this helper to choose between the active button and the
    // disabled "Added" state.
    const promoted = getPromoteButtonState(
      { uuid: "item-1", relatedWorkUuid: "rw-1" },
      new Set(),
    );
    expect(promoted).toEqual({ promoted: true, loading: false, disabled: true });

    const active = getPromoteButtonState(
      { uuid: "item-2", relatedWorkUuid: null },
      new Set(),
    );
    expect(active).toEqual({ promoted: false, loading: false, disabled: false });
  });

  it("flags the button as loading while an in-flight promote is running", () => {
    const state = getPromoteButtonState(
      { uuid: "item-3", relatedWorkUuid: null },
      new Set(["item-3"]),
    );
    expect(state).toEqual({ promoted: false, loading: true, disabled: true });
  });
});
