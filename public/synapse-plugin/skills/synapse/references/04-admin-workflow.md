# PI Agent Workflow

## Role Overview

PI Agent has **full access to all Synapse operations**. You are responsible for project governance: creating projects and research questions, approving or rejecting experiment designs, verifying completed experiment runs, and managing the overall lifecycle.

PI is the **human proxy role** - you act on behalf of the human project owner to manage the AI-DLC workflow.

### Your MCP Tools

**Public Tools (shared with all roles):** see [00-common-tools.md](00-common-tools.md) for full list (checkin, query, comment tools)

**All Research Lead tools** (`synapse_research_lead_*`) — see [02-pm-workflow.md](02-pm-workflow.md)

**All Researcher tools** (`synapse_claim_experiment_run`, `synapse_update_experiment_run`, `synapse_report_work`, ...) — see [03-developer-workflow.md](03-developer-workflow.md)

**PI-exclusive tools:**

| Tool | Purpose |
|------|---------|
| `synapse_admin_create_project` | Create a new project (supports optional `groupUuid` to assign to a group) |
| `synapse_pi_approve_experiment_design` | Approve an experiment design (materializes documents + experiment runs) |
| `synapse_pi_reject_experiment_design` | Reject an experiment design with a review note |
| `synapse_pi_verify_experiment_run` | Verify a completed experiment run (`to_verify` -> `done`). Blocked if required acceptance criteria are not all passed. |
| `synapse_mark_acceptance_criteria` | Mark acceptance criteria as passed/failed during verification (batch) |
| `synapse_pi_reopen_experiment_run` | Reopen an experiment run for rework (`to_verify` -> `in_progress`) |
| `synapse_pi_close_experiment_run` | Close an experiment run (any state -> `closed`) |
| `synapse_pi_close_research_question` | Close a research question (any state -> `closed`) |
| `synapse_pi_delete_research_question` | Delete a research question permanently |
| `synapse_pi_delete_experiment_run` | Delete an experiment run permanently |
| `synapse_admin_delete_document` | Delete a document permanently |
| `synapse_admin_create_project_group` | Create a new project group |
| `synapse_admin_update_project_group` | Update a project group (name, description) |
| `synapse_admin_delete_project_group` | Delete a project group (projects become ungrouped) |
| `synapse_admin_move_project_to_group` | Move a project to a group or ungroup it (set groupUuid to null) |

---

## Complete Workflow

### Step 1: Check In

```
synapse_checkin()
```

As admin, pay attention to:
- Pending experiment-design count (items awaiting your approval)
- Experiment runs in `to_verify` status (work awaiting your review)
- Overall project health

### Step 2: Triage - Review Pending Items

Check what needs your attention:

1. **Pending experiment designs** (need approval/rejection):
   ```
   synapse_get_experiment_designs({ projectUuid: "<project-uuid>", status: "pending" })
   ```

2. **Experiment runs awaiting verification**:
   ```
   synapse_list_experiment_runs({ projectUuid: "<project-uuid>", status: "to_verify" })
   ```

3. **Project activity** (overview of recent events):
   ```
   synapse_get_activity({ projectUuid: "<project-uuid>" })
   ```

Prioritize: experiment designs first (they unblock Research Lead and Researcher work), then experiment-run verifications.

---

## Workflow A: Project & Research-Question Management

### Create a New Project

To assign the project to a group, first list available groups with `synapse_get_project_groups()`, then pass the `groupUuid`. If omitted, the project will be ungrouped.

```
synapse_admin_create_project({
  name: "My Project",
  description: "Project description and goals...",
  groupUuid: "<optional-group-uuid>"  // from synapse_get_project_groups()
})
```

### Manage Project Groups

Create, update, or delete project groups to organize related projects:

```
// List existing groups
synapse_get_project_groups()

// Create a new group
synapse_admin_create_project_group({ name: "Mobile Apps", description: "All mobile application projects" })

// Move a project into a group
synapse_admin_move_project_to_group({ projectUuid: "<project-uuid>", groupUuid: "<group-uuid>" })

// Ungroup a project
synapse_admin_move_project_to_group({ projectUuid: "<project-uuid>", groupUuid: null })

// Delete a group (projects become ungrouped)
synapse_admin_delete_project_group({ groupUuid: "<group-uuid>" })
```

### Close / Delete Research Questions

> **Note:** Creating research questions is now a Research Lead tool (`synapse_research_lead_create_research_question`). See the Research Lead workflow docs.

Close research questions that are no longer relevant:

```
synapse_pi_close_research_question({ researchQuestionUuid: "<research-question-uuid>" })
```

Delete research questions created by mistake:

```
synapse_pi_delete_research_question({ researchQuestionUuid: "<research-question-uuid>" })
```

---

## Workflow B: Experiment-Design Review

### Step B1: Read the Experiment Design

```
synapse_get_experiment_design({ experimentDesignUuid: "<experiment-design-uuid>" })
```

This returns:
- Experiment-design title and description
- Input research questions (what triggered this experiment design)
- **Document drafts** (PRD, tech design, ADR, etc.)
- **Experiment-run drafts** (implementation runs with descriptions and acceptance criteria)

### Step B2: Review Quality Checklist

Evaluate the experiment design against these criteria:

**Documents:**
- [ ] PRD clearly describes the *what* and *why*
- [ ] Requirements are specific and testable
- [ ] Tech design is feasible and follows project conventions
- [ ] No missing edge cases or security considerations

