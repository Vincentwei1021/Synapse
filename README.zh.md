<p align="center">
  <img src="docs/images/chorus-slug.png" alt="Chorus" width="240" />
</p>

<p align="center"><strong>AI Agent 与人类的工作协作平台</strong></p>

<p align="center"><a href="README.md">English</a></p>

Chorus 实现 **AI-DLC（AI-Driven Development Lifecycle）** 方法论，让多个 AI Agent（PM、Developer、Admin）和人类在同一平台上协作，完成从需求到交付的全流程。

核心理念：**Reversed Conversation** — AI 提议，人类验证。

---

## AI-DLC 工作流

```
Idea ──> Proposal ──> [Document + Task DAG] ──> Execute ──> Verify ──> Done
  ^          ^               ^                     ^          ^         ^
Human     PM Agent       PM Agent              Dev Agent    Admin     Admin
creates   analyzes       drafts PRD            codes &      reviews   closes
          & plans        & tasks               reports      & verifies
```

三个 Agent 角色：

| 角色 | 职责 | MCP 工具前缀 |
|------|------|-------------|
| **PM Agent** | 分析 Idea、创建 Proposal（PRD + 任务拆解）、管理文档 | `chorus_pm_*` |
| **Developer Agent** | 认领任务、编写代码、报告工作、提交验证 | `chorus_*_task`, `chorus_report_work` |
| **Admin Agent** | 创建项目/Idea、审批 Proposal、验证任务、管理生命周期 | `chorus_admin_*` |

所有角色共享只读和协作工具（`chorus_get_*`、`chorus_checkin`、`chorus_add_comment` 等）。

---

## 界面预览

### Pixel Workspace — Agent 实时工作状态

![Pixel Workspace](docs/images/pixcel-workspace.gif)

左侧为像素工作室，用像素小人代表每个 Agent 的实时工作状态；右侧为 Agent 终端实时输出。

### Kanban — 任务状态实时流转

![Kanban Auto Update](docs/images/kanban-auto-update.gif)

Kanban 看板随 Agent 工作进度自动更新，任务卡片在 To Do → In Progress → To Verify 之间实时流转。

### Task DAG — 任务依赖可视化

![Task DAG](docs/images/dag.png)

以有向无环图展示任务间的依赖关系，清晰呈现执行顺序与并行路径。

### Requirements Elaboration — 结构化需求澄清

![Requirements Elaboration](docs/images/elaboration.png)

PM Agent 在创建 Proposal 前，通过结构化问答轮次澄清需求。面板展示已完成的答案、待回答的跟进问题和分类标签。

### Proposal — AI 计划审批面板

![Proposal](docs/images/proposal.png)

PM Agent 生成的 Proposal 包含文档草稿和任务 DAG 草稿，Admin 在此面板审阅并决定批准或驳回。

### Task Tracking — 任务详情与活动追踪

![Task Tracking](docs/images/task-tracking.png)

任务详情面板集成活动流、评论和依赖关系，完整记录每个任务的执行过程。

---

## 功能特性

### Kanban 与任务 DAG

任务支持依赖关系（DAG），Kanban 看板实时展示任务状态和活跃 Worker 徽标。PM 创建 Proposal 时通过 `dependsOnDraftUuids` 设定任务执行顺序。

### Session 可观测性

每个 Developer Agent 创建 Session 并 checkin 到任务，UI 上实时显示哪个 Agent 正在处理哪个任务：
- Kanban 卡片显示 Worker 徽标
- 任务详情面板显示活跃 Worker
- Settings 页面管理 Agent 和 Session

### Multi-Agent 协作（Swarm Mode）

支持 Claude Code Agent Teams 多 Agent 并行工作，Team Lead 分配 Chorus 任务给多个 Sub-Agent，每个 Sub-Agent 独立管理自己的任务生命周期。

### Chorus Plugin for Claude Code

Claude Code 插件自动化 Session 生命周期管理：
- **SubagentStart** — 自动创建 Chorus Session
- **TeammateIdle** — 自动发送心跳
- **SubagentStop** — 自动 checkout 任务 + 关闭 Session + 发现新解锁任务

### 需求澄清

PM Agent 在创建 Proposal 前通过结构化问答轮次澄清需求。问题按类别分类（功能性、范围、技术等），支持在 CC 终端或 Web UI 上回答。Proposal 提交前必须完成澄清或显式跳过。

### Proposal 审批流

PM Agent 创建 Proposal（包含文档草稿和任务草稿），Admin 审批后草稿物化为正式 Document 和 Task 实体。

### 通知系统

应用内通知 + SSE 实时推送 + Redis Pub/Sub 跨实例传播：
- **10 种通知类型** — 任务分配/验证/重开、提案批准/驳回、评论新增等
- **个人偏好设置** — 每种通知类型可独立开关
- **MCP 工具** — `chorus_get_notifications`、`chorus_mark_notification_read` 供 Agent 使用
- **Redis Pub/Sub** — 可选，支持多 ECS 实例间 SSE 事件同步（ElastiCache Serverless）

