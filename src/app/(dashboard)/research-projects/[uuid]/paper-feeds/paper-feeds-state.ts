// Pure helpers for the Paper Feeds page. Extracted so they can be unit tested
// without rendering the React tree (the repo runs Vitest in `node` and does
// not have @testing-library/react / jsdom installed).

export interface PaperFeedConfigState {
  paperFeedEnabled: boolean;
  paperFeedAgentUuid: string | null;
  paperFeedActiveAgentUuid: string | null;
  paperFeedStartedAt: string | null;
  paperFeedLastRunAt: string | null;
}

export interface PaperFeedRunState {
  uuid: string;
  feedDate: string;
  status: string;
  paperCount: number;
  errorMessage: string | null;
  triggeredBy: string;
  startedAt: string;
  completedAt: string | null;
}

export interface PaperFeedItemState {
  uuid: string;
  paperId: string;
  arxivId: string | null;
  title: string;
  authors: string;
  abstract: string;
  paperUrl: string;
  summary: string;
  relevanceNote: string;
  relatedWorkUuid: string | null;
}

export interface PaperFeedDayState {
  feedDate: string;
  items: PaperFeedItemState[];
}

export type HeaderStatus = "disabled" | "active" | "running";

export function getHeaderStatus(config: PaperFeedConfigState): HeaderStatus {
  if (config.paperFeedActiveAgentUuid) return "running";
  if (config.paperFeedEnabled) return "active";
  return "disabled";
}

/**
 * Returns true when the page should display the empty state — i.e. the feed
 * is disabled AND no items have been collected yet.
 */
export function shouldShowEmptyState(
  config: PaperFeedConfigState,
  itemsByDate: PaperFeedDayState[],
): boolean {
  return !config.paperFeedEnabled && itemsByDate.length === 0;
}

/**
 * Returns the latest `failed` run, or null if the latest run did not fail.
 * Runs are expected to be sorted by `feedDate desc` (the API order).
 */
export function getLatestFailedRun(
  runs: PaperFeedRunState[],
): PaperFeedRunState | null {
  if (runs.length === 0) return null;
  const latest = runs[0];
  return latest.status === "failed" ? latest : null;
}

/**
 * Returns true when there is a run currently in flight (status `pending` or
 * `running`). Used to disable the "Run now" button.
 */
export function hasInflightRun(runs: PaperFeedRunState[]): boolean {
  return runs.some((r) => r.status === "pending" || r.status === "running");
}

/**
 * Computes the disabled/loading/promoted state of the "Add to Related Works"
 * button on a feed item card.
 */
export interface PromoteButtonState {
  promoted: boolean;
  loading: boolean;
  disabled: boolean;
}

export function getPromoteButtonState(
  item: Pick<PaperFeedItemState, "uuid" | "relatedWorkUuid">,
  runningPromote: ReadonlySet<string>,
): PromoteButtonState {
  const promoted = item.relatedWorkUuid !== null;
  const loading = runningPromote.has(item.uuid);
  return { promoted, loading, disabled: promoted || loading };
}
