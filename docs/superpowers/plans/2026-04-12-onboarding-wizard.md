# Onboarding Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guide new Synapse users through Agent creation, Agent connectivity verification, and Compute setup in a dedicated `/onboarding` wizard, with a persistent sidebar progress indicator.

**Architecture:** Standalone `/onboarding` page (outside dashboard layout) with a 3-step wizard. Dashboard layout gains an `OnboardingProgress` sidebar component and auto-redirect logic. A new lightweight `/api/onboarding/status` endpoint provides setup state. Agent session creation emits SSE events for real-time connectivity detection.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS 4, shadcn/Radix UI, next-intl, EventBus SSE

---

### Task 1: Backend — Onboarding Status Endpoint

**Files:**
- Create: `src/app/api/onboarding/status/route.ts`

- [ ] **Step 1: Create the status route**

```ts
// src/app/api/onboarding/status/route.ts
import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { success, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) return errors.unauthorized();
  if (!isUser(auth)) return errors.forbidden("Only users can check onboarding status");

  const [agentCount, sessionCount, poolCount, projectCount] = await Promise.all([
    prisma.agent.count({ where: { companyUuid: auth.companyUuid, ownerUuid: auth.actorUuid } }),
    prisma.agentSession.count({ where: { companyUuid: auth.companyUuid, agent: { ownerUuid: auth.actorUuid } } }),
    prisma.computePool.count({ where: { companyUuid: auth.companyUuid } }),
    prisma.researchProject.count({ where: { companyUuid: auth.companyUuid } }),
  ]);

  return success({
    hasAgent: agentCount > 0,
    hasAgentSession: sessionCount > 0,
    hasComputePool: poolCount > 0,
    hasProject: projectCount > 0,
  });
});
```

- [ ] **Step 2: Verify the endpoint works**

Run: `curl -s http://localhost:3000/api/onboarding/status -H "Cookie: <session_cookie>" | jq`

Expected: `{ "success": true, "data": { "hasAgent": false, "hasAgentSession": false, "hasComputePool": false, "hasProject": false } }`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/onboarding/status/route.ts
git commit -m "feat: add onboarding status endpoint"
```

---

### Task 2: Backend — Emit SSE Event on Session Creation

**Files:**
- Modify: `src/services/session.service.ts:87-100`
- Modify: `src/lib/event-bus.ts:11` (add `agent_session` to entityType union)

- [ ] **Step 1: Add `agent_session` to the RealtimeEvent entityType union**

In `src/lib/event-bus.ts`, update the `entityType` union:

```ts
// Before:
entityType: "experiment" | "experiment_run" | "research_question" | "experiment_design" | "document" | "research_project" | "related_work";

