# Claude Code Research Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance Claude Code plugin to guide users through the Synapse research lifecycle by showing projects at session start and providing a workflow guide.

**Architecture:** Add a `projects` query to `synapse_checkin`, then parse and format it in the SessionStart hook alongside a static workflow guide prompt.

**Tech Stack:** Prisma, TypeScript, Bash

**Spec:** `docs/superpowers/specs/2026-04-12-claude-code-research-copilot-design.md`

---

### Task 1: Add `projects` to synapse_checkin response

**Files:**
- Modify: `src/mcp/tools/public.ts:238-340` (synapse_checkin handler)

- [ ] **Step 1: Add projects query**

In `src/mcp/tools/public.ts`, inside the `synapse_checkin` handler (after the `assignedExperiments` query at line 275 and before the `unreadNotificationCount` query at line 278), add:

```typescript
      // Get research projects with progress summaries
      const projects = await prisma.researchProject.findMany({
        where: { companyUuid: auth.companyUuid },
        select: {
          uuid: true,
          name: true,
          description: true,
          deepResearchDocUuid: true,
          researchQuestions: {
            select: { uuid: true, title: true, status: true },
            orderBy: { createdAt: "asc" },
          },
          _count: {
            select: { relatedWorks: true },
          },
        },
        orderBy: { updatedAt: "desc" },
      });

      // Get experiment counts per project (grouped by status)
      const experimentCountsByProject: Record<string, Record<string, number>> = {};
      if (projects.length > 0) {
        const projectUuids = projects.map((p) => p.uuid);
        const experiments = await prisma.experiment.groupBy({
          by: ["researchProjectUuid", "status"],
          where: {
            companyUuid: auth.companyUuid,
            researchProjectUuid: { in: projectUuids },
          },
          _count: true,
        });
        for (const row of experiments) {
          if (!experimentCountsByProject[row.researchProjectUuid]) {
            experimentCountsByProject[row.researchProjectUuid] = {};
          }
          experimentCountsByProject[row.researchProjectUuid][row.status] = row._count;
        }
      }
```

- [ ] **Step 2: Add projects to the result object**

In the `result` object (around line 309), add `projects` after `notifications`:

```typescript
        notifications: {
          unreadCount: unreadNotificationCount,
        },
        projects: projects.map((p) => ({
          uuid: p.uuid,
          name: p.name,
          description: p.description,
          relatedWorksCount: p._count.relatedWorks,
          deepResearchExists: !!p.deepResearchDocUuid,
          researchQuestions: p.researchQuestions.map((q) => ({
            uuid: q.uuid,
            title: q.title,
            status: q.status,
          })),
          experimentCounts: experimentCountsByProject[p.uuid] || {},
        })),
```

- [ ] **Step 3: Verify locally**

```bash
pnpm db:generate
```

Confirm no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/mcp/tools/public.ts
git commit -m "feat: include research projects with progress in checkin response"
```

---

### Task 2: Enhance SessionStart hook with project list and workflow guide

**Files:**
- Modify: `public/synapse-plugin/bin/on-session-start.sh`

- [ ] **Step 1: Add project list parsing**

After the assignments block (line 98, after the `fi` that closes `ASSIGNMENTS_BLOCK`), add a new block to parse projects:

```bash
# Parse research projects for Claude context
PROJECTS_BLOCK=""
if command -v jq >/dev/null 2>&1; then
  PROJECT_COUNT=$(echo "$CHECKIN_RESULT" | jq -r '.projects | length // 0' 2>/dev/null) || PROJECT_COUNT=0

  if [ "$PROJECT_COUNT" -gt 0 ]; then
    PROJECTS_BLOCK="
## Research Projects

