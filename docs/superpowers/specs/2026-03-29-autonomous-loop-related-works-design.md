# Autonomous Loop + Related Works — Design Spec

**Date:** 2026-03-29
**Status:** Approved

## Overview

Two new features that elevate Synapse from experiment execution to autonomous research orchestration:

1. **Autonomous Loop** — When enabled on a project, an agent automatically analyzes all research context and proposes new experiments when the experiment queue is empty.
2. **Related Works** — A new project-level page for collecting literature (manual + auto-search) with one-shot deep research report generation.

---

## Feature 1: Autonomous Loop

### Trigger Condition

All three must be true:
- `ResearchProject.autonomousLoopEnabled = true`
- `ResearchProject.autonomousLoopAgentUuid` is set
- Project has 0 experiments in `draft`, `pending_review`, AND `pending_start`

### Flow

1. User opens Experiments page → toggles "Autonomous Loop" ON → selects an agent from dropdown
2. Settings saved to `ResearchProject` (`autonomousLoopEnabled`, `autonomousLoopAgentUuid`)
3. When an experiment completes (`completeExperiment` in `experiment.service.ts`), check trigger condition
4. If triggered: call OpenClaw plugin hook `/hooks/agent` with the selected agent, injecting a full-context analysis prompt
5. Agent receives: project brief, datasets, evaluation methods, all research questions (with status), all experiments (with outcomes/results)
6. Agent analyzes and decides whether to propose new experiments via `synapse_propose_experiment`
7. Proposed experiments land in `draft` status on the board
8. Human reviews on the board: approve → `pending_start` → agent executes → completes → loop checks again

### Schema Changes

```prisma
model ResearchProject {
  // ... existing fields, after computePoolUuid:
  autonomousLoopEnabled    Boolean  @default(false)
  autonomousLoopAgentUuid  String?
}
```

### UI

**Experiments page header** — below the title row:
- Three-state control: OFF (no dropdown) → ON + "Select agent..." (waiting) → ON + agent selected (active)
- Active state: amber border, green "Active · analyzing with {agentName}" text
- Only agents with `research` or `experiment` permission shown in dropdown

### API Changes

**PATCH `/api/research-projects/[uuid]`** — accept `autonomousLoopEnabled` and `autonomousLoopAgentUuid`

### Service Changes

**`experiment.service.ts` → `completeExperiment()`** — after completion logic, check:
```typescript
// Check autonomous loop trigger
const project = await prisma.researchProject.findFirst({
  where: { uuid: updated.researchProjectUuid },
  select: { autonomousLoopEnabled: true, autonomousLoopAgentUuid: true },
});
if (project?.autonomousLoopEnabled && project.autonomousLoopAgentUuid) {
  const queueCount = await prisma.experiment.count({
    where: {
      researchProjectUuid: updated.researchProjectUuid,
      companyUuid: input.companyUuid,
      status: { in: ["draft", "pending_review", "pending_start"] },
    },
  });
  if (queueCount === 0) {
    // Trigger autonomous analysis via notification
    // ... emit notification to autonomousLoopAgentUuid
  }
}
```

### New MCP Tools

**`synapse_get_project_full_context`**
- Input: `{ researchProjectUuid: string }`
- Returns: project info (name, description, datasets, evaluationMethods) + all research questions + all experiments with outcomes/results + all documents summary + related works count
- Available to agents with `research` permission

**`synapse_propose_experiment`**
- Input: `{ researchProjectUuid: string, title: string, description: string, researchQuestionUuid?: string, priority?: string }`
- Creates experiment with `status: "draft"`, `createdByType: "agent"`
- Only callable when the project has `autonomousLoopEnabled = true` and the calling agent matches `autonomousLoopAgentUuid`

### Agent Prompt (injected via hook)

```
[Synapse] Autonomous research loop triggered for project "{projectName}".

The experiment queue is empty. Analyze the current research state and decide what to do next.

## Project Context
{full project brief, datasets, evaluation methods}

## Research Questions
{all questions with status}

## Completed Experiments
{all experiments with outcomes and key results}

## Related Works
{count} papers collected. Use synapse_get_related_works for details.

## Your Task
1. Use synapse_get_project_full_context to review all details
2. Analyze gaps: what questions remain unanswered? What experiments could yield new insights?
3. If you identify valuable next steps, use synapse_propose_experiment to create draft experiments
4. If the research objectives are met, report that no further experiments are needed

Proposed experiments will enter "draft" status for human review before execution.
```

---

## Feature 2: Related Works

### Data Model

```prisma
model RelatedWork {
  id                  Int      @id @default(autoincrement())
  uuid                String   @unique @default(uuid())
  companyUuid         String
  researchProjectUuid String
  researchProject     ResearchProject @relation(fields: [researchProjectUuid], references: [uuid], onDelete: Cascade)
  title               String
  authors             String?
  abstract            String?
  url                 String
  arxivId             String?
  source              String   // "arxiv" | "semantic_scholar"
  addedBy             String   // "manual" | "auto"
  addedByAgentUuid    String?
  createdAt           DateTime @default(now())

  @@index([companyUuid])
  @@index([researchProjectUuid])
}
```

