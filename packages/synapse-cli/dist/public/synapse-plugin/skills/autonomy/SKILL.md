---
name: autonomy
description: Drive the Claude Code-client autonomous research loop — analyze project state, propose the next experiment, dispatch sub-agents to execute it, and iterate.
license: AGPL-3.0
metadata:
  author: Vincentwei1021
  version: "0.6.1"
  category: research
  mcp_server: synapse
---

# Autonomy Skill

Use this skill when the user asks the Claude Code agent to drive research autonomously on a Synapse project: propose the next experiment, dispatch it, analyze the result, and repeat.

This is the **CC-client autonomous loop**. It does not depend on the server-side `autonomousLoopEnabled` flag (that flag is for realtime-transport agents). The loop runs entirely inside the current Claude Code session: the main agent is the orchestrator, and sub-agents spawned via the Task tool are auto-enrolled by the plugin's `SubagentStart` hook.

## Default Mode

**Full auto** by default. When the user says "turn on autonomous loop", "run until done", or similar, assume full auto unless they say otherwise:

- New experiment proposals are created as `pending_start` and immediately dispatched to sub-agents for execution.
- The main agent does not wait for human approval between iterations.
- The user can stop the loop at any time by interrupting the session; the main agent should also stop voluntarily once stop conditions (below) are met.

If the user explicitly asks for "human review before each experiment", switch to **review mode**: proposals land as `pending_review` and the loop pauses until they are approved externally.

## Full-Auto Lives In This Session Only

Full-auto mode for the CC-client autonomous loop is opted in **verbally** ("turn on autonomous loop", "full auto", "run until done") and lives only in the main agent's current session context. It does **not** flip the server-side `autonomousLoopEnabled` / `autonomousLoopMode` fields, and it does not write any state to Synapse.

Full-auto is a one-way track. The only exits are:

- The user explicitly says stop (or interrupts the session).
- A hard external error makes progress impossible (compute exhausted, MCP failure, network partition that cannot be recovered).

Self-review **never** pauses full-auto. Sub-agent timeouts in self-review do not pause full-auto. Advisory issues raised by self-review do not pause full-auto. The main agent applies a single revision pass when feasible and continues. Whatever the main agent decides, it must be reflected in the `reviewNote` of the resulting `synapse_review_experiment` call (see template below).

## Prompt Boundary

Stay inside this skill when the work is about:
- reviewing the project state after experiments finish
- deciding whether to propose the next experiment or wait for in-flight work
- dispatching sub-agents to execute `pending_start` experiments
- maintaining a rolling synthesis via `synapse_save_project_synthesis`
- detecting stop conditions and exiting cleanly

Hand off to:
- **[experiments](../experiments/SKILL.md)** for the inner execution logic of one experiment (the sub-agent operates there)
- **[research](../research/SKILL.md)** when the loop decides it needs new literature before the next experiment
- **[sessions](../sessions/SKILL.md)** for how sub-agent sessions and heartbeats are auto-managed

## Before Starting The Loop

1. `synapse_checkin()` to refresh identity and current assignments.
2. `synapse_get_project_full_context({ researchProjectUuid })` to load brief, evaluation methods, past experiments, latest synthesis, and compute availability.
3. Confirm with the user:
   - target project UUID
   - mode (`full_auto` default, or `review`)
   - optional budgets: `maxIterations`, `maxExperimentsProposed`, `maxComputeHours`
4. If the project has no completed experiments, do not enter the loop cold. Offer the foundational path first (data prep + baseline + eval script — see **[experiments](../experiments/SKILL.md)**), then start the loop once the baseline is in place.

## Iteration Procedure

Each iteration of the loop follows the same shape. The main agent runs this until a stop condition triggers.

1. **Refresh project state**
   - `synapse_get_project_full_context({ researchProjectUuid })`
   - `synapse_get_assigned_experiments({ researchProjectUuid, statuses: ["pending_start", "in_progress"] })`

2. **Decide what this iteration should do**
   - If any experiment is `in_progress`, the loop should **monitor**, not propose. Poll `synapse_get_experiment` for each running experiment, write a progress note to the user, and yield back so the next user turn re-enters the loop.
   - If any experiment is `pending_start` (and mode is `full_auto`), **dispatch** it: spawn a Task-tool sub-agent with the experiment UUID in its prompt. The `SubagentStart` hook auto-injects the session UUID and execution workflow; the main agent does not need to call `synapse_create_session`.
   - If the queue is empty and there are completed experiments to digest, **synthesize** first: read the current `project_synthesis` document via `synapse_get_documents({ type: "project_synthesis" })` + `synapse_get_document`, and update it with `synapse_save_project_synthesis` only if new results add something the existing synthesis does not already cover.
   - If the queue is empty and synthesis is current, **propose** the next experiment with `synapse_propose_experiment`. One independent run per proposal — split comparisons, ablations, and parameter sweeps into separate proposals.

