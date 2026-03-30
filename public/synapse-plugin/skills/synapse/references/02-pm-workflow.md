# Research Lead Agent Workflow

## Role Overview

Research Lead Agent is responsible for **analyzing Research Questions, producing Experiment Designs (with PRD documents and experiment-run breakdowns), and managing project documentation**. You bridge the gap between human-created Research Questions and Researcher-executable Experiment Runs.

### Your MCP Tools

**Research Question Management:**
- `synapse_research_lead_create_research_question` - Create a new research question in a project (on behalf of humans or from discovered requirements)
- `synapse_claim_research_question` - Claim an open research question (`open` -> `elaborating`). Claiming auto-transitions to elaborating.
- `synapse_release_research_question` - Release a claimed research question (`elaborating` -> `open`)
- `synapse_update_research_question_status` - Update research-question status (`proposal_created` / `completed`)
- `synapse_move_research_question` - Move a research question to a different project within the same company (also moves linked draft/pending experiment designs)

**Requirements Elaboration:**
- `synapse_research_lead_start_hypothesis_formulation` - Start a hypothesis-formulation round with structured questions for a Research Question
- `synapse_research_lead_validate_hypothesis_formulation` - Validate answers from a hypothesis-formulation round (resolve or create follow-up)
- `synapse_research_lead_skip_hypothesis_formulation` - Skip formulation for clear/simple Research Questions

**Experiment Design Management:**
- `synapse_research_lead_create_experiment_design` - Create an empty experiment-design container (add drafts separately with draft tools)
- `synapse_research_lead_validate_experiment_design` - Validate experiment-design completeness before submission (returns errors, warnings, info)
- `synapse_research_lead_submit_experiment_design` - Submit an experiment design for PI approval (`draft` -> `pending`). Runs validation internally.
- `synapse_research_lead_add_document_draft` - Add a document draft to an experiment design
- `synapse_research_lead_add_experiment_run_draft` - Add an experiment-run draft to an experiment design
- `synapse_research_lead_update_document_draft` - Update a document draft in an experiment design
- `synapse_research_lead_update_experiment_run_draft` - Update an experiment-run draft in an experiment design
- `synapse_research_lead_remove_document_draft` - Remove a document draft from an experiment design
- `synapse_research_lead_remove_experiment_run_draft` - Remove an experiment-run draft from an experiment design

**Experiment-Run Assignment:**
- `synapse_research_lead_assign_experiment_run` - Assign an experiment run to a Researcher Agent (run must be open or assigned; target agent must have researcher role)

**Document & Experiment-Run Management:**
- `synapse_pm_create_document` - Create standalone document (PRD, tech_design, ADR, spec, guide)
- `synapse_pm_update_document` - Update document content (increments version)
- `synapse_research_lead_create_experiment_runs` - Batch create experiment runs (supports intra-batch dependencies via draftUuid)

**Experiment-Run Dependency Management:**
- `synapse_research_lead_add_run_dependency` - Add dependency between two existing experiment runs (with cycle detection)
- `synapse_research_lead_remove_run_dependency` - Remove an experiment-run dependency

**Public Tools (shared with all roles):** see [00-common-tools.md](00-common-tools.md) for full list (checkin, query, comment tools)

---

## Complete Workflow

### Step 1: Check In

```
synapse_checkin()
```

Review your persona, current assignments, and pending work counts.

### Step 2: Find Work

Check for available research questions to analyze:

```
synapse_get_available_research_questions({ researchProjectUuid: "<project-uuid>" })
```

Or check your existing assignments:

```
synapse_get_my_assignments()
```

### Step 3: Claim a Research Question

Pick a research question and claim it. Claiming automatically transitions the Research Question to `elaborating` status:

```
synapse_claim_research_question({ researchQuestionUuid: "<research-question-uuid>" })
```

### Step 4: Elaborate on the Research Question

**Every Research Question should go through elaboration.** Skip only when requirements are completely unambiguous (e.g., a bug fix with clear steps). Elaboration improves experiment-design quality and reduces rejection cycles.

First, gather context:

Gather context before writing an experiment design:

1. **Read the research question in detail:**
   ```
   synapse_get_research_question({ researchQuestionUuid: "<research-question-uuid>" })
   ```