// After:
entityType: "experiment" | "experiment_run" | "research_question" | "experiment_design" | "document" | "research_project" | "related_work" | "agent_session";
```

- [ ] **Step 2: Add emitChange to createSession**

In `src/services/session.service.ts`, add the event emission after session creation (inside `createSession`, after the prisma create, before the return):

```ts
export async function createSession(params: SessionCreateParams): Promise<SessionResponse> {
  const session = await prisma.agentSession.create({
    data: {
      companyUuid: params.companyUuid,
      agentUuid: params.agentUuid,
      name: params.name,
      description: params.description ?? null,
      status: "active",
      expiresAt: params.expiresAt ?? null,
    },
  });

  eventBus.emitChange({
    companyUuid: params.companyUuid,
    researchProjectUuid: "",
    entityType: "agent_session",
    entityUuid: session.uuid,
    action: "created",
    actorUuid: params.agentUuid,
  });

  return formatSessionResponse(session);
}
```

- [ ] **Step 3: Verify SSE event fires**

Start dev server, create a session via API, check that `/api/events` stream receives an `agent_session` created event.

- [ ] **Step 4: Commit**

```bash
git add src/lib/event-bus.ts src/services/session.service.ts
git commit -m "feat: emit SSE event on agent session creation"
```

---

### Task 3: i18n — Add Onboarding Keys

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1: Add onboarding namespace to en.json**

Add the following under the top level of `messages/en.json` (after any existing top-level key, e.g. after `"settings"`):

```json
"onboarding": {
  "skipSetup": "Skip setup",
  "skip": "Skip",
  "next": "Next",
  "back": "Back",
  "stepOf": "Step {current} of {total}",

  "step1": {
    "title": "Create Your First Agent",
    "subtitle": "An agent is an AI assistant that runs experiments and searches literature on your behalf.",
    "nameLabel": "Agent Name",
    "namePlaceholder": "e.g. Research Assistant",
    "typeLabel": "Agent Type",
    "typeClaudeCode": "Claude Code",
    "typeClaudeCodeDesc": "Discovers tasks at session start via checkin",
    "typeOpenClaw": "OpenClaw",
    "typeOpenClawDesc": "Receives tasks in real-time via SSE",
    "rolesLabel": "Permissions",
    "rolePreResearch": "Literature Search",
    "roleResearch": "Research Questions",
    "roleExperiment": "Experiments",
    "roleReport": "Reports",
    "roleAdmin": "Admin",
    "createAgent": "Create Agent"
  },

  "step2": {
    "title": "Connect Your Agent",
    "subtitle": "Configure your agent with the API key and endpoint below, then test the connection.",
    "apiKeyLabel": "API Key",
    "apiKeyWarning": "This key is shown only once. Copy it now.",
    "endpointLabel": "MCP Endpoint",
    "configTitle": "Configuration",
    "configClaudeCode": "Add this MCP server to your Claude Code settings:",
    "configOpenClaw": "Install the Synapse plugin in your OpenClaw gateway:",
    "testConnection": "I've configured the agent — Test Connection",
    "waiting": "Waiting for agent to connect...",
    "waitingHint": "Start your agent with the configuration above. This page will detect the connection automatically.",
    "connected": "Agent connected!",
    "timeout": "No connection detected. Please check your agent configuration.",
    "retry": "Retry"
  },

  "step3": {
    "title": "Set Up Compute",
    "subtitle": "Create a compute pool and add a machine so agents can run GPU workloads.",
    "poolPhase": "Create Compute Pool",
    "poolNameLabel": "Pool Name",
    "poolNamePlaceholder": "e.g. GPU Cluster",
    "poolDescLabel": "Description",
    "poolDescPlaceholder": "Optional description",
    "createPool": "Create Pool",
    "machinePhase": "Add Machine",
    "hostLabel": "Hostname / IP",
    "hostPlaceholder": "e.g. 10.0.1.5",
    "userLabel": "SSH User",
    "portLabel": "SSH Port",
    "authLabel": "Authentication",
    "authPassword": "Password",
    "authKey": "SSH Key",
    "passwordPlaceholder": "SSH password",
    "keyPlaceholder": "Paste private key content here",
    "gpuCountLabel": "GPU Count",
    "gpuCountHint": "Optional — auto-detected after first telemetry",
    "addMachine": "Add Machine"
  },

  "complete": {
    "title": "Setup Complete!",
    "summary": "Created {agentCount} agent, {poolCount} compute pool, and {nodeCount} machine.",
    "redirecting": "Redirecting to projects..."
  },

  "sidebar": {
    "setupProgress": "Setup Progress",
    "agentConfigured": "Agent configured",
    "computeConfigured": "Compute configured",
    "completeSetup": "Complete setup"
  }
}
```

- [ ] **Step 2: Add onboarding namespace to zh.json**

Add the following under the top level of `messages/zh.json`:

```json
"onboarding": {
  "skipSetup": "跳过设置",
  "skip": "跳过",
  "next": "下一步",
  "back": "上一步",
  "stepOf": "第 {current} 步，共 {total} 步",

  "step1": {
    "title": "创建你的第一个 Agent",
    "subtitle": "Agent 是一个 AI 助手，可以代替你运行实验和搜索文献。",
    "nameLabel": "Agent 名称",
    "namePlaceholder": "例如：研究助手",
    "typeLabel": "Agent 类型",
    "typeClaudeCode": "Claude Code",
    "typeClaudeCodeDesc": "通过 checkin 在会话开始时获取任务",
    "typeOpenClaw": "OpenClaw",
    "typeOpenClawDesc": "通过 SSE 实时接收任务",
    "rolesLabel": "权限",
    "rolePreResearch": "文献搜索",
    "roleResearch": "研究问题",
    "roleExperiment": "实验",
    "roleReport": "报告",
    "roleAdmin": "管理员",
    "createAgent": "创建 Agent"
  },

  "step2": {
    "title": "连接你的 Agent",
    "subtitle": "使用以下 API Key 和端点配置你的 Agent，然后测试连接。",
    "apiKeyLabel": "API Key",
    "apiKeyWarning": "此密钥仅显示一次，请立即复制。",
    "endpointLabel": "MCP 端点",
    "configTitle": "配置方法",
    "configClaudeCode": "将此 MCP 服务器添加到你的 Claude Code 设置中：",
    "configOpenClaw": "在 OpenClaw 网关中安装 Synapse 插件：",
    "testConnection": "已配置完成，测试连接",
    "waiting": "等待 Agent 连接...",
    "waitingHint": "使用上面的配置启动你的 Agent。此页面将自动检测连接。",
    "connected": "Agent 已连接！",
    "timeout": "未检测到连接，请检查 Agent 配置。",
    "retry": "重试"
  },

  "step3": {
    "title": "设置算力",
    "subtitle": "创建算力池并添加机器，以便 Agent 运行 GPU 任务。",
    "poolPhase": "创建算力池",
    "poolNameLabel": "算力池名称",
    "poolNamePlaceholder": "例如：GPU 集群",
    "poolDescLabel": "描述",
    "poolDescPlaceholder": "可选描述",
    "createPool": "创建算力池",
    "machinePhase": "添加机器",
    "hostLabel": "主机名 / IP",
    "hostPlaceholder": "例如：10.0.1.5",
    "userLabel": "SSH 用户名",
    "portLabel": "SSH 端口",
    "authLabel": "认证方式",
    "authPassword": "密码",
    "authKey": "SSH 密钥",
    "passwordPlaceholder": "SSH 密码",
    "keyPlaceholder": "在此粘贴私钥内容",
    "gpuCountLabel": "GPU 数量",
    "gpuCountHint": "可选 — 首次遥测后自动检测",
    "addMachine": "添加机器"
  },

  "complete": {
    "title": "设置完成！",
    "summary": "已创建 {agentCount} 个 Agent、{poolCount} 个算力池和 {nodeCount} 台机器。",
    "redirecting": "正在跳转到项目页..."
  },

  "sidebar": {
    "setupProgress": "设置进度",
    "agentConfigured": "Agent 已配置",
    "computeConfigured": "算力已配置",
    "completeSetup": "完成设置"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add messages/en.json messages/zh.json
git commit -m "feat: add onboarding i18n keys (en + zh)"
```

---

### Task 4: Frontend — Onboarding Page Layout & Step Indicator

**Files:**
- Create: `src/app/onboarding/layout.tsx`
- Create: `src/app/onboarding/page.tsx`

- [ ] **Step 1: Create the onboarding layout (standalone, no sidebar)**

```tsx
// src/app/onboarding/layout.tsx
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        {children}
      </div>
    </NextIntlClientProvider>
  );
}
```

- [ ] **Step 2: Create the wizard page with step indicator and state management**

```tsx
// src/app/onboarding/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { authFetch } from "@/lib/auth-client";
import { OnboardingStep1 } from "./step1-agent";
import { OnboardingStep2 } from "./step2-connect";
import { OnboardingStep3 } from "./step3-compute";

