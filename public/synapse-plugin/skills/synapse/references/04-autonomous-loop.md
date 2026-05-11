# Autonomous Loop (Claude Code-Client)

This guide covers the **CC-client autonomous loop**: the main Claude Code agent drives research on a project without waiting for per-step human instruction. It proposes experiments, dispatches sub-agents to execute them, monitors progress, synthesizes results, and iterates.

The CC-client loop runs entirely inside the current Claude Code session. It does not depend on the server-side `ResearchProject.autonomousLoopEnabled` flag — that flag is for realtime-transport agents. A user opens Claude Code, says "enable autonomous loop on project X", and the main agent takes over.

---

## Architecture

```
Main CC agent (orchestrator)
  ├── synapse_get_project_full_context     (each iteration)
  ├── synapse_get_assigned_experiments     (each iteration)
  ├── synapse_list_compute_nodes           (before proposing)
  ├── Task()   → sub-agent → executes experiment
  ├── Task()   → sub-agent → executes experiment     (parallel)
  ├── synapse_save_project_synthesis       (when new results exist)
  ├── synapse_propose_experiment           (when queue empty)
  └── synapse_add_comment                  (audit trail)
```

- The main agent **never** runs training itself. It monitors and proposes.
- Sub-agents spawned via the Task tool are auto-enrolled by the `SubagentStart` hook: session created, UUID injected, execution workflow attached.
- State persists in Synapse (experiments, results, synthesis document). No extra local state is required.

---

## Modes

### Full Auto (default)

- Proposals created as `pending_start` and immediately dispatched to sub-agents.
- No human approval between iterations.
- User can stop at any time by interrupting the session or saying "stop autonomous loop".

### Review

- Proposals created as `pending_review`.
- The main agent pauses until a human approves, then returns to the loop.
- Use when the user wants a sanity check on each proposed experiment.

Choose the mode at loop start. Default is full auto unless the user explicitly asks for review.

---

## Before Starting

1. `synapse_checkin()` — refresh identity, roles, assignments.
2. `synapse_get_research_project({ researchProjectUuid })` — confirm the target project and check its `autonomousLoopEnabled` flag.
3. If `autonomousLoopEnabled = true` and a realtime loop agent is already assigned, warn the user: running the CC-client loop against the same project will double-dispatch proposals. Ask the user to either disable the server-side loop or run the CC loop on a different project.
4. `synapse_get_project_full_context({ researchProjectUuid })` — load the brief, evaluation methods, past experiments, and latest synthesis.
5. If the project has no completed experiments, do not enter the loop cold. Offer the foundational path first (see **[03-experiment-workflow.md](03-experiment-workflow.md)** — Foundational First Experiment). Once the baseline exists, the loop has something to build on.
6. Collect budgets from the user: `maxIterations`, `maxExperimentsProposed`, optional `maxComputeHours`.

---

## Iteration Procedure

Each iteration runs the same five steps:

### Step 1: Refresh state

```text
synapse_get_project_full_context({ researchProjectUuid: "..." })
synapse_get_assigned_experiments({
  researchProjectUuid: "...",
  statuses: ["pending_start", "in_progress"]
})
```

### Step 2: Decide what this iteration does

Priority order:

- **Monitor** — if any experiment is `in_progress`, do not propose. Poll `synapse_get_experiment` for each, write a short progress note, and yield.
- **Dispatch** — if any experiment is `pending_start` and mode is `full_auto`, spawn a Task sub-agent per experiment (see Step 3). Do not wait for them to finish — sub-agents run in parallel.
- **Synthesize** — if the queue is empty and new completed experiments exist, read the current `project_synthesis` document with `synapse_get_documents({ type: "project_synthesis" })` + `synapse_get_document`. Update it with `synapse_save_project_synthesis` only if the new evidence is not already covered.
- **Propose** — if the queue is empty and synthesis is current, call `synapse_propose_experiment`. One independent run per proposal — split comparisons, ablations, and parameter sweeps into separate proposals.

### Step 3: Dispatch sub-agents for `pending_start` experiments

```text
Task({
  subagent_type: "general-purpose",
  name: "exp-<short-id>",
  prompt: "Your Synapse experiment UUID: <experiment-uuid>. Execute the experiment end to end following the experiments skill."
})
```

The `SubagentStart` hook automatically creates/reuses a Synapse session, injects the session UUID, and includes the execution workflow. The main agent does not call `synapse_create_session`.

