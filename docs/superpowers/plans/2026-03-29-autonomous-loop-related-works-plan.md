# Autonomous Loop + Related Works Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add autonomous research loop (agent proposes experiments when queue is empty) and a Related Works page (literature collection + auto-search + deep research).

**Architecture:** Schema adds `RelatedWork` model + fields on `ResearchProject`. Two new MCP tools for paper search (`synapse_search_papers`, `synapse_add_related_work`). Autonomous loop triggers via existing eventBus/notification system when experiment completes and all queues are empty. Related Works page is a new project-level route with server + client components.

**Tech Stack:** Next.js 15 App Router, Prisma 7, TypeScript, Semantic Scholar API, next-intl, Zod, MCP SDK

**Spec:** `docs/superpowers/specs/2026-03-29-autonomous-loop-related-works-design.md`

---

## Task 1: Schema — RelatedWork model + ResearchProject fields

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1:** Add new fields to `ResearchProject` model. After `deepResearchDocUuid`, before `createdAt`:

```prisma
  autonomousLoopEnabled    Boolean  @default(false)
  autonomousLoopAgentUuid  String?
  autoSearchEnabled        Boolean  @default(false)
  autoSearchAgentUuid      String?
  deepResearchDocUuid      String?
```

- [ ] **Step 2:** Add `relatedWorks RelatedWork[]` relation to `ResearchProject` model (after `experimentDesigns` relation).

- [ ] **Step 3:** Add `RelatedWork` model after `ExperimentProgressLog`:

```prisma
model RelatedWork {
  id                  Int             @id @default(autoincrement())
  uuid                String          @unique @default(uuid())
  companyUuid         String
  researchProjectUuid String
  researchProject     ResearchProject @relation(fields: [researchProjectUuid], references: [uuid], onDelete: Cascade)
  title               String
  authors             String?
  abstract            String?
  url                 String
  arxivId             String?
  source              String          // "arxiv" | "semantic_scholar"
  addedBy             String          // "manual" | "auto"
  addedByAgentUuid    String?
  createdAt           DateTime        @default(now())

  @@index([companyUuid])
  @@index([researchProjectUuid])
}
```

- [ ] **Step 4:** Run `pnpm db:generate`. Do NOT run `db:migrate:dev`.

- [ ] **Step 5:** Commit.
```bash
git add prisma/ src/generated/
git commit -m "feat: schema for autonomous loop, related works, and auto-search"
```

---

## Task 2: Related Works service

**Files:**
- Create: `src/services/related-work.service.ts`

- [ ] **Step 1:** Create the service with CRUD + arXiv metadata fetching:

