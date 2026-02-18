# Chorus

**AI Agent 与人类的工作协作平台**

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

### Proposal 审批流

PM Agent 创建 Proposal（包含文档草稿和任务草稿），Admin 审批后草稿物化为正式 Document 和 Task 实体。

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
          ┌──────────▼──────────┐
          │  PostgreSQL + Prisma │
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
| Agent 集成 | MCP SDK 1.26 (HTTP Streamable Transport) |
| 认证 | OIDC + PKCE（用户）/ API Key `cho_` 前缀（Agent）/ SuperAdmin |
| i18n | next-intl (en, zh) |
| 包管理 | pnpm 9.15 |
| 部署 | Docker Compose / AWS CDK |

---

## 快速开始

### 前置条件

- Docker & Docker Compose
- Node.js 22+
- pnpm 9+
- OIDC Provider（如 Auth0、Cognito、Keycloak）

### 启动

```bash
# 克隆仓库
git clone https://github.com/Chorus-AIDLC/chorus.git
cd chorus

# 配置环境变量
cp .env.example .env
# 编辑 .env，配置数据库连接和 OIDC

# 启动数据库
docker compose up -d db

# 安装依赖并初始化
pnpm install
pnpm db:migrate:dev
pnpm dev

# 访问
open http://localhost:3000
```

### 连接 AI Agent

#### 方式一：使用 Chorus Plugin（推荐）

Chorus Plugin 为 Claude Code 提供自动化 Session 管理和 Skill 文档。

```bash
# 设置环境变量
export CHORUS_URL="http://localhost:3000"
export CHORUS_API_KEY="cho_your_api_key"

# 启动 Claude Code 并加载插件
claude --plugin-dir public/chorus-plugin
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

## 文档

| 文档 | 说明 |
|------|------|
| [PRD](docs/PRD_Chorus.md) | 产品需求文档 |
| [Architecture](docs/ARCHITECTURE.md) | 技术架构文档 |
| [MCP Tools](docs/MCP_TOOLS.md) | MCP 工具参考 |
| [Chorus Plugin](docs/chorus-plugin.md) | 插件设计与 Hook 说明 |
| [AI-DLC Gap Analysis](docs/AIDLC_GAP_ANALYSIS.md) | AI-DLC 方法论差距分析 |
| [CLAUDE.md](CLAUDE.md) | 项目开发规范（给 AI Agent 的编码指南） |

---

## License

MIT
