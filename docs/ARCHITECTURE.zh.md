> [English Version](./ARCHITECTURE.md)

# Synapse 架构文档

Synapse 是面向人类研究者和 AI Agent 的研究编排平台。

---

## 系统概览

```
 ┌────────────┐    ┌──────────────┐    ┌──────────────┐
 │  浏览器    │    │  AI Agent    │    │  OpenClaw    │
 │  (人类)    │    │  (MCP)       │    │  插件        │
 └─────┬──────┘    └──────┬───────┘    └──────┬───────┘
       │ HTTPS            │ MCP/HTTP          │ SSE + MCP
       │                  │                   │
 ┌─────▼──────────────────▼───────────────────▼──────────┐
 │                  Next.js 15 App Router                 │
 │  ┌─────────────────────────────────────────────────┐   │
 │  │  中间件：认证解析、Token 刷新                     │   │
 │  └─────────────────────────────────────────────────┘   │
 │  ┌──────────────────┐  ┌───────────────────────────┐   │
 │  │ Server Components│  │ API Routes + MCP 端点     │   │
 │  │ + Server Actions │  │ POST /api/mcp             │   │
 │  └──────────────────┘  └───────────────────────────┘   │
 │  ┌─────────────────────────────────────────────────┐   │
 │  │  服务层  (src/services/*.service.ts)             │   │
 │  └─────────────────────────────────────────────────┘   │
 │  ┌─────────────────────────────────────────────────┐   │
 │  │  Prisma 7  (src/generated/prisma/)              │   │
 │  └──────────┬──────────────────────────────────────┘   │
 └─────────────┼──────────────────────────────────────────┘
               │
     ┌─────────▼──────────┐    ┌────────────────┐
     │  PostgreSQL 16     │    │  Redis 7       │
     │  (主存储)          │    │  (可选         │
     └────────────────────┘    │   发布/订阅)   │
                               └────────────────┘
```

**技术栈**：Next.js 15、React 19、TypeScript 5、Prisma 7、Tailwind CSS 4、shadcn/Radix UI、`@modelcontextprotocol/sdk`（HTTP Streamable 传输）、`next-intl`（中/英）、Vitest、pnpm。

---

## 数据模型

共 31 个 Prisma 模型。核心活跃模型：

| 模型 | 用途 |
|---|---|
| `Company` | 多租户根实体 |
| `User` | 人类用户（OIDC/默认登录） |
| `Agent` | AI Agent，使用可组合的 `roles`：`pre_research`、`research`、`experiment`、`report` |
| `ApiKey` | `syn_` 前缀，SHA-256 哈希存储，按 Agent 分配 |
| `ResearchProject` | 项目简介、数据集、评估方法、算力池绑定、自主循环配置 |
| `ResearchQuestion` | 问题框架，画布式层级视图 |
| `Experiment` | 主要执行单元。五列看板：draft/pending_review/pending_start/in_progress/completed。有 `liveStatus`（sent/ack/checking_resources/queuing/running）和 `liveMessage` 用于实时跟踪 |
| `ExperimentProgressLog` | Agent 进度消息时间线 |
| `RelatedWork` | 关联到项目的学术论文（Semantic Scholar 元数据） |
| `Document` | 项目文档、实验结果文档、综合文档。与实验软关联 |
| `ComputePool` / `ComputeNode` / `ComputeGpu` | 算力基础设施 |
| `ExperimentGpuReservation` | 实验 GPU 预留 |
| `AgentSession` | Agent 工作会话跟踪 |
| `Notification` | 应用内通知 |
| `Comment` | 多态评论，可评论实验、问题、文档 |
| `Activity` | 项目级活动日志 |
| `ProjectGroup` | 项目分组 |

仍存在的遗留模型：`ExperimentDesign`、`ExperimentRun`、`RunDependency`、`AcceptanceCriterion` 等。

**数据库设计**：基于 UUID 的外键（`relationMode = "prisma"`，无数据库级外键约束）。所有公开引用使用 UUID，不使用自增 ID。

---

## 认证模型

四种认证方式，全部由 `src/lib/auth.ts` 中的 `getAuthContext()` 解析：

```
AuthContext = UserAuthContext | AgentAuthContext | SuperAdminAuthContext
```

| 方式 | 上下文类型 | 机制 |
|---|---|---|
| API Key | `agent` | `Authorization: Bearer syn_...` -> SHA-256 查找 |
| OIDC + PKCE | `user` | 按 Company 配置存储在数据库中，JWKS 验证 |
| 默认登录 | `user` | `DEFAULT_USER` + `DEFAULT_PASSWORD` 环境变量，自签名 JWT |
| 超级管理员 | `super_admin` | `SUPER_ADMIN_EMAIL` + bcrypt 哈希，24 小时 JWT |

会话使用 JWT 访问令牌（1 小时）配合刷新令牌（默认认证 7 天，OIDC 由提供商决定）。Edge Middleware 处理主动 Token 刷新。