```typescript
import { prisma } from "@/lib/prisma";

export interface RelatedWorkResponse {
  uuid: string;
  title: string;
  authors: string | null;
  abstract: string | null;
  url: string;
  arxivId: string | null;
  source: string;
  addedBy: string;
  addedByAgentUuid: string | null;
  createdAt: string;
}

function formatRelatedWork(rw: {
  uuid: string; title: string; authors: string | null; abstract: string | null;
  url: string; arxivId: string | null; source: string; addedBy: string;
  addedByAgentUuid: string | null; createdAt: Date;
}): RelatedWorkResponse {
  return { ...rw, createdAt: rw.createdAt.toISOString() };
}

export async function listRelatedWorks(
  companyUuid: string,
  researchProjectUuid: string,
): Promise<RelatedWorkResponse[]> {
  const works = await prisma.relatedWork.findMany({
    where: { companyUuid, researchProjectUuid },
    orderBy: { createdAt: "desc" },
  });
  return works.map(formatRelatedWork);
}

export async function createRelatedWork(input: {
  companyUuid: string;
  researchProjectUuid: string;
  title: string;
  authors?: string | null;
  abstract?: string | null;
  url: string;
  arxivId?: string | null;
  source: string;
  addedBy: string;
  addedByAgentUuid?: string | null;
}): Promise<RelatedWorkResponse> {
  const rw = await prisma.relatedWork.create({
    data: {
      companyUuid: input.companyUuid,
      researchProjectUuid: input.researchProjectUuid,
      title: input.title,
      authors: input.authors ?? null,
      abstract: input.abstract ?? null,
      url: input.url,
      arxivId: input.arxivId ?? null,
      source: input.source,
      addedBy: input.addedBy,
      addedByAgentUuid: input.addedByAgentUuid ?? null,
    },
  });
  return formatRelatedWork(rw);
}

export async function deleteRelatedWork(
  companyUuid: string,
  uuid: string,
): Promise<void> {
  await prisma.relatedWork.deleteMany({
    where: { uuid, companyUuid },
  });
}

/** Fetch paper metadata from arXiv API given an arXiv URL or ID */
export async function fetchArxivMetadata(url: string): Promise<{
  title: string; authors: string; abstract: string; arxivId: string;
} | null> {
  const match = url.match(/arxiv\.org\/abs\/(\d+\.\d+)/);
  if (!match) return null;
  const arxivId = match[1];

  try {
    const resp = await fetch(`http://export.arxiv.org/api/query?id_list=${arxivId}`);
    const xml = await resp.text();

    const title = xml.match(/<title>([\s\S]*?)<\/title>/g)?.[1]
      ?.replace(/<\/?title>/g, "").trim() ?? "";
    const abstract = xml.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]
      ?.replace(/<\/?summary>/g, "").trim() ?? "";
    const authorMatches = [...xml.matchAll(/<name>(.*?)<\/name>/g)];
    const authors = authorMatches.map(m => m[1]).join(", ");

    if (!title) return null;
    return { title, authors, abstract, arxivId };
  } catch {
    return null;
  }
}
```

- [ ] **Step 2:** Commit.
```bash
git add src/services/related-work.service.ts
git commit -m "feat: related work service with CRUD and arXiv metadata fetching"
```

---

## Task 3: Related Works API routes

**Files:**
- Create: `src/app/api/research-projects/[uuid]/related-works/route.ts`

- [ ] **Step 1:** Create the route with GET (list) and POST (create with auto-fetch):

```typescript
import { NextRequest } from "next/server";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api-handler";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { researchProjectExists } from "@/services/research-project.service";
import {
  listRelatedWorks,
  createRelatedWork,
  fetchArxivMetadata,
} from "@/services/related-work.service";

type RouteContext = { params: Promise<{ uuid: string }> };

export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) return errors.unauthorized();
    const { uuid } = await context.params;
    if (!(await researchProjectExists(auth.companyUuid, uuid))) {
      return errors.notFound("Research Project");
    }
    const works = await listRelatedWorks(auth.companyUuid, uuid);
    return success({ relatedWorks: works });
  }
);

const createSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  authors: z.string().optional(),
  abstract: z.string().optional(),
  arxivId: z.string().optional(),
  source: z.string().default("arxiv"),
});

export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) return errors.unauthorized();
    const { uuid } = await context.params;
    if (!(await researchProjectExists(auth.companyUuid, uuid))) {
      return errors.notFound("Research Project");
    }

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return errors.validationError(parsed.error.flatten().fieldErrors);
    }

    // Auto-fetch metadata from arXiv if title not provided
    let { title, authors, abstract: abs, arxivId, source } = parsed.data;
    if (!title) {
      const meta = await fetchArxivMetadata(parsed.data.url);
      if (meta) {
        title = meta.title;
        authors = authors || meta.authors;
        abs = abs || meta.abstract;
        arxivId = arxivId || meta.arxivId;
      }
    }

    if (!title) {
      return errors.validationError({ title: "Title is required (could not auto-fetch from URL)" });
    }

    const rw = await createRelatedWork({
      companyUuid: auth.companyUuid,
      researchProjectUuid: uuid,
      title,
      authors,
      abstract: abs,
      url: parsed.data.url,
      arxivId,
      source,
      addedBy: isUser(auth) ? "manual" : "auto",
      addedByAgentUuid: isUser(auth) ? null : auth.actorUuid,
    });

    return success({ relatedWork: rw });
  }
);
```

- [ ] **Step 2:** Create delete route `src/app/api/research-projects/[uuid]/related-works/[workUuid]/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { deleteRelatedWork } from "@/services/related-work.service";

type RouteContext = { params: Promise<{ uuid: string; workUuid: string }> };

