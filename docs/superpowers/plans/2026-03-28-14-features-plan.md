# 14 Feature Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 14 improvements covering quick UI fixes, schema changes for new agent permissions and compute pool binding, and real-time experiment status tracking.

**Architecture:** Three batches — Batch 1 (7 quick fixes, no schema changes), Batch 2 (5 medium changes with schema migrations and new pages), Batch 3 (2 real-time features with new models and MCP tools). Each batch builds on the previous.

**Tech Stack:** Next.js 15 App Router, React 19, Prisma 7, TypeScript 5, Tailwind CSS 4, next-intl, Zod, MCP SDK, SSE via EventBus

**Spec:** `docs/superpowers/specs/2026-03-28-14-features-design.md`

---

## Batch 1: Quick Fixes

### Task 1: Overview page layout reorder (#5)

**Files:**
- Modify: `src/app/(dashboard)/research-projects/[uuid]/dashboard/page.tsx`

- [ ] **Step 1:** Read the dashboard page and locate the bottom two-column grid section. The current layout has Research Pipeline on the left and Research Questions on the right.

- [ ] **Step 2:** Swap the two columns — Research Questions section first (left), then Research Pipeline section (right). Find the grid container (should be `grid md:grid-cols-2` or similar) and swap the order of its two child `<section>` elements.

- [ ] **Step 3:** Verify by running `pnpm dev` and navigating to a project dashboard. Research Questions should appear on the left.

- [ ] **Step 4:** Commit.
```bash
git add src/app/(dashboard)/research-projects/[uuid]/dashboard/page.tsx
git commit -m "feat(#5): move research questions to left of pipeline on overview"
```

---

### Task 2: Dark mode document fix (#6)

**Files:**
- Modify: `src/app/(dashboard)/research-projects/[uuid]/documents/page.tsx`
- Modify: `src/app/(dashboard)/research-projects/[uuid]/documents/[documentUuid]/page.tsx`

- [ ] **Step 1:** Read both document page files. Search for hardcoded color values: `#xxx`, `bg-[#`, `text-[#`, `border-[#`. These need to be replaced with theme-aware Tailwind classes.

- [ ] **Step 2:** Replace hardcoded colors with theme variables:
  - `bg-[#FBF8F3]` → `bg-card` or `bg-background`
  - `bg-[#FAF7F2]` → `bg-secondary/50`
  - `text-[#2C2C2C]` → `text-foreground`
  - `text-[#6B6B6B]` → `text-muted-foreground`
  - `text-[#8E8478]` → `text-muted-foreground`
  - `border-[#E5DED3]` → `border-border`
  - `border-[#D8CEBF]` → `border-border`
  - Any `bg-white` → `bg-card`

- [ ] **Step 3:** Also check the document detail page (`[documentUuid]/page.tsx`) for the Markdown content renderer — ensure it uses `prose dark:prose-invert` for dark mode markdown rendering.

- [ ] **Step 4:** Test in dark mode by toggling theme in Settings → Theme → Dark. Verify document list and document detail pages render correctly.

- [ ] **Step 5:** Commit.
```bash
git add "src/app/(dashboard)/research-projects/[uuid]/documents/"
git commit -m "fix(#6): replace hardcoded colors with theme-aware classes in document pages"
```

---

### Task 3: New project button → /research-projects/new (#7)

**Files:**
- Modify: `src/app/(dashboard)/research-projects/page.tsx`

- [ ] **Step 1:** Read the research projects page. Find all "New Project" buttons — there are multiple entry points: `ProjectsPageHeader`, `GroupSection`, `UngroupedSection`. Each currently sets `createResearchProjectTarget` state to open a `CreateProjectDialog`.

- [ ] **Step 2:** Replace all "New Project" button `onClick` handlers with `<Link href="/research-projects/new">` navigation. The button should be wrapped in or replaced by a Link component.

For the header button:
```tsx
<Button asChild>
  <Link href="/research-projects/new">
    <Plus className="mr-2 h-4 w-4" />
    {t("researchProjects.newProject")}
  </Link>
</Button>
```

For the per-group and ungrouped section buttons, do the same — replace onClick dialog open with Link to `/research-projects/new`.

- [ ] **Step 3:** Remove the `CreateProjectDialog` component import and all related state (`createResearchProjectTarget`, `setCreateResearchProjectTarget`) if they become unused.

- [ ] **Step 4:** Test: click "New Project" from header, from a group section, and from the ungrouped section. All should navigate to `/research-projects/new`.

