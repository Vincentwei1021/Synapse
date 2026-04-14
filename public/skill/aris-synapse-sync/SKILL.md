# ARIS → Synapse Dashboard Sync

## Purpose

When running ARIS research workflows (idea-discovery, experiment-bridge, run-experiment, auto-review-loop, paper-writing, research-pipeline), **automatically sync progress to Synapse** for real-time dashboard visualization.

This skill is a **sidecar** — it adds observability without changing ARIS behavior. ARIS controls the research flow; Synapse provides the dashboard.

## Golden Rule

**Sync failures MUST NOT block ARIS workflows.** If any Synapse MCP call fails, log it and continue. ARIS execution always takes priority.

## Prerequisites

- Synapse MCP server configured in `.mcp.json` or `~/.claude/settings.json`
- Agent API key with roles: `pre_research`, `research`, `experiment`, `report`
- (Optional) A pre-created Synapse ResearchProject UUID

## State File

Maintain `.aris-synapse-sync.json` in the working directory. This maps ARIS artifacts to Synapse UUIDs.

```json
{
  "projectUuid": null,
  "mainExperimentUuid": null,
  "researchQuestions": {},
  "documents": {},
  "reviewRound": 0,
  "lastSyncAt": null
}
```

**On first sync:** create this file. **On subsequent syncs:** read, update, write back.

---

## Checkpoint Protocol

Execute these checkpoints at the corresponding ARIS workflow stages. Each checkpoint is independent — execute whichever checkpoints apply to the current workflow.

### Checkpoint 0: Session Init

**When:** At the START of any ARIS workflow (before any ARIS skill execution).

```
1. Read .aris-synapse-sync.json (or create if missing)
2. Call synapse_checkin()
3. If projectUuid is null:
   a. If user provided a Synapse project UUID → use it
   b. Otherwise → synapse_create_research_project({
        name: "ARIS: <research direction/topic>",
        description: "<1-2 sentence research goal>"
      })
   c. Save projectUuid to state file
4. Log: "Synapse sync initialized → project <uuid>"
```

### Checkpoint 1: Literature Sync

**When:** After `/research-lit` or any literature search completes.

For each paper discovered:
```
synapse_add_related_work({
  researchProjectUuid: <projectUuid>,
  title: <paper title>,
  url: <arxiv URL or DOI link>,
  authors: <author list as string>,
  abstract: <abstract text>,
  arxivId: <arxiv ID if available>,
  year: <publication year>,
  source: "arxiv"  // or "semantic_scholar", "deepxiv"
})
```

If a deep research / literature review report is produced:
```
synapse_save_deep_research_report({
  researchProjectUuid: <projectUuid>,
  title: "ARIS Literature Review: <topic>",
  content: <full review content as markdown>
})
```

**Note:** `synapse_add_related_work` has built-in dedup (returns `isNew: false` for duplicates). Safe to re-sync.

### Checkpoint 2: Ideas Sync

**When:** After `/idea-creator` or `/idea-discovery` produces ranked ideas (IDEA_REPORT.md).

For each generated idea:
```
synapse_create_research_question({
  researchProjectUuid: <projectUuid>,
  title: "Idea #<rank>: <idea title>",
  content: "<idea summary>\n\n**Confidence:** <score>\n**Novelty:** <assessment>\n**Feasibility:** <assessment>"
})
→ Save { "<idea-slug>": "<researchQuestionUuid>" } to state file
```

### Checkpoint 3: Idea Selected → Experiment Created

