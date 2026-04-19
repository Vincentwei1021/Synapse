# Experiment Workflow

This guide covers the experiment execution lifecycle: getting assignments, starting experiments, using compute resources, reporting progress, and submitting results.

---

## Experiment Lifecycle

```
draft --> pending_review --> pending_start --> in_progress --> completed
```

- **draft**: Initial creation, not yet submitted
- **pending_review**: Awaiting human review
- **pending_start**: Approved and ready for execution
- **in_progress**: Agent is actively running the experiment
- **completed**: Results submitted

---

## Getting Assigned Experiments

```
# Check all your assignments
synapse_get_assigned_experiments()

# Filter by project
synapse_get_assigned_experiments({ researchProjectUuid: "..." })

# Filter by status
synapse_get_assigned_experiments({ statuses: ["pending_start", "in_progress"] })
```

For full experiment details:

```
synapse_get_experiment({ experimentUuid: "..." })
```

---

## Starting an Experiment

When ready to begin work on a `pending_start` experiment:

```
synapse_start_experiment({
  experimentUuid: "...",
  workingNotes: "Starting with baseline configuration"
})
```

This moves the experiment to `in_progress` and creates or updates the experiment result document.

### With GPU Reservation

If the experiment needs compute, reserve GPUs at start time:

```
# First, find available compute
synapse_list_compute_nodes({ onlyAvailable: true })

# Start with GPU reservation
synapse_start_experiment({
  experimentUuid: "...",
  gpuUuids: ["gpu-uuid-1", "gpu-uuid-2"],
  workingNotes: "Using 2x L40S GPUs"
})
```

---

## Reporting Progress

Report progress updates during execution. These appear in real-time on the experiment card in the UI.

```
synapse_report_experiment_progress({
  experimentUuid: "...",
  message: "Epoch 15/100, loss: 0.342, val_acc: 87.2%",
  phase: "training"
})
```

Use `phase` to categorize updates (e.g., `setup`, `training`, `evaluation`, `analysis`).

---

## Using Compute Resources

### Listing Available Compute

```
synapse_list_compute_nodes({ onlyAvailable: true })
```

Returns pools, nodes, GPUs, and whether managed SSH access is available.

### Getting SSH Access

Do not assume local key paths exist. Always use the access bundle:

```
synapse_get_node_access_bundle({
  experimentUuid: "...",
  nodeUuid: "..."
})
```

Returns:
- `host`, `port`, `user` -- SSH connection details
- `privateKeyPemBase64` -- Base64-encoded PEM key

To connect:
1. Decode and write the PEM key to a local file
2. `chmod 600` the PEM file
3. SSH using the returned host/user/port with the PEM key

---

## Submitting Results

When the experiment is complete:

```
synapse_submit_experiment_results({
  experimentUuid: "...",
  outcome: "success",
  experimentResults: "## Results\n\nAccuracy: 92.3%\nF1: 0.891\n\n## Analysis\n..."
})
```

This:
- Moves the experiment to `completed`
- Updates the experiment result document
- Triggers a refresh of the project-level synthesis document

The `outcome` field is optional and can be `"success"`, `"failure"`, or `"inconclusive"`.

---

## Commenting on Experiments

Add comments to document decisions, ask questions, or discuss results:

```
synapse_add_comment({
  targetType: "experiment",
  targetUuid: "...",
  content: "Switched to AdamW optimizer after initial results showed instability with SGD."
})

synapse_get_comments({
  targetType: "experiment",
  targetUuid: "..."
})
```

---

## Typical Execution Flow

1. **Check in**: `synapse_checkin()` to see assigned experiments
2. **Review assignment**: `synapse_get_experiment()` to understand the task
3. **Check compute**: `synapse_list_compute_nodes()` if GPUs are needed
4. **Start**: `synapse_start_experiment()` with optional GPU reservation
5. **Get SSH access**: `synapse_get_node_access_bundle()` if remote execution is needed
6. **Execute**: Run the experiment (training, evaluation, etc.)
7. **Report progress**: `synapse_report_experiment_progress()` periodically
8. **Submit results**: `synapse_submit_experiment_results()` when done
9. **Comment**: Document key findings and decisions
