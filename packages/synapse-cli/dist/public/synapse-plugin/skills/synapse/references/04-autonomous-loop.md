# Autonomous Loop

This guide covers the autonomous experiment proposal flow -- how agents can independently propose new experiments when all current work is complete.

---

## When to Use

The autonomous loop triggers when:
- All assigned experiments are `completed`
- No `pending_start` or `in_progress` experiments remain for the agent
- The project still has open research questions or areas to explore

This is the self-directed mode where the agent drives the research forward without waiting for human task assignment.

---

## Step 1: Gather Full Context

Before proposing anything, understand the complete project state:

```
synapse_get_project_full_context({ researchProjectUuid: "..." })
```

This returns:
- Project brief and objectives
- All research questions and their statuses
- All experiments and their outcomes
- Existing results and synthesis

Review what has been tried, what succeeded, what failed, and what gaps remain.

---

## Step 2: Check Literature

Search for relevant papers that might inform the next experiment:

```
synapse_search_papers({ query: "..." })
synapse_get_related_works({ researchProjectUuid: "..." })
```

Compare existing related works against the project's current direction. Add any new relevant papers:

```
synapse_add_related_work({ researchProjectUuid: "...", title: "...", url: "..." })
```

---

## Step 3: Propose an Experiment

When you identify a promising direction:

```
synapse_propose_experiment({
  researchProjectUuid: "...",
  title: "Ablation study: attention head pruning impact on downstream tasks",
  description: "## Motivation\n\nPrevious experiment showed..."
})
```

The proposed experiment is created in `draft` status. A human reviewer will move it to `pending_start` when approved.

### Writing Good Proposals

A proposal should include:
- **Motivation**: Why this experiment? What gap does it fill?
- **Hypothesis**: What do you expect to find?
- **Method**: How will the experiment be conducted?
- **Success criteria**: How will you judge the results?
- **Relationship to prior work**: How does this build on completed experiments?

---

## Step 4: Report Generation

After experiments complete, synthesis documents are updated automatically. You can also review and comment on the synthesis:

```
synapse_get_documents({ researchProjectUuid: "...", type: "project_synthesis" })
synapse_get_document({ documentUuid: "..." })
```

Add comments to the synthesis document if you notice gaps or have additional insights:

```
synapse_add_comment({
  targetType: "document",
  targetUuid: "...",
  content: "The synthesis should also note the correlation between..."
})
```

---

## Full Autonomous Loop

```
# 1. Check in and confirm no active work
synapse_checkin()
synapse_get_assigned_experiments({ statuses: ["pending_start", "in_progress"] })

# 2. If no active work, gather full context
synapse_get_project_full_context({ researchProjectUuid: "..." })

# 3. Search literature for new directions
synapse_search_papers({ query: "..." })

# 4. Propose next experiment
synapse_propose_experiment({
  researchProjectUuid: "...",
  title: "...",
  description: "..."
})

# 5. Comment on reasoning
synapse_add_comment({
  targetType: "experiment",
  targetUuid: "<new-experiment-uuid>",
  content: "Proposed because..."
})

# 6. Wait for approval, then execute when assigned
# (loops back to experiment workflow)
```

---

## Tips

- **Do not propose redundant experiments** -- always check completed experiments first
- **Build on failures** -- a failed experiment with good analysis is valuable; propose refined versions
- **Stay focused** -- proposals should align with the project's research questions
- **Be specific** -- vague proposals are harder to review and approve
- **Reference prior results** -- cite specific findings from completed experiments in your motivation
