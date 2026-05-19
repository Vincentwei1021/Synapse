# Changelog

## [0.7.2] - 2026-05-18

### Added
- **Experiment incident lessons**: new `IncidentLesson` table, lessons MCP/service layer, and a project-level Lessons page. Lessons are surfaced to the experiment proposal flow so agents can avoid repeating known failure modes.
- **Experiment report figure uploads**: `synapse_upload_document_image` now accepts experiment-report figures and serves them from Synapse instead of relying on external image hosts.

### Changed
- **Release process**: publishing the main npm package must now also rebuild and push the `vincentwei1021/synapse` Docker image (both `:vX.Y.Z` and `:latest`) so Docker deployments stay in sync with npm. Documented in CLAUDE.md and AGENTS.md.

---

## [0.7.1] - 2026-05-11

### Added
- **CC plugin 0.7.0**: full skill rewrite. Sessions skill becomes a 10-hook mechanism manual with local state layout and parallel multi-experiment dispatch. Autonomy skill becomes a Claude-Code-client loop (default full_auto, main agent orchestrates, sub-agents auto-spawn via the Task hook, mutual exclusion with server-side `autonomousLoopEnabled`). Experiments skill/reference gain foundational first-experiment guidance, a detailed execution checklist (tmux + unbuffered + PEM + repo branch + cron), failure handling, and review-rejection flow. Empty-project onboarding added to top-level, research, experiments, and autonomy skills.
- **Document image upload (local mode)**: upload and serve images from documents without S3.
- **Research question → linked experiment deep link**: click-through from a question to its proposed experiment.
- **First-experiment guidance** in experiment authoring flow.
- **Compute page per-GPU Release button**: force-clear stuck reservations.

### Changed
- **Onboarding Step 2 (Claude Code)**: replaces the single `claude mcp add` command with a README-aligned three-block layout — plugin marketplace install, environment variables, and a collapsed manual `.mcp.json` fallback. Matching en/zh i18n.
- **Settings**: drops the Autonomous Loop and Auto Search cards; adds a synthesis reset control.
- **Experiments**: clears `liveStatus` when a user manually exits an `in_progress` experiment.
- **Synthesis refresh**: auto-completes on save and enriches full context.
- **Reassign button**: falls back to the current assignee when the dropdown is untouched.

### Fixed
- **Broken image fallback** for document images.
- **arXiv paper search**: falls back to arXiv on 401 when no DeepXiv token is configured.
- **Round 2 E2E findings**: UI, locale, MCP cleanup, and paper-search fallback fixes.

### Removed
- **Agent-teams skill** in the CC plugin (its multi-agent content is merged into the sessions skill).
- **OpenClaw-specific language** from CC skills.

---

## [0.6.0] - 2026-04-12

### Added
- **Agent Type & Transport**: Agents now have a `type` field (`openclaw` | `claude_code`) that maps to an internal transport capability (`realtime` | `poll`). Web UI dispatch features (auto-search, deep research, autonomous loop) only show realtime-capable agents.
- **Agent type selector**: Create and edit forms on the Agents page include a Type dropdown with badge display.
- **Transport query filter**: `GET /api/agents` supports `?transport=realtime` and `?type=claude_code` query parameters.
- **Dispatch validation**: Auto-search and deep-research API routes reject agents that don't support realtime transport.
- **Experiment assignments in checkin**: `synapse_checkin` now returns assigned experiments (pending_start + in_progress) alongside legacy experiment runs.
- **Research Copilot workflow**: Claude Code SessionStart hook presents research projects with progress summaries and a guided workflow covering paper search, deep research, research questions, experiments, and analysis.
- **Project progress in checkin**: `synapse_checkin` returns a `projects` array with paper counts, deep research status, research question titles, and experiment counts by status.

### Changed
- **Plugin version**: Synapse Claude Code plugin bumped to 0.6.0.

### Fixed
- **Admin role validation**: Added `admin` to valid agent roles in server actions and API routes (was missing, causing UI/backend mismatch).
- **Type validation in server actions**: `createAgentAndKeyAction` and `updateAgentAction` now validate agent type against allowed values.
- **Nullable auth guard**: Fixed potential null auth context in integrations route.

---
