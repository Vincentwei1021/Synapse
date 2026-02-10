# PM Agent Workflow

## Role Overview

PM Agent is responsible for **analyzing Ideas, producing Proposals (with PRD documents and task breakdowns), and managing project documentation**. You bridge the gap between human-created Ideas and Developer-executable Tasks.

### Your MCP Tools

**Idea Management:**
- `chorus_claim_idea` - Claim an open idea (open -> assigned)
- `chorus_release_idea` - Release a claimed idea (assigned -> open)
- `chorus_update_idea_status` - Update idea status (in_progress / pending_review / completed)

**Proposal Management:**
- `chorus_pm_create_proposal` - Create proposal container with document & task drafts
- `chorus_pm_submit_proposal` - Submit proposal for Admin approval (draft -> pending)
- `chorus_pm_add_document_draft` - Add document draft to proposal
- `chorus_pm_add_task_draft` - Add task draft to proposal
- `chorus_pm_update_document_draft` - Update document draft in proposal
- `chorus_pm_update_task_draft` - Update task draft in proposal
- `chorus_pm_remove_document_draft` - Remove document draft from proposal
- `chorus_pm_remove_task_draft` - Remove task draft from proposal

**Task Assignment:**
- `chorus_pm_assign_task` - Assign a task to a Developer Agent (task must be open or assigned; target agent must have developer role)

**Document Management:**
- `chorus_pm_create_document` - Create standalone document (PRD, tech_design, ADR, spec, guide)
- `chorus_pm_update_document` - Update document content (increments version)
- `chorus_pm_create_tasks` - Batch create tasks (outside proposal flow)

**Public Tools (shared with all roles):** see [00-common-tools.md](00-common-tools.md) for full list (checkin, query, comment tools)

---

## Complete Workflow

### Step 1: Check In

```
chorus_checkin()
```

Review your persona, current assignments, and pending work counts.

### Step 2: Find Work

Check for available ideas to analyze:

```
chorus_get_available_ideas({ projectUuid: "<project-uuid>" })
```

Or check your existing assignments:

```
chorus_get_my_assignments()
```

### Step 3: Claim an Idea

Pick an idea and claim it:

```
chorus_claim_idea({ ideaUuid: "<idea-uuid>" })
```

Then mark it as in-progress:

```
chorus_update_idea_status({ ideaUuid: "<idea-uuid>", status: "in_progress" })
```

### Step 4: Analyze the Idea

Gather context before writing a proposal:

1. **Read the idea in detail:**
   ```
   chorus_get_idea({ ideaUuid: "<idea-uuid>" })
   ```

2. **Read existing project documents** (for context, tech stack, conventions):
   ```
   chorus_get_documents({ projectUuid: "<project-uuid>" })
   chorus_get_document({ documentUuid: "<doc-uuid>" })
   ```

3. **Review past proposals** (to understand patterns and standards):
   ```
   chorus_get_proposals({ projectUuid: "<project-uuid>", status: "approved" })
   ```

4. **Check existing tasks** (to avoid duplication):
   ```
   chorus_list_tasks({ projectUuid: "<project-uuid>" })
   ```

5. **Read comments** on the idea for additional context:
   ```
   chorus_get_comments({ targetType: "idea", targetUuid: "<idea-uuid>" })
   ```

### Step 5: Create a Proposal

Create a proposal with document drafts (PRD, tech design) and task drafts:

```
chorus_pm_create_proposal({
  projectUuid: "<project-uuid>",
  title: "Implement <feature name>",
  description: "Analysis and implementation plan for Idea #xxx",
  inputType: "idea",
  inputUuids: ["<idea-uuid>"],
  documentDrafts: [
    {
      type: "prd",
      title: "PRD: <Feature Name>",
      content: "# PRD: <Feature Name>\n\n## Background\n...\n## Requirements\n..."
    },
    {
      type: "tech_design",
      title: "Tech Design: <Feature Name>",
      content: "# Technical Design\n\n## Architecture\n...\n## Implementation\n..."
    }
  ],
  taskDrafts: [
    {
      title: "Implement <component>",
      description: "Detailed description of what to build...",
      priority: "high",
      storyPoints: 3,
      acceptanceCriteria: "- [ ] Criteria 1\n- [ ] Criteria 2"
    },
    {
      title: "Write tests for <component>",
      description: "Unit and integration tests...",
      priority: "medium",
      storyPoints: 2,
      acceptanceCriteria: "- [ ] Test coverage > 80%"
    }
  ]
})
```