Ask the user which project to work on:
"
    PROJECT_LIST=$(echo "$CHECKIN_RESULT" | jq -r '
      .projects | to_entries[] |
      "\(.key + 1). \"\(.value.name)\" (uuid: `\(.value.uuid)`)\n   \(.value.relatedWorksCount) papers | deep research: \(if .value.deepResearchExists then "yes" else "no" end) | \(.value.researchQuestions | length) questions | experiments: \([.value.experimentCounts | to_entries[] | "\(.key)=\(.value)"] | join(", ") | if . == "" then "none" else . end)"
    ' 2>/dev/null) || true
    if [ -n "$PROJECT_LIST" ]; then
      PROJECTS_BLOCK="${PROJECTS_BLOCK}
${PROJECT_LIST}"
    fi
  else
    PROJECTS_BLOCK="
## Research Projects

No research projects found. The user can create one on the Synapse web UI."
  fi
fi
```

- [ ] **Step 2: Add the static workflow guide**

After the projects block, add the workflow guide:

```bash
# Static workflow guide for Research Copilot
WORKFLOW_GUIDE="
## Research Copilot — Workflow Guide

When the user selects a project:

1. Call \`synapse_get_project_full_context({ researchProjectUuid })\` to load full context.
2. Present the project's current state to the user:
   - Collected papers (count + highlights if any)
   - Deep research status
   - Research questions (list titles)
   - Experiments (count by status, key results if completed)
3. Explain the full research lifecycle:
   a. **Paper Search** — find and collect relevant papers
   b. **Deep Research** — synthesize papers into a literature review
   c. **Research Questions** — formulate specific research questions
   d. **Experiments** — design, execute, and submit results
   e. **Analysis & Iteration** — analyze results, identify gaps, loop back
4. Based on current state, suggest the most natural next step:
   - relatedWorksCount = 0 → suggest starting with Paper Search
   - relatedWorksCount > 0 but deepResearchExists = false → suggest Deep Research
   - no research questions → suggest formulating Research Questions
   - no experiments → suggest proposing Experiments
   - some experiments completed → suggest analyzing results and planning next iteration
5. Tell the user they can jump to any stage — the suggestion is a guide, not a constraint.

### Tool Reference by Stage

**Paper Search:**
  - \`synapse_search_papers({ query })\` — search for papers
  - \`synapse_read_paper_brief({ arxivId })\` — quick summary (~500 tokens)
  - \`synapse_read_paper_head({ arxivId })\` — section structure (~1-2k tokens)
  - \`synapse_read_paper_section({ arxivId, sectionTitle })\` — full section
  - \`synapse_add_related_work({ researchProjectUuid, ... })\` — add paper to project
  - \`synapse_get_related_works({ researchProjectUuid })\` — list collected papers

**Deep Research:**
  - \`synapse_get_related_works\` — review collected papers
  - \`synapse_get_deep_research_report({ researchProjectUuid })\` — get existing report
  - \`synapse_upsert_deep_research_report({ researchProjectUuid, content })\` — create/update report

**Research Questions:**
  - \`synapse_get_research_project({ researchProjectUuid })\` — project context
  - Research question CRUD is available if agent has the research role

**Experiments:**
  - \`synapse_start_experiment({ experimentUuid })\` — begin execution
  - \`synapse_report_experiment_progress({ experimentUuid, message })\` — report progress
  - \`synapse_submit_experiment_results({ experimentUuid, results, outcome })\` — submit results
  - \`synapse_get_experiment({ experimentUuid })\` — check experiment details

**Analysis:**
  - \`synapse_get_project_full_context({ researchProjectUuid })\` — reload full state
  - Review experiment outcomes and propose next steps

### Language

Respond in the same language the user uses. If the user writes in Chinese, respond in Chinese. If in English, respond in English."
```

- [ ] **Step 3: Inject both blocks into CONTEXT**

Replace the current CONTEXT string (starting at line 100). Insert `${PROJECTS_BLOCK}` and `${WORKFLOW_GUIDE}` after `${ASSIGNMENTS_BLOCK}` and before `## Session Management`:

Change line 109 from:

```bash
${ASSIGNMENTS_BLOCK}
## Session Management — IMPORTANT
```

To:

```bash
${ASSIGNMENTS_BLOCK}
${PROJECTS_BLOCK}
${WORKFLOW_GUIDE}

## Session Management — IMPORTANT
```

- [ ] **Step 4: Verify bash syntax**

```bash
bash -n public/synapse-plugin/bin/on-session-start.sh
```

Expected: no output (no syntax errors).

- [ ] **Step 5: Commit**

```bash
git add public/synapse-plugin/bin/on-session-start.sh
git commit -m "feat: add research project list and copilot workflow guide to SessionStart"
```