export const DELETE = withErrorHandler<{ uuid: string; workUuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) return errors.unauthorized();
    if (!isUser(auth)) return errors.forbidden("Only users can delete related works");
    const { workUuid } = await context.params;
    await deleteRelatedWork(auth.companyUuid, workUuid);
    return success({ deleted: true });
  }
);
```

- [ ] **Step 3:** Commit.
```bash
git add src/app/api/research-projects/\[uuid\]/related-works/
git commit -m "feat: related works API routes (list, create with arXiv auto-fetch, delete)"
```

---

## Task 4: Related Works page (server + client)

**Files:**
- Create: `src/app/(dashboard)/research-projects/[uuid]/related-works/page.tsx`
- Create: `src/app/(dashboard)/research-projects/[uuid]/related-works/related-works-client.tsx`
- Modify: `src/app/(dashboard)/layout.tsx` — add nav item
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1:** Add sidebar nav item. In `layout.tsx`, find `projectNavItems` array. Add between Insights and Documents:
```typescript
{ href: `/research-projects/${currentProjectUuid}/related-works`, label: t("nav.relatedWorks"), icon: BookOpen },
```
Import `BookOpen` from lucide-react.

- [ ] **Step 2:** Create server page `related-works/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getServerAuthContext } from "@/lib/auth-server";
import { researchProjectExists } from "@/services/research-project.service";
import { listRelatedWorks } from "@/services/related-work.service";
import { listAgentSummaries } from "@/services/agent.service";
import { RelatedWorksClient } from "./related-works-client";

interface PageProps { params: Promise<{ uuid: string }> }

export default async function RelatedWorksPage({ params }: PageProps) {
  const auth = await getServerAuthContext();
  if (!auth) redirect("/login");
  const { uuid: projectUuid } = await params;
  if (!(await researchProjectExists(auth.companyUuid, projectUuid))) redirect("/research-projects");

  const [works, agents, project] = await Promise.all([
    listRelatedWorks(auth.companyUuid, projectUuid),
    listAgentSummaries(auth.companyUuid),
    prisma.researchProject.findFirst({
      where: { uuid: projectUuid, companyUuid: auth.companyUuid },
      select: {
        autoSearchEnabled: true, autoSearchAgentUuid: true,
        deepResearchDocUuid: true,
      },
    }),
  ]);

  return (
    <div className="space-y-6 p-4 md:p-8">
      <RelatedWorksClient
        projectUuid={projectUuid}
        initialWorks={works}
        agents={agents}
        autoSearchEnabled={project?.autoSearchEnabled ?? false}
        autoSearchAgentUuid={project?.autoSearchAgentUuid ?? null}
        deepResearchDocUuid={project?.deepResearchDocUuid ?? null}
      />
    </div>
  );
}
```

Note: import `prisma` from `@/lib/prisma` for the project query, or add a service function.

- [ ] **Step 3:** Create client component `related-works-client.tsx` with:
  - Header with title + "+ Add Paper" button
  - Auto-search three-state toggle (OFF → ON waiting → Active)
  - Deep Research row: agent dropdown + Generate button + "View Document →" link
  - Paper card list: each card is an `<a>` linking to paper URL, shows title + ↗, authors, arxivId, abstract excerpt, source/addedBy badges
  - Add Paper dialog: URL input (auto-fetches on blur), title/authors/abstract fields
  - Delete button on each card (X icon, user only)

  Follow the mockup from the brainstorming session (V5). Use existing UI components (Card, Button, Dialog, Input, Badge).

  For toggle persistence: on toggle/agent change, PATCH `/api/research-projects/{uuid}` with `autoSearchEnabled`/`autoSearchAgentUuid`.

  For Deep Research Generate: POST to `/api/research-projects/{uuid}/related-works/deep-research` (created in Task 6).

- [ ] **Step 4:** Add i18n keys to both `messages/en.json` and `messages/zh.json`:
```json
"nav": { "relatedWorks": "Related Works" }  // en
"nav": { "relatedWorks": "相关文献" }  // zh