- [ ] **Step 5:** Commit.
```bash
git add "src/app/(dashboard)/research-projects/page.tsx"
git commit -m "feat(#7): new project button navigates to /research-projects/new"
```

---

### Task 4: Create project form text changes (#8) + collapsible sections (#9)

**Files:**
- Modify: `src/app/(dashboard)/research-projects/new/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1:** Read the create project page. Identify the Goal field, Description placeholder, Datasets placeholder, and Evaluation Methods placeholder.

- [ ] **Step 2:** Remove the Goal field entirely (remove the `<div>` containing the Goal label and textarea, and remove `goal` from the form data handling/submission).

- [ ] **Step 3:** Update i18n keys in `messages/zh.json`:
```json
{
  "createProject": {
    "descriptionPlaceholder": "说明研究方向，研究目标，约束条件",
    "datasetsPlaceholder": "可以填写公开数据集名称，也可以填写你的 agent 能访问的 S3 路径或本地路径。每个可附上一句简短说明",
    "evaluationMethodsPlaceholder": "指标，基准或评估方法"
  }
}
```

- [ ] **Step 4:** Update i18n keys in `messages/en.json`:
```json
{
  "createProject": {
    "descriptionPlaceholder": "Describe research direction, objectives, and constraints",
    "datasetsPlaceholder": "Public dataset names, S3 paths, or local paths accessible by your agent. Add a brief note for each.",
    "evaluationMethodsPlaceholder": "Metrics, baselines, or evaluation methods"
  }
}
```

- [ ] **Step 5:** For collapsible sections (#9): rename Step 2 header to use i18n key `createProject.initialIdeas` ("初始想法（可选）" / "Initial Ideas (Optional)") and Step 3 to `createProject.referenceDocuments` ("参考文档（可选）" / "Reference Documents (Optional)").

- [ ] **Step 6:** Make the section headers clickable to toggle. Replace the current expand button with an `onClick` on the entire header `<div>`. Remove the separate "Optional" text on the right and the separate expand/collapse icon button. Add a chevron icon that rotates based on expanded state. Default both sections to collapsed (`false`).

- [ ] **Step 7:** Also remove `goal` from the form submission body sent to the API.

- [ ] **Step 8:** Test the form: verify Goal is gone, placeholders are updated, sections 2 and 3 start collapsed, clicking the header toggles them.

- [ ] **Step 9:** Commit.
```bash
git add "src/app/(dashboard)/research-projects/new/page.tsx" messages/en.json messages/zh.json
git commit -m "feat(#8,#9): update create project form text and collapsible sections"
```

---

### Task 5: Fix logout on long form stays (#10)

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1:** Read the layout file. Find the `checkSession` function and the initial `useEffect`.

- [ ] **Step 2:** Add a proactive token refresh interval after the session check succeeds. Insert this `useEffect` after the existing session check:

```tsx
// Proactive token refresh — prevent logout during long form stays
useEffect(() => {
  if (!user) return; // only run when authenticated
  const interval = setInterval(async () => {
    try {
      await fetch("/api/auth/refresh", { method: "POST" });
    } catch {
      // Refresh failed silently — next API call will handle redirect
    }
  }, 45 * 60 * 1000); // refresh every 45 minutes (token expires in 60)
  return () => clearInterval(interval);
}, [user]);
```

- [ ] **Step 3:** Test: log in, wait several minutes (or temporarily set interval to 10 seconds for testing), verify no unexpected logout occurs.

- [ ] **Step 4:** Commit.
```bash
git add src/app/\(dashboard\)/layout.tsx
git commit -m "fix(#10): proactive token refresh to prevent logout during long form stays"
```

---

### Task 6: Compute budget → time limit (#12)

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/zh.json`
- Modify: `src/app/(dashboard)/research-projects/[uuid]/experiments/new/create-experiment-form.tsx`
- Modify: `src/app/(dashboard)/research-projects/[uuid]/experiments/experiments-board.tsx`

- [ ] **Step 1:** Update i18n keys. In `messages/en.json`, change experiment field labels:
```json
{
  "experiments": {
    "fields": {
      "computeBudgetHours": "Time Limit",
      "computeBudgetHoursPlaceholder": "Default: Unlimited",
      "computeBudgetHoursHelp": "Maximum runtime for this experiment (hours)"
    },
    "detail": {
      "computeBudget": "Time Limit"
    }
  }
}
```

