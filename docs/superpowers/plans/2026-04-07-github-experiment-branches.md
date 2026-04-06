# GitHub Experiment Branches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate GitHub repos with research projects so agents can push experiment code to per-experiment branches, and users can browse/download results from the Synapse UI.

**Architecture:** Add GitHub config (repoUrl, username, token) to ResearchProject and branch tracking (baseBranch, experimentBranch, commitSha) to Experiment. New API endpoint lists branches via GitHub API. New MCP tool gives agents repo credentials. Experiment prompt instructs agent to push to `experiment/{uuid}-{name}` branch. Frontend shows branch links in experiment detail.

**Tech Stack:** TypeScript, Prisma, Next.js API routes, GitHub REST API, React

---

### File Structure

| File | Action | Responsibility |
|---|---|---|
| `prisma/schema.prisma` | **Modify** | Add fields to ResearchProject and Experiment |
| `src/services/research-project.service.ts` | **Modify** | Accept new GitHub fields in update |
| `src/app/api/research-projects/[uuid]/github/branches/route.ts` | **Create** | List branches via GitHub API |
| `src/app/(dashboard)/research-projects/[uuid]/settings/project-settings-client.tsx` | **Modify** | Add GitHub config section |
| `src/app/(dashboard)/research-projects/[uuid]/experiments/new/create-experiment-form.tsx` | **Modify** | Add base branch dropdown |
| `src/mcp/tools/compute.ts` | **Modify** | Add `synapse_get_repo_access` tool, extend `synapse_submit_experiment_results` |
| `src/services/experiment.service.ts` | **Modify** | Store experimentBranch/commitSha on complete |
| `src/app/(dashboard)/research-projects/[uuid]/experiments/experiments-board.tsx` | **Modify** | Show branch/commit links in detail panel |
| `packages/openclaw-plugin/src/event-router.ts` | **Modify** | Add GitHub instructions to experiment prompt |
| `packages/openclaw-plugin/src/tools/common-tool-definitions.ts` | **Modify** | Add `synapse_get_repo_access` definition |
| `messages/en.json` + `messages/zh.json` | **Modify** | Add i18n keys |

---

### Task 1: Schema — add GitHub fields

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add fields to ResearchProject**

After the `deepResearchDocUuid` field, add:

```prisma
  repoUrl              String?
  githubUsername        String?
  githubToken          String?
```

- [ ] **Step 2: Add fields to Experiment**

After the `liveUpdatedAt` field, add:

```prisma
  baseBranch           String?
  experimentBranch     String?
  commitSha            String?
```

- [ ] **Step 3: Generate Prisma client**

```bash
pnpm db:generate
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma src/generated/
git commit -m "schema: add GitHub fields to ResearchProject and Experiment"
```

---

### Task 2: Service layer — accept GitHub fields

**Files:**
- Modify: `src/services/research-project.service.ts`
- Modify: `src/services/experiment.service.ts`
- Modify: `src/app/api/research-projects/[uuid]/route.ts`

- [ ] **Step 1: Update ResearchProjectUpdateParams**

In `research-project.service.ts`, find the `ResearchProjectUpdateParams` type/interface and add:

```typescript
repoUrl?: string | null;
githubUsername?: string | null;
githubToken?: string | null;
```

In `updateResearchProject()`, handle these fields in the update data (same pattern as existing nullable fields).

- [ ] **Step 2: Update PATCH route to accept GitHub fields**

In `src/app/api/research-projects/[uuid]/route.ts`, add to the PATCH body type:

```typescript
repoUrl?: string | null;
githubUsername?: string | null;
githubToken?: string | null;
```

And add the corresponding `if (body.xxx !== undefined)` blocks to build updateData.

- [ ] **Step 3: Strip githubToken from GET response**

In the GET handler of `src/app/api/research-projects/[uuid]/route.ts`, ensure the response does NOT include `githubToken`. Instead, add a computed `githubConfigured: boolean` field:

```typescript
return success({
  // ... existing fields
  repoUrl: researchProject.repoUrl ?? null,
  githubUsername: researchProject.githubUsername ?? null,
  githubConfigured: !!researchProject.githubToken,
});
```

Update `getResearchProjectByUuid()` in the service to include `repoUrl`, `githubUsername`, `githubToken` in the select. The token is needed by the service but must be stripped at the API boundary.

