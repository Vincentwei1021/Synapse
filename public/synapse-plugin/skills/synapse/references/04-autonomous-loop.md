# Autonomous Loop

This guide covers the autonomous experiment proposal flow: how agents propose the next experiment when the queue is empty and autonomous loop is enabled.

---

## When To Use

The autonomous loop triggers when:
- assigned experiments are no longer actively running
- no `pending_start` or `in_progress` experiments remain for the agent
- the project still has open questions or promising directions to explore

This is the self-directed mode where the agent drives research forward without waiting for a new manual assignment.

---

## Step 1: Gather Full Context

Before proposing anything, understand the complete project state:

```text
synapse_get_project_full_context({ researchProjectUuid: "..." })
```

This returns:
- project brief and objectives
- research questions and their statuses
- experiment summaries and outcomes
- synthesis hints and results-log context
- compute availability and queue hints

Review what has been tried, what worked, what failed, and what gaps remain.

---

## Step 2: Check Literature

Search for relevant papers that might inform the next experiment:

```text
synapse_search_papers({ query: "..." })
synapse_get_related_works({ researchProjectUuid: "..." })
```

Compare existing related works against the project's direction. Add any new relevant papers:

```text
synapse_add_related_work({
  researchProjectUuid: "...",
  title: "...",
  url: "..."
})
```

---

## Step 3: Propose An Experiment

When you identify a promising direction:

```text
synapse_propose_experiment({
  researchProjectUuid: "...",
  title: "Ablation study: attention head pruning impact on downstream tasks",
  description: "## Motivation\n\nPrevious experiment showed..."
})
```

The resulting status depends on the project's autonomous-loop mode:
- **Human Review mode**: the experiment is created in `pending_review`
- **Full Auto mode**: the experiment is created in `pending_start` and auto-assigned back to the agent for execution

### Writing Good Proposals

A proposal should include:
- motivation: why this experiment matters now
- hypothesis: what you expect to learn
- method: how it will be executed
- success criteria: how you will judge the result
- relation to prior work: how it builds on completed experiments
- compute fit: keep current compute availability in mind and avoid over-proposing concurrent work

---

## Step 4: Review Synthesis And Results

After experiments complete, synthesis documents are updated automatically. You can also review and comment on them:

```text
synapse_get_documents({ researchProjectUuid: "...", type: "project_synthesis" })
synapse_get_document({ documentUuid: "..." })
```

Add comments if you notice gaps or additional insights:

```text
synapse_add_comment({
  targetType: "document",
  targetUuid: "...",
  content: "The synthesis should also note the correlation between..."
})
```

---

## Full Autonomous Loop

```text
# 1. Confirm no active work
synapse_checkin()
synapse_get_assigned_experiments({ statuses: ["pending_start", "in_progress"] })

# 2. Gather full context
synapse_get_project_full_context({ researchProjectUuid: "..." })

# 3. Search literature for new directions
synapse_search_papers({ query: "..." })

# 4. Propose the next experiment
synapse_propose_experiment({
  researchProjectUuid: "...",
  title: "...",
  description: "..."
})

# 5. Comment on the reasoning if helpful
synapse_add_comment({
  targetType: "experiment",
  targetUuid: "<new-experiment-uuid>",
  content: "Proposed because..."
})

# 6. If the project is in Human Review mode, wait for approval.
#    If it is in Full Auto mode, expect the experiment to come back as a normal assignment in `pending_start`.
```

---

## Tips

- Do not propose redundant experiments; check completed work first
- Build on failures instead of ignoring them
- Stay aligned with the project's research questions
- Be specific enough that another agent could execute the plan
- Use the compute availability summary to keep proposals realistic
