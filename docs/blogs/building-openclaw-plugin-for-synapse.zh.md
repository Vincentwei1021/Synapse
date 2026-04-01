# 为 Synapse 构建 OpenClaw Plugin：SSE + MCP 驱动的自主研究 Agent

你有没有遇到过这种情况：AI Agent 明明有能力跑实验、分析结果、提出后续方案，却在那里闲着——因为它根本不知道实验队列里已经堆满了任务。它不知道三分钟前有人把一个实验分配给了它，也看不到有人 @它问进度。一个完全有能力的研究员，被锁在了隔音室里。

本文分享三个可以直接拿走的模式：**双通道架构**（SSE 感知事件，MCP 执行操作）、**Prompt 驱动行为**（用消息模板引导 Agent 自主决策，而非硬编码状态机）、以及**声明式工具桥接**（统一的 `createPassthroughTool` 模式将 45 个 MCP 工具暴露为 Agent 原生工具）。以 [Synapse](https://github.com/Vincentwei1021/Synapse) x [OpenClaw](https://openclaw.ai) 集成作为实战案例。

---

## 摘要

1. **SSE + MCP 天然配对** -- Synapse 通过 SSE 推送实时通知（与 Web UI 使用同一条事件流），并通过 MCP 暴露 45 个工具供 Agent 调用。Plugin 同时连接两个通道：SSE 告诉 Agent *什么时候该行动*，MCP 告诉它*怎么行动*。
2. **`/hooks/agent` 唤醒机制** -- 当事件到达时，Plugin 调用 OpenClaw 的 `/hooks/agent` 端点，创建一个隔离的 Agent 回合，Synapse 的任务分配作为主 Prompt。Agent 看到的是一个聚焦的任务，而不是一条可能被忽略的旁路通知。
3. **声明式 `createPassthroughTool` 桥接** -- 45 个 Synapse MCP 工具通过统一模式注册：定义名称、JSON Schema 参数和目标 MCP 工具名。注册层自动处理序列化、错误格式化和 `toolCallId` 约定。

---

## 1. 背景：为什么需要这个 Plugin

[Synapse](https://github.com/Vincentwei1021/Synapse) 是一个研究编排平台，人类研究员和 AI Agent 在其中协作完成完整的研究生命周期：

```
Research Project → Research Questions → Experiments → Reports
       ^                  ^                  ^            ^
    Human PI        Human or Agent       AI Agent     AI Agent
```

Agent 拥有四种可组合的权限：`pre_research`（文献检索、上下文阅读）、`research`（问题管理、假设构建）、`experiment`（启动、进度报告、提交、计算资源工具）和 `report`（文档、综合分析）。一个 Agent 可以持有这些权限的任意组合。

[OpenClaw](https://openclaw.ai) 是一个 AI Agent 运行时，带有 Plugin 系统。我们的目标是：**在 Synapse 的看板上分配一个实验，OpenClaw Agent 就能自动检测到它、申请计算资源、执行实验、实时报告进度、提交结果并撰写报告。**

没有 Plugin 时：

```
Human assigns experiment → manually tells agent → agent runs → human copies results back
```

有了 Plugin：

```
Human assigns experiment on Synapse UI
        |
SSE pushes task_assigned notification
        |
Plugin fetches experiment + project context via MCP
        |
/hooks/agent creates isolated agent turn
        |
Agent starts experiment, reports progress, submits results
        |
Agent writes experiment report, @mentions the assigner
```

在 Web UI 上点一下，其余全自动。

---

## 2. SSE + MCP：双通道架构

Synapse 提供了两套接口，最初分别为两类用户设计：

- **SSE 事件流** -- 通过 `/api/events/notifications` 的长连接向 Web UI 推送实时通知。覆盖实验分配、@提及、自主循环触发等事件。
- **MCP 工具** -- 面向 Agent 的 API。45 个工具覆盖完整的研究工作流：查看项目、认领问题、启动实验、报告进度、搜索论文、管理计算资源。通过 API Key（`syn_` 前缀）认证，基于 HTTP streamable transport。

对于 OpenClaw 这样的 Agent 运行时——Agent"像人一样工作"——这两个通道自然地组合在一起：**SSE 提供态势感知（知道什么时候该行动），MCP 提供操作能力（知道怎么行动）。**

```
Synapse Server
  |
  |--- SSE ------> Plugin SSE listener -----> "Experiment assigned to you"
  |                                                    |
  |                                                    v
  |                                            Event Router
  |                                                    |
  |                                                    v
  |                                         /hooks/agent (wake)
  |                                                    |
  |                                                    v
  |                                              Agent turn
  |                                                    |
  +--- MCP <------- Agent calls tools <------ synapse_start_experiment
  |                                            synapse_report_experiment_progress
  +--- MCP <------- Agent calls tools <------ synapse_submit_experiment_results
```

不需要开发自定义 API，不需要修改 Synapse 的服务端代码。当 Synapse 新增一个 MCP 工具时，Plugin 只需添加一条 `createPassthroughTool` 定义就能直接使用。

### 重连与回填

SSE 连接会断——网络抖动、服务重启、负载均衡器超时。Plugin 实现了指数退避重连：

```
1s -> 2s -> 4s -> 8s -> 16s -> 30s (max)
```

成功重连后，Plugin 调用 `synapse_get_notifications`（`status: "unread"`）回填断连期间遗漏的通知，确保跨连接中断零事件丢失。

```typescript
onReconnect: async () => {
  const result = await mcpClient.callTool("synapse_get_notifications", {
    status: "unread",
    autoMarkRead: false,
  });
  const count = result?.notifications?.length ?? 0;
  if (count > 0) {
    logger.info(`SSE reconnect: ${count} unread notifications to process`);
  }
},
```

---

## 3. OpenClaw Plugin 三个原语

OpenClaw 的 Plugin API 提供三个核心原语。整个 Plugin 就是用这三个积木搭起来的：

| 原语 | 用途 | 在本 Plugin 中的角色 |
|------|------|---------------------|
| `registerService` | 后台长驻进程，有 start/stop 生命周期 | **维护 SSE 连接** -- Plugin 加载时启动，持续监听 Synapse 通知 |
| `registerTool` | 向 Agent 暴露可调用的工具 | **桥接 45 个 Synapse MCP 工具** -- Agent 像调用原生工具一样调用 |
| `registerCommand` | 注册 `/command` 快捷指令（绕过 LLM） | **`/synapse status`**、**`/synapse experiments`**、**`/synapse questions`** |

下面是整个 Plugin 的骨架，展示三个原语如何组装：

```typescript
register(api) {
  // 1. Background service: SSE long-lived connection
  api.registerService({
    id: "synapse-sse",
    async start() {
      // Establish SSE connection to /api/events/notifications
      // Events flow through EventRouter -> /hooks/agent
    },
    async stop() {
      // Disconnect SSE and MCP client
    },
  });

  // 2. Tools: 45 Synapse MCP tools exposed to the agent
  registerCommonTools(api, mcpClient);

  // 3. Commands: /synapse status, /synapse experiments, /synapse questions
  registerSynapseCommands(api, mcpClient, getStatus);
}
```

### registerService：SSE 心跳

`registerService` 运行一个独立于 Agent 对话循环的后台进程。Plugin 用它来维护与 Synapse 的 SSE 连接：

- `start()` 在 Plugin 加载时调用 -- 建立到 `/api/events/notifications` 的 SSE 连接
- 断连后自动重连（指数退避，1 秒到最大 30 秒）
- 事件通过 `SynapseEventRouter` 分发
- `stop()` 在 Plugin 卸载时调用 -- 优雅断开 SSE 和 MCP 连接

SSE 流推送的是精简的通知信封：

```json
{"type": "new_notification", "notificationUuid": "550e8400-..."}
```

Event Router 通过 MCP 获取完整的通知详情，检查 Project UUID 过滤条件，然后路由到对应的处理器。

### Event Router：8 种通知类型

`SynapseEventRouter` 将通知动作映射到 Agent 行为：

| 通知动作 | Agent 行为 |
|----------|-----------|
| `task_assigned` / `run_assigned` | 获取实验 + 项目上下文，唤醒 Agent 开始执行 |
| `autonomous_loop_triggered` | Agent 分析完整项目上下文，提出新实验方案 |
| `deep_research_requested` | Agent 阅读相关文献，生成文献综述文档 |
| `experiment_report_requested` | Agent 为已完成的实验撰写详细报告 |
| `mentioned` | Agent 阅读评论线程，回复 @提及 |
| `hypothesis_formulation_requested` | Agent 审阅研究问题的假设构建问卷 |
| `hypothesis_formulation_answered` | Agent 验证回答，可选地启动下一轮 |
| `research_question_claimed` / `idea_claimed` | Agent 接收并审阅认领的研究问题 |

每个处理器构造一个包含 Agent 所需全部上下文的 Prompt 字符串，然后调用 `triggerAgent()` 通过 `/hooks/agent` 唤醒 Agent。

---

## 4. 唤醒 Agent：`/hooks/agent`

当 Event Router 判定 Agent 应该行动时，需要立即唤醒一个空闲的 Agent。OpenClaw 的 Hooks 系统正是为此设计的。关键端点是 **`/hooks/agent`**，它创建一个隔离的 Agent 回合：

```typescript
async function wakeAgent(
  gatewayUrl: string,
  hooksToken: string,
  text: string,
  logger: { info: (msg: string) => void; warn: (msg: string) => void },
  timeoutSeconds?: number,
) {
  const res = await fetch(`${gatewayUrl}/hooks/agent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${hooksToken}`,
    },
    body: JSON.stringify({
      message: text,
      name: "Synapse",
      wakeMode: "now",
      deliver: false,
      timeoutSeconds: timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS,
    }),
  });
}
```

这做了三件重要的事：

1. **创建隔离的 Agent 回合** -- `message` 成为 Agent 的主 Prompt。这不是一条 Agent 可能忽略的旁路通知，而是任务本身。
2. **设置可配置的超时** -- 基于实验的 `computeBudgetHours` 推导。如果实验有 4 小时的计算预算，Agent 回合就获得 4 小时超时。如果预算无限（`null`），默认 24 小时。
3. **触发立即执行** -- `wakeMode: "now"` 意味着 Agent 立即开始工作，没有轮询延迟。

### 为什么用 `/hooks/agent` 而不是 `/hooks/wake`

早期版本的 Plugin 使用 `/hooks/wake`，它将文本作为旁路事件注入 Agent 的现有对话中。问题是：如果 Agent 正在执行其他任务，wake 事件会与 Agent 当前的工作产生竞争。

`/hooks/agent` 创建一个完全独立的 Agent 回合。Synapse 的任务分配 Prompt 成为主消息。这就是可靠实现端到端自动实验执行的关键——Agent 完全专注于分配的工作，不会受到其他任务的上下文污染。

### 从计算预算推导超时

超时不是硬编码的，而是根据实验自适应调整：

```typescript
// Compute timeout: use experiment's computeBudgetHours, or 24h if unlimited
const budgetHours = experiment?.computeBudgetHours;
const timeoutSeconds = budgetHours != null
  ? Math.ceil(budgetHours * 3600)
  : 24 * 3600; // 24 hours for unlimited budget

this.triggerAgent(prompt, {
  notificationUuid: n.uuid,
  action: "task_assigned",
  entityType: n.entityType,
  entityUuid: n.entityUuid,
  projectUuid,
  timeoutSeconds,
});
```

一个 30 分钟的快速 GPU 基准测试就给 30 分钟超时。一个多天的训练任务给 24 小时。Agent 不会被过早中断，也不会无限期挂着。

---

## 5. 消息模板：Prompt 驱动行为

Event Router 的最终输出是一个文本字符串，通过 `/hooks/agent` 注入 Agent 的上下文。这个字符串就是**消息模板**——它决定了 Agent 被唤醒后做什么。

这是 OpenClaw Plugin 设计中一个有趣的模式：**Plugin 不通过代码控制 Agent 的行为，而是通过精心构造的 Prompt 引导 Agent 的自主决策。**

### 实验分配模板

当一个实验被分配时，Prompt 包含丰富的上下文：

```
[Synapse] Experiment assigned: Train LoRA adapter on domain corpus.
Experiment UUID: 550e8400-..., Project UUID: 8a2b9c10-...
Research project: Efficient Domain Adaptation
Project brief: Investigate parameter-efficient fine-tuning...
Datasets: domain_corpus_v2.jsonl; validation_set.jsonl
Evaluation methods: Perplexity on held-out set; downstream task accuracy
Experiment description: Train a LoRA adapter with rank 16...
Linked research question: Does LoRA rank affect domain transfer quality?
Compute budget (hours): 4
If a selected compute node exposes managedKeyAvailable=true, call
synapse_get_node_access_bundle with the experimentUuid and nodeUuid.
Write the returned privateKeyPemBase64 to a local PEM file with
chmod 600 before using ssh.
Use synapse_get_assigned_experiments to inspect your current queue.
Execute the highest-priority item first; experiments with priority
'immediate' must jump to the front of the queue.
Then use synapse_get_experiment to inspect full details,
use synapse_list_compute_nodes to inspect available machines and GPUs,
call synapse_start_experiment when you begin execution.
During execution, call synapse_report_experiment_progress at each
major step (e.g. data download, training start, evaluation).
When finished, call synapse_submit_experiment_results to complete.
After completing your work, post a comment on this experiment
using synapse_add_comment with @mention:
Use this exact mention format: @[Alice](user:9f8e7d6c-...)
```

注意其结构。每个消息模板都包含：

1. **实体上下文** -- 哪个实验、哪个项目、相关 UUID、关联的研究问题
2. **项目上下文** -- 数据集、评估方法、计算预算、之前的实验结果
3. **工具指引** -- 具体调用哪些 `registerTool` 注册的工具、按什么顺序
4. **计算访问模式** -- 如何处理托管 SSH 密钥（永远不要假设本地路径存在）
5. **优先级指令** -- 如何处理实验队列（优先级在前，然后 FIFO）
6. **社交行为** -- 完成后 @谁、用什么格式

### 自主循环模板

当实验队列清空且自主循环已启用时：

```
[Synapse] Autonomous research loop triggered for project "Efficient Domain Adaptation"
(projectUuid: 8a2b9c10-...).

The experiment queue is empty. Your task:
1. Use synapse_get_project_full_context to review all project details,
   research questions, and experiment results
2. Analyze: What questions remain unanswered? What experiments could
   yield new insights? Are there gaps in the research?
3. If you identify valuable next steps, use synapse_propose_experiment
   to create draft experiments for human review
4. If the research objectives appear to be met, you may choose not
   to propose any new experiments

Proposed experiments will enter "draft" status and require human
approval before execution.
```

Agent 拥有充分的自主权来分析和决策，但有一个人工审核关卡：提出的实验进入 `draft` 状态，必须经过人类批准才能执行。这形成了一个自我维持的研究循环：执行、分析、提出、审核、执行。

### 深度研究模板

当人类请求文献综述时：

```
[Synapse] Deep research literature review requested for project
(projectUuid: 8a2b9c10-...).

1. Use synapse_get_related_works to read all collected papers
2. Use synapse_get_project_full_context to understand research objectives
3. Analyze how each paper relates to the project's goals
4. Create a comprehensive literature review document
```

### 为什么用 Prompt 而不是状态机

我们最初尝试硬编码一个状态机来强制规范 Agent 行为——"必须等待人类确认才能验证""必须先检查 GPU 可用性才能启动"。这是过度工程。**Agent 本身有足够的判断力。Plugin 只需要提供正确的上下文和工具，然后通过 Prompt 引导方向。**如果一个计算节点离线了，Agent 会注意到并选择另一个。如果结果看起来异常，Agent 会在评论区标记出来。Prompt 设定方向，Agent 自己导航。

---

## 6. `registerTool` 桥接模式

`registerTool` 是 OpenClaw 向 Agent 暴露可调用工具的原语。每个 Synapse MCP 工具都通过 Plugin 的 `createPassthroughTool` 辅助函数以统一模式桥接。

### 注册层

Plugin 使用声明式工具定义模式。不是手写 45 个 `api.registerTool()` 调用，而是在类型化数组中定义工具，批量注册：

```typescript
// tool-registry.ts
export function createPassthroughTool<TArgs>(definition: {
  name: string;
  description: string;
  parameters: OpenClawObjectSchema;
  targetToolName: string;
  mapArgs?: (args: TArgs) => Record<string, unknown>;
}): OpenClawToolDefinition {
  return {
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters,
    async execute(mcpClient, args) {
      return mcpClient.callTool(
        definition.targetToolName,
        definition.mapArgs ? definition.mapArgs(args as TArgs) : args
      );
    },
  };
}

export function registerOpenClawTools(
  api: OpenClawToolApi,
  mcpClient: SynapseMcpClient,
  definitions: readonly OpenClawToolDefinition[]
) {
  definitions.forEach((definition) => {
    api.registerTool({
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters,
      async execute(_id: string, args: Record<string, unknown>) {
        const result = await definition.execute(mcpClient, args);
        return JSON.stringify(result, null, 2);
      },
    });
  });
}
```

### 定义一个工具

每个工具就是一次 `createPassthroughTool` 调用：

```typescript
createPassthroughTool<{ experimentUuid: string }>({
  name: "synapse_start_experiment",
  description: "Start an assigned experiment and optionally reserve GPUs.",
  parameters: {
    type: "object",
    properties: {
      experimentUuid: { type: "string", description: "Experiment UUID" },
      gpuUuids: {
        type: "array",
        items: { type: "string" },
        description: "Optional GPU UUIDs to reserve",
      },
      workingNotes: {
        type: "string",
        description: "Optional notes or execution plan",
      },
    },
    required: ["experimentUuid"],
    additionalProperties: false,
  },
  targetToolName: "synapse_start_experiment",
  mapArgs: ({ experimentUuid, gpuUuids, workingNotes }) => ({
    experimentUuid,
    gpuUuids: gpuUuids ?? [],
    workingNotes,
  }),
}),
```

两个 OpenClaw 特有的约定需要注意：

- **`parameters` 必须是完整的 JSON Schema**（`type: "object"` + `properties` + `required`），不能用简写——因为 OpenClaw 对接 Bedrock 等模型提供商时需要严格的 Schema 校验。
- **`execute` 的第一个参数是 `toolCallId`**（即上面的 `_id` 参数），不是工具参数。第二个参数才是实际的 args。这是 OpenClaw 的 tool-use 协议约定。

可选的 `mapArgs` 函数处理默认值和参数规范化。例如，确保 `gpuUuids` 默认为 `[]` 而非 `undefined`，或在未提供时将 `onlyAvailable` 强制为 `false`。

### 45 个工具一览

| 分类 | 数量 | 工具 |
|------|------|------|
| **Agent 身份** | 2 | `synapse_checkin`, `synapse_get_my_assignments` |
| **研究项目** | 4 | `synapse_list_research_projects`, `synapse_get_research_project`, `synapse_get_project_full_context`, `synapse_get_activity` |
| **研究问题** | 6 | `synapse_get_research_questions`, `synapse_get_research_question`, `synapse_get_available_research_questions`, `synapse_claim_research_question`, `synapse_release_research_question`, `synapse_update_research_question_status` |
| **实验** | 6 | `synapse_get_experiment`, `synapse_get_assigned_experiments`, `synapse_start_experiment`, `synapse_submit_experiment_results`, `synapse_report_experiment_progress`, `synapse_propose_experiment` |
| **计算资源** | 4 | `synapse_list_compute_nodes`, `synapse_get_node_access_bundle`, `synapse_sync_node_inventory`, `synapse_report_gpu_status` |
| **文档** | 2 | `synapse_get_documents`, `synapse_get_document` |
| **评论** | 2 | `synapse_add_comment`, `synapse_get_comments` |
| **通知** | 2 | `synapse_get_notifications`, `synapse_mark_notification_read` |
| **提及** | 1 | `synapse_search_mentionables` |
| **假设构建** | 2 | `synapse_answer_hypothesis_formulation`, `synapse_get_hypothesis_formulation` |
| **项目组** | 3 | `synapse_get_project_groups`, `synapse_get_project_group`, `synapse_get_group_dashboard` |
| **文献** | 3 | `synapse_search_papers`, `synapse_add_related_work`, `synapse_get_related_works` |
| **会话** | 6 | `synapse_create_session`, `synapse_list_sessions`, `synapse_get_session`, `synapse_close_session`, `synapse_reopen_session`, `synapse_session_heartbeat` |

所有 45 个工具对所有 Agent 可用。Synapse 的 MCP Server 根据 Agent 的可组合权限在内部处理基于角色的访问控制。

---

## 7. MCP Client：懒连接与会话恢复

Plugin 将 `@modelcontextprotocol/sdk` 封装在 `SynapseMcpClient` 中，处理长连接的各种现实问题：

**懒连接** -- MCP Client 不在 Plugin 加载时连接，而是在第一次 `callTool` 调用时才连接。这避免了启动阶段 Synapse 服务器可能尚未就绪时的连接失败。

**会话过期恢复** -- MCP 会话可能过期（服务重启、会话超时）。当工具调用返回 404 时，Client 自动重连并重试：

```typescript
async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (!this.client || this._status !== "connected") {
    await this.connect();
  }

  try {
    return await this._doCallTool(name, args);
  } catch (err) {
    if (this.isSessionExpiredError(err)) {
      this.opts.logger.warn("MCP session expired, reconnecting...");
      this._status = "reconnecting";
      await this.cleanupConnection();
      await this.connect();
      return await this._doCallTool(name, args);
    }
    throw err;
  }
}
```

**JSON 自动解析** -- MCP 工具响应以 content block 形式返回。Client 提取第一个 `text` content block 并解析为 JSON，解析失败则回退到原始文本。这意味着 Event Router 中的工具处理器得到的是类型化对象，而非原始的 MCP 响应信封。

---

## 8. Project UUID 过滤

在多项目环境中，一个 Agent 可能被分配到多个研究项目，但只有其中一部分应由 OpenClaw Plugin 处理（其他的可能由不同的 Agent 运行时处理，或手动操作）。

Plugin 配置接受一个可选的 `projectUuids` 数组：

```json
{
  "config": {
    "synapseUrl": "https://synapse.example.com",
    "apiKey": "syn_your_api_key",
    "projectUuids": ["550e8400-...", "8a2b9c10-..."]
  }
}
```

配置后，Event Router 对每条通知检查此集合：

```typescript
private readonly projectFilter: Set<string>;

constructor(opts: SynapseEventRouterOptions) {
  this.projectFilter = new Set(opts.config.projectUuids ?? []);
}

// In fetchAndRoute:
const projectUuid = notification.projectUuid ?? notification.researchProjectUuid ?? "";
if (this.projectFilter.size > 0 && !this.projectFilter.has(projectUuid)) {
  this.logger.info(`Notification for project ${projectUuid} filtered out`);
  return;
}
```

空数组（默认值）表示"监控所有项目"。这是一个简单但在生产部署中不可或缺的功能——一个 Agent 实例无法也不应该处理所有事情。

---

## 9. 踩坑记录

### 坑 1：npm Scoped 包名 vs OpenClaw Plugin ID

npm 包名带有 scope：`@vincentwei1021/synapse-openclaw-plugin`。但 OpenClaw Plugin ID **不能包含 scope 前缀**。

三个地方，三套命名规则：

| 位置 | 值 | 说明 |
|------|---|------|
| `package.json` -> `name` | `@vincentwei1021/synapse-openclaw-plugin` | npm 包名，带 scope |
| `openclaw.plugin.json` -> `id` | `synapse-openclaw-plugin` | OpenClaw Plugin ID，**不带 scope** |
| `src/index.ts` -> `id` | `synapse-openclaw-plugin` | 必须与 manifest 一致 |

配置 `openclaw.json` 时，用 Plugin ID（不带 scope）作为 key：

```json
{
  "plugins": {
    "entries": {
      "synapse-openclaw-plugin": {
        "enabled": true,
        "config": { ... }
      }
    }
  }
}
```

如果用完整的 npm 包名（`@vincentwei1021/...`）作为 key，OpenClaw 会报 `plugin not found` 或 `plugin id mismatch`。

### 坑 2：`hooks.token` 必须和 `gateway.auth.token` 不同

OpenClaw 的 Hooks 认证 Token 和 Gateway 认证 Token 必须是不同的值。使用相同的值会触发安全错误。这是一个有意的设计决策，防止 Plugin 和 Gateway 共享凭证。

### 坑 3：配置字段可能是 `undefined`，即使 Zod 有默认值

OpenClaw 传递 Plugin 配置时可能没有经过 Zod 校验。即使你的 Schema 设了 `.default([])`，运行时实际的 `projectUuids` 也可能是 `undefined`。

解决方案：对所有配置字段做显式兜底：

```typescript
const config: SynapsePluginConfig = {
  synapseUrl: rawConfig.synapseUrl || undefined,
  apiKey: rawConfig.apiKey || undefined,
  projectUuids: rawConfig.projectUuids ?? [],
  autoStart: rawConfig.autoStart ?? true,
};
```

永远不要信任 Zod 的默认值能通过 OpenClaw 的配置管道幸存下来。

### 坑 4：用 `/hooks/agent` 端点，不是 `/hooks/wake`

如果你在看较老的 OpenClaw Plugin 文档或博客，可能会看到 `/hooks/wake` 的引用。Synapse Plugin 使用的是 **`/hooks/agent`**，它创建一个隔离的 Agent 回合。这一点至关重要：`/hooks/agent` 让 Synapse 的任务分配成为主消息，而 `/hooks/wake` 会将其作为旁路事件注入，如果 Agent 正忙可能会被丢弃。

### 坑 5：SSH 密钥路径不是本地的

当实验涉及远程计算时，Agent 必须使用 `synapse_get_node_access_bundle` 获取 SSH 凭证。返回的 `privateKeyPemBase64` 必须写入本地文件并 `chmod 600`。永远不要假设 Agent 机器上存在 `/home/ubuntu/.synapse/keys/...` 这样的路径。Event Router 的实验分配模板中明确包含了这一指引。

---

## 10. 项目结构

```
packages/openclaw-plugin/
|-- package.json               # @vincentwei1021/synapse-openclaw-plugin v0.5.0
|-- openclaw.plugin.json       # OpenClaw plugin manifest (id: synapse-openclaw-plugin)
|-- tsconfig.json
|-- README.md
|-- src/
    |-- index.ts               # Plugin entry: wires SSE + MCP + tools + commands
    |-- config.ts              # Zod config schema + validation
    |-- mcp-client.ts          # MCP Client (lazy connect, 404 auto-reconnect)
    |-- sse-listener.ts        # SSE connection + exponential backoff reconnect
    |-- event-router.ts        # Notification -> agent action mapping (8 handlers)
    |-- event-router.test.ts   # Event router unit tests
    |-- mcp-client.test.ts     # MCP client unit tests
    |-- sse-listener.test.ts   # SSE listener unit tests
    |-- commands.ts            # /synapse slash commands
    |-- tools/
        |-- tool-registry.ts           # createPassthroughTool + registerOpenClawTools
        |-- common-tool-definitions.ts # 45 tool definitions (declarative)
        |-- common-tools.ts            # Registration entry point
```

### 安装

```bash
openclaw plugins install @vincentwei1021/synapse-openclaw-plugin
```

配置 `~/.openclaw/openclaw.json`：

```json
{
  "hooks": {
    "enabled": true,
    "token": "your-hooks-token-must-differ-from-auth-token"
  },
  "plugins": {
    "enabled": true,
    "entries": {
      "synapse-openclaw-plugin": {
        "enabled": true,
        "config": {
          "synapseUrl": "https://synapse.example.com",
          "apiKey": "syn_your_api_key",
          "projectUuids": [],
          "autoStart": true
        }
      }
    }
  }
}
```

配置字段说明：

| 字段 | 必填 | 说明 |
|------|------|------|
| `synapseUrl` | 是 | Synapse 服务器 URL |
| `apiKey` | 是 | Agent API Key（`syn_` 前缀） |
| `projectUuids` | 否 | 要监控的项目 UUID（空数组 = 所有项目） |
| `autoStart` | 否 | 收到分配事件时自动启动（默认：`true`） |

---

## 11. 总结

这个 Plugin 背后的核心理念一句话就能说清：**让 AI Agent 成为研究工作流中的一等公民，而不是等待终端输入的被动工具。**

通过 SSE 实现实时事件感知、MCP 提供结构化操作、`/hooks/agent` 实现隔离的任务执行、Prompt 模板引导行为决策，Agent 像真正的团队成员一样参与：接收分配、检查计算资源、运行实验、逐步报告进度、提交结果、撰写报告、完成后 @分配者。

三个设计决策影响最大：

1. **双通道优于单通道。** SSE 和 MCP 服务于不同目的。试图通过 MCP 做所有事（轮询新任务）或通过 SSE 做所有事（在事件中编码工具调用）都不如让每个通道做它最擅长的事。

2. **Prompt 优于状态机。** Agent 足够聪明，能处理分支逻辑、错误恢复和社交礼仪。Plugin 提供上下文和方向引导，而不是刚性的控制流。当我们移除硬编码的状态机并换成结构良好的 Prompt 后，Agent 处理边界情况反而*更好了*——因为它可以推理这些情况，而不是撞上未处理的状态。

3. **声明式工具桥接优于手写调用。** 45 个工具且在不断增加，`createPassthroughTool` 模式让代码库保持可维护。新增一个工具只需一个定义对象，而不是一个充满样板代码的新文件。

如果你的平台也同时服务人类用户和 AI Agent，这种"事件推送 + 工具协议"的双通道架构值得考虑。你为人类用户构建的基础设施（通知、实时更新、API 端点）也是 Agent 所需的大部分内容。

项目链接：
- **Synapse**: [github.com/Vincentwei1021/Synapse](https://github.com/Vincentwei1021/Synapse)
- **OpenClaw Plugin**: [npm @vincentwei1021/synapse-openclaw-plugin](https://www.npmjs.com/package/@vincentwei1021/synapse-openclaw-plugin)