interface OnboardingStatus {
  hasAgent: boolean;
  hasAgentSession: boolean;
  hasComputePool: boolean;
  hasProject: boolean;
}

interface WizardState {
  agentUuid: string | null;
  agentName: string | null;
  agentType: string | null;
  apiKey: string | null;
  poolUuid: string | null;
  nodeAdded: boolean;
}

const TOTAL_STEPS = 3;

export default function OnboardingPage() {
  const router = useRouter();
  const t = useTranslations("onboarding");
  const [currentStep, setCurrentStep] = useState(1);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [wizardState, setWizardState] = useState<WizardState>({
    agentUuid: null,
    agentName: null,
    agentType: null,
    apiKey: null,
    poolUuid: null,
    nodeAdded: false,
  });

  // Fetch onboarding status to determine initial step
  useEffect(() => {
    authFetch("/api/onboarding/status")
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          const s: OnboardingStatus = json.data;
          setStatus(s);
          // Auto-advance to first incomplete step
          if (s.hasAgent && s.hasAgentSession && s.hasComputePool) {
            // Everything done, go to projects
            router.replace("/research-projects");
          } else if (s.hasAgent && s.hasAgentSession) {
            setCurrentStep(3);
          } else if (s.hasAgent) {
            setCurrentStep(2);
          }
        }
      })
      .catch(() => {});
  }, [router]);

  const handleSkipAll = () => {
    router.push("/research-projects");
  };

  const handleStep1Complete = (agentUuid: string, agentName: string, agentType: string) => {
    setWizardState((prev) => ({ ...prev, agentUuid, agentName, agentType }));
    setCurrentStep(2);
  };

  const handleStep2Complete = () => {
    setCurrentStep(3);
  };

  const handleStep3Complete = useCallback((poolUuid: string) => {
    setWizardState((prev) => ({ ...prev, poolUuid, nodeAdded: true }));
    // Show completion briefly, then redirect
    setTimeout(() => {
      router.push("/research-projects");
    }, 3000);
  }, [router]);

  const handleSkipStep = () => {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(currentStep + 1);
    } else {
      router.push("/research-projects");
    }
  };

  if (!status) {
    return null; // Loading
  }

  const stepDone = (step: number) => {
    if (step === 1) return status.hasAgent || !!wizardState.agentUuid;
    if (step === 2) return status.hasAgentSession;
    if (step === 3) return status.hasComputePool || wizardState.nodeAdded;
    return false;
  };

  const isComplete = wizardState.nodeAdded;

  return (
    <div className="w-full max-w-[600px]">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Image src="/synapse-icon.png" alt="Synapse" width={28} height={28} />
          <span className="text-base font-semibold text-foreground">Synapse</span>
        </div>
        {!isComplete && (
          <Button variant="ghost" size="sm" onClick={handleSkipAll} className="text-muted-foreground">
            {t("skipSetup")}
          </Button>
        )}
      </div>

      {/* Step indicator */}
      <div className="mb-8 flex items-center justify-center gap-2">
        {[1, 2, 3].map((step) => (
          <div key={step} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                stepDone(step)
                  ? "bg-green-600 text-white"
                  : step === currentStep
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {stepDone(step) ? <Check className="h-4 w-4" /> : step}
            </div>
            {step < TOTAL_STEPS && (
              <div className={`h-px w-12 ${stepDone(step) ? "bg-green-600" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      {isComplete ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">{t("complete.title")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("complete.summary", { agentCount: 1, poolCount: 1, nodeCount: 1 })}
          </p>
          <p className="mt-4 text-xs text-muted-foreground">{t("complete.redirecting")}</p>
        </div>
      ) : (
        <>
          {currentStep === 1 && (
            <OnboardingStep1
              onComplete={handleStep1Complete}
              onSkip={handleSkipStep}
            />
          )}
          {currentStep === 2 && (
            <OnboardingStep2
              agentUuid={wizardState.agentUuid}
              agentName={wizardState.agentName}
              agentType={wizardState.agentType}
              onComplete={handleStep2Complete}
              onSkip={handleSkipStep}
            />
          )}
          {currentStep === 3 && (
            <OnboardingStep3
              onComplete={handleStep3Complete}
              onSkip={handleSkipStep}
            />
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/layout.tsx src/app/onboarding/page.tsx
git commit -m "feat: add onboarding wizard page with layout and step indicator"
```

---

### Task 5: Frontend — Step 1 (Create Agent)

**Files:**
- Create: `src/app/onboarding/step1-agent.tsx`

- [ ] **Step 1: Create the Step 1 component**

```tsx
// src/app/onboarding/step1-agent.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Terminal, Radio } from "lucide-react";
import { authFetch } from "@/lib/auth-client";

interface Props {
  onComplete: (agentUuid: string, agentName: string, agentType: string) => void;
  onSkip: () => void;
}

const ROLES = [
  { value: "pre_research", key: "rolePreResearch" },
  { value: "research", key: "roleResearch" },
  { value: "experiment", key: "roleExperiment" },
  { value: "report", key: "roleReport" },
  { value: "admin", key: "roleAdmin" },
] as const;

const DEFAULT_ROLES = ["pre_research", "research", "experiment"];

export function OnboardingStep1({ onComplete, onSkip }: Props) {
  const t = useTranslations("onboarding.step1");
  const tCommon = useTranslations("onboarding");
  const [name, setName] = useState("");
  const [type, setType] = useState("claude_code");
  const [roles, setRoles] = useState<string[]>(DEFAULT_ROLES);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleRole = (role: string) => {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await authFetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), type, roles }),
      });
      const json = await res.json();
      if (json.success) {
        onComplete(json.data.uuid, json.data.name, json.data.type);
      } else {
        setError(json.error || "Failed to create agent");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>

      <div className="mt-6 space-y-5">
        {/* Name */}
        <div>
          <Label htmlFor="agent-name">{t("nameLabel")}</Label>
          <Input
            id="agent-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            className="mt-1.5"
          />
        </div>

        {/* Type */}
        <div>
          <Label>{t("typeLabel")}</Label>
          <div className="mt-1.5 grid grid-cols-2 gap-3">
            {[
              { value: "claude_code", label: t("typeClaudeCode"), desc: t("typeClaudeCodeDesc"), icon: Terminal },
              { value: "openclaw", label: t("typeOpenClaw"), desc: t("typeOpenClawDesc"), icon: Radio },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                className={`flex flex-col items-start rounded-lg border p-3 text-left transition-colors ${
                  type === opt.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <opt.icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{opt.label}</span>
                </div>
                <span className="mt-1 text-xs text-muted-foreground">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Roles */}
        <div>
          <Label>{t("rolesLabel")}</Label>
          <div className="mt-1.5 space-y-2">
            {ROLES.map((role) => (
              <label key={role.value} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={roles.includes(role.value)}
                  onCheckedChange={() => toggleRole(role.value)}
                />
                <span className="text-foreground">{t(role.key)}</span>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </div>

      {/* Actions */}
      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground">
          {tCommon("skip")}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!name.trim() || roles.length === 0 || submitting}
          className="bg-primary text-primary-foreground"
        >
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("createAgent")}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the component renders**

Start dev server, navigate to `/onboarding`. Step 1 form should render with name input, type cards, and role checkboxes.

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/step1-agent.tsx
git commit -m "feat: add onboarding step 1 — create agent form"
```

---

### Task 6: Frontend — Step 2 (API Key & Connect)

**Files:**
- Create: `src/app/onboarding/step2-connect.tsx`

- [ ] **Step 1: Create the Step 2 component**

```tsx
// src/app/onboarding/step2-connect.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Check, Copy, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { authFetch } from "@/lib/auth-client";

interface Props {
  agentUuid: string | null;
  agentName: string | null;
  agentType: string | null;
  onComplete: () => void;
  onSkip: () => void;
}

type Phase = "configure" | "waiting" | "connected" | "timeout";

const TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 5_000;

export function OnboardingStep2({ agentUuid, agentName, agentType, onComplete, onSkip }: Props) {
  const t = useTranslations("onboarding.step2");
  const tCommon = useTranslations("onboarding");
  const [phase, setPhase] = useState<Phase>("configure");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [endpointCopied, setEndpointCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  const endpoint = typeof window !== "undefined" ? `${window.location.origin}/api/mcp` : "/api/mcp";

  // Generate API key on mount if we have an agent
  useEffect(() => {
    if (!agentUuid) return;
    authFetch("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentUuid, name: "onboarding-key" }),
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setApiKey(json.data.key);
        } else {
          setError(json.error || "Failed to create API key");
        }
      })
      .catch(() => setError("Failed to create API key"));
  }, [agentUuid]);

  const copyToClipboard = (text: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const cleanup = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
  }, []);

  const handleConnected = useCallback(() => {
    cleanup();
    setPhase("connected");
    setTimeout(() => onComplete(), 2000);
  }, [cleanup, onComplete]);

  const startWaiting = useCallback(() => {
    setPhase("waiting");
    cleanup();

    // SSE listener (primary)
    const es = new EventSource("/api/events");
    sseRef.current = es;
    es.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data);
        if (
          event.entityType === "agent_session" &&
          event.action === "created" &&
          event.actorUuid === agentUuid
        ) {
          handleConnected();
        }
      } catch {
        // ignore
      }
    };

    // Polling fallback
    pollRef.current = setInterval(async () => {
      try {
        const res = await authFetch(`/api/onboarding/status`);
        const json = await res.json();
        if (json.success && json.data.hasAgentSession) {
          handleConnected();
        }
      } catch {
        // ignore
      }
    }, POLL_INTERVAL_MS);

    // Timeout
    timeoutRef.current = setTimeout(() => {
      cleanup();
      setPhase("timeout");
    }, TIMEOUT_MS);
  }, [agentUuid, cleanup, handleConnected]);

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup]);

  // If no agent was created (user skipped step 1 but has existing agents), 
  // try to fetch first agent info
  useEffect(() => {
    if (agentUuid) return;
    authFetch("/api/agents?pageSize=1")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data?.data?.length > 0) {
          // We have an existing agent but no key generated in this session.
          // Skip to waiting or show minimal config info.
        }
      })
      .catch(() => {});
  }, [agentUuid]);

  const claudeCodeConfig = apiKey
    ? `claude mcp add synapse \\
  --transport http \\
  --url ${endpoint} \\
  --header "Authorization: Bearer ${apiKey}"`
    : "";

  const openClawConfig = apiKey
    ? `# In your OpenClaw plugin config:
SYNAPSE_URL=${typeof window !== "undefined" ? window.location.origin : ""}
SYNAPSE_API_KEY=${apiKey}`
    : "";

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>

      {phase === "configure" && (
        <div className="mt-6 space-y-4">
          {/* API Key */}
          {apiKey && (
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("apiKeyLabel")}
              </label>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs font-mono text-foreground break-all">
                  {apiKey}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => copyToClipboard(apiKey, setKeyCopied)}
                >
                  {keyCopied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <p className="mt-1 text-xs text-amber-600">{t("apiKeyWarning")}</p>
            </div>
          )}

          {/* Endpoint */}
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("endpointLabel")}
            </label>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs font-mono text-foreground">
                {endpoint}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => copyToClipboard(endpoint, setEndpointCopied)}
              >
                {endpointCopied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          {/* Config snippet */}
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("configTitle")}
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              {agentType === "openclaw" ? t("configOpenClaw") : t("configClaudeCode")}
            </p>
            <pre className="mt-2 rounded-lg border border-border bg-muted/50 p-3 text-xs font-mono text-foreground whitespace-pre-wrap break-all">
              {agentType === "openclaw" ? openClawConfig : claudeCodeConfig}
            </pre>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground">
              {tCommon("skip")}
            </Button>
            <Button onClick={startWaiting} disabled={!apiKey} className="bg-primary text-primary-foreground">
              {t("testConnection")}
            </Button>
          </div>
        </div>
      )}

      {phase === "waiting" && (
        <div className="mt-8 flex flex-col items-center gap-3 py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-foreground">
            {t("waiting")}
          </p>
          <p className="text-xs text-muted-foreground text-center max-w-sm">
            {t("waitingHint")}
          </p>
          <Button variant="ghost" size="sm" onClick={onSkip} className="mt-4 text-muted-foreground">
            {tCommon("skip")}
          </Button>
        </div>
      )}

      {phase === "connected" && (
        <div className="mt-8 flex flex-col items-center gap-3 py-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <p className="text-sm font-semibold text-green-700">{t("connected")}</p>
          {agentName && (
            <p className="text-xs text-muted-foreground">{agentName}</p>
          )}
        </div>
      )}

      {phase === "timeout" && (
        <div className="mt-8 flex flex-col items-center gap-3 py-8">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <p className="text-sm font-medium text-foreground">{t("timeout")}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={startWaiting}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              {t("retry")}
            </Button>
            <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground">
              {tCommon("skip")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify Step 2 renders and API key is generated**

Navigate to `/onboarding`, create an agent in step 1, verify step 2 shows API key + endpoint + config snippet.

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/step2-connect.tsx
git commit -m "feat: add onboarding step 2 — API key, config guide, SSE connection wait"
```

---

### Task 7: Frontend — Step 3 (Compute Setup)

**Files:**
- Create: `src/app/onboarding/step3-compute.tsx`

- [ ] **Step 1: Create the Step 3 component**

```tsx
// src/app/onboarding/step3-compute.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Check, Server, HardDrive } from "lucide-react";
import { authFetch } from "@/lib/auth-client";

interface Props {
  onComplete: (poolUuid: string) => void;
  onSkip: () => void;
}

type Phase = "pool" | "machine" | "done";

export function OnboardingStep3({ onComplete, onSkip }: Props) {
  const t = useTranslations("onboarding.step3");
  const tCommon = useTranslations("onboarding");
  const [phase, setPhase] = useState<Phase>("pool");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pool form
  const [poolName, setPoolName] = useState("");
  const [poolDesc, setPoolDesc] = useState("");
  const [poolUuid, setPoolUuid] = useState<string | null>(null);

  // Machine form
  const [host, setHost] = useState("");
  const [sshUser, setSshUser] = useState("ubuntu");
  const [sshPort, setSshPort] = useState("22");
  const [authMethod, setAuthMethod] = useState<"password" | "key">("key");
  const [password, setPassword] = useState("");
  const [sshKey, setSshKey] = useState("");

  const handleCreatePool = async () => {
    if (!poolName.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await authFetch("/api/compute-pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: poolName.trim(), description: poolDesc.trim() || undefined }),
      });
      const json = await res.json();
      if (json.success) {
        setPoolUuid(json.data.pool.uuid);
        setPhase("machine");
      } else {
        setError(json.error || "Failed to create pool");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddMachine = async () => {
    if (!host.trim() || !poolUuid) return;
    setSubmitting(true);
    setError(null);

    try {
      // For SSH key auth, we upload via FormData
      const formData = new FormData();
      formData.append("poolUuid", poolUuid);
      formData.append("sshHost", host.trim());
      formData.append("sshUser", sshUser.trim() || "ubuntu");
      formData.append("sshPort", sshPort || "22");
      formData.append("label", host.trim());

      if (authMethod === "key" && sshKey.trim()) {
        // Create a File from the pasted key content
        const keyBlob = new Blob([sshKey], { type: "application/x-pem-file" });
        const keyFile = new File([keyBlob], `${host.trim()}.pem`, { type: "application/x-pem-file" });
        formData.append("pemFile", keyFile);
        formData.append("sshKeySource", "upload");
      }
      // Note: password-based SSH auth is not currently supported by the compute-nodes API.
      // For onboarding, we focus on SSH key auth. Password field is UI-only placeholder.

      const res = await authFetch("/api/compute-nodes", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (json.success) {
        setPhase("done");
        onComplete(poolUuid);
      } else {
        setError(json.error || "Failed to add machine");
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>

      {phase === "pool" && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-primary">
            <Server className="h-3.5 w-3.5" />
            {t("poolPhase")}
          </div>
          <div>
            <Label htmlFor="pool-name">{t("poolNameLabel")}</Label>
            <Input
              id="pool-name"
              value={poolName}
              onChange={(e) => setPoolName(e.target.value)}
              placeholder={t("poolNamePlaceholder")}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="pool-desc">{t("poolDescLabel")}</Label>
            <Input
              id="pool-desc"
              value={poolDesc}
              onChange={(e) => setPoolDesc(e.target.value)}
              placeholder={t("poolDescPlaceholder")}
              className="mt-1.5"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground">
              {tCommon("skip")}
            </Button>
            <Button onClick={handleCreatePool} disabled={!poolName.trim() || submitting} className="bg-primary text-primary-foreground">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("createPool")}
            </Button>
          </div>
        </div>
      )}

      {phase === "machine" && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-primary">
            <HardDrive className="h-3.5 w-3.5" />
            {t("machinePhase")}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <Label htmlFor="ssh-host">{t("hostLabel")}</Label>
              <Input
                id="ssh-host"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder={t("hostPlaceholder")}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="ssh-user">{t("userLabel")}</Label>
              <Input
                id="ssh-user"
                value={sshUser}
                onChange={(e) => setSshUser(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>

          <div className="w-24">
            <Label htmlFor="ssh-port">{t("portLabel")}</Label>
            <Input
              id="ssh-port"
              value={sshPort}
              onChange={(e) => setSshPort(e.target.value)}
              className="mt-1.5"
            />
          </div>

          {/* Auth method */}
          <div>
            <Label>{t("authLabel")}</Label>
            <div className="mt-1.5 flex gap-2">
              {(["key", "password"] as const).map((method) => (
                <Button
                  key={method}
                  type="button"
                  variant={authMethod === method ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setAuthMethod(method)}
                  className="text-xs"
                >
                  {method === "key" ? t("authKey") : t("authPassword")}
                </Button>
              ))}
            </div>
          </div>

          {authMethod === "password" ? (
            <div>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("passwordPlaceholder")}
              />
            </div>
          ) : (
            <div>
              <Textarea
                value={sshKey}
                onChange={(e) => setSshKey(e.target.value)}
                placeholder={t("keyPlaceholder")}
                rows={4}
                className="font-mono text-xs"
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground">
              {tCommon("skip")}
            </Button>
            <Button onClick={handleAddMachine} disabled={!host.trim() || submitting} className="bg-primary text-primary-foreground">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("addMachine")}
            </Button>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="mt-8 flex flex-col items-center gap-3 py-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <Check className="h-6 w-6 text-green-600" />
          </div>
          <p className="text-sm font-semibold text-green-700">{t("machinePhase")} — Done!</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify full wizard flow**

Navigate to `/onboarding`, walk through all 3 steps: create agent → see API key → skip connection test → create pool → add machine (can use dummy data). Verify completion screen and redirect.

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/step3-compute.tsx
git commit -m "feat: add onboarding step 3 — compute pool and machine setup"
```

---

### Task 8: Frontend — Sidebar Onboarding Progress Indicator

**Files:**
- Create: `src/components/onboarding-progress.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Create the OnboardingProgress component**

```tsx
// src/components/onboarding-progress.tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Check, X, ArrowRight } from "lucide-react";
import { authFetch } from "@/lib/auth-client";

interface OnboardingStatus {
  hasAgent: boolean;
  hasComputePool: boolean;
}

export function OnboardingProgress() {
  const t = useTranslations("onboarding.sidebar");
  const [status, setStatus] = useState<OnboardingStatus | null>(null);

  useEffect(() => {
    authFetch("/api/onboarding/status")
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setStatus({ hasAgent: json.data.hasAgent, hasComputePool: json.data.hasComputePool });
        }
      })
      .catch(() => {});
  }, []);

  // Don't render if status unknown or everything is set up
  if (!status || (status.hasAgent && status.hasComputePool)) {
    return null;
  }

  const items = [
    { label: t("agentConfigured"), done: status.hasAgent },
    { label: t("computeConfigured"), done: status.hasComputePool },
  ];

  return (
    <Link href="/onboarding">
      <div className="mx-3 mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 transition-colors hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/30 dark:hover:bg-amber-950/50 cursor-pointer">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            {t("setupProgress")}
          </span>
          <ArrowRight className="h-3 w-3 text-amber-600 dark:text-amber-500" />
        </div>
        <div className="mt-2 space-y-1">
          {items.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5 text-[11px]">
              {item.done ? (
                <Check className="h-3 w-3 text-green-600" />
              ) : (
                <X className="h-3 w-3 text-amber-500" />
              )}
              <span className={item.done ? "text-muted-foreground line-through" : "text-foreground"}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Add OnboardingProgress to dashboard sidebar**

In `src/app/(dashboard)/layout.tsx`, import the component at the top:

```ts
import { OnboardingProgress } from "@/components/onboarding-progress";
```

Then in the `SidebarContent` component, add `<OnboardingProgress />` just before the User Profile section. Find this code (around line 393):

```tsx
      {/* User Profile */}
      <div className="p-6">
```

Insert the component before it:

```tsx
      <OnboardingProgress />
      {/* User Profile */}
      <div className="p-6">
```

- [ ] **Step 3: Verify sidebar indicator appears when setup is incomplete**

Navigate to `/research-projects`. If no agents or compute pools exist, the amber "Setup Progress" card should appear in the sidebar above the user profile. Clicking it should navigate to `/onboarding`.

- [ ] **Step 4: Commit**

```bash
git add src/components/onboarding-progress.tsx src/app/\(dashboard\)/layout.tsx
git commit -m "feat: add onboarding progress indicator to sidebar"
```

---

### Task 9: Frontend — Auto-Redirect to Onboarding

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Add auto-redirect logic to dashboard layout**

In `src/app/(dashboard)/layout.tsx`, add a new state and effect. After the existing `fetchProjects` function (around line 155), add:

```ts
  // Auto-redirect to onboarding for brand-new users
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  useEffect(() => {
    if (!user || onboardingChecked) return;
    authFetch("/api/onboarding/status")
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          const s = json.data;
          if (!s.hasAgent && !s.hasComputePool && !s.hasProject) {
            router.replace("/onboarding");
          }
        }
      })
      .catch(() => {})
      .finally(() => setOnboardingChecked(true));
  }, [user, onboardingChecked, router]);
```

Also add `onboardingChecked` to the state declarations area (near line 63):

No additional state declaration needed — it's already in the code block above with `useState(false)`.

- [ ] **Step 2: Verify auto-redirect works**

With a fresh user (no agents, no pools, no projects), navigate to `/research-projects`. Should auto-redirect to `/onboarding`.

- [ ] **Step 3: Verify no redirect when user has data**

With existing data (at least one project or agent), navigate to `/research-projects`. Should stay on the page, no redirect.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/layout.tsx
git commit -m "feat: auto-redirect new users to onboarding wizard"
```

---

### Task 10: Integration Test & Polish

**Files:**
- All onboarding files from previous tasks

- [ ] **Step 1: Full flow test**

Walk through the complete flow:
1. Fresh user → auto-redirected to `/onboarding`
2. Create agent → advances to step 2
3. API key shown, config snippet displayed → click "Test Connection"
4. Skip the connection wait → advances to step 3
5. Create compute pool → add machine form appears
6. Add machine (dummy data) → completion screen → redirect to `/research-projects`
7. Sidebar no longer shows setup progress (since agent + pool exist)

- [ ] **Step 2: Skip flow test**

1. Fresh user → `/onboarding`
2. Click "Skip setup" → goes to `/research-projects`
3. Sidebar still shows "Setup Progress" indicator
4. Click sidebar indicator → returns to `/onboarding`
5. Next visit to `/research-projects` → no auto-redirect (because sidebar click means user was on a dashboard page, which means at least the onboarding check ran)

- [ ] **Step 3: Re-entry flow test**

1. Complete step 1 only (create agent), then navigate away
2. Return to `/onboarding` → step 1 shows green check, wizard starts at step 2

- [ ] **Step 4: Fix any issues found during testing**

Address any bugs or UX issues found during the test flows.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "fix: onboarding integration polish"
```
