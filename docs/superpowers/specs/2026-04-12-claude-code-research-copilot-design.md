# Claude Code Research Copilot Design

**Date:** 2026-04-12
**Status:** Draft
**Scope:** Enhance Claude Code plugin to guide users through the Synapse research lifecycle interactively

## Problem

When a Claude Code agent connects to Synapse, it only sees pending task assignments. There is no guided workflow — the user must already know what to do and which MCP tools to call. This makes Claude Code unsuitable as an interactive research copilot.

## Solution Overview

Enhance the `synapse_checkin` response and SessionStart hook to:

1. Return a list of research projects with progress summaries
2. Present projects for the user to select
3. After selection, load project context and guide the user through the research lifecycle
4. Suggest next steps based on project state, but let the user drive

No new MCP tools needed — all research tools already exist.

## Part 1: Checkin Response Enhancement

`synapse_checkin` gains a new `projects` array in its response:

```json
{
  "projects": [
    {
      "uuid": "xxx",
      "name": "LLM Scaling",
      "description": "Investigate scaling laws for...",
      "relatedWorksCount": 12,
      "deepResearchExists": true,
      "researchQuestions": [
        { "uuid": "q1", "title": "How does model size affect...", "status": "open" },
        { "uuid": "q2", "title": "What is the optimal...", "status": "in_progress" }
      ],
      "experimentCounts": {
        "draft": 0,
        "pending_review": 1,
        "pending_start": 2,
        "in_progress": 1,
        "completed": 3
      }
    }
  ]
}
```

Fields per project:
- `uuid`, `name`, `description` — basic info
- `relatedWorksCount` — number of collected papers
- `deepResearchExists` — whether a deep research document exists
- `researchQuestions` — array of `{uuid, title, status}` (typically few, OK to include titles)
- `experimentCounts` — counts grouped by status (not individual titles — too many)

Query: scoped by `companyUuid`, filtered to projects where the agent's owner is a member (or all company projects if no scoping). Ordered by most recently updated.

## Part 2: SessionStart Hook Enhancement

After parsing the checkin result, the hook builds two new context blocks.

### Block 1: Project List

Formatted from `projects` array:

```
## Research Projects

Ask the user which project to work on:

1. "LLM Scaling" (uuid: xxx)
   12 papers | deep research: yes | 2 questions | 7 experiments (3 completed)
2. "ASR Model POC" (uuid: yyy)
   0 papers | deep research: no | 0 questions | 0 experiments
```

If no projects exist, show: "No research projects found. The user can create one on the Synapse web UI."

### Block 2: Research Copilot Workflow Guide

A static prompt template injected into additionalContext:

```
## Research Copilot — Workflow Guide

When the user selects a project:

1. Call synapse_get_project_full_context({ researchProjectUuid }) to load the full context.
2. Present the project's current state to the user:
   - Collected papers (count + highlights if any)
   - Deep research status
   - Research questions (list titles)
   - Experiments (count by status, key results if completed)
3. Explain the full research lifecycle:
   a. Paper Search — find and collect relevant papers
   b. Deep Research — synthesize papers into a literature review
   c. Research Questions — formulate specific research questions
   d. Experiments — design, execute, and submit results
   e. Analysis & Iteration — analyze results, identify gaps, loop back
4. Based on current state, suggest the most natural next step:
   - relatedWorksCount = 0 → suggest starting with Paper Search
   - relatedWorksCount > 0 but deepResearchExists = false → suggest Deep Research
   - no research questions → suggest formulating Research Questions
   - no experiments → suggest proposing Experiments
   - some experiments completed → suggest analyzing results and planning next iteration
5. Tell the user they can jump to any stage — the suggestion is a guide, not a constraint.

### Tool Reference by Stage

Paper Search:
  - synapse_search_papers({ query }) — search for papers
  - synapse_read_paper_brief({ arxivId }) — quick summary (~500 tokens)
  - synapse_read_paper_head({ arxivId }) — section structure (~1-2k tokens)
  - synapse_read_paper_section({ arxivId, sectionTitle }) — full section
  - synapse_add_related_work({ researchProjectUuid, ... }) — add paper to project
  - synapse_get_related_works({ researchProjectUuid }) — list collected papers

Deep Research:
  - synapse_get_related_works — review collected papers
  - synapse_get_deep_research_report({ researchProjectUuid }) — get existing report
  - synapse_upsert_deep_research_report({ researchProjectUuid, content }) — create/update report

Research Questions:
  - synapse_get_research_project({ researchProjectUuid }) — project context
  - Use Synapse web UI or direct API for question CRUD (MCP tools available if agent has research role)

Experiments:
  - synapse_start_experiment({ experimentUuid }) — begin execution
  - synapse_report_experiment_progress({ experimentUuid, message }) — report progress
  - synapse_submit_experiment_results({ experimentUuid, results, outcome }) — submit results
  - synapse_get_experiment({ experimentUuid }) — check experiment details

Analysis:
  - synapse_get_project_full_context({ researchProjectUuid }) — reload full state
  - Review experiment outcomes and propose next steps

### Language

Respond in the same language the user uses. If the user writes in Chinese, respond in Chinese. If in English, respond in English.
```

## Part 3: Language Handling

Locale is currently stored client-side only (localStorage). Rather than adding DB schema changes, the workflow guide instructs Claude to mirror the user's language. This is natural behavior and requires no infrastructure changes.

Optional future enhancement: `SYNAPSE_LOCALE` env var in plugin config for explicit override.

## Changes Summary

| Component | Change |
|-----------|--------|
| `src/mcp/tools/public.ts` (synapse_checkin) | Add `projects` query with progress summaries |
| `public/synapse-plugin/bin/on-session-start.sh` | Parse projects, format list + inject workflow guide |
| No new MCP tools | All tools already exist |
| No schema changes | Project/question/experiment models unchanged |

## Out of Scope

- Automatic stage transitions (Claude suggests, user decides)
- New MCP tools (existing tools cover all stages)
- Database locale storage (mirror user's language instead)
- Web UI changes (this is Claude Code plugin only)