"relatedWorks": {
  "title": "Related Works",  // "相关文献"
  "subtitle": "Collect and analyze relevant literature for this research project",  // "收集和分析与本研究项目相关的文献"
  "addPaper": "Add Paper",  // "添加论文"
  "autoSearch": "Auto-search",  // "自动搜索"
  "autoSearchDesc": "Find related papers automatically",  // "自动查找相关论文"
  "selectAgent": "Select an agent to activate",  // "选择一个智能体以激活"
  "activeWith": "Active · searching with {agent}",  // "已激活 · 使用 {agent} 搜索中"
  "deepResearch": "Deep Research",  // "深度研究"
  "deepResearchNone": "No report generated yet",  // "暂未生成报告"
  "deepResearchLast": "Last generated: {date}",  // "上次生成：{date}"
  "viewDocument": "View Document",  // "查看文档"
  "generate": "Generate",  // "生成"
  "regenerate": "Regenerate",  // "重新生成"
  "selectAgentToGenerate": "Select agent...",  // "选择智能体..."
  "papers": "{count} papers collected",  // "已收集 {count} 篇论文"
  "noPapers": "No papers collected yet",  // "暂无论文"
  "noPapersDesc": "Add papers manually or enable auto-search",  // "手动添加论文或启用自动搜索"
  "addPaperTitle": "Add Paper",  // "添加论文"
  "urlLabel": "Paper URL",  // "论文链接"
  "urlPlaceholder": "https://arxiv.org/abs/...",  // "https://arxiv.org/abs/..."
  "titleLabel": "Title",  // "标题"
  "authorsLabel": "Authors",  // "作者"
  "abstractLabel": "Abstract",  // "摘要"
  "fetchingMetadata": "Fetching metadata...",  // "正在获取元数据..."
  "manual": "manual",  // "手动"
  "auto": "auto"  // "自动"
}
```

- [ ] **Step 5:** Commit.
```bash
git add "src/app/(dashboard)/research-projects/[uuid]/related-works/" \
  src/app/\(dashboard\)/layout.tsx messages/
