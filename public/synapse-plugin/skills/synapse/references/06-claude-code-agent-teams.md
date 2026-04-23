# Claude Code Agent Teams Integration

## Overview

Claude Code Agent Teams can be combined with Synapse for parallel experiment planning, execution, and reporting with full observability. A Team Lead agent orchestrates sub-agents, each working on separate experiments or experiment-plan revisions.

---

## Architecture

| Layer | System | Purpose |
|-------|--------|---------|
| Orchestration | Claude Code Agent Teams | Spawning sub-agents, task dispatch, messaging |
| Work Tracking | Synapse | Experiment lifecycle, session observability, activity stream |

```text
Team Lead (Claude Code)
  |-- spawn --> Sub-Agent A --> Synapse Session --> Experiment X
  |-- spawn --> Sub-Agent B --> Synapse Session --> Experiment Y
```

The Synapse Plugin handles session creation, heartbeats, and cleanup automatically.

Tool availability still depends on the Synapse roles attached to the API key. Use an agent with the right roles for literature, experiment execution, or admin work.

---

## MCP Access For Sub-Agents

Sub-agents can access Synapse MCP tools if the server is configured at project level. Place the config in `.mcp.json` at the project root:

```json
{
  "mcpServers": {
    "synapse": {
      "type": "http",
      "url": "<BASE_URL>/api/mcp",
      "headers": {
        "Authorization": "Bearer syn_xxxxxxxxxxxx"
      }
    }
  }
}
```

If MCP is configured only at user level, sub-agents may not inherit access.

---

## Workflow

### Team Lead: Plan And Dispatch

```text
# 1. Check in and review assigned experiments
synapse_checkin()
synapse_get_assigned_experiments({ statuses: ["pending_start"] })

# 2. Review each experiment
synapse_get_experiment({ experimentUuid: "..." })

# 3. Spawn sub-agents with experiment UUIDs
Task({
  name: "training-worker",
  prompt: "Your Synapse experiment UUID: <experiment-uuid>. Run the training experiment..."
})
```

The Team Lead only needs to pass experiment UUIDs. The plugin injects session context automatically.

### Sub-Agent: Execute

```text
# 1. Start the experiment
synapse_start_experiment({ experimentUuid: "..." })

# 2. Do the work
# ...

# 3. Report progress periodically
synapse_report_experiment_progress({
  experimentUuid: "...",
  message: "Epoch 50/100, loss: 0.28"
})

# 4. Submit results when done
synapse_submit_experiment_results({
  experimentUuid: "...",
  outcome: "success",
  experimentResults: "..."
})

# 5. Save the dedicated report if requested
synapse_save_experiment_report({
  experimentUuid: "...",
  content: "# Experiment Report\n\n..."
})

# 6. Notify the team lead
SendMessage({ recipient: "team-lead", content: "Experiment complete" })
```

### Planning / Revision Worker

If a sub-agent is asked to flesh out a quick experiment or address reviewer feedback:

```text
synapse_get_experiment({ experimentUuid: "..." })
synapse_get_comments({ targetType: "experiment", targetUuid: "..." })
synapse_update_experiment_status({ experimentUuid: "...", status: "draft", liveStatus: "writing" })
synapse_update_experiment_plan({ experimentUuid: "...", description: "## Objective\n\n..." })
synapse_update_experiment_status({ experimentUuid: "...", status: "pending_review" })
```

### Team Lead: Monitor And Continue

```text
# Check experiment statuses
synapse_get_assigned_experiments({ statuses: ["completed"] })

# Review results
synapse_get_experiment({ experimentUuid: "..." })

# Propose follow-up experiments if needed
synapse_propose_experiment({ researchProjectUuid: "...", title: "...", description: "..." })
```

---

## Multiple Experiments Per Sub-Agent

A sub-agent can handle multiple experiments sequentially:

```text
Task({
  name: "sequential-worker",
  prompt: """
    Your Synapse experiments (work in order):
    1. <experiment-uuid-1> -- Baseline evaluation
    2. <experiment-uuid-2> -- Ablation study (depends on #1)

    For each: start_experiment -> work -> report_progress -> submit_results
  """
})
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Sub-agent cannot access MCP tools | Move MCP config to project-level `.mcp.json` |
| Session shows inactive | The sub-agent may have crashed; respawn with the same name to reuse the session |
| Experiment stuck in `in_progress` | Re-open the experiment context, report progress, and either submit results or save a revision plan |