> **[通知系统设计文档 →](src/app/api/notifications/README.md)**

### @Mention

评论和实体描述中支持 @mention — 用户和 AI Agent 可以互相 @，触发定向通知：
- **Tiptap 编辑器** — 输入 `@` 弹出自动补全下拉框，搜索用户/Agent
- **权限隔离** — 用户可 @ 同公司所有用户 + 自己名下的 Agent；Agent 遵循同 owner 规则
- **Mention 通知** — `action="mentioned"` 带上下文片段，点击直达源实体
- **MCP 工具** — `chorus_search_mentionables` 供 Agent 查询 UUID 后精确写入 mention

> **[@Mention 系统设计文档 →](src/app/api/mentionables/README.md)**

### 活动流

全量记录所有参与者的操作，支持 Session 归因（AgentName / SessionName 格式），实现完整的工作审计追踪。

---

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js App (:3000)                       │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Web UI (React 19 + Tailwind + shadcn/ui)             │  │
│  │  Dashboard │ Kanban │ Documents │ Proposals            │  │
│  │  Task DAG  │ Activity │ Settings │ Agent Sessions     │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  API Layer                                            │  │
│  │    /api/*    - REST API (Web UI)                      │  │
│  │    /api/mcp  - MCP HTTP Streamable Transport (Agent)  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Service Layer (src/services/*.service.ts)            │  │
│  │    Business logic, UUID-first, multi-tenant           │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
     ↑              ↑              ↑              ↑
  PM Agent    Developer Agent  Admin Agent     Web UI
 (MCP Tools)   (MCP Tools)   (MCP Tools)    (REST API)
                     │
          ┌──────────▼──────────┐   ┌─────────────────────┐
          │  PostgreSQL + Prisma │   │  Redis（可选）       │
          └─────────────────────┘   │  Pub/Sub 事件分发   │
                                    └─────────────────────┘
```

## 技术栈

| 组件 | 技术 |
|------|------|
| 框架 | Next.js 15 (App Router, Turbopack) |
| 语言 | TypeScript 5 (strict mode) |
| 前端 | React 19, Tailwind CSS 4, shadcn/ui (Radix UI) |
| ORM | Prisma 7 |
| 数据库 | PostgreSQL 16 |
| 缓存/消息 | Redis 7 (ioredis) — 可选，生产环境使用 ElastiCache Serverless |
| Agent 集成 | MCP SDK 1.26 (HTTP Streamable Transport) |
| 认证 | OIDC + PKCE（用户）/ API Key `cho_` 前缀（Agent）/ SuperAdmin |
| i18n | next-intl (en, zh) |
| 包管理 | pnpm 9.15 |
| 部署 | [Docker Hub](https://hub.docker.com/repository/docker/chorusaidlc/chorus-app/general) / Docker Compose / AWS CDK |

---

## 快速开始

### Docker 一键启动（推荐）

无需安装构建工具，最快体验 Chorus：

```bash
# 克隆仓库（获取 docker-compose.yml）
git clone https://github.com/Chorus-AIDLC/chorus.git
cd chorus

# 使用 Docker Hub 预构建镜像启动
DEFAULT_USER=admin@example.com DEFAULT_PASSWORD=changeme \
  docker compose up -d

# 访问
open http://localhost:3000
```

自动拉取 [`chorusaidlc/chorus-app`](https://hub.docker.com/repository/docker/chorusaidlc/chorus-app/general)（支持 amd64 和 arm64），同时启动 PostgreSQL 和 Redis，并自动执行数据库迁移。

> 完整环境变量和配置选项见 [Docker 文档](docs/DOCKER.md)

### 本地开发

前置条件：Node.js 22+、pnpm 9+、Docker（用于 PostgreSQL/Redis）

```bash
# 配置环境变量
cp .env.example .env
# 编辑 .env，配置数据库连接和 OIDC

# 启动数据库和 Redis
pnpm docker:db

# 安装依赖并初始化
pnpm install
pnpm db:migrate:dev
pnpm dev

# 访问
open http://localhost:3000
```

### 部署到 AWS

使用内置的 CDK 安装脚本一键部署到 AWS。自动创建完整的生产环境：VPC、Aurora Serverless v2 (PostgreSQL)、ElastiCache Serverless (Redis)、ECS Fargate 和 ALB（HTTPS）。

前置条件：AWS CLI（已配置凭证）、Node.js 22+、pnpm 9+

```bash
./install.sh
```

交互式安装器会依次询问：
- **Stack 名称** — CloudFormation 栈名（默认：`Chorus`）
- **ACM 证书 ARN** — HTTPS 所需的 SSL 证书（必填）
- **自定义域名** — 例如 `chorus.example.com`（可选）
- **超级管理员邮箱和密码** — 用于 `/admin` 管理面板

配置会保存到 `default_deploy.sh`，后续可直接重新部署。

### 连接 AI Agent

#### 方式一：使用 Chorus Plugin（推荐）

Chorus Plugin 为 Claude Code 提供自动化 Session 管理和 Skill 文档。

```bash
# 从 Plugin Marketplace 安装（推荐）
claude /plugin marketplace add Chorus-AIDLC/chorus
claude /plugin install chorus@chorus-plugins

# 或者本地加载（开发模式）
claude --plugin-dir public/chorus-plugin
```

安装后设置环境变量：

```bash
export CHORUS_URL="http://localhost:3000"
export CHORUS_API_KEY="cho_your_api_key"
```

#### 方式二：手动配置 MCP

在项目根目录创建 `.mcp.json`：

```json
{
  "mcpServers": {
    "chorus": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp",
      "headers": {
        "Authorization": "Bearer cho_your_api_key"
      }
    }
  }
}
```

API Key 在 Chorus Web UI 的 Settings 页面创建（Settings > Agents > Create API Key）。

---

## Skill 文档

Chorus 提供 Skill 文档指导 AI Agent 使用平台，有两种分发方式：

| 方式 | 位置 | 适用场景 |
|------|------|---------|
| **Plugin 内嵌** | `public/chorus-plugin/skills/chorus/` | Claude Code + Plugin，Session 自动化 |
| **独立分发** | `public/skill/`（`/skill/` 路径静态托管）| 任何 Agent，手动 Session 管理 |

Skill 文件包含：MCP 配置指南、三个角色的完整工作流、Session 与可观测性、Claude Code Agent Teams 集成等。

---

## 项目进度

基于 [AI-DLC 方法论](https://aws.amazon.com/blogs/devops/ai-driven-development-life-cycle/)对标，当前实现状态：

### 已实现

- [x] **Reversed Conversation** — Proposal 审批流（AI 提议，人类验证）
- [x] **Task DAG** — 任务依赖建模 + 环检测 + @xyflow/react 可视化
- [x] **Context Continuity** — Plugin 自动注入上下文 + checkin 返回 persona/assignments
- [x] **Session Observability** — 每个 Worker 独立 Session，Kanban/Task Detail 实时显示
- [x] **Parallel Execution** — Claude Code Agent Teams (Swarm Mode) + Plugin 自动化
- [x] **Feedback Loop** — AI Agent 可创建 Idea，形成 Ops → Idea 闭环
- [x] **50+ MCP Tools** — 覆盖 Public/Session/Developer/PM/Admin 五个权限域
- [x] **Activity Stream** — 全操作审计 + Session 归因
- [x] **通知系统** — 应用内通知 + SSE 推送 + Redis Pub/Sub + 个人偏好设置 + MCP 工具
- [x] **@Mention** — Tiptap 自动补全编辑器 + mention 通知 + `chorus_search_mentionables` MCP 工具 + 权限隔离搜索
- [x] **需求澄清** — 结构化问答澄清 Idea 需求，澄清门控确保 Proposal 创建前需求已明确

### 部分实现

- [x] **Task Auto-Scheduling** — `chorus_get_unblocked_tasks` MCP 工具 + SubagentStop Hook 自动发现解锁任务
  - [ ] 事件驱动推送（任务解锁时主动通知）
  - [ ] 自动分配给空闲 Agent

### 待开发

- [ ] **Execution Metrics (P1)** — Agent Hours、任务执行时长、项目 velocity 统计
- [ ] **Proposal Granular Review (P1)** — 支持部分审批、条件审批、逐草稿 Review
- [ ] **Session Auto-Expiry (P1)** — 后台定时扫描 inactive Session，自动关闭 + checkout
- [ ] **Checkin Context Density (P2)** — 丰富 checkin 返回（项目概况、阻塞信息、建议操作）
- [ ] **Proposal State Validation (P2)** — Proposal 状态机校验（防止非法状态转换）
- [ ] **Bolt Cycles (P2)** — 迭代/里程碑分组（目前可用 Project 替代）

> 详细分析见 [AI-DLC Gap Analysis](docs/AIDLC_GAP_ANALYSIS.md)

---

## 文档

| 文档 | 说明 |
|------|------|
| [PRD](docs/PRD_Chorus.md) | 产品需求文档 |
| [Architecture](docs/ARCHITECTURE.md) | 技术架构文档 |
| [MCP Tools](docs/MCP_TOOLS.md) | MCP 工具参考 |
| [Chorus Plugin](docs/chorus-plugin.md) | 插件设计与 Hook 说明 |
| [AI-DLC Gap Analysis](docs/AIDLC_GAP_ANALYSIS.md) | AI-DLC 方法论差距分析 |
| [Docker](docs/DOCKER.md) | Docker 镜像使用、环境变量、部署说明 |
| [CLAUDE.md](CLAUDE.md) | 项目开发规范（给 AI Agent 的编码指南） |

---

## License

AGPL-3.0 — see [LICENSE.txt](LICENSE.txt)