```prisma
model ResearchProject {
  // ... existing fields, after autonomousLoopAgentUuid:
  autoSearchEnabled    Boolean  @default(false)
  autoSearchAgentUuid  String?
  deepResearchDocUuid  String?

  relatedWorks RelatedWork[]
}
```

### Page

**URL:** `/research-projects/[uuid]/related-works`

**Navigation:** Added to project sidebar between "Documents" and legacy pages. Icon: `BookOpen` from lucide-react.

**Layout (top to bottom):**

1. **Header** — "Related Works" title + "+ Add Paper" button
2. **Auto-search control** — Three-state toggle (OFF → ON waiting → Active)
3. **Deep Research control** — Agent dropdown + "Generate" button + "View Document →" link when report exists
4. **Paper list** — Cards with: title (clickable → arXiv URL), authors, arxivId, abstract excerpt, source badge (arxiv/semantic_scholar), addedBy badge (manual/auto)

### Add Paper Dialog

User clicks "+ Add Paper" → dialog with:
- URL input (paste arXiv link like `https://arxiv.org/abs/2212.04356`)
- On paste: auto-fetch title + abstract from arXiv API
- Manual fallback fields: title, authors, abstract
- Save → creates RelatedWork with `addedBy: "manual"`

### API Routes

**`GET /api/research-projects/[uuid]/related-works`**
- Returns paginated list of RelatedWork entries
- Auth: any authenticated user/agent in company

**`POST /api/research-projects/[uuid]/related-works`**
- Body: `{ url, title?, authors?, abstract?, arxivId?, source? }`
- If only `url` provided and it's an arXiv URL, server fetches metadata via arXiv API
- Auth: user or agent

**`DELETE /api/research-projects/[uuid]/related-works/[workUuid]`**
- Auth: user only

**`POST /api/research-projects/[uuid]/related-works/auto-search`**
- Triggers the auto-search agent via hook
- Auth: user only

**`POST /api/research-projects/[uuid]/related-works/deep-research`**
- Body: `{ agentUuid: string }`
- Triggers deep research agent via hook
- Auth: user only

### Auto-search Trigger

When enabled (`autoSearchEnabled = true` + `autoSearchAgentUuid` set):
- Triggered when project info changes (description, datasets, evaluationMethods updated)
- Triggered when a new research question is created
- Agent receives prompt with project context → uses `synapse_search_papers` → stores results via `synapse_add_related_work`

### New MCP Tools

**`synapse_search_papers`**
- Input: `{ query: string, limit?: number }`
- Backend calls Semantic Scholar API: `GET https://api.semanticscholar.org/graph/v1/paper/search?query={query}&limit={limit}&fields=title,abstract,authors,externalIds,url`
- Returns: `{ papers: [{ title, authors, abstract, url, arxivId }] }`
- Available to agents with `pre_research` permission

**`synapse_add_related_work`**
- Input: `{ researchProjectUuid: string, title: string, url: string, authors?: string, abstract?: string, arxivId?: string, source: string }`
- Creates RelatedWork entry with `addedBy: "auto"`, `addedByAgentUuid: auth.actorUuid`
- Available to agents with `pre_research` permission

**`synapse_get_related_works`**
- Input: `{ researchProjectUuid: string }`
- Returns all RelatedWork entries for the project
- Available to any agent

### Deep Research Flow

1. User selects agent + clicks "Generate"
2. POST `/api/research-projects/[uuid]/related-works/deep-research` with `{ agentUuid }`
3. Server sends notification/hook to agent with prompt:
   ```
   [Synapse] Generate a deep research literature review for project "{name}".
   Use synapse_get_related_works to read all collected papers.
   Analyze the papers in the context of the project's research objectives.
   Create a comprehensive literature review document using synapse tools.
   ```
4. Agent reads papers → generates Document with `type: "literature_review"`
5. Server updates `ResearchProject.deepResearchDocUuid` to the new document UUID
6. Related Works page shows "View Document →" link

### arXiv Metadata Fetching (server-side)

For manual "Add Paper" with arXiv URL:
```typescript
// Parse arxiv ID from URL
const arxivId = url.match(/arxiv\.org\/abs\/(\d+\.\d+)/)?.[1];
if (arxivId) {
  // Fetch from arXiv API
  const resp = await fetch(`http://export.arxiv.org/api/query?id_list=${arxivId}`);
  const xml = await resp.text();
  // Parse XML for title, authors, abstract
}
```

---

## Sidebar Navigation Update

Project-level nav becomes:
- Overview
- Research Questions
- Experiments
- Insights
- Related Works (NEW — icon: BookOpen)
- Documents

---

## i18n Keys Required

Both `en.json` and `zh.json` need keys for:
- `nav.relatedWorks` / "Related Works" / "相关文献"
- `relatedWorks.title` / subtitle / addPaper / autoSearch / deepResearch / etc.
- `experiments.autonomousLoop` / description / selectAgent / active / etc.
- Paper source labels, added-by labels
- Agent selection prompt text

---

## Out of Scope

- Full-text paper reading (agent only sees title + abstract from Semantic Scholar)
- Citation graph traversal
- PDF download and parsing
- Auto-search scheduling (triggered by events, not cron)
- Related Works in legacy experiment-run flow