2. **Read existing project documents** (for context, tech stack, conventions):
   ```
   synapse_get_documents({ researchProjectUuid: "<project-uuid>" })
   synapse_get_document({ documentUuid: "<doc-uuid>" })
   ```

3. **Review past experiment designs** (to understand patterns and standards):
   ```
   synapse_get_experiment_designs({ researchProjectUuid: "<project-uuid>", status: "approved" })
   ```

4. **Check existing experiment runs** (to avoid duplication):
   ```
   synapse_list_experiment_runs({ researchProjectUuid: "<project-uuid>" })
   ```

5. **Read comments** on the research question for additional context:
   ```
   synapse_get_comments({ targetType: "research_question", targetUuid: "<research-question-uuid>" })
   ```

After gathering context, determine if structured elaboration is needed or can be skipped.

**Simple Research Questions** (bug fixes, small changes with clear requirements):
You may skip elaboration, but **you MUST ask the user for permission first** via AskUserQuestion before calling `synapse_research_lead_skip_hypothesis_formulation`. Never skip on your own judgment alone.

```
synapse_research_lead_skip_hypothesis_formulation({
  researchQuestionUuid: "<research-question-uuid>",
  reason: "Bug fix with clear reproduction steps"
})
```

**Standard/Complex Research Questions** (new features, multi-component changes):
Start an elaboration round to clarify requirements:

1. **Determine depth** based on research-question complexity:
   - `"minimal"` — 2-4 questions (small features, minor enhancements)
   - `"standard"` — 5-10 questions (typical new features)
   - `"comprehensive"` — 10-15 questions (large features, architectural changes)

2. **Create elaboration questions:**

   > **Note:** Do NOT include an "Other" option in your questions. The UI automatically adds a free-text "Other" option to every question. When the user selects "Other", the answer is submitted as `selectedOptionId: null, customText: "user's text"`.

   ```
   synapse_research_lead_start_hypothesis_formulation({
     researchQuestionUuid: "<research-question-uuid>",
     depth: "standard",
     questions: [
       {
         id: "q1",
         text: "What user roles should have access to this feature?",
         category: "hypothesis",
         options: [
           { id: "a", label: "All users" },
           { id: "b", label: "Admin only" },
           { id: "c", label: "Role-based (configurable)" }
         ]
       },
       {
         id: "q2",
         text: "What is the expected data volume for this feature?",
         category: "resources",
         options: [
           { id: "a", label: "Low (< 1000 records)" },
           { id: "b", label: "Medium (1K-100K records)" },
           { id: "c", label: "High (100K+ records)" }
         ]
       },
       {
         id: "q3",
         text: "Should this feature support real-time updates?",
         category: "methodology",
         options: [
           { id: "a", label: "Yes, real-time via WebSocket" },
           { id: "b", label: "Near real-time (polling)" },
           { id: "c", label: "No, refresh on demand is fine" }
         ]
       }
     ]
   })
   ```

3. **Present questions to the user — MUST use the `AskUserQuestion` tool.** Do NOT display questions as text, tables, or markdown. The `AskUserQuestion` tool renders interactive radio buttons in the terminal that the user can click to select. Map each elaboration question to an AskUserQuestion call (max 4 questions per call; batch if needed). Example:

   ```
   AskUserQuestion({
     questions: [
       {
         question: "Which new locales should be prioritized for V1?",
         header: "Scope",
         options: [
           { label: "Japanese only", description: "Single locale for initial release" },
           { label: "Japanese + Korean", description: "Two East Asian locales" },
           { label: "Japanese + Korean + Arabic (RTL)", description: "Includes right-to-left support" }
         ],
         multiSelect: false
       }
     ]
   })
   ```

   After the user answers all questions via AskUserQuestion, map their selections back to option IDs and call `synapse_answer_hypothesis_formulation`. If the user selected "Other", set `selectedOptionId: null` and `customText` to their input.

4. **Submit answers** (or the user/stakeholder submits via the UI):
   ```
   synapse_answer_hypothesis_formulation({
     researchQuestionUuid: "<research-question-uuid>",
     roundUuid: "<round-uuid>",
     answers: [
       { questionId: "q1", selectedOptionId: "c", customText: null },
       { questionId: "q2", selectedOptionId: "b", customText: "We may need to support 500K+ in future" },
       { questionId: "q3", selectedOptionId: null, customText: "We need a custom hybrid approach" }
     ]
   })
   ```

   Answer format:
   - **Select an option**: `selectedOptionId: "a", customText: null`
   - **Select an option + add a note**: `selectedOptionId: "a", customText: "additional context"`
   - **Choose "Other" (free text)**: `selectedOptionId: null, customText: "your answer"` — customText is required when no option is selected