**When:** After an idea is selected for execution (user selects or auto-select #1).

```
synapse_propose_experiment({
  researchProjectUuid: <projectUuid>,
  title: <selected idea title>,
  description: <idea description + hypothesis + expected outcome>,
  researchQuestionUuid: <mapped from state file if available>,
  priority: "high"
})
→ Save mainExperimentUuid to state file
```

**Note:** If the Synapse project has autonomous loop enabled, this creates the experiment in `pending_start` and auto-assigns it to the agent. Otherwise it lands in `pending_review` (visible on the board either way).

### Checkpoint 4: Experiment Plan Sync

**When:** After `/experiment-plan` or `/experiment-bridge` produces EXPERIMENT_PLAN.md.

```
synapse_create_document({
  researchProjectUuid: <projectUuid>,
  type: "methodology",
  title: "ARIS Experiment Plan: <topic>",
  content: <full experiment plan as markdown>
})
→ Save { "EXPERIMENT_PLAN": "<documentUuid>" } to state file
```

### Checkpoint 5: Experiment Execution

**When:** During `/run-experiment` or `/experiment-bridge` execution phases.

**5a. Experiment starts:**
```
synapse_start_experiment({
  experimentUuid: <mainExperimentUuid>,
  workingNotes: "ARIS experiment execution started.\nGPU: <gpu info>\nEstimated time: <budget>"
})
```

If `synapse_start_experiment` fails (e.g. wrong status), fall back to progress reporting only.

**5b. During execution (periodic, every significant milestone):**
```
synapse_report_experiment_progress({
  experimentUuid: <mainExperimentUuid>,
  message: <current status — e.g. "Sanity check passed ✓" or "Epoch 5/20 | loss=0.342 | acc=0.76">,
  phase: <"sanity_check" | "baseline" | "main_experiment" | "ablation">,
  liveStatus: "running"
})
```

Report at these ARIS milestones:
- Sanity check start/pass/fail
- Each experiment run start
- Training progress (every ~25% or significant metric change)
- Run completion with key metrics
- Auto-debug retries

**5c. Baseline registration (if applicable):**
```
synapse_create_baseline({
  researchProjectUuid: <projectUuid>,
  name: "ARIS Baseline: <method name>",
  metrics: { "accuracy": 0.82, "f1": 0.79, ... },
  experimentUuid: <mainExperimentUuid>
})
```

### Checkpoint 6: Review Loop Sync

**When:** During `/auto-review-loop`, after each review round completes.

**6a. Review received (after Phase A-B):**
```
synapse_add_comment({
  targetType: "experiment",
  targetUuid: <mainExperimentUuid>,
  content: "## 📋 Review Round <N>\n\n**Score:** <X>/10\n**Verdict:** <ready|almost|not ready>\n\n### Weaknesses\n<ranked list>\n\n### Required Fixes\n<action items>\n\n---\n*Reviewer: <codex|oracle-pro>*"
})

synapse_report_experiment_progress({
  experimentUuid: <mainExperimentUuid>,
  message: "Review Round <N>: <score>/10 — <verdict>",
  phase: "review_round_<N>",
  liveStatus: "running"
})

→ Update reviewRound in state file
```

**6b. Fixes implemented (after Phase C-D):**
```
synapse_report_experiment_progress({
  experimentUuid: <mainExperimentUuid>,
  message: "Round <N> fixes applied: <summary of changes and new experiments run>",
  phase: "review_fixes_<N>"
})
```

**6c. Debate transcript (hard/nightmare mode, after Phase B.5-B.6):**
```
synapse_add_comment({
  targetType: "experiment",
  targetUuid: <mainExperimentUuid>,
  content: "## ⚖️ Debate Round <N>\n\n<debate transcript with SUSTAINED/OVERRULED verdicts>"
})
```

### Checkpoint 7: Experiment Complete

**When:** After `/auto-review-loop` finishes (all rounds done or score threshold met), or after `/run-experiment` completes without review loop.

```
synapse_submit_experiment_results({
  experimentUuid: <mainExperimentUuid>,
  outcome: <score >= 6 ? "positive" : "negative">,
  experimentResults: {
    "finalScore": <last review score>,
    "totalRounds": <N>,
    "scoreProgression": [5.0, 6.5, 6.8, 7.5],
    "verdict": <final verdict>,
    "keyMetrics": { <metric: value pairs> },
    "summary": <1-2 paragraph result summary>
  }
})
```

### Checkpoint 8: Document Sync

**When:** After `/paper-writing`, `/paper-compile`, or report generation.

**8a. Narrative report:**
```
doc = state.documents["NARRATIVE_REPORT"]
if doc exists:
  synapse_update_document({ documentUuid: doc, content: <updated content> })
else:
  synapse_create_document({
    researchProjectUuid: <projectUuid>,
    type: "results_report",
    title: "ARIS Narrative Report: <topic>",
    content: <NARRATIVE_REPORT.md content>
  })
  → Save to state file
```

**8b. Paper draft:**
```
synapse_create_document({
  researchProjectUuid: <projectUuid>,
  type: "other",
  title: "ARIS Paper Draft: <paper title>",
  content: <paper content or "Paper compiled. See local PDF: <path>">
})
```

**8c. Auto-improvement round results:**
```
synapse_update_document({
  documentUuid: <paper doc uuid>,
  content: <updated paper content after improvement round>
})
// Document versioning auto-increments (v1 → v2 → v3)
```

---

## Workflow-to-Checkpoint Mapping

Quick reference for which checkpoints apply to each ARIS workflow:

| ARIS Workflow | Checkpoints |
|---------------|-------------|
| `/idea-discovery` | 0 → 1 → 2 |
| `/research-lit` | 0 → 1 |
| `/idea-creator` | 0 → 2 |
| `/experiment-plan` | 0 → 4 |
| `/experiment-bridge` | 0 → 3 → 4 → 5 |
| `/run-experiment` | 0 → 5 → 7 |
| `/auto-review-loop` | 0 → 6 → 7 |
| `/paper-writing` | 0 → 8 |
| `/paper-compile` | 0 → 8 |
| `/auto-paper-improvement-loop` | 0 → 8 |
| `/research-pipeline` | 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 (full chain) |
| `/result-to-claim` | 0 → 7 (update experiment results with claims) |

## Error Handling

```
For every Synapse MCP call:
  try:
    result = call synapse tool
    update state file
  catch:
    log: "⚠️ Synapse sync failed at checkpoint <N>: <error>"
    continue ARIS workflow (NEVER block)
```

Common failures and responses:
- **MCP server unreachable**: Log warning, disable sync for this session (set `syncEnabled: false` in state)
- **Auth error (401/403)**: Log "API key missing or invalid", disable sync
- **Project not found**: Re-run checkpoint 0 to create project
- **Experiment status conflict**: Fall back to progress reporting and comments only (skip `start_experiment` / `submit_results`)
- **Rate limit**: Add 2s delay between batch calls (e.g. multiple `add_related_work`)

## State File Recovery

If `.aris-synapse-sync.json` is lost or corrupted:

1. Call `synapse_checkin()` to get agent identity
2. Call `synapse_list_research_projects()` to find existing ARIS project (match by name prefix "ARIS:")
3. Call `synapse_get_assigned_experiments()` to find active experiment
4. Reconstruct state file from Synapse data
5. Continue sync from current ARIS workflow state

## Setup Instructions

### 1. Configure Synapse MCP

Add to `.mcp.json` in your research project directory:
```json
{
  "mcpServers": {
    "synapse": {
      "type": "streamable-http",
      "url": "https://<synapse-host>/api/mcp",
      "headers": {
        "Authorization": "Bearer syn_<your-api-key>"
      }
    }
  }
}
```

### 2. Create Synapse Agent

In Synapse web UI (`/agents`):
- Create agent with roles: `pre_research`, `research`, `experiment`, `report`
- Type: `claude_code`
- Generate API key (prefix: `syn_`)

### 3. (Optional) Pre-create Project

Create a ResearchProject in Synapse web UI. Copy its UUID and pass when starting ARIS:
```
> /research-pipeline "your topic" — synapse-project: <uuid>
```

Or let the sync skill auto-create the project at checkpoint 0.

### 4. Install This Skill

```bash
# Copy to Claude Code skills directory
cp -r aris-synapse-sync/ ~/.claude/skills/aris-synapse-sync/
```

### 5. Run ARIS Normally

```
> /idea-discovery "efficient attention for long sequences"
# Sync happens automatically at each checkpoint
```