git commit -m "feat: related works page with auto-search toggle and paper list"
```

---

## Task 5: MCP tools — paper search + add related work

**Files:**
- Create: `src/mcp/tools/literature.ts`
- Modify: `src/mcp/server.ts` (or wherever tools are registered) — register new tools

- [ ] **Step 1:** Create `src/mcp/tools/literature.ts`:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AgentAuthContext } from "@/types/auth";
import { createRelatedWork, listRelatedWorks } from "@/services/related-work.service";

export function registerLiteratureTools(server: McpServer, auth: AgentAuthContext) {
  server.registerTool(
    "synapse_search_papers",
    {
      description: "Search for academic papers using Semantic Scholar. Returns titles, abstracts, authors, and URLs.",
      inputSchema: z.object({
        query: z.string().describe("Search query, e.g. 'speech recognition Chinese accent'"),
        limit: z.number().int().min(1).max(20).default(10),
      }),
    },
    async ({ query, limit }) => {
      const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=title,abstract,authors,externalIds,url`;
      const resp = await fetch(url);
      if (!resp.ok) {
        return { content: [{ type: "text", text: `Semantic Scholar API error: ${resp.status}` }], isError: true };
      }
      const data = await resp.json() as {
        data?: Array<{
          paperId: string;
          title: string;
          abstract: string | null;
          authors: Array<{ name: string }>;
          externalIds: { ArXiv?: string } | null;
          url: string;
        }>;
      };

      const papers = (data.data ?? []).map(p => ({
        title: p.title,
        abstract: p.abstract,
        authors: p.authors.map(a => a.name).join(", "),
        url: p.externalIds?.ArXiv
          ? `https://arxiv.org/abs/${p.externalIds.ArXiv}`
          : p.url,
        arxivId: p.externalIds?.ArXiv ?? null,
        source: p.externalIds?.ArXiv ? "arxiv" : "semantic_scholar",
      }));

      return {
        content: [{ type: "text", text: JSON.stringify({ papers }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "synapse_add_related_work",
    {
      description: "Add a paper to a research project's Related Works collection.",
      inputSchema: z.object({
        researchProjectUuid: z.string(),
        title: z.string(),
        url: z.string(),
        authors: z.string().optional(),
        abstract: z.string().optional(),
        arxivId: z.string().optional(),
        source: z.enum(["arxiv", "semantic_scholar"]).default("arxiv"),
      }),
    },
    async ({ researchProjectUuid, title, url, authors, abstract, arxivId, source }) => {
      const rw = await createRelatedWork({
        companyUuid: auth.companyUuid,
        researchProjectUuid,
        title,
        url,
        authors,
        abstract,
        arxivId,
        source,
        addedBy: "auto",
        addedByAgentUuid: auth.actorUuid,
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ relatedWork: rw }) }],
      };
    }
  );

  server.registerTool(
    "synapse_get_related_works",
    {
      description: "Get all related works (papers) collected for a research project.",
      inputSchema: z.object({
        researchProjectUuid: z.string(),
      }),
    },
    async ({ researchProjectUuid }) => {
      const works = await listRelatedWorks(auth.companyUuid, researchProjectUuid);
      return {
        content: [{ type: "text", text: JSON.stringify({ relatedWorks: works }, null, 2) }],
      };
    }
  );
}
```

- [ ] **Step 2:** Find where MCP tools are registered (check `src/mcp/server.ts` or the file that calls `registerComputeTools`). Add:
```typescript
import { registerLiteratureTools } from "@/mcp/tools/literature";
// ... in the registration function:
registerLiteratureTools(server, auth);
```

- [ ] **Step 3:** Commit.
```bash
git add src/mcp/tools/literature.ts src/mcp/
git commit -m "feat: MCP tools for paper search, add related work, get related works"
```

---

## Task 6: Autonomous loop — full context MCP tool + trigger

**Files:**
- Modify: `src/mcp/tools/compute.ts` — add `synapse_get_project_full_context` and `synapse_propose_experiment`
- Modify: `src/services/experiment.service.ts` — add autonomous loop trigger in `completeExperiment`
- Modify: `src/services/research-project.service.ts` — accept new fields in update
- Create: `src/app/api/research-projects/[uuid]/related-works/deep-research/route.ts`

- [ ] **Step 1:** Add `synapse_get_project_full_context` to `compute.ts`:

```typescript
server.registerTool(
  "synapse_get_project_full_context",
  {
    description: "Get full research context for a project: brief, datasets, evaluation methods, all research questions, all experiments with outcomes, related works summary. Use this for autonomous research analysis.",
    inputSchema: z.object({
      researchProjectUuid: z.string(),
    }),
  },
  async ({ researchProjectUuid }) => {
    const project = await prisma.researchProject.findFirst({
      where: { uuid: researchProjectUuid, companyUuid: auth.companyUuid },
      select: {
        uuid: true, name: true, description: true, goal: true,
        datasets: true, evaluationMethods: true,
        researchQuestions: {
          select: { uuid: true, title: true, content: true, status: true, reviewStatus: true },
          orderBy: { createdAt: "asc" },
        },
        experiments: {
          select: { uuid: true, title: true, description: true, status: true, priority: true, outcome: true, results: true, completedAt: true },
          orderBy: { createdAt: "asc" },
        },
        _count: { select: { relatedWorks: true } },
      },
    });
    if (!project) {
      return { content: [{ type: "text", text: "Project not found" }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify({ project }, null, 2) }],
    };
  }
);
```

- [ ] **Step 2:** Add `synapse_propose_experiment` to `compute.ts`:

```typescript
server.registerTool(
  "synapse_propose_experiment",
  {
    description: "Propose a new experiment for human review. The experiment will be created in 'draft' status. Only usable when autonomous loop is active for this project.",
    inputSchema: z.object({
      researchProjectUuid: z.string(),
      title: z.string(),
      description: z.string(),
      researchQuestionUuid: z.string().optional(),
      priority: z.enum(["low", "medium", "high", "immediate"]).default("medium"),
    }),
  },
  async ({ researchProjectUuid, title, description, researchQuestionUuid, priority }) => {
    // Verify autonomous loop is enabled for this agent
    const project = await prisma.researchProject.findFirst({
      where: {
        uuid: researchProjectUuid,
        companyUuid: auth.companyUuid,
        autonomousLoopEnabled: true,
        autonomousLoopAgentUuid: auth.actorUuid,
      },
      select: { uuid: true },
    });
    if (!project) {
      return { content: [{ type: "text", text: "Autonomous loop is not enabled for this project or you are not the assigned agent" }], isError: true };
    }

    const experiment = await experimentService.createExperiment({
      companyUuid: auth.companyUuid,
      researchProjectUuid,
      title,
      description,
      researchQuestionUuid: researchQuestionUuid || null,
      priority,
      createdByUuid: auth.actorUuid,
      createdByType: "agent",
    });

    return {
      content: [{ type: "text", text: JSON.stringify({ experiment, note: "Experiment created as draft. Human review required before execution." }, null, 2) }],
    };
  }
);
```

- [ ] **Step 3:** In `experiment.service.ts`, at the end of `completeExperiment` (after the eventBus emit, before the return), add the autonomous loop trigger check:

```typescript
// Check autonomous loop trigger
const loopProject = await prisma.researchProject.findFirst({
  where: { uuid: updated.researchProjectUuid, companyUuid: input.companyUuid },
  select: { autonomousLoopEnabled: true, autonomousLoopAgentUuid: true, name: true },
});
if (loopProject?.autonomousLoopEnabled && loopProject.autonomousLoopAgentUuid) {
  const queueCount = await prisma.experiment.count({
    where: {
      researchProjectUuid: updated.researchProjectUuid,
      companyUuid: input.companyUuid,
      status: { in: ["draft", "pending_review", "pending_start"] },
    },
  });
  if (queueCount === 0) {
    const actorName = await getActorName("agent", loopProject.autonomousLoopAgentUuid);
    await notificationService.create({
      companyUuid: input.companyUuid,
      researchProjectUuid: updated.researchProjectUuid,
      recipientType: "agent",
      recipientUuid: loopProject.autonomousLoopAgentUuid,
      entityType: "research_project",
      entityUuid: updated.researchProjectUuid,
      entityTitle: loopProject.name,
      projectName: loopProject.name,
      action: "autonomous_loop_triggered",
      message: `Experiment queue is empty. Analyze the project and propose next experiments.`,
      actorType: "system",
      actorUuid: "system",
      actorName: "Synapse",
    });
  }
}
```

- [ ] **Step 4:** In `research-project.service.ts`, ensure `updateResearchProject` accepts `autonomousLoopEnabled`, `autonomousLoopAgentUuid`, `autoSearchEnabled`, `autoSearchAgentUuid`, `deepResearchDocUuid` in its params type and passes them to Prisma.

- [ ] **Step 5:** Create deep research trigger route `src/app/api/research-projects/[uuid]/related-works/deep-research/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api-handler";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import * as notificationService from "@/services/notification.service";