- [ ] **Step 4: Update completeExperiment to accept branch/commit**

In `experiment.service.ts`, find `completeExperiment()`. Add to its input type:

```typescript
experimentBranch?: string | null;
commitSha?: string | null;
```

In the Prisma update inside that function, add these to the data block.

- [ ] **Step 5: Run tests**

```bash
pnpm test
```

- [ ] **Step 6: Commit**

```bash
git commit -am "feat: service layer accepts GitHub config and experiment branch fields"
```

---

### Task 3: GitHub branches API endpoint

**Files:**
- Create: `src/app/api/research-projects/[uuid]/github/branches/route.ts`

- [ ] **Step 1: Create the endpoint**

```typescript
import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { errors, success } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ uuid: string }> };

export const GET = withErrorHandler(async (request: NextRequest, context: RouteContext) => {
  const auth = await getAuthContext(request);
  if (!auth) return errors.unauthorized();

  const { uuid: projectUuid } = await context.params;
  const project = await prisma.researchProject.findFirst({
    where: { uuid: projectUuid, companyUuid: auth.companyUuid },
    select: { repoUrl: true, githubUsername: true, githubToken: true },
  });

  if (!project) return errors.notFound("Research Project");
  if (!project.repoUrl || !project.githubToken) {
    return success({ branches: [] });
  }

  // Extract owner/repo from URL: https://github.com/owner/repo or https://github.com/owner/repo.git
  const match = project.repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (!match) {
    return success({ branches: [] });
  }

  const [, owner, repo] = match;

  try {
    const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`, {
      headers: {
        Authorization: `Bearer ${project.githubToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "Synapse",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      return success({ branches: [], error: `GitHub API: ${resp.status}` });
    }

    const data = await resp.json() as Array<{ name: string; commit: { sha: string } }>;
    const branches = data.map((b) => ({ name: b.name, sha: b.commit.sha }));
    return success({ branches });
  } catch {
    return success({ branches: [], error: "Failed to fetch branches" });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/research-projects/\[uuid\]/github/
git commit -m "feat: GET /api/research-projects/[uuid]/github/branches endpoint"
```

---

### Task 4: Project settings — GitHub config UI

**Files:**
- Modify: `src/app/(dashboard)/research-projects/[uuid]/settings/project-settings-client.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1: Add i18n keys**

In `messages/en.json`, find the `projectSettings` section (or an appropriate section) and add:

```json
"github": "GitHub Repository",
"githubDesc": "Connect a GitHub repo to track experiment code in branches",
"repoUrl": "Repository URL",
"repoUrlPlaceholder": "https://github.com/owner/repo",
"githubUsername": "GitHub Username",
"githubToken": "Access Token",
"githubTokenPlaceholder": "ghp_...",
"githubTokenHint": "Personal access token with repo scope. Never exposed to the frontend after saving.",
"githubConfigured": "Configured",
"githubNotConfigured": "Not configured"
```

Same in `messages/zh.json`:

```json
"github": "GitHub 仓库",
"githubDesc": "关联 GitHub 仓库，自动将实验代码推送到分支",
"repoUrl": "仓库地址",
"repoUrlPlaceholder": "https://github.com/owner/repo",
"githubUsername": "GitHub 用户名",
"githubToken": "访问令牌",
"githubTokenPlaceholder": "ghp_...",
"githubTokenHint": "需要 repo 权限的个人访问令牌。保存后不会在前端展示。",
"githubConfigured": "已配置",
"githubNotConfigured": "未配置"
```

- [ ] **Step 2: Add GitHub config section to project settings**

Read the current `project-settings-client.tsx` to understand its structure. Add a new section (Card) for GitHub configuration with:

- Repo URL input
- GitHub Username input
- Token input (type=password, show "••••• (configured)" when `githubConfigured` is true, allow changing)
- Save button that PATCHes the project

The token field should only send the value when the user actively types a new one (don't send empty string to clear an existing token unless intended).

- [ ] **Step 3: Ensure page server component passes GitHub fields**

Check the settings page.tsx server component — it may need to pass `repoUrl`, `githubUsername`, `githubConfigured` (NOT the token) to the client component.

- [ ] **Step 4: Run tests**

```bash
pnpm test
```

- [ ] **Step 5: Commit**

```bash
git commit -am "feat: GitHub config section in project settings"
```

---

### Task 5: Experiment creation — base branch dropdown

**Files:**
- Modify: `src/app/(dashboard)/research-projects/[uuid]/experiments/new/create-experiment-form.tsx`
- Modify: `src/app/(dashboard)/research-projects/[uuid]/experiments/new/page.tsx`
- Modify: `src/app/api/experiments/route.ts` (or wherever experiments are created)

- [ ] **Step 1: Pass repoUrl to the create form**

In the `page.tsx` server component for experiment creation, query whether the project has a `repoUrl` configured. Pass `hasRepo: boolean` and `projectUuid` to the form.

- [ ] **Step 2: Add branch dropdown to the form**

In `create-experiment-form.tsx`:

- If `hasRepo` is true, show a "Base Branch" select dropdown
- On mount (or on focus), fetch branches from `/api/research-projects/{projectUuid}/github/branches`
- Default to `main` if available
- Store selected branch in form state
- Include `baseBranch` in the POST body when creating the experiment

- [ ] **Step 3: Ensure experiment create API accepts baseBranch**

Check the experiment creation API route. Add `baseBranch` as an optional field in the create body, and pass it to the service.

- [ ] **Step 4: Add i18n keys**

```json
"baseBranch": "Base Branch",
"baseBranchPlaceholder": "Select branch...",
"baseBranchHint": "Experiment code will be branched from here"
```

Same in Chinese:

```json
"baseBranch": "基础分支",
"baseBranchPlaceholder": "选择分支...",
"baseBranchHint": "实验代码将从此分支创建"
```

- [ ] **Step 5: Run tests**

```bash
pnpm test
```

- [ ] **Step 6: Commit**

```bash
git commit -am "feat: base branch selection when creating experiments"
```

---

### Task 6: MCP tools — repo access + submit branch

**Files:**
- Modify: `src/mcp/tools/compute.ts`
- Modify: `packages/openclaw-plugin/src/tools/common-tool-definitions.ts`

- [ ] **Step 1: Add synapse_get_repo_access MCP tool**

In `compute.ts`, add a new tool registration:

```typescript
server.registerTool(
  "synapse_get_repo_access",
  {
    description: "Get GitHub repository credentials for a research project. Returns repoUrl, username, token, and the experiment's base branch.",
    inputSchema: z.object({
      researchProjectUuid: z.string(),
      experimentUuid: z.string().optional().describe("If provided, returns the experiment's baseBranch"),
    }),
  },
  async ({ researchProjectUuid, experimentUuid }) => {
    const project = await prisma.researchProject.findFirst({
      where: { uuid: researchProjectUuid, companyUuid: auth.companyUuid },
      select: { repoUrl: true, githubUsername: true, githubToken: true },
    });
    if (!project?.repoUrl || !project?.githubToken) {
      return { content: [{ type: "text", text: JSON.stringify({ configured: false }) }] };
    }

    let baseBranch: string | null = null;
    if (experimentUuid) {
      const experiment = await prisma.experiment.findFirst({
        where: { uuid: experimentUuid, companyUuid: auth.companyUuid },
        select: { baseBranch: true },
      });
      baseBranch = experiment?.baseBranch ?? null;
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          configured: true,
          repoUrl: project.repoUrl,
          githubUsername: project.githubUsername,
          githubToken: project.githubToken,
          baseBranch,
        }),
      }],
    };
  }
);
```

- [ ] **Step 2: Extend synapse_submit_experiment_results**

In the `synapse_submit_experiment_results` tool input schema, add:

```typescript
experimentBranch: z.string().optional().describe("Git branch name where experiment code was pushed"),
commitSha: z.string().optional().describe("Git commit SHA of the final experiment code"),
```

In the handler, pass these to `completeExperiment()`:

```typescript
const updated = await experimentService.completeExperiment({
  // ... existing fields
  experimentBranch,
  commitSha,
});
```

- [ ] **Step 3: Add tool definition to OpenClaw plugin**

In `common-tool-definitions.ts`, add:

```typescript
createPassthroughTool<{ researchProjectUuid: string; experimentUuid?: string }>({
  name: "synapse_get_repo_access",
  description: "Get GitHub repository credentials for a research project.",
  parameters: {
    type: "object",
    properties: {
      researchProjectUuid: { type: "string", description: "Research Project UUID" },
      experimentUuid: { type: "string", description: "Experiment UUID (optional, to get baseBranch)" },
    },
    required: ["researchProjectUuid"],
    additionalProperties: false,
  },
  targetToolName: "synapse_get_repo_access",
}),
```

- [ ] **Step 4: Run tests**

```bash
pnpm test
```

- [ ] **Step 5: Commit**

```bash
git commit -am "feat: synapse_get_repo_access MCP tool + branch/commit in submit results"
```

---

### Task 7: Experiment prompt — GitHub instructions

**Files:**
- Modify: `packages/openclaw-plugin/src/event-router.ts`

- [ ] **Step 1: Add GitHub instructions to experiment assigned prompt**

In `handleExperimentAssigned()`, add to the `contextLines` array (before the SSH key instruction):

```typescript
"If the project has a GitHub repo configured, call synapse_get_repo_access with researchProjectUuid and experimentUuid to get repo credentials and base branch. Clone the repo, checkout the base branch, create a new branch named experiment/{experimentUuid}-{experimentTitle} (sanitize the title for branch name), commit your code changes, and push. Include experimentBranch and commitSha when calling synapse_submit_experiment_results.",
```

- [ ] **Step 2: Bump plugin version**

In `packages/openclaw-plugin/package.json`, bump version.

- [ ] **Step 3: Commit**

```bash
git commit -am "feat: add GitHub branch instructions to experiment prompt"
```

---

### Task 8: Frontend — show branch/commit links in experiment detail

**Files:**
- Modify: `src/app/(dashboard)/research-projects/[uuid]/experiments/experiments-board.tsx`
- Modify: `messages/en.json` + `messages/zh.json`

- [ ] **Step 1: Add i18n keys**

```json
"experimentBranch": "Code Branch",
"commitSha": "Commit",
"viewOnGithub": "View on GitHub"
```

Chinese:

```json
"experimentBranch": "代码分支",
"commitSha": "提交",
"viewOnGithub": "在 GitHub 上查看"
```

- [ ] **Step 2: Ensure experiment data includes branch fields**

Check the experiment detail data fetching in `experiments-board.tsx`. The experiment object needs `baseBranch`, `experimentBranch`, `commitSha`, and the project's `repoUrl`. Verify these are included in the query/API response.

- [ ] **Step 3: Add branch/commit display to experiment detail panel**

In the experiment detail panel (inside `experiments-board.tsx`), when `experiment.experimentBranch` is set, show:

```tsx
{experiment.experimentBranch && (
  <div className="flex items-center gap-2">
    <GitBranch className="h-4 w-4 text-muted-foreground" />
    <a
      href={`${repoUrl}/tree/${experiment.experimentBranch}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm text-primary hover:underline"
    >
      {experiment.experimentBranch}
    </a>
    {experiment.commitSha && (
      <a
        href={`${repoUrl}/commit/${experiment.commitSha}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-xs text-muted-foreground hover:text-primary"
      >
        {experiment.commitSha.slice(0, 7)}
      </a>
    )}
  </div>
)}
```

Import `GitBranch` from lucide-react.

- [ ] **Step 4: Run tests**

```bash
pnpm test
```

- [ ] **Step 5: Commit**

```bash
git commit -am "feat: show experiment branch and commit links in detail panel"
```

---

### Task 9: Sync, deploy, push

**Files:** (no code changes)

- [ ] **Step 1: Sync to remote**

```bash
rsync -avz --delete --exclude node_modules --exclude .next --exclude .git . synapse:/home/ubuntu/Synapse/
```

- [ ] **Step 2: Generate Prisma and push schema**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && pnpm db:generate && DATABASE_URL="postgresql://synapse:synapse@localhost:5432/synapse" npx prisma db push'
```

- [ ] **Step 3: Run tests on remote**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && pnpm test'
```

- [ ] **Step 4: Publish OpenClaw plugin**

```bash
ssh synapse 'cd /home/ubuntu/Synapse/packages/openclaw-plugin && npm publish --access public'
ssh openclaw '... install + restart'
```

- [ ] **Step 5: Commit and push**

```bash
ssh synapse 'cd /home/ubuntu/Synapse && git add -A && git commit -m "feat: GitHub experiment branches — repo config, branch tracking, agent push" && git push'
```

- [ ] **Step 6: Pull locally**

```bash
git pull
```