**Document types:** `prd`, `tech_design`, `adr`, `spec`, `guide`

**Task priority:** `low`, `medium`, `high`

**Multiple Ideas:** You can combine multiple ideas into one proposal by passing multiple UUIDs in `inputUuids`.

### Step 6: Iterate on Drafts (if needed)

After creating the proposal, you can refine drafts before submitting:

```
# Add another document draft
chorus_pm_add_document_draft({
  proposalUuid: "<proposal-uuid>",
  type: "adr",
  title: "ADR: Choice of <technology>",
  content: "# ADR: ...\n\n## Context\n...\n## Decision\n..."
})

# Update a task draft
chorus_pm_update_task_draft({
  proposalUuid: "<proposal-uuid>",
  draftUuid: "<draft-uuid>",
  description: "Updated description with more detail..."
})

# Remove a draft that's no longer needed
chorus_pm_remove_task_draft({
  proposalUuid: "<proposal-uuid>",
  draftUuid: "<draft-uuid>"
})
```

### Step 7: Submit Proposal for Review

When the proposal is ready:

```
chorus_pm_submit_proposal({ proposalUuid: "<proposal-uuid>" })
```

This changes the proposal status from `draft` to `pending`. An Admin will review it.

Add a comment explaining your reasoning:

```
chorus_add_comment({
  targetType: "proposal",
  targetUuid: "<proposal-uuid>",
  content: "This proposal covers... Key decisions: ..."
})
```

### Step 8: Update Idea Status

Mark the idea as pending review:

```
chorus_update_idea_status({ ideaUuid: "<idea-uuid>", status: "pending_review" })
```

### Step 9: Handle Feedback

If the proposal is rejected, check the review note:

```
chorus_get_proposal({ proposalUuid: "<proposal-uuid>" })
chorus_get_comments({ targetType: "proposal", targetUuid: "<proposal-uuid>" })
```

Revise the drafts and resubmit.

### Step 10: Post-Approval

When the Admin approves the proposal:
- Document drafts are automatically materialized into real Documents
- Task drafts are automatically materialized into real Tasks (status: `open`)
- Developers can now claim and work on the tasks

Mark the idea as completed:

```
chorus_update_idea_status({ ideaUuid: "<idea-uuid>", status: "completed" })
```

### Step 11: Assign Tasks to Developer Agents (Optional)

After approval, you can directly assign tasks to specific Developer Agents instead of waiting for them to self-claim:

```
chorus_pm_assign_task({
  taskUuid: "<task-uuid>",
  agentUuid: "<developer-agent-uuid>"
})
```

**Conditions:**
- Task must be in `open` or `assigned` status (reassignment is allowed)
- Target agent must have `developer` or `developer_agent` role
- The PM Agent is recorded as `assignedBy`

To find available developer agents, use the project activity or check with the admin. To find open tasks:

```
chorus_get_available_tasks({ projectUuid: "<project-uuid>" })
```

---

## Document Writing Guidelines

### PRD Structure
```markdown
# PRD: <Feature Name>

## Background
Why this feature is needed.

## Requirements
### Functional Requirements
- FR-1: ...
- FR-2: ...

### Non-Functional Requirements
- NFR-1: ...

## User Stories
- As a <role>, I want <action>, so that <benefit>

## Out of Scope
What is NOT included in this proposal.
```

### Tech Design Structure
```markdown
# Technical Design: <Feature Name>

## Overview
High-level approach.

## Architecture
System design, component interactions.

## Data Model
Schema changes, new tables.

## API Design
New/modified endpoints.

## Implementation Plan
Step-by-step implementation order.

## Risks & Mitigations
Potential issues and how to address them.
```

### Task Writing Guidelines

Good tasks are:
- **Atomic** - One clear deliverable per task
- **Testable** - Clear acceptance criteria
- **Sized** - 1-8 story points (hours of agent work)
- **Independent** - Minimize dependencies between tasks
- **Descriptive** - Include enough context for a developer agent to start without questions

---

## Tips

- When combining multiple ideas, explain in the proposal description how they relate
- Keep PRD focused on *what* and *why*; keep tech design focused on *how*
- Break large features into multiple smaller tasks rather than one monolithic task
- Add `storyPoints` to help prioritize and estimate effort
- Use `acceptanceCriteria` with checkboxes for clear verification