type RouteContext = { params: Promise<{ uuid: string }> };

const bodySchema = z.object({ agentUuid: z.string() });

export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) return errors.unauthorized();
    if (!isUser(auth)) return errors.forbidden("Only users can trigger deep research");

    const { uuid: projectUuid } = await context.params;
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return errors.validationError(parsed.error.flatten().fieldErrors);

    await notificationService.create({
      companyUuid: auth.companyUuid,
      researchProjectUuid: projectUuid,
      recipientType: "agent",
      recipientUuid: parsed.data.agentUuid,
      entityType: "research_project",
      entityUuid: projectUuid,
      entityTitle: "Deep Research",
      projectName: "",
      action: "deep_research_requested",
      message: "Generate a deep research literature review for this project.",
      actorType: "user",
      actorUuid: auth.actorUuid,
      actorName: "User",
    });

    return success({ triggered: true });
  }
);
```

- [ ] **Step 6:** Commit.
```bash
git add src/mcp/tools/compute.ts src/services/experiment.service.ts \
  src/services/research-project.service.ts \
  src/app/api/research-projects/\[uuid\]/related-works/deep-research/
git commit -m "feat: autonomous loop trigger, full context + propose experiment MCP tools, deep research route"
```

---

## Task 7: Autonomous Loop toggle on Experiments page

**Files:**
- Modify: `src/app/(dashboard)/research-projects/[uuid]/experiments/page.tsx`
- Modify: `src/app/(dashboard)/research-projects/[uuid]/experiments/experiments-board.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1:** In the experiments page (server component), fetch the project's autonomous loop settings and pass to the board:
```typescript
const project = await prisma.researchProject.findFirst({
  where: { uuid: projectUuid, companyUuid: auth.companyUuid },
  select: { autonomousLoopEnabled: true, autonomousLoopAgentUuid: true },
});
```
Pass `autonomousLoopEnabled`, `autonomousLoopAgentUuid` as props to `ExperimentsBoard`.

- [ ] **Step 2:** In `experiments-board.tsx`, add the three-state toggle control below the header. Include state management for the toggle and agent dropdown. On change, PATCH `/api/research-projects/{projectUuid}` with `autonomousLoopEnabled` and `autonomousLoopAgentUuid`.

