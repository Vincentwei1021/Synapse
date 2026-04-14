# Changelog

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
