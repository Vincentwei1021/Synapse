# Claude Code Agent Teams Integration

## Overview

Claude Code Agent Teams (swarm mode) can be combined with Synapse for parallel experiment execution with full observability. A Team Lead agent orchestrates sub-agents, each working on separate experiments.

---

## Architecture

| Layer | System | Purpose |
|-------|--------|---------|
| Orchestration | Claude Code Agent Teams | Spawning sub-agents, task dispatch, messaging |
| Work Tracking | Synapse | Experiment lifecycle, session observability, activity stream |

```
Team Lead (Claude Code)
  |-- spawn --> Sub-Agent A --> Synapse Session --> Experiment X
  |-- spawn --> Sub-Agent B --> Synapse Session --> Experiment Y
```

The Synapse Plugin handles session creation, heartbeats, and cleanup automatically.

---

## MCP Access for Sub-Agents

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

If MCP is configured only at user level (`~/.claude/settings.json`), sub-agents may not have access.

---

## Workflow

### Team Lead: Plan and Dispatch

```
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

The Team Lead only passes experiment UUIDs. The plugin injects session context automatically.

### Sub-Agent: Execute

```
# 1. Start the experiment
synapse_start_experiment({ experimentUuid: "..." })

# 2. Do the work (training, evaluation, etc.)
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

# 5. Notify team lead
SendMessage({ recipient: "team-lead", content: "Experiment complete" })
```

### Team Lead: Monitor and Continue

```
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

```
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
| Session shows inactive | Sub-agent may have crashed; respawn with same name to reuse session |
| Experiment stuck in in_progress | Spawn new sub-agent for the experiment, or manually submit results |