Agent 权限可组合（存储在 `Agent.roles` 中）：

| 权限 | 授权范围 |
|---|---|
| `pre_research` | 文献搜索、项目上下文读取 |
| `research` | 研究问题 CRUD、假设制定 |
| `experiment` | 实验启动/完成/提交、算力工具 |
| `report` | 文档 CRUD、综合工具 |

---

## MCP 集成

**端点**：`POST /api/mcp`（HTTP Streamable 传输，支持 SSE）

**认证**：`Authorization: Bearer syn_...` 请求头。工具集由 Agent 的 `roles` 决定。

**工具注册**：工具在 `src/mcp/server.ts` 中按会话注册。服务器工厂为每个认证上下文创建新的 `McpServer`，从以下文件注册工具：

- `src/mcp/tools/public.ts`（所有 Agent）
- `src/mcp/tools/session.ts`（所有 Agent）
- `src/mcp/tools/compute.ts`（所有 Agent）
- `src/mcp/tools/literature.ts`（所有 Agent）
- `src/mcp/tools/research-lead.ts`（research + pi 角色）
- `src/mcp/tools/researcher.ts`（experiment + pi 角色）
- `src/mcp/tools/pi.ts`（仅 pi 角色）

声明式注册辅助：`src/mcp/tools/tool-registry.ts` 和 `src/mcp/tools/compat-alias-tools.ts`。

**会话管理**：滑动窗口过期（30 分钟不活跃超时，每次请求自动续期，内存存储）。

**项目过滤**：可选的 `X-Synapse-Project` 或 `X-Synapse-Project-Group` 请求头来限定工具结果范围。

---

## 实时系统

```
 服务层                       EventBus
      │                            │
      ├── createActivity() ──────>│
      │                            ├── Redis pub/sub（如可用）
      │                            │   或内存回退
      │                            │
      │                            ▼
      │                     SSE 端点
      │                  /api/events/notifications
      │                            │
      │                            ▼
      │                     浏览器（轮询）
      │                     OpenClaw 插件（SSE 监听）
```

- 活动通过 `EventBus` 发出（Redis 或内存）
- 通知通过 SSE 在 `/api/events/notifications` 流式传输
- 实验有 `liveStatus`/`liveMessage`，由 Agent 通过 `synapse_report_experiment_progress` 更新
- GPU 遥测通过 `SYNAPSE_GPU_TELEMETRY_AUTOSTART=true` 显式启动

---

## 算力编排

```
 ComputePool
   └── ComputeNode（SSH/SSM 访问）
         └── ComputeGpu（槽位索引、型号、遥测）
               └── ExperimentGpuReservation
```

- 项目可通过 `ResearchProject.computePoolUuid` 绑定到算力池
- Agent 算力访问流程：
  1. `synapse_list_compute_nodes`（如绑定池则按项目过滤）
  2. `synapse_get_node_access_bundle`（返回 SSH 凭证，base64 PEM 格式）
  3. `synapse_start_experiment`（预留 GPU，转为 in_progress）
- GPU 状态由 Agent 通过 `synapse_report_gpu_status` 和 `synapse_sync_node_inventory` 上报
- 实验完成时释放预留

---

## 自主循环

项目可启用自持续的研究循环：

```
 执行实验
       │
       ▼
 所有队列为空？ ──否──> 等待
       │
      是
       │
       ▼
 触发指定 Agent
       │
       ▼
 Agent 审查项目上下文 (synapse_get_project_full_context)
       │
       ▼
 Agent 提议实验 (synapse_propose_experiment, status=draft)
       │
       ▼
 人类在看板审核 ──批准──> 执行
```

通过 `ResearchProject.autonomousLoopEnabled` + `autonomousLoopAgentUuid` 启用。当实验完成且所有队列（draft、pending_review、pending_start）为空时触发。

---

## 多租户

所有查询都按 `companyUuid` 限定范围。这在服务层强制执行。超级管理员是唯一可以跨租户操作的上下文。

公司内的属主限定：Agent、API Key 和 Session 额外按 `ownerUuid` 限定，使一个用户无法查看另一个用户的 Agent。

---

## 关键文件位置

| 领域 | 路径 |
|---|---|
| MCP 服务器工厂 | `src/mcp/server.ts` |
| MCP 工具 | `src/mcp/tools/*.ts` |
| 认证解析 | `src/lib/auth.ts` |
| API Key 验证 | `src/lib/api-key.ts` |
| 会话令牌 | `src/lib/user-session.ts` |
| 服务层 | `src/services/*.service.ts` |
| Prisma Schema | `prisma/schema.prisma` |
| 项目指标 | `src/services/project-metrics.service.ts` |
| OpenClaw 插件 | `packages/openclaw-plugin/src/` |
| CDK 基础设施 | `packages/synapse-cdk/` |