- [ ] **Step 2:** Same for `messages/zh.json`:
```json
{
  "experiments": {
    "fields": {
      "computeBudgetHours": "时间限制",
      "computeBudgetHoursPlaceholder": "默认无限制",
      "computeBudgetHoursHelp": "实验的最大运行时间（小时）"
    },
    "detail": {
      "computeBudget": "时间限制"
    }
  }
}
```

- [ ] **Step 3:** In `experiments-board.tsx` detail panel, find where `computeBudgetHours` is displayed. Update the label to use `t("experiments.detail.computeBudget")` if not already. Ensure display shows "Unlimited" / "无限制" when value is null.

- [ ] **Step 4:** Commit.
```bash
git add messages/en.json messages/zh.json \
  "src/app/(dashboard)/research-projects/[uuid]/experiments/new/create-experiment-form.tsx" \
  "src/app/(dashboard)/research-projects/[uuid]/experiments/experiments-board.tsx"
git commit -m "feat(#12): rename compute budget to time limit"
```

---

## Batch 2: Medium Changes

### Task 7: Schema migration — compute pool binding + new notification fields (#3, #2)

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1:** Add `computePoolUuid` to `ResearchProject`:
```prisma
model ResearchProject {
  // after groupUuid field:
  computePoolUuid      String? // nullable FK -> ComputePool.uuid
  // add to @@index list:
  @@index([computePoolUuid])
}
```

- [ ] **Step 2:** Update `NotificationPreference` model — rename old fields and add new ones for the 4-permission grouping. Keep old column names via `@map` for backward compat:
```prisma
model NotificationPreference {
  // Replace old fields with new names:
  experimentAssigned              Boolean @default(true) @map("taskAssigned")
  experimentStatusChanged         Boolean @default(true) @map("taskStatusChanged")
  experimentCompleted             Boolean @default(true)
  experimentDesignApproved        Boolean @default(true) @map("proposalApproved")
  experimentDesignRejected        Boolean @default(true) @map("proposalRejected")
  researchQuestionClaimed         Boolean @default(true) @map("ideaClaimed")
  hypothesisFormulationRequested  Boolean @default(true) @map("elaborationRequested")
  hypothesisFormulationAnswered   Boolean @default(true) @map("elaborationAnswered")
  commentAdded                    Boolean @default(true)
  mentioned                       Boolean @default(true)
  // Remove old unused: runVerified, runReopened, designSubmitted
}
```

- [ ] **Step 3:** Run `pnpm db:generate` to regenerate Prisma client.

- [ ] **Step 4:** Create and apply migration: `pnpm db:migrate:dev --name add-compute-pool-binding-and-notification-fields`

- [ ] **Step 5:** Commit.
```bash
git add prisma/
git commit -m "feat(#3,#2): schema migration for compute pool binding and notification preferences"
```

---

### Task 8: Compute pool binding — enforcement (#3)

**Files:**
- Modify: `src/services/compute.service.ts`
- Modify: `src/mcp/tools/compute.ts`
- Modify: `src/app/api/research-projects/route.ts` (POST — accept computePoolUuid)
- Modify: `src/app/api/research-projects/[uuid]/route.ts` (PATCH — accept computePoolUuid)
- Modify: `src/services/research-project.service.ts`

- [ ] **Step 1:** In `compute.service.ts`, add a helper function to validate pool binding:
```typescript
async function validatePoolBinding(companyUuid: string, experimentUuid: string, gpuUuids: string[]) {
  const experiment = await prisma.experiment.findFirst({
    where: { uuid: experimentUuid, companyUuid },
    select: { researchProjectUuid: true },
  });
  if (!experiment) throw new Error("Experiment not found");

  const project = await prisma.researchProject.findFirst({
    where: { uuid: experiment.researchProjectUuid, companyUuid },
    select: { computePoolUuid: true },
  });

  if (!project?.computePoolUuid) return; // no constraint

  const gpus = await prisma.computeGpu.findMany({
    where: { uuid: { in: gpuUuids } },
    include: { node: { select: { poolUuid: true } } },
  });

  const invalidGpu = gpus.find(gpu => gpu.node.poolUuid !== project.computePoolUuid);
  if (invalidGpu) {
    throw new Error("GPU does not belong to the compute pool bound to this project");
  }
}
```