3. **Respect compute reality**
   - Before proposing, check availability with `synapse_list_compute_nodes({ researchProjectUuid, onlyAvailable: true })`. Do not over-propose concurrent experiments beyond what available GPUs can run.
   - If the project has a `computePoolUuid`, reservations must stay inside that pool.

4. **Log the decision**
   - Add a short `synapse_add_comment({ targetType: "research_project", ... })` summarizing what this iteration decided and why. This gives the human a readable audit trail in the UI.

5. **Check stop conditions**, then either return control to the user (normal case) or immediately re-run step 1 if the user asked for tight, unattended iteration within a single turn.

## Self-Review Before `synapse_propose_experiment`

Before calling `synapse_propose_experiment`, spawn a `Task` sub-agent to self-review the proposal text (motivation, hypothesis, method, success criteria, compute fit) against the project context and evaluation methods. Self-review is in-session only — it does **not** write to Synapse. Refine the proposal text based on the verdict, then call `synapse_propose_experiment`.

The same applies after `synapse_create_experiment` lands a draft inside the loop: self-review the draft via a sub-agent, revise, then push to `pending_review` and (in full-auto) auto-approve.

## Monitor-Not-Executor

The main agent does **not** SSH into GPU nodes, does **not** run training loops, and does **not** call `synapse_start_experiment` itself (unless the user explicitly tells it to run an experiment inline with no sub-agent). Its job is:

- read state → decide → dispatch → monitor → synthesize → propose → repeat.

All execution work — `synapse_start_experiment`, `synapse_get_node_access_bundle`, SSH, training, `synapse_report_experiment_progress`, `synapse_submit_experiment_results` — happens inside sub-agents. Spawn one Task sub-agent per `pending_start` experiment. Each sub-agent receives its session UUID and the full experiment workflow automatically via the `SubagentStart` hook.

## Proposal Quality

A good proposal includes:
- **Motivation** — what previous result or gap this addresses
- **Hypothesis** — what you expect to learn
- **Method** — enough detail that a sub-agent can execute without further prompting
- **Success criteria** — how the result will be judged against the project's evaluation method
- **Compute fit** — realistic given current availability

Bad proposals to avoid:
- bundling multiple runs into one card
- re-running something already completed
- ignoring the project's stated evaluation methods
- proposing work the available compute pool cannot support

## Stop Conditions

Exit the loop and report back to the user when any of these hold:

- `maxIterations` reached (default: ask the user up front)
- `maxExperimentsProposed` reached
- `maxComputeHours` used across this loop's runs
- synthesis has not materially changed for K consecutive iterations (no-progress detection)
- the user interrupts or explicitly says "stop"
- all research questions are `completed` and there is no promising direction left
- compute pool is exhausted and no experiment is making forward progress

On exit, summarize what was run, what was learned, the current state of the synthesis document, and any recommended follow-ups for a human.

## Auto-Approve `reviewNote` Template (CC Full-Auto Only)

When the main agent auto-approves a draft after a successful self-review:

```
synapse_review_experiment({
  experimentUuid,
  decision: "approved",
  reviewNote: "Full-auto session authorized by <ownerName> at <ISO time>. Self-review pass: <key points>.",
})
```

When self-review failed or timed out, use:

```
reviewNote: "Full-auto session authorized by <ownerName> at <ISO time>. Self-review skipped: <reason>."
```

Either way, full-auto continues — the `reviewNote` is the audit truth.

## Mutual Exclusion With The Server-Side Loop

If `synapse_get_research_project` shows the project already has `autonomousLoopEnabled = true` and a loop agent assigned on the realtime side, do not also run the CC-client loop against it. Warn the user and either defer, or ask them to disable the server-side loop first — running both will double-dispatch proposals and reservations.

## Typical Turn

```
synapse_checkin()
synapse_get_project_full_context({ researchProjectUuid })
synapse_get_assigned_experiments({ researchProjectUuid, statuses: ["pending_start", "in_progress"] })

# Monitor in-flight experiments if any
# Else dispatch pending_start via Task sub-agents
# Else synthesize if new results need analysis
# Else propose next experiment

synapse_add_comment({
  targetType: "research_project",
  targetUuid: "<projectUuid>",
  content: "Iteration N — dispatched experiment <uuid> / proposed <title> / no-op (synthesis current)"
})
```

## Reference

- **[Autonomous loop reference](../synapse/references/04-autonomous-loop.md)**
- **[Experiments skill](../experiments/SKILL.md)**
- **[Sessions skill](../sessions/SKILL.md)**
- **[Common tools](../synapse/references/00-common-tools.md)**
