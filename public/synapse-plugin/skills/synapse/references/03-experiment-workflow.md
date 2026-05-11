# Experiment Workflow

This guide covers the current experiment lifecycle: planning or revising experiment specs, executing approved experiments, reporting progress, and saving final reports.

All execution happens through Synapse MCP tools plus Claude Code's own tools (Bash for remote shells, Task for sub-agent dispatch). The Synapse Claude Code plugin never requires a custom runtime on GPU nodes — remote work is driven over SSH using the access bundle.

---

## Experiment Lifecycle

```text
draft --> pending_review --> pending_start --> in_progress --> completed
```

- `draft` — being authored or revised
- `pending_review` — waiting for human review
- `pending_start` — approved and ready for execution
- `in_progress` — actively running
- `completed` — results submitted

Each experiment card must represent **one independent run**. Do not bundle comparison runs, ablations, or parameter sweeps into a single card — create multiple cards instead.

---

## Getting Assigned Experiments

```text
synapse_get_assigned_experiments()
synapse_get_assigned_experiments({ researchProjectUuid: "..." })
synapse_get_assigned_experiments({ statuses: ["pending_start", "in_progress"] })
```

For full details:

```text
synapse_get_experiment({ experimentUuid: "..." })
```

---

## Foundational First Experiment

If a project has no completed experiments yet, treat the first experiment as foundational infrastructure, not a normal research run. Bundle three deliverables:

1. **Data preparation** — normalize the raw dataset into a single canonical format every future experiment will consume. Script lives under the project's repo (if `synapse_get_repo_access` shows one is configured).
2. **Baseline** — the simplest reasonable approach, run end-to-end, with metrics recorded via `synapse_submit_experiment_results`. This becomes the reference all future experiments compare against.
3. **Evaluation script** — a canonical eval harness that future experiments call. Committed alongside data prep.

If the project has a repo, commit all three onto the base branch (or a per-experiment branch merged back into the base branch). Every subsequent experiment branches from that base so it inherits prep + eval.

---

## Planning Or Revising An Experiment

When Synapse asks you to flesh out a quick experiment idea or revise a reviewer-returned experiment:

```text
# Mark that you are drafting
synapse_update_experiment_status({
  experimentUuid: "...",
  status: "draft",
  liveStatus: "writing",
  liveMessage: "Drafting experiment plan"
})

# Save the full plan
synapse_update_experiment_plan({
  experimentUuid: "...",
  title: "Refined title",
  description: "## Objective\n\n...",
  researchQuestionUuid: "...",
  priority: "high"
})

# Hand it back for review
synapse_update_experiment_status({
  experimentUuid: "...",
  status: "pending_review"
})
```

When revising based on reviewer feedback, read the full comment thread first — feedback is often scattered across multiple comments:

```text
synapse_get_comments({
  targetType: "experiment",
  targetUuid: "..."
})
```

Write the plan in the same language as the project description. After revising, reply to the reviewer with `synapse_add_comment` using the exact mention format `@[name](actorType:uuid)`.

### Plan content

A good experiment plan covers:
- **Objective** — the one thing this experiment is trying to learn
- **Methodology** — enough detail that another agent (or sub-agent) could execute it unattended
- **Expected outcomes** — what success and failure look like against the project's evaluation method
- **Implementation steps** — data prep, training/inference, evaluation, analysis
- **Resource requirements** — expected GPU count, wall clock, dataset size

---

## Creating A New Experiment

When the user asks you to author a brand-new experiment outside autonomous loop, create it directly:

```text
synapse_create_experiment({
  researchProjectUuid: "...",
  title: "Baseline reproduction with revised tokenizer",
  description: "## Objective\n\n...",
  researchQuestionUuid: "...",
  priority: "high"
})
```

Defaults:
- `status = pending_review` for the normal agent-created path
- Use `status: "draft"` if you want to keep refining before sending it to review

Typical follow-up after creating a draft:

```text
synapse_update_experiment_plan({ experimentUuid: "...", description: "## Objective\n\n..." })
synapse_update_experiment_status({ experimentUuid: "...", status: "pending_review" })
```

---

## Execution Checklist

This is the detailed flow for moving an experiment through `in_progress` to `completed`. It assumes the experiment is already `pending_start`.

1. **Build an internal todo list** covering: compute reservation, repo setup, data prep, run, monitoring, commit, submission. Keeps complex experiments honest.

2. **Inspect available compute**

   ```text
   synapse_list_compute_nodes({
     researchProjectUuid: "...",
     onlyAvailable: true
   })
   ```

   If the project has a `computePoolUuid`, your reservations must stay inside that pool.

3. **Reserve GPUs** — either inline via `synapse_start_experiment({ gpuUuids: [...] })` or explicitly ahead of time:

   ```text
   synapse_reserve_gpus({
     experimentUuid: "...",
     gpuUuids: ["gpu-uuid-1", "gpu-uuid-2"]
   })
   ```

4. **Start the experiment** — moves it to `in_progress` and creates/updates the experiment result document:

   ```text
   synapse_start_experiment({
     experimentUuid: "...",
     workingNotes: "Starting with baseline configuration"
   })
   ```

5. **Fetch SSH access** — never assume a server-local key path exists:

   ```text
   synapse_get_node_access_bundle({
     experimentUuid: "...",
     nodeUuid: "..."
   })
   ```

   Returns host / user / port and `privateKeyPemBase64`. Decode, write to a local PEM, `chmod 600`, then SSH using the returned host/user/port and the PEM.