- [ ] **Step 2:** Call `validatePoolBinding` at the start of `reserveGpusForExperiment` and `reserveGpusForRun` (for runs, look up project via run's researchProjectUuid).

- [ ] **Step 3:** In the MCP tool `synapse_list_compute_nodes`, add an optional `researchProjectUuid` parameter. When provided, look up the project's `computePoolUuid` and filter pools to only that one.

- [ ] **Step 4:** Update the create project API route and service to accept and store `computePoolUuid`.

- [ ] **Step 5:** Write a test for `validatePoolBinding` ensuring it rejects GPUs from wrong pools and allows GPUs from the correct pool.

- [ ] **Step 6:** Run `pnpm test` and fix any failures.

- [ ] **Step 7:** Commit.
```bash
git add src/services/compute.service.ts src/mcp/tools/compute.ts \
  src/app/api/research-projects/ src/services/research-project.service.ts
git commit -m "feat(#3): enforce compute pool binding on GPU reservations"
```

---

### Task 9: Create project form — compute pool dropdown (#3)

**Files:**
- Modify: `src/app/(dashboard)/research-projects/new/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1:** The create project page is a server component. Fetch compute pools at page level:
```typescript
import { listComputePools } from "@/services/compute.service";
// In the page function:
const pools = await listComputePools(auth.companyUuid);
```

- [ ] **Step 2:** Pass `pools` to the form component. Add a `<select>` for compute pool between the Evaluation Methods field and the collapsible sections:
```tsx
<div className="space-y-2">
  <Label htmlFor="computePoolUuid">{t("createProject.computePool")}</Label>
  <select id="computePoolUuid" name="computePoolUuid" required
    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
    <option value="">{t("createProject.noComputePool")}</option>
    {pools.map(pool => (
      <option key={pool.uuid} value={pool.uuid}>{pool.name}</option>
    ))}
  </select>
</div>
```

- [ ] **Step 3:** Add i18n keys:
  - en: `"computePool": "Compute Pool"`, `"noComputePool": "None (no constraint)"`
  - zh: `"computePool": "算力池"`, `"noComputePool": "无（不限制）"`

- [ ] **Step 4:** Include `computePoolUuid` in form submission data sent to POST `/api/research-projects`.

- [ ] **Step 5:** Test: create a project with and without a pool selected.

- [ ] **Step 6:** Commit.
```bash
git add "src/app/(dashboard)/research-projects/new/page.tsx" messages/en.json messages/zh.json
git commit -m "feat(#3): add compute pool dropdown to create project form"
```

---

### Task 10: Project details edit dialog (#4)

**Files:**
- Modify: `src/app/(dashboard)/research-projects/[uuid]/dashboard/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1:** The dashboard page is a server component. Extract the interactive edit dialog into a client component. Create or add to existing client wrapper.

- [ ] **Step 2:** Add an "Edit" button (Pencil icon) next to the project title in the header card:
```tsx
<Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
  <Pencil className="mr-2 h-4 w-4" />
  {t("common.edit")}
</Button>
```

- [ ] **Step 3:** Create an edit dialog with fields: name, description, datasets (textarea), evaluation methods (textarea), compute pool (dropdown). Pre-populate with current project data.

- [ ] **Step 4:** On save, call PATCH `/api/research-projects/[uuid]` with the updated fields. Close dialog and refresh page data.

- [ ] **Step 5:** Add i18n keys for the edit dialog title and labels.

- [ ] **Step 6:** Test: open edit dialog, change a field, save, verify the dashboard updates.

- [ ] **Step 7:** Commit.
```bash
git add "src/app/(dashboard)/research-projects/[uuid]/dashboard/"
git commit -m "feat(#4): add project details edit dialog to dashboard"
```

---

### Task 11: Agent page with 4 composable permissions (#1)

**Files:**
- Create: `src/app/(dashboard)/agents/page.tsx`
- Create: `src/app/(dashboard)/agents/agent-card.tsx`
- Create: `src/app/(dashboard)/agents/agent-detail-sheet.tsx`
- Create: `src/app/(dashboard)/agents/create-agent-dialog.tsx`
- Modify: `src/app/(dashboard)/layout.tsx` (sidebar)
- Modify: `src/app/(dashboard)/settings/page.tsx` (remove agent section)
- Modify: `src/services/agent.service.ts`
- Modify: `src/app/api/agents/route.ts`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1:** Add sidebar entry. In `layout.tsx`, find `globalNavItems` array. Add between Compute and Settings:
```typescript
{ href: "/agents", label: t("nav.agents"), icon: Bot },
```
Also add `Bot` to the lucide-react imports. Add `isGlobalPage` check for `/agents`.

- [ ] **Step 2:** Update valid roles in `agent.service.ts` and API routes. Replace references to `researcher_agent`, `research_lead_agent`, `pi_agent` with `pre_research`, `research`, `experiment`, `report`.

Also update `VALID_AGENT_ROLES` in `src/app/(dashboard)/settings/actions.ts`:
```typescript
const VALID_AGENT_ROLES = new Set(["pre_research", "research", "experiment", "report"]);
```

And in `src/app/api/agents/route.ts`:
```typescript
const validRoles = ["pre_research", "research", "experiment", "report"];
```

And in `src/app/api/agents/[uuid]/route.ts`:
```typescript
const validRoles = ["pre_research", "research", "experiment", "report"];
```

- [ ] **Step 3:** Create `src/app/(dashboard)/agents/page.tsx` — server component:
```tsx
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getServerAuthContext } from "@/lib/auth-server";
import { listAgents } from "@/services/agent.service";
import { AgentsPageClient } from "./agents-page-client";

export default async function AgentsPage() {
  const auth = await getServerAuthContext();
  if (!auth) redirect("/login");
  const t = await getTranslations();
  const { agents } = await listAgents({
    companyUuid: auth.companyUuid,
    skip: 0, take: 100,
    ownerUuid: auth.actorUuid,
  });
  return <AgentsPageClient agents={agents} />;
}
```

- [ ] **Step 4:** Create the client component `agents-page-client.tsx` with:
  - Header with title "智能体" and "Create Agent" button
  - Grid of `AgentCard` components
  - `CreateAgentDialog` for creating new agents
  - `AgentDetailSheet` slide-out panel on card click

- [ ] **Step 5:** Create `agent-card.tsx` — displays: name, role badges (colored: pre_research=blue, research=purple, experiment=green, report=orange), persona excerpt, last active, API key count.

- [ ] **Step 6:** Create `create-agent-dialog.tsx` — form with: name input, 4 permission checkboxes, persona textarea. On submit, calls `createAgentAndKeyAction` (reuse from settings/actions.ts). Shows API key once on success.

- [ ] **Step 7:** Create `agent-detail-sheet.tsx` — slide-out Sheet showing: agent info (editable name/persona/permissions), API keys list with create/revoke, sessions list.

- [ ] **Step 8:** Remove the agents section from `src/app/(dashboard)/settings/page.tsx`. Keep language, theme, and notification preferences.

- [ ] **Step 9:** Add i18n keys for agents page:
  - en: `"nav.agents": "Agents"`, `"agents.title": "Agents"`, `"agents.create": "Create Agent"`, `"agents.permissions.preResearch": "Pre-research"`, `"agents.permissions.research": "Research"`, `"agents.permissions.experiment": "Experiment"`, `"agents.permissions.report": "Report"`
  - zh: `"nav.agents": "智能体"`, `"agents.title": "智能体"`, `"agents.create": "创建智能体"`, `"agents.permissions.preResearch": "预研"`, `"agents.permissions.research": "研究"`, `"agents.permissions.experiment": "实验"`, `"agents.permissions.report": "报告"`

- [ ] **Step 10:** Run `pnpm test` — update any failing tests that reference old role names.

- [ ] **Step 11:** Commit.
```bash
git add src/app/\(dashboard\)/agents/ src/app/\(dashboard\)/layout.tsx \
  src/app/\(dashboard\)/settings/page.tsx src/services/agent.service.ts \
  src/app/api/agents/ messages/
git commit -m "feat(#1): agent management page with 4 composable permissions"
```

---

### Task 12: Notification preferences update (#2)

**Files:**
- Modify: `src/components/notification-preferences-form.tsx`
- Modify: `src/services/notification.service.ts`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1:** Update the notification preferences form to group by the 4 permission categories + general:

```
预研 (Pre-research):
  - projectCreated
  - literatureFound (placeholder)

研究 (Research):
  - researchQuestionClaimed
  - hypothesisFormulationRequested
  - hypothesisFormulationAnswered

实验 (Experiment):
  - experimentAssigned
  - experimentStatusChanged
  - experimentCompleted
  - experimentDesignApproved
  - experimentDesignRejected

报告 (Report):
  - documentCreated (placeholder)
  - synthesisUpdated (placeholder)

通用 (General):
  - commentAdded
  - mentioned
```

- [ ] **Step 2:** Update the form's toggle list to use new field names and groupings. Map API response fields to the new names.

- [ ] **Step 3:** Update `notification.service.ts` types (`NotificationPreferenceFields`, `NotificationPreferenceResponse`) to match the new Prisma field names.

- [ ] **Step 4:** Add i18n keys for the new group names and preference labels.

- [ ] **Step 5:** Test: open Settings → Notifications, verify new groupings display correctly, toggle a preference and verify it saves.

- [ ] **Step 6:** Commit.
```bash
git add src/components/notification-preferences-form.tsx src/services/notification.service.ts messages/
git commit -m "feat(#2): update notification preferences with new permission-based grouping"
```

---

### Task 13: Experiment description from other experiments (#11)

**Files:**
- Modify: `src/app/(dashboard)/research-projects/[uuid]/experiments/new/page.tsx`
- Modify: `src/app/(dashboard)/research-projects/[uuid]/experiments/new/create-experiment-form.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1:** In the experiments new page (server component), fetch existing experiments:
```typescript
const { experiments } = await listExperiments({
  companyUuid: auth.companyUuid,
  researchProjectUuid: projectUuid,
  skip: 0, take: 200,
});
```
Pass `experiments` as a prop to `CreateExperimentForm`.

- [ ] **Step 2:** In `CreateExperimentForm`, add a `<select>` above the description textarea:
```tsx
<div className="space-y-2 md:col-span-2">
  <Label>{t("experiments.fields.copyFromExperiment")}</Label>
  <select
    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
    onChange={(e) => {
      const exp = existingExperiments.find(ex => ex.uuid === e.target.value);
      if (exp?.description) {
        setDescription(exp.description);
      }
    }}
    defaultValue=""
  >
    <option value="">{t("experiments.fields.writeYourOwn")}</option>
    {existingExperiments.map(exp => (
      <option key={exp.uuid} value={exp.uuid}>{exp.title}</option>
    ))}
  </select>
</div>
```

- [ ] **Step 3:** Convert description from uncontrolled to controlled input (add `const [description, setDescription] = useState("")` and bind to textarea).

- [ ] **Step 4:** Add i18n keys:
  - en: `"copyFromExperiment": "Copy from existing experiment"`, `"writeYourOwn": "Write your own"`
  - zh: `"copyFromExperiment": "从已有实验复制描述"`, `"writeYourOwn": "自行填写"`

- [ ] **Step 5:** Test: create a new experiment, select an existing one from dropdown, verify description auto-fills.

- [ ] **Step 6:** Commit.
```bash
git add "src/app/(dashboard)/research-projects/[uuid]/experiments/new/"
git commit -m "feat(#11): copy experiment description from existing experiments"
```

---

## Batch 3: Real-time Status

### Task 14: Schema — experiment live status and progress log (#13, #14)

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1:** Add live status fields to `Experiment` model:
```prisma
model Experiment {
  // after completedAt:
  liveStatus    String?   // null | sent | ack | checking_resources | queuing | running
  liveMessage   String?   // latest progress message from agent
  liveUpdatedAt DateTime? // when liveStatus/liveMessage last changed
  // add relation:
  progressLogs  ExperimentProgressLog[]
}
```

- [ ] **Step 2:** Add new `ExperimentProgressLog` model:
```prisma
model ExperimentProgressLog {
  id             Int        @id @default(autoincrement())
  uuid           String     @unique @default(uuid())
  companyUuid    String
  experimentUuid String
  experiment     Experiment @relation(fields: [experimentUuid], references: [uuid], onDelete: Cascade)
  message        String
  phase          String?
  actorUuid      String
  createdAt      DateTime   @default(now())

  @@index([experimentUuid, createdAt])
  @@index([companyUuid])
}
```

- [ ] **Step 3:** Run `pnpm db:generate` and create migration: `pnpm db:migrate:dev --name add-experiment-live-status-and-progress-log`

- [ ] **Step 4:** Commit.
```bash
git add prisma/
git commit -m "feat(#13,#14): schema for experiment live status and progress log"
```

---

### Task 15: Experiment live status service + MCP integration (#13)

**Files:**
- Modify: `src/services/experiment.service.ts`
- Modify: `src/mcp/tools/compute.ts`

- [ ] **Step 1:** Add a helper function in `experiment.service.ts`:
```typescript
export async function updateExperimentLiveStatus(
  experimentUuid: string,
  liveStatus: string | null,
  liveMessage?: string | null,
) {
  const data: Record<string, unknown> = {
    liveStatus,
    liveUpdatedAt: new Date(),
  };
  if (liveMessage !== undefined) {
    data.liveMessage = liveMessage;
  }
  await prisma.experiment.update({
    where: { uuid: experimentUuid },
    data,
  });
}
```

- [ ] **Step 2:** In `assignExperiment`, after the assignment update, set `liveStatus = "sent"`:
```typescript
await updateExperimentLiveStatus(input.experimentUuid, "sent");
```

- [ ] **Step 3:** In `compute.ts` MCP tool `synapse_get_assigned_experiments`, after fetching experiments, update any with `liveStatus = "sent"` to `"ack"`:
```typescript
for (const exp of experiments) {
  if (exp.liveStatus === "sent") {
    await experimentService.updateExperimentLiveStatus(exp.uuid, "ack");
  }
}
```

- [ ] **Step 4:** In `synapse_start_experiment` MCP tool, update liveStatus at each step:
  - Before GPU reservation: `await experimentService.updateExperimentLiveStatus(experimentUuid, "checking_resources");`
  - If no GPUs found/reserved: `await experimentService.updateExperimentLiveStatus(experimentUuid, "queuing");`
  - After successful start: `await experimentService.updateExperimentLiveStatus(experimentUuid, "running");`

- [ ] **Step 5:** In `synapse_submit_experiment_results`, clear liveStatus:
```typescript
await experimentService.updateExperimentLiveStatus(experimentUuid, null, null);
```

- [ ] **Step 6:** Emit SSE events after each liveStatus update by calling `eventBus.emitChange()`.

- [ ] **Step 7:** Include `liveStatus`, `liveMessage`, `liveUpdatedAt` in the `formatExperiment` response.

- [ ] **Step 8:** Run `pnpm test`, fix any failures.

- [ ] **Step 9:** Commit.
```bash
git add src/services/experiment.service.ts src/mcp/tools/compute.ts
git commit -m "feat(#13): experiment live status updates through assignment and MCP tools"
```

---

### Task 16: Progress log service and API (#14)

**Files:**
- Create: `src/services/experiment-progress.service.ts`
- Create: `src/app/api/experiments/[uuid]/progress/route.ts`
- Modify: `src/mcp/tools/compute.ts`

- [ ] **Step 1:** Create `experiment-progress.service.ts`:
```typescript
import { prisma } from "@/lib/prisma";
import { eventBus } from "@/lib/event-bus";
import { updateExperimentLiveStatus } from "./experiment.service";

export async function createProgressLog(input: {
  companyUuid: string;
  experimentUuid: string;
  message: string;
  phase?: string;
  actorUuid: string;
}) {
  const log = await prisma.experimentProgressLog.create({
    data: {
      companyUuid: input.companyUuid,
      experimentUuid: input.experimentUuid,
      message: input.message,
      phase: input.phase ?? null,
      actorUuid: input.actorUuid,
    },
  });

  // Update experiment's liveMessage
  await updateExperimentLiveStatus(input.experimentUuid, "running", input.message);

  // Look up project UUID for SSE
  const experiment = await prisma.experiment.findFirst({
    where: { uuid: input.experimentUuid },
    select: { researchProjectUuid: true },
  });

  if (experiment) {
    eventBus.emitChange({
      companyUuid: input.companyUuid,
      researchProjectUuid: experiment.researchProjectUuid,
      entityType: "experiment",
      entityUuid: input.experimentUuid,
      action: "updated",
      actorUuid: input.actorUuid,
    });
  }

  return log;
}

export async function listProgressLogs(companyUuid: string, experimentUuid: string) {
  return prisma.experimentProgressLog.findMany({
    where: { companyUuid, experimentUuid },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
```

- [ ] **Step 2:** Create API route `src/app/api/experiments/[uuid]/progress/route.ts`:
```typescript
import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { errors, success } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";
import { listProgressLogs } from "@/services/experiment-progress.service";

type RouteContext = { params: Promise<{ uuid: string }> };

export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) return errors.unauthorized();
    const { uuid } = await context.params;
    const logs = await listProgressLogs(auth.companyUuid, uuid);
    return success({ logs });
  }
);
```

- [ ] **Step 3:** Register new MCP tool `synapse_report_experiment_progress` in `compute.ts`:
```typescript
import { createProgressLog } from "@/services/experiment-progress.service";

server.registerTool(
  "synapse_report_experiment_progress",
  {
    description: "Report a progress update for an in-progress experiment. The message appears on the experiment card in real-time.",
    inputSchema: z.object({
      experimentUuid: z.string(),
      message: z.string(),
      phase: z.string().optional(),
    }),
  },
  async ({ experimentUuid, message, phase }) => {
    await createProgressLog({
      companyUuid: auth.companyUuid,
      experimentUuid,
      message,
      phase,
      actorUuid: auth.actorUuid,
    });
    return {
      content: [{ type: "text", text: JSON.stringify({ success: true }) }],
    };
  }
);
```

- [ ] **Step 4:** Commit.
```bash
git add src/services/experiment-progress.service.ts \
  src/app/api/experiments/\[uuid\]/progress/ \
  src/mcp/tools/compute.ts
git commit -m "feat(#14): experiment progress log service, API, and MCP tool"
```

---

### Task 17: Experiment board — live status badge + progress display (#13, #14)

**Files:**
- Modify: `src/app/(dashboard)/research-projects/[uuid]/experiments/experiments-board.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1:** Add i18n keys for live status badges:
```json
// en.json
"experiments.liveStatus.sent": "Sent",
"experiments.liveStatus.ack": "Received",
"experiments.liveStatus.checking_resources": "Checking Resources",
"experiments.liveStatus.queuing": "Queuing",
"experiments.liveStatus.running": "Running",
"experiments.detail.progressLog": "Progress Log",
"experiments.detail.noProgress": "No progress updates yet"

// zh.json
"experiments.liveStatus.sent": "已发送",
"experiments.liveStatus.ack": "已接收",
"experiments.liveStatus.checking_resources": "检查资源中",
"experiments.liveStatus.queuing": "排队中",
"experiments.liveStatus.running": "运行中",
"experiments.detail.progressLog": "进度日志",
"experiments.detail.noProgress": "暂无进度更新"
```

- [ ] **Step 2:** In `experiments-board.tsx`, add a `liveStatusBadge` helper:
```tsx
function liveStatusBadge(t: ReturnType<typeof useTranslations>, status: string | null) {
  if (!status) return null;
  const colors: Record<string, string> = {
    sent: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
    ack: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    checking_resources: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
    queuing: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
    running: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${colors[status] || ""}`}>
      {t(`experiments.liveStatus.${status}`)}
    </span>
  );
}
```

- [ ] **Step 3:** In each experiment card, after the assignee line, add:
```tsx
{experiment.liveStatus && (
  <div className="flex items-center gap-2">
    {liveStatusBadge(t, experiment.liveStatus)}
    {experiment.liveMessage && (
      <span className="truncate text-[11px] text-muted-foreground">{experiment.liveMessage}</span>
    )}
  </div>
)}
```

- [ ] **Step 4:** In the detail panel (Sheet), add a "Progress Log" section. Fetch logs on open:
```tsx
const [progressLogs, setProgressLogs] = useState<Array<{uuid: string; message: string; phase: string | null; createdAt: string}>>([]);