The three states:
- OFF: gray toggle, no dropdown
- ON + no agent: amber toggle, "Select agent..." dropdown, hint text "Select an agent to activate"
- ON + agent selected: amber border, green "Active · analyzing with {name}" text, agent dropdown

- [ ] **Step 3:** Add i18n keys:
```json
"experiments.autonomousLoop": "Autonomous Loop",
"experiments.autonomousLoopDesc": "When all queues are empty, agent analyzes project and proposes new experiments",
"experiments.selectAgentToActivate": "Select an agent to activate",
"experiments.autonomousActive": "Active · analyzing with {agent}",
"experiments.selectAgent": "Select agent..."
```
Same for zh.json with Chinese translations.

- [ ] **Step 4:** Add `projectUuid` as a prop to `ExperimentsBoard` if not already available (needed for the PATCH call). The page already passes experiments and agents.

- [ ] **Step 5:** Commit.
```bash
git add "src/app/(dashboard)/research-projects/[uuid]/experiments/" messages/
git commit -m "feat: autonomous loop toggle on experiments page"
```

---

## Task 8: OpenClaw plugin — handle autonomous loop + deep research notifications

**Files:**
- Modify: `packages/openclaw-plugin/src/event-router.ts`

- [ ] **Step 1:** Add handlers for the two new notification actions in `fetchAndRoute`:

```typescript
case "autonomous_loop_triggered":
  await this.handleAutonomousLoopTriggered(notification);
  break;
case "deep_research_requested":
  await this.handleDeepResearchRequested(notification);
  break;
```

- [ ] **Step 2:** Implement `handleAutonomousLoopTriggered`:

```typescript
private async handleAutonomousLoopTriggered(n: NotificationDetail): Promise<void> {
  const projectUuid = n.projectUuid ?? n.researchProjectUuid ?? "";

  this.triggerAgent(
    `[Synapse] Autonomous research loop triggered for project "${n.entityTitle}" (projectUuid: ${projectUuid}).

The experiment queue is empty. Your task:
1. Use synapse_get_project_full_context with researchProjectUuid "${projectUuid}" to review all project details, research questions, and experiment results
2. Analyze: What questions remain unanswered? What experiments could yield new insights? Are there gaps in the research?
3. If you identify valuable next steps, use synapse_propose_experiment to create draft experiments for human review
4. If the research objectives appear to be met, you may choose not to propose any new experiments

Proposed experiments will enter "draft" status and require human approval before execution.`,
    { notificationUuid: n.uuid, action: "autonomous_loop_triggered", entityUuid: n.entityUuid, projectUuid }
  );
}
```

- [ ] **Step 3:** Implement `handleDeepResearchRequested`:

```typescript
private async handleDeepResearchRequested(n: NotificationDetail): Promise<void> {
  const projectUuid = n.projectUuid ?? n.researchProjectUuid ?? "";

  this.triggerAgent(
    `[Synapse] Deep research literature review requested for project (projectUuid: ${projectUuid}).

1. Use synapse_get_related_works with researchProjectUuid "${projectUuid}" to read all collected papers
2. Use synapse_get_project_full_context with researchProjectUuid "${projectUuid}" to understand the research objectives
3. Analyze how each paper relates to the project's goals, identify key methods, findings, and gaps
4. Create a comprehensive literature review document summarizing the analysis`,
    { notificationUuid: n.uuid, action: "deep_research_requested", entityUuid: n.entityUuid, projectUuid }
  );
}
```

- [ ] **Step 4:** Commit.
```bash
git add packages/openclaw-plugin/src/event-router.ts
git commit -m "feat: OpenClaw handlers for autonomous loop and deep research notifications"
```

---

## Task 9: Final verification, docs update, sync and push

- [ ] **Step 1:** Run `pnpm test` — fix any failures
- [ ] **Step 2:** Run `npx tsc --noEmit` — fix any type errors
- [ ] **Step 3:** Run `pnpm lint` — fix any lint issues
- [ ] **Step 4:** Update `CLAUDE.md` and `AGENTS.md` with new features (autonomous loop, related works, new MCP tools, new nav item)
- [ ] **Step 5:** Sync to remote: `rsync` to chorus-research
- [ ] **Step 6:** Run `pnpm db:push` on remote (apply schema changes)
- [ ] **Step 7:** Run tests on remote
- [ ] **Step 8:** Push from remote to GitHub