6. **Check out the repo** — if the project is repo-backed:

   ```text
   synapse_get_repo_access({ experimentUuid: "..." })
   ```

   Clone on the remote node, then check out the experiment's base branch (or create a per-experiment branch off the base). Subsequent experiments must inherit the base branch's data prep + eval scripts.

7. **Run the workload in a persistent remote shell** — use `tmux` (or `screen`) so the session survives disconnects, and run Python with unbuffered output so logs do not stall tool calls:

   ```bash
   tmux new -d -s exp-<short> 'cd ~/work && PYTHONUNBUFFERED=1 python -u train.py --config exp.yaml 2>&1 | tee run.log'
   ```

8. **Monitoring — long runs (>30 min)**: poll from the main agent on a cadence, or set up a cron / periodic job on the remote node that calls back with a progress update. Use `synapse_report_experiment_progress` to push each milestone:

   ```text
   synapse_report_experiment_progress({
     experimentUuid: "...",
     message: "Epoch 15/100, loss: 0.342, val_acc: 87.2%",
     phase: "training",
     liveStatus: "running"
   })
   ```

   `liveStatus` values:
   - `checking_resources` while probing compute
   - `queuing` while waiting for GPUs (status-only, does not create a progress-log row)
   - `running` during active execution

   `phase` labels: `setup`, `training`, `evaluation`, `analysis`.

9. **Monitoring — short runs** (a few minutes): skip the cron, report progress inline at setup / mid-training / evaluation / analysis transitions.

10. **Commit code and artifacts** — commit configs, scripts, and meaningful artifacts to the experiment branch (or base branch) and capture the commit SHA to include in the submission.

11. **Submit results**

    ```text
    synapse_submit_experiment_results({
      experimentUuid: "...",
      outcome: "success",
      experimentResults: {
        "accuracy": 0.923,
        "summary": "Ablation outperformed baseline",
        "branch": "exp-ablation-3",
        "commit": "abc1234"
      }
    })
    ```

    `outcome` is optional, typically `success`, `failure`, or `inconclusive`. Submitting moves the experiment to `completed`, refreshes the experiment result document, and triggers the project synthesis refresh.

12. **Save the dedicated experiment report** — when the flow asks for a full writeup:

    ```text
    synapse_save_experiment_report({
      experimentUuid: "...",
      title: "Experiment Report: Baseline vs Ablation",
      content: "# Objective\n\n..."
    })
    ```

    Use python + a plotting library to generate charts and embed them in the markdown where they help. Do **not** post the report as a comment — always use `synapse_save_experiment_report` so the dedicated result document exists.

13. **Match the project description's language** — if the project brief is in Chinese, write plan, progress messages, and report in Chinese.

---

## Handling Failures And Inconclusive Runs

A failed or inconclusive experiment is still a valid submission — it is data. Do not leave it stuck in `in_progress`:

```text
synapse_submit_experiment_results({
  experimentUuid: "...",
  outcome: "failure",
  experimentResults: {
    "error": "OOM at batch size 32 on 2x L40S",
    "completedEpochs": 3,
    "lastLoss": 1.82,
    "nextSteps": "Retry with gradient accumulation or batch 16"
  }
})
```

Follow up with a comment explaining the failure so the reviewer can decide whether to revise and retry:

```text
synapse_add_comment({
  targetType: "experiment",
  targetUuid: "...",
  content: "Failed due to OOM. Proposing a revised plan..."
})
```

---

## Reviving A Stuck Experiment

An experiment stuck in `in_progress` (sub-agent crashed, SSH died, user killed the run) can be unblocked in two ways:

1. **Resume** — respawn a sub-agent with the same experiment UUID. The `SubagentStart` hook reuses the existing Synapse session if still active; otherwise it reopens the closed one. The sub-agent re-fetches node access and continues.
2. **Close out** — if the run cannot be resumed, submit a failure:

   ```text
   synapse_submit_experiment_results({
     experimentUuid: "...",
     outcome: "failure",
     experimentResults: { "error": "Sub-agent lost remote session, no checkpoint" }
   })
   ```

---

## Handling Rejection During Review

When a reviewer sends `pending_review` back to `draft`:

1. Read the full comment thread — feedback may span multiple comments and a re-read of the plan.
2. Flip to `draft` with `liveStatus: "writing"`.
3. Revise title / description / researchQuestionUuid / priority via `synapse_update_experiment_plan`.
4. Move it back with `synapse_update_experiment_status({ status: "pending_review" })`.
5. `synapse_add_comment` on the experiment with `@[reviewerName](actorType:uuid)` so the reviewer sees the update.

---

## Typical Execution Flow (Short Form)

1. `synapse_checkin()` — see assigned experiments
2. `synapse_get_experiment()` — understand the task
3. `synapse_create_experiment()` — only if authoring new
4. If drafting or revising: `synapse_update_experiment_status` + `synapse_update_experiment_plan`
5. `synapse_list_compute_nodes()` — inspect availability
6. `synapse_start_experiment()` with optional inline / explicit `synapse_reserve_gpus()`
7. `synapse_get_node_access_bundle()` — write PEM locally, chmod 600, SSH
8. Run workload in tmux + unbuffered python
9. `synapse_report_experiment_progress()` at milestones
10. `synapse_submit_experiment_results()` — success, failure, or inconclusive
11. `synapse_save_experiment_report()` if a dedicated report is required
12. `synapse_add_comment()` for durable findings and mention the reviewer

For parallel multi-experiment dispatch (main agent orchestrates, sub-agents execute), see **[05-session-sub-agent.md](05-session-sub-agent.md)**.
