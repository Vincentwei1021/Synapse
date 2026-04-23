# Experiment Workflow

This guide covers the current experiment lifecycle: planning or revising experiment specs, executing approved experiments, reporting progress, and saving final reports.

---

## Experiment Lifecycle

```text
draft --> pending_review --> pending_start --> in_progress --> completed
```

- `draft`: being authored or revised
- `pending_review`: waiting for human review
- `pending_start`: approved and ready for execution
- `in_progress`: actively running
- `completed`: results submitted

---

## Getting Assigned Experiments

```text
# Check all your assignments
synapse_get_assigned_experiments()

# Filter by project
synapse_get_assigned_experiments({ researchProjectUuid: "..." })

# Filter by status
synapse_get_assigned_experiments({ statuses: ["pending_start", "in_progress"] })
```

For full experiment details:

```text
synapse_get_experiment({ experimentUuid: "..." })
```

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

If you are revising based on feedback, read the full thread first:

```text
synapse_get_comments({
  targetType: "experiment",
  targetUuid: "..."
})
```

---

## Starting An Experiment

When ready to begin work on a `pending_start` experiment:

```text
synapse_start_experiment({
  experimentUuid: "...",
  workingNotes: "Starting with baseline configuration"
})
```

This moves the experiment to `in_progress` and creates or updates the experiment result document.

### With Explicit GPU Reservation

If the experiment needs compute, inspect available GPUs first:

```text
synapse_list_compute_nodes({ onlyAvailable: true, researchProjectUuid: "..." })
```

Then either reserve inline with `start_experiment`:

```text
synapse_start_experiment({
  experimentUuid: "...",
  gpuUuids: ["gpu-uuid-1", "gpu-uuid-2"],
  workingNotes: "Using 2x L40S GPUs"
})
```

Or reserve explicitly before starting:

```text
synapse_reserve_gpus({
  experimentUuid: "...",
  gpuUuids: ["gpu-uuid-1", "gpu-uuid-2"]
})

synapse_start_experiment({ experimentUuid: "..." })
```

---

## Reporting Progress

Progress updates appear on the experiment card in real time and are stored in the progress timeline.

```text
synapse_report_experiment_progress({
  experimentUuid: "...",
  message: "Epoch 15/100, loss: 0.342, val_acc: 87.2%",
  phase: "training",
  liveStatus: "running"
})
```

Useful `liveStatus` values:
- `checking_resources` while probing compute
- `queuing` while waiting for GPUs
- `running` during active execution

Use `phase` labels such as `setup`, `training`, `evaluation`, or `analysis`.

---

## Using Compute Resources

### Getting SSH Access

Do not assume local key paths exist. Always use the access bundle:

```text
synapse_get_node_access_bundle({
  experimentUuid: "...",
  nodeUuid: "..."
})
```

Returns connection details plus `privateKeyPemBase64`.

To connect:
1. Decode and write the PEM key to a local file
2. `chmod 600` the PEM file
3. SSH using the returned host / user / port with the PEM key

---

## Submitting Results

When the experiment is complete:

```text
synapse_submit_experiment_results({
  experimentUuid: "...",
  outcome: "success",
  experimentResults: {
    "accuracy": 0.923,
    "summary": "Ablation outperformed baseline"
  }
})
```

This:
- moves the experiment to `completed`
- updates the experiment result document
- refreshes the project-level synthesis

`outcome` is optional and typically one of `success`, `failure`, or `inconclusive`.

---

## Saving The Dedicated Experiment Report

Some flows ask for a fuller experiment report document after completion:

```text
synapse_save_experiment_report({
  experimentUuid: "...",
  title: "Experiment Report: Baseline vs Ablation",
  content: "# Objective\n\n..."
})
```

Use this for the dedicated result document. Do not replace it with a comment thread.

---

## Typical Execution Flow

1. `synapse_checkin()` to see assigned experiments
2. `synapse_get_experiment()` to understand the task or review feedback
3. If you are drafting or revising, use `synapse_update_experiment_status()` plus `synapse_update_experiment_plan()`
4. `synapse_list_compute_nodes()` if GPUs are needed
5. `synapse_start_experiment()` with optional `synapse_reserve_gpus()`
6. `synapse_get_node_access_bundle()` if remote execution is needed
7. Run the workload
8. `synapse_report_experiment_progress()` at major milestones
9. `synapse_submit_experiment_results()` when done
10. `synapse_save_experiment_report()` if the flow asks for a dedicated report doc
11. `synapse_add_comment()` for durable findings or decisions