useEffect(() => {
  if (selectedExperiment?.uuid) {
    fetch(`/api/experiments/${selectedExperiment.uuid}/progress`)
      .then(r => r.json())
      .then(d => { if (d.success) setProgressLogs(d.data.logs); });
  }
}, [selectedExperiment?.uuid]);
```

Display as a timeline list in the detail panel, after the results section.

- [ ] **Step 5:** Update `ExperimentResponse` type to include `liveStatus`, `liveMessage`, `liveUpdatedAt`.

- [ ] **Step 6:** Test end-to-end: assign experiment to agent, verify "Sent" badge appears. (Full flow requires an agent, but UI can be verified with manual DB updates.)

- [ ] **Step 7:** Commit.
```bash
git add "src/app/(dashboard)/research-projects/[uuid]/experiments/experiments-board.tsx" \
  messages/en.json messages/zh.json
git commit -m "feat(#13,#14): live status badges and progress log on experiment cards"
```

---

### Task 18: Final verification and sync

- [ ] **Step 1:** Run full test suite: `pnpm test`
- [ ] **Step 2:** Run type check: `npx tsc --noEmit`
- [ ] **Step 3:** Run lint: `pnpm lint`
- [ ] **Step 4:** Run build: `pnpm build`
- [ ] **Step 5:** Sync to remote: `rsync` to chorus-research
- [ ] **Step 6:** Run tests on remote: `ssh chorus-research 'cd ~/Synapse && pnpm test'`
- [ ] **Step 7:** Restart dev server and E2E verify key flows
- [ ] **Step 8:** Push from remote: `ssh chorus-research 'cd ~/Synapse && git push origin codex/research-orchestration'`