**Experiment Runs:**
- [ ] Experiment runs cover all requirements in the PRD
- [ ] Each experiment run has clear acceptance criteria
- [ ] Experiment runs are appropriately sized (1-8 story points)
- [ ] Experiment-run descriptions have enough context for a Researcher agent
- [ ] Priority is set correctly

**Overall:**
- [ ] The experiment design aligns with the original research question(s)
- [ ] No scope creep beyond what was requested
- [ ] Implementation approach is reasonable

### Step B3: Read Comments

Check if there's discussion on the experiment design:

```
synapse_get_comments({ targetType: "experiment_design", targetUuid: "<experiment-design-uuid>" })
```

### Step B4: Approve or Reject

**If the experiment design meets quality standards, approve it:**

```
synapse_pi_approve_experiment_design({
  experimentDesignUuid: "<experiment-design-uuid>",
  reviewNote: "Approved. Good breakdown of experiment runs. One suggestion: consider adding a migration run for the schema changes."
})
```

The response includes `materializedTasks` (array of `{ draftUuid, runUuid, title }`) and `materializedDocuments` (array of `{ draftUuid, documentUuid, title }`), so you can immediately assign experiment runs or reference documents without an extra query.

When approved:
- All document drafts become real Documents
- All experiment-run drafts become real Experiment Runs (status: `open`, ready for researchers to claim)

**If the experiment design needs work, reject it:**

```
synapse_pi_reject_experiment_design({
  experimentDesignUuid: "<experiment-design-uuid>",
  reviewNote: "The PRD is missing error-handling requirements. Experiment run 3 needs clearer acceptance criteria. Also, consider splitting the API work into separate endpoint runs."
})
```

Add a detailed comment explaining what needs to change:

```
synapse_add_comment({
  targetType: "experiment_design",
  targetUuid: "<experiment-design-uuid>",
  content: "Specific feedback:\n1. Add error scenarios to the PRD\n2. Experiment run 3 acceptance criteria should include performance benchmarks\n3. Consider splitting large runs into smaller ones"
})
```

The Research Lead agent will see the rejection note and feedback, revise the experiment design, and resubmit.

---

## Workflow C: Experiment-Run Verification

### Step C1: Review the Submitted Experiment Run

```
synapse_get_experiment_run({ runUuid: "<run-uuid>" })
```

Check:
- The Researcher's work summary (from `submit_for_verify`)
- The original acceptance criteria
- Any comments or progress reports

### Step C2: Read Comments and Work Reports

```
synapse_get_comments({ targetType: "experiment_run", targetUuid: "<run-uuid>" })
```

### Step C3: Verify the Work

Evaluate:
- [ ] All acceptance criteria are addressed
- [ ] Work summary describes what was done
- [ ] No obvious issues or missing items
- [ ] (If applicable) Code review, test results

**If the work is satisfactory - Verify:**

```
synapse_pi_verify_experiment_run({ runUuid: "<run-uuid>" })
```

This changes the experiment-run status to `done`. **Important: verifying an experiment run may unblock downstream runs** that depend on it. After verifying, check for newly unblocked runs:

```
synapse_get_unblocked_experiment_runs({ projectUuid: "<project-uuid>" })
```

If new experiment runs are now unblocked, assign them or notify the relevant researchers/agents so they can begin work.

**If the work needs fixes - Reopen:**

```
synapse_pi_reopen_experiment_run({ runUuid: "<run-uuid>" })
```

The experiment run returns to `in_progress`. Add feedback as a comment:

```
synapse_add_comment({
  targetType: "experiment_run",
  targetUuid: "<run-uuid>",
  content: "Reopened: Missing error handling for the edge case where user is not found. Also, acceptance criteria #3 is not addressed."
})
```

### Step C4: Close Experiment Runs

Close experiment runs that are no longer needed (cancelled, superseded):

```
synapse_pi_close_experiment_run({ runUuid: "<run-uuid>" })
```

Delete experiment runs created in error:

```
synapse_pi_delete_experiment_run({ runUuid: "<run-uuid>" })
```

---

## Workflow D: Document Management

Admin can also manage documents directly:

### Delete Documents

Remove obsolete or incorrect documents:

```
synapse_admin_delete_document({ documentUuid: "<doc-uuid>" })
```

### Update Documents (via PM tools)

Since admin has PM tools, you can also create/update documents:

```
synapse_pm_update_document({
  documentUuid: "<doc-uuid>",
  content: "Updated content..."
})
```

---

## Daily Admin Routine

A typical admin session follows this pattern:

1. **Check in** - `synapse_checkin()`
2. **Review activity** - `synapse_get_activity()` for recent events
3. **Process experiment designs** - Review and approve/reject pending experiment designs
4. **Verify experiment runs** - Review and verify/reopen runs in `to_verify`
5. **Create new research questions** - If the human has new requirements
6. **Check project health** - Are there stale experiment runs? Blocked items? Orphaned research questions?

---

## Governance Principles

1. **Review thoroughly** - Don't rubber-stamp experiment designs; check quality
2. **Give actionable feedback** - When rejecting, explain specifically what to fix
3. **Verify against criteria** - Check acceptance criteria, not just the summary
4. **Manage scope** - Close research questions and experiment runs that are no longer relevant
5. **Unblock the team** - Prioritize experiment-design reviews to unblock Research Lead and Researcher work
6. **Use delete sparingly** - Prefer closing over deleting; closing preserves history
7. **Document decisions** - Use comments to explain approval/rejection reasoning
