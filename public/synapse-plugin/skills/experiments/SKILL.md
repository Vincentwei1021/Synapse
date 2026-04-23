---
name: experiments
description: Plan, revise, execute, and report Synapse experiments, including compute access and result submission.
license: AGPL-3.0
metadata:
  author: Vincentwei1021
  version: "0.6.1"
  category: research
  mcp_server: synapse
---

# Experiments Skill

Use this skill for the experiment stage: drafting plans, revising returned experiments, running approved work, using compute, and submitting results.

## Prompt Boundary

Stay inside this skill when the work is about:
- `draft`, `pending_review`, `pending_start`, `in_progress`, or `completed` experiments
- plan authoring or revision
- reserving GPUs and starting workloads
- reporting progress and saving results
- writing experiment reports

Do not use this skill for open-ended literature synthesis or autonomous next-step ideation. Hand off to:
- **[research](../research/SKILL.md)** for literature and deep research
- **[autonomy](../autonomy/SKILL.md)** for autonomous proposal of the next experiment

## Typical Flow

1. `synapse_checkin()`
2. `synapse_get_assigned_experiments()` or `synapse_get_experiment()`
3. If drafting or revising: `synapse_update_experiment_status()` + `synapse_update_experiment_plan()`
4. If executing: `synapse_list_compute_nodes()` and optionally `synapse_reserve_gpus()`
5. `synapse_start_experiment()`
6. `synapse_get_node_access_bundle()` when remote compute access is needed
7. `synapse_report_experiment_progress()` at milestones
8. `synapse_submit_experiment_results()` and optionally `synapse_save_experiment_report()`

## Compute Rule

Never assume a server-local key path exists. Always use `synapse_get_node_access_bundle()` and write the returned PEM locally.

## Reference

- **[Experiment workflow reference](../synapse/references/03-experiment-workflow.md)**
- **[Common tools](../synapse/references/00-common-tools.md)**