Dispatch all `pending_start` experiments concurrently if compute allows. Let the sub-agents do the work — the main agent only tracks them via `synapse_get_assigned_experiments` and `synapse_get_experiment` on subsequent iterations.

### Step 4: Respect compute reality

Before proposing new experiments:

```text
synapse_list_compute_nodes({
  researchProjectUuid: "...",
  onlyAvailable: true
})
```

Do not over-propose concurrent experiments beyond what free GPUs can accommodate. If the project has a `computePoolUuid`, all proposals must fit within that pool.

### Step 5: Log and check stop conditions

Leave an audit trail for the human:

```text
synapse_add_comment({
  targetType: "research_project",
  targetUuid: "...",
  content: "Iteration 5 — dispatched exp <uuid1>, <uuid2>; no proposal (queue saturated)."
})
```

Then evaluate stop conditions (next section). If none trigger, continue to the next iteration.

---

## Writing A Proposal

`synapse_propose_experiment` creates a new experiment card. A good proposal includes:

- **Motivation** — what prior result or gap this addresses
- **Hypothesis** — what you expect to learn
- **Method** — enough detail that a sub-agent can execute without further prompting
- **Success criteria** — how the result will be judged against the project's evaluation method
- **Compute fit** — realistic given current availability

```text
synapse_propose_experiment({
  researchProjectUuid: "...",
  title: "Ablation: remove cross-attention from layer 6",
  description: "## Motivation\n\nExperiment <uuid> showed..."
})
```

In full auto mode the resulting experiment lands as `pending_start` and is auto-assigned back to the loop agent for execution on the next iteration. In review mode it lands as `pending_review`.

**One independent run per proposal.** Do not bundle comparisons, ablations, or parameter sweeps into one card — create multiple proposals instead.

---

## Stop Conditions

Exit the loop cleanly when any of the following hold:

- `maxIterations` reached
- `maxExperimentsProposed` reached
- `maxComputeHours` consumed across loop-dispatched experiments
- synthesis unchanged across K consecutive iterations (no-progress signal)
- all research questions are `completed` and no promising direction remains
- compute pool exhausted and no experiment is making forward progress
- user interrupts or says "stop"

On exit, summarize for the user:

- experiments dispatched and their outcomes
- whether the synthesis changed materially
- open questions and recommended next steps the human should consider

---

## Mutual Exclusion With The Server-Side Loop

The server-side autonomous loop (`autonomousLoopEnabled`) is designed for realtime-transport agents and dispatches proposals through a different path than the CC-client loop. Running both against the same project will cause double-dispatch.

Before entering the CC-client loop:

- If `autonomousLoopEnabled = true` → warn the user, do not start.
- If the user insists, ask them to disable the server-side loop first, or use a different project.

Do not try to take over the server-side flag from inside Claude Code.

---

## Compact End-to-End Example

```text
# Turn 1 — enter loop
synapse_checkin()
synapse_get_research_project({ researchProjectUuid })          # check flag
synapse_get_project_full_context({ researchProjectUuid })

# Iteration 1
synapse_get_assigned_experiments({ researchProjectUuid, statuses: ["pending_start", "in_progress"] })
# queue empty, no new results
synapse_list_compute_nodes({ researchProjectUuid, onlyAvailable: true })
synapse_propose_experiment({ researchProjectUuid, title, description })
synapse_add_comment({ targetType: "research_project", targetUuid, content: "Iter 1 — proposed <title>" })

# Iteration 2 (same turn or next turn)
synapse_get_assigned_experiments(...)                           # one pending_start now
Task({ name: "exp-ablation-1", prompt: "Your Synapse experiment UUID: <uuid>. Execute end to end." })
synapse_add_comment({ ..., content: "Iter 2 — dispatched exp <uuid>" })

# Iteration 3
synapse_get_assigned_experiments(...)                           # in_progress
# monitor only, no proposal

# Iteration 4
synapse_get_assigned_experiments(...)                           # completed
synapse_get_documents({ researchProjectUuid, type: "project_synthesis" })
synapse_save_project_synthesis({ researchProjectUuid, title, content })
# queue empty again → next propose

# ...until a stop condition fires
```

---

## Tips

- Do not re-propose an experiment that has already completed. Always check `synapse_get_project_full_context` for prior work first.
- Build on failures — an `outcome: "failure"` experiment is signal, not noise.
- Stay aligned with the project's research questions and evaluation method.
- Proposals should be specific enough that a sub-agent can execute them unattended.
- Use the compute availability summary to keep proposals realistic.
- Leave a comment on the project each iteration — it is the user's only visible log when the loop runs for hours.