5. **Review answers and confirm with the owner (@mention flow):**

   After answers are submitted, review them and **@mention the answerer** (typically the agent's owner) with a summary of your understanding. This confirmation step prevents misinterpretation before you validate or create follow-up questions.

   a. **Get owner info** from your checkin response (`agent.owner`) or search for the answerer:
      ```
      synapse_search_mentionables({ query: "owner-name" })
      ```

   b. **Post a summary comment** on the research question, @mentioning the answerer:
      ```
      synapse_add_comment({
        targetType: "research_question",
        targetUuid: "<research-question-uuid>",
        content: "@[Owner Name](user:owner-uuid) I've reviewed the elaboration answers. Here's my understanding:\n\n- Key requirement 1: ...\n- Key requirement 2: ...\n- Scope decision: ...\n\nDoes this match your intent? Any additions or corrections before I proceed?"
      })
      ```

   c. **Wait for confirmation.** The owner will be notified and can reply via comment. Check for their response:
      ```
      synapse_get_comments({ targetType: "research_question", targetUuid: "<research-question-uuid>" })
      ```

   d. **Based on the response**, take one of three actions:
      - **Confirmed** — Proceed to validate with empty issues (step 5d below)
      - **Additions/corrections** — Incorporate feedback, optionally start a follow-up elaboration round
      - **Unclear** — Ask clarifying questions via another comment

   Once confirmed, validate the elaboration:

   ```
   synapse_research_lead_validate_hypothesis_formulation({
     researchQuestionUuid: "<research-question-uuid>",
     roundUuid: "<round-uuid>",
     issues: [],
     followUpQuestions: []
   })
   ```
   - If issues are found (contradictions, ambiguities, incomplete answers), include them in `issues` and provide `followUpQuestions` to start a new round:
   ```
   synapse_research_lead_validate_hypothesis_formulation({
     researchQuestionUuid: "<research-question-uuid>",
     roundUuid: "<round-uuid>",
     issues: [
       {
         questionId: "q1",
         type: "ambiguity",
         description: "Role-based access selected but no roles defined"
       }
     ],
     followUpQuestions: [
       {
         id: "fq1",
         text: "Which specific roles should have access?",
         category: "functional",
         options: [
           { id: "a", label: "PI + Research Lead" },
           { id: "b", label: "PI + Research Lead + Researcher" },
           { id: "c", label: "Custom roles (specify)" }
         ]
       }
     ]
   })
   ```

6. **Check elaboration status** at any time:
   ```
   synapse_get_hypothesis_formulation({ researchQuestionUuid: "<research-question-uuid>" })
   ```

7. Once all rounds are resolved, proceed to Step 5 (Create Experiment Design). The elaboration answers provide rich context for writing the PRD and experiment-run breakdown.

**Elaboration as audit trail:** Even if the user discusses requirements with you outside the formal elaboration flow (e.g., in casual conversation), you should still record key decisions and clarifications as elaboration rounds on the Research Question. This ensures all requirement decisions are persisted, traceable, and visible to the team — not lost in chat history. Create a round with the decisions as pre-answered questions if needed.

**Question categories:** `hypothesis`, `methodology`, `prior_work`, `resources`, `success_metrics`, `scope`

**Validation issue types:** `contradiction`, `ambiguity`, `incomplete`

### Step 5: Create an Empty Experiment Design

**Recommended approach:** Create the experiment-design container first without any drafts, then incrementally add document and experiment-run drafts one by one. This avoids overly large tool calls, lets you build the experiment design iteratively, and makes it easier to review and adjust each draft individually.

```
synapse_research_lead_create_experiment_design({
  researchProjectUuid: "<project-uuid>",
  title: "Implement <feature name>",
  description: "Analysis and implementation plan for Research Question #xxx",
  inputType: "research_question",
  inputUuids: ["<research-question-uuid>"]
})
```

**Multiple Research Questions:** You can combine multiple research questions into one experiment design by passing multiple UUIDs in `inputUuids`.

### Step 6: Add Document Drafts

Add document drafts to the experiment design one at a time using `synapse_research_lead_add_document_draft`:

```
# Add PRD
synapse_research_lead_add_document_draft({
  experimentDesignUuid: "<experiment-design-uuid>",
  type: "prd",
  title: "PRD: <Feature Name>",
  content: "# PRD: <Feature Name>\n\n## Background\n...\n## Requirements\n..."
})

# Add Tech Design
synapse_research_lead_add_document_draft({
  experimentDesignUuid: "<experiment-design-uuid>",
  type: "tech_design",
  title: "Tech Design: <Feature Name>",
  content: "# Technical Design\n\n## Architecture\n...\n## Implementation\n..."
})

# Add ADR (if needed)
synapse_research_lead_add_document_draft({
  experimentDesignUuid: "<experiment-design-uuid>",
  type: "adr",
  title: "ADR: Choice of <technology>",
  content: "# ADR: ...\n\n## Context\n...\n## Decision\n..."
})
```

**Document types:** `prd`, `tech_design`, `adr`, `spec`, `guide`

### Step 7: Add Experiment-Run Drafts

Add experiment-run drafts one at a time using `synapse_research_lead_add_experiment_run_draft`. The response returns the new draft's `draftUuid` — use it directly for `dependsOnDraftUuids` in subsequent drafts without needing to call `synapse_get_experiment_design`.

```
# Add first experiment run → response includes { draftUuid, draftTitle }
synapse_research_lead_add_experiment_run_draft({
  experimentDesignUuid: "<experiment-design-uuid>",
  title: "Implement <component>",
  description: "Detailed description of what to build...",
  priority: "high",
  computeBudgetHours: 3,
  acceptanceCriteriaItems: [
    { description: "Criteria 1", required: true },
    { description: "Criteria 2", required: true }
  ]
})

# Add second experiment run — use draftUuid from the first experiment run's response
synapse_research_lead_add_experiment_run_draft({
  experimentDesignUuid: "<experiment-design-uuid>",
  title: "Write tests for <component>",
  description: "Unit and integration tests...",
  priority: "medium",
  computeBudgetHours: 2,
  acceptanceCriteriaItems: [
    { description: "Test coverage > 80%", required: true }
  ],
  dependsOnDraftUuids: ["<draftUuid-from-first-run>"]
})
```

**Experiment-run priority:** `low`, `medium`, `high`

### Step 8: Review and Refine Drafts

After adding all drafts, review the full experiment design and refine as needed:

```
# Review current state
synapse_get_experiment_design({ experimentDesignUuid: "<experiment-design-uuid>" })

# Update a document draft
synapse_research_lead_update_document_draft({
  experimentDesignUuid: "<experiment-design-uuid>",
  draftUuid: "<draft-uuid>",
  content: "Updated content with more detail..."
})

# Update an experiment-run draft
synapse_research_lead_update_experiment_run_draft({
  experimentDesignUuid: "<experiment-design-uuid>",
  draftUuid: "<draft-uuid>",
  description: "Updated description with more detail...",
  computeBudgetHours: 4,
  acceptanceCriteriaItems: [
    { description: "Updated criterion", required: true }
  ],
  dependsOnDraftUuids: ["<other-draft-uuid>"]
})

# Remove a draft that's no longer needed
synapse_research_lead_remove_experiment_run_draft({
  experimentDesignUuid: "<experiment-design-uuid>",
  draftUuid: "<draft-uuid>"
})
```

### Step 9: Validate and Submit Experiment Design for Review

Before submitting, validate the experiment design to preview any issues:

```
synapse_research_lead_validate_experiment_design({ experimentDesignUuid: "<experiment-design-uuid>" })
```

This returns `{ valid, issues }` with error, warning, and info levels. Fix any errors before submitting. Warnings and info are advisory but worth addressing.

When the experiment design passes validation (no errors):

```
synapse_research_lead_submit_experiment_design({ experimentDesignUuid: "<experiment-design-uuid>" })
```

This changes the experiment-design status from `draft` to `pending`. The PI will review it. Note: `submit` also runs validation internally and rejects if errors exist.

Add a comment explaining your reasoning:

```
synapse_add_comment({
  targetType: "experiment_design",
  targetUuid: "<experiment-design-uuid>",
  content: "This experiment design covers... Key decisions: ..."
})
```

### Step 10: Update Research Question Status

Mark the research question as `proposal_created`:

```
synapse_update_research_question_status({ researchQuestionUuid: "<research-question-uuid>", status: "proposal_created" })
```

### Step 11: Handle Feedback

If the experiment design is rejected, check the review note:

```
synapse_get_experiment_design({ experimentDesignUuid: "<experiment-design-uuid>" })
synapse_get_comments({ targetType: "experiment_design", targetUuid: "<experiment-design-uuid>" })
```

Revise the drafts and resubmit.

### Step 12: Post-Approval

When the PI approves the experiment design:
- Document drafts are automatically materialized into real Documents
- Experiment-run drafts are automatically materialized into real Experiment Runs (status: `open`)
- Researchers can now claim and work on the experiment runs

Mark the research question as `completed`:

```
synapse_update_research_question_status({ researchQuestionUuid: "<research-question-uuid>", status: "completed" })
```

### Step 13: Manage Experiment-Run Dependencies (Optional)

After experiment runs are created (either via experiment-design approval or `synapse_research_lead_create_experiment_runs`), you can manage dependencies between them.

**Add dependency using `synapse_research_lead_create_experiment_runs` with intra-batch dependencies:**

```
synapse_research_lead_create_experiment_runs({
  researchProjectUuid: "<project-uuid>",
  experimentRuns: [
    {
      draftUuid: "draft-db",
      title: "Create database schema",
      priority: "high",
      computeBudgetHours: 2
    },
    {
      draftUuid: "draft-api",
      title: "Implement API endpoints",
      priority: "high",
      computeBudgetHours: 4,
      dependsOnDraftUuids: ["draft-db"]
    },
    {
      title: "Write integration tests",
      priority: "medium",
      computeBudgetHours: 2,
      dependsOnDraftUuids: ["draft-api"],
      dependsOnRunUuids: ["<existing-run-uuid>"]
    }
  ]
})
```

**Add/remove dependencies on existing experiment runs:**

```
# Add dependency: Experiment Run B depends on Experiment Run A
synapse_research_lead_add_run_dependency({
  runUuid: "<run-b-uuid>",
  dependsOnRunUuid: "<run-a-uuid>"
})

# Remove dependency
synapse_research_lead_remove_run_dependency({
  runUuid: "<run-b-uuid>",
  dependsOnRunUuid: "<run-a-uuid>"
})
```

**Notes:**
- Dependencies are validated: same project, no self-dependency, no cycles (DFS detection)
- Use `synapse_get_experiment_run` to see `dependsOn` and `dependedBy` arrays

### Step 14: Assign Experiment Runs to Researcher Agents (Optional)

After approval, you can directly assign experiment runs to specific Researcher Agents instead of waiting for them to self-claim:

```
synapse_research_lead_assign_experiment_run({
  runUuid: "<run-uuid>",
  agentUuid: "<researcher-agent-uuid>"
})
```

**Conditions:**
- Experiment run must be in `open` or `assigned` status (reassignment is allowed)
- Target agent must have `researcher` or `researcher_agent` role
- The Research Lead agent is recorded as `assignedBy`

To find available researcher agents, use the project activity or check with the PI. To find open experiment runs:

```
synapse_get_available_experiment_runs({ researchProjectUuid: "<project-uuid>" })
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
What is NOT included in this experiment design.
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

### Experiment-Run Writing Guidelines

Good experiment runs are:
- **Atomic** - One clear deliverable per experiment run
- **Testable** - Clear acceptance criteria
- **Sized** - 1-8 compute-budget hours (hours of agent work)
- **Ordered** - Use `dependsOnDraftUuids` / `dependsOnRunUuids` to express execution order when experiment runs have real prerequisites
- **Descriptive** - Include enough context for a Researcher agent to start without questions

---

## Tips

- When combining multiple research questions, explain in the experiment-design description how they relate
- Keep PRD focused on *what* and *why*; keep tech design focused on *how*
- Break large features into multiple smaller experiment runs rather than one monolithic run
- Add `computeBudgetHours` to help prioritize and estimate effort
- Use `acceptanceCriteriaItems` for structured verification criteria
