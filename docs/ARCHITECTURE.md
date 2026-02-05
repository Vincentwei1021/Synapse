# Project Chorus - 技术架构文档

**版本**: 1.3
**更新日期**: 2026-02-05

---

## 1. 系统概述

### 1.1 定位

Chorus 是一个 AI Agent 与人类协作的平台，实现 AI-DLC（AI-Driven Development Lifecycle）方法论。核心理念是 **Reversed Conversation**：AI 提议，人类验证。

### 1.2 核心能力

| 能力 | 描述 |
|-----|------|
| **知识库** | 项目上下文存储和查询 |
| **任务管理** | 任务 CRUD、状态流转、Kanban |
| **认领机制** | Idea/Task 认领，解决 Agent 协作冲突 |
| **提议审批** | PM Agent 创建提议，人类审批 |
| **MCP Server** | Agent 通过 MCP 协议接入平台 |
| **活动流** | 实时追踪所有参与者的操作 |

### 1.3 参与者

```
┌─────────────────────────────────────────────────────────────┐
│                      Chorus Platform                        │
└─────────────────────────────────────────────────────────────┘
        ↑               ↑               ↑
        │               │               │
   ┌────┴────┐    ┌─────┴─────┐   ┌─────┴─────┐
   │  Human  │    │ PM Agent  │   │ Personal  │
   │         │    │           │   │  Agent    │
   └─────────┘    └───────────┘   └───────────┘
   Web UI 访问     Claude Code     Claude Code
   审批提议        提议任务        执行任务
```

---

## 2. 技术栈

### 2.1 核心技术选型

| 层 | 技术 | 版本 | 选型理由 |
|---|------|------|---------|
| **框架** | Next.js | 15.x | 全栈统一，App Router，RSC 支持 |
| **语言** | TypeScript | 5.x | 类型安全，前后端一致 |
| **ORM** | Prisma | 7.x | 类型安全，迁移管理，良好 DX，无外键约束设计 |
| **数据库** | PostgreSQL | 16 | 可靠，JSON 支持，后续可扩展 pgvector |
| **UI 组件** | shadcn/ui | - | 基于 Radix，可定制，美观 |
| **样式** | Tailwind CSS | 4.x | 原子化 CSS，快速开发 |
| **认证** | next-auth | 5.x | OIDC 支持，与 Next.js 深度集成 |
| **MCP SDK** | @modelcontextprotocol/sdk | latest | 官方 TypeScript SDK |
| **容器化** | Docker Compose | - | 本地开发一键启动 |

### 2.2 开发工具

| 工具 | 用途 |
|-----|------|
| pnpm | 包管理 |
| ESLint + Prettier | 代码规范 |
| Vitest | 单元测试 |
| Playwright | E2E 测试 |

---

## 3. 系统架构

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         Clients                                 │
├──────────────────┬──────────────────┬───────────────────────────┤
│    Web Browser   │    PM Agent      │    Personal Agent         │
│    (Human)       │    (Claude Code) │    (Claude Code)          │
└────────┬─────────┴────────┬─────────┴─────────┬─────────────────┘
         │                  │                   │
         │ HTTPS            │ MCP/HTTP          │ MCP/HTTP
         │                  │                   │
┌────────▼──────────────────▼───────────────────▼─────────────────┐
│                     Next.js Application                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Middleware Layer                       │   │
│  │  - OIDC Authentication (Human)                           │   │
│  │  - API Key Authentication (Agent)                        │   │
│  │  - Rate Limiting                                         │   │
│  │  - Request Logging                                       │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────┐  ┌─────────────────────────────────┐   │
│  │   React Pages       │  │        API Routes               │   │
│  │   (App Router)      │  │                                 │   │
│  │                     │  │  /api/projects/*                │   │
│  │  - Dashboard        │  │  /api/ideas/*                   │   │
│  │  - Project Overview │  │  /api/documents/*               │   │
│  │  - Ideas List       │  │  /api/tasks/*                   │   │
│  │  - Documents List   │  │  /api/proposals/*               │   │
│  │  - Kanban Board     │  │  /api/agents/*                  │   │
│  │  - Proposal Review  │  │  /api/auth/*                    │   │
│  │  - Activity Feed    │  │  /api/mcp    ← MCP HTTP 端点    │   │
│  └─────────────────────┘  └─────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Service Layer                          │   │
│  │  - ProjectService      - IdeaService                     │   │
│  │  - DocumentService     - TaskService                     │   │
│  │  - ProposalService     - CommentService                  │   │
│  │  - AgentService        - ActivityService                 │   │
│  │  - AssignmentService                                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Data Access Layer                      │   │
│  │                    (Prisma Client)                        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │    PostgreSQL     │
                    │    Database       │
                    └───────────────────┘
```

### 3.2 Controller-Service-DAO 架构

Chorus 采用经典的三层架构模式，职责清晰分离：

```
┌─────────────────────────────────────────────────────────────────┐
│                    Controller Layer                              │
│                    (Next.js API Routes)                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  职责:                                                    │   │
│  │  - 请求/响应处理                                          │   │
│  │  - 认证/授权检查                                          │   │
│  │  - 参数验证                                               │   │
│  │  - 调用 Service 层                                        │   │
│  │  - 格式化响应                                             │   │
│  └──────────────────────────────────────────────────────────┘   │
│  代码位置: src/app/api/**/*.ts                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Service Layer                                 │
│                    (Business Logic)                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  职责:                                                    │   │
│  │  - 业务逻辑实现                                           │   │
│  │  - 数据查询和转换                                         │   │
│  │  - 事务管理                                               │   │
│  │  - 跨实体操作协调                                         │   │
│  │  - 状态机验证                                             │   │
│  └──────────────────────────────────────────────────────────┘   │
│  代码位置: src/services/*.service.ts                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DAO Layer                                     │
│                    (Prisma Client)                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  职责:                                                    │   │
│  │  - 数据库操作封装                                         │   │
│  │  - ORM 映射                                               │   │
│  │  - 连接池管理                                             │   │
│  └──────────────────────────────────────────────────────────┘   │
│  代码位置: src/lib/prisma.ts (单例)                              │
│            src/generated/prisma/ (生成的客户端)                   │
└─────────────────────────────────────────────────────────────────┘
```

#### 服务层模块

| 服务 | 文件 | 职责 |
|-----|------|------|
| ProjectService | `project.service.ts` | 项目 CRUD |
| IdeaService | `idea.service.ts` | Idea CRUD + 状态流转 + 认领 |
| TaskService | `task.service.ts` | Task CRUD + 状态流转 + 认领 |
| DocumentService | `document.service.ts` | Document CRUD |
| ProposalService | `proposal.service.ts` | Proposal CRUD + 审批流程 |
| AgentService | `agent.service.ts` | Agent + API Key 管理 |
| CommentService | `comment.service.ts` | 多态评论 |
| ActivityService | `activity.service.ts` | 活动日志 |
| AssignmentService | `assignment.service.ts` | Agent 自助查询（我的任务、可认领） |

#### 代码示例

**Controller (route.ts)**:
```typescript
// src/app/api/projects/route.ts
import { withErrorHandler, parsePagination } from "@/lib/api-handler";
import { success, paginated, errors } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import * as projectService from "@/services/project.service";

export const GET = withErrorHandler(async (request) => {
  const auth = await getAuthContext(request);
  if (!auth) return errors.unauthorized();

  const { page, pageSize, skip, take } = parsePagination(request);
  const { projects, total } = await projectService.listProjects({
    companyId: auth.companyId,
    skip,
    take,
  });

  return paginated(projects, page, pageSize, total);
});
```

**Service (*.service.ts)**:
```typescript
// src/services/project.service.ts
import { prisma } from "@/lib/prisma";

export async function listProjects({ companyId, skip, take }) {
  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where: { companyId },
      skip,
      take,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.project.count({ where: { companyId } }),
  ]);
  return { projects, total };
}
```

### 3.3 目录结构

```
chorus/
├── docker-compose.yml          # 本地开发环境
├── Dockerfile                  # 生产镜像
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── next.config.js
├── tailwind.config.js
├── .env.example
│
├── prisma/
│   ├── schema.prisma           # 数据模型定义
│   └── migrations/             # 数据库迁移
│
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── layout.tsx          # 根布局
│   │   ├── page.tsx            # 首页/Dashboard
│   │   ├── globals.css
│   │   │
│   │   ├── (auth)/             # 认证相关页面
│   │   │   ├── login/page.tsx
│   │   │   └── callback/page.tsx
│   │   │
│   │   ├── projects/
│   │   │   ├── page.tsx        # 项目列表
│   │   │   └── [id]/
│   │   │       ├── page.tsx    # 项目 Overview
│   │   │       ├── ideas/page.tsx      # Ideas 列表
│   │   │       ├── documents/page.tsx  # Documents 列表
│   │   │       ├── tasks/page.tsx      # Kanban 看板
│   │   │       ├── knowledge/page.tsx  # 知识库查询
│   │   │       ├── proposals/page.tsx  # 提议列表
│   │   │       └── activity/page.tsx   # 活动流
│   │   │
│   │   ├── agents/
│   │   │   ├── page.tsx        # Agent 管理
│   │   │   └── [id]/page.tsx   # Agent 详情/Key 管理
│   │   │
│   │   └── api/                # API Routes
│   │       ├── auth/
│   │       │   └── [...nextauth]/route.ts
│   │       ├── projects/
│   │       │   ├── route.ts    # GET (list), POST (create)
│   │       │   └── [id]/
│   │       │       ├── route.ts
│   │       │       ├── ideas/route.ts
│   │       │       ├── documents/route.ts
│   │       │       ├── tasks/route.ts
│   │       │       ├── proposals/route.ts
│   │       │       ├── knowledge/route.ts
│   │       │       └── activities/route.ts
│   │       ├── ideas/
│   │       │   └── [id]/route.ts
│   │       ├── documents/
│   │       │   └── [id]/route.ts
│   │       ├── tasks/
│   │       │   └── [id]/
│   │       │       ├── route.ts
│   │       │       └── comments/route.ts
│   │       ├── proposals/
│   │       │   └── [id]/
│   │       │       ├── route.ts
│   │       │       ├── approve/route.ts
│   │       │       └── reject/route.ts
│   │       ├── agents/
│   │       │   ├── route.ts
│   │       │   └── [id]/
│   │       │       ├── route.ts
│   │       │       └── keys/route.ts
│   │       ├── activities/
│   │       │   └── route.ts
│   │       └── mcp/
│   │           └── route.ts    # MCP HTTP 端点
│   │
│   ├── components/             # React 组件
│   │   ├── ui/                 # shadcn/ui 组件
│   │   ├── layout/
│   │   │   ├── header.tsx
│   │   │   ├── sidebar.tsx
│   │   │   └── nav.tsx
│   │   ├── idea/
│   │   │   ├── idea-card.tsx
│   │   │   ├── idea-form.tsx
│   │   │   └── idea-list.tsx
│   │   ├── document/
│   │   │   ├── document-card.tsx
│   │   │   ├── document-viewer.tsx
│   │   │   └── document-list.tsx
│   │   ├── kanban/
│   │   │   ├── board.tsx
│   │   │   ├── column.tsx
│   │   │   └── card.tsx
│   │   ├── task/
│   │   │   ├── task-card.tsx
│   │   │   ├── task-detail.tsx
│   │   │   └── task-form.tsx
│   │   ├── proposal/
│   │   │   ├── proposal-card.tsx
│   │   │   ├── proposal-review.tsx
│   │   │   ├── proposal-timeline.tsx
│   │   │   └── approval-buttons.tsx
│   │   ├── knowledge/
│   │   │   ├── knowledge-search.tsx
│   │   │   └── knowledge-results.tsx
│   │   └── activity/
│   │       ├── activity-feed.tsx
│   │       └── activity-item.tsx
│   │
│   ├── lib/                    # 核心库
│   │   ├── prisma.ts           # Prisma Client 单例
│   │   ├── auth.ts             # NextAuth 配置
│   │   ├── api-key.ts          # API Key 验证
│   │   └── utils.ts            # 工具函数
│   │
│   ├── services/               # 业务逻辑层
│   │   ├── project.service.ts
│   │   ├── idea.service.ts
│   │   ├── document.service.ts
│   │   ├── task.service.ts
│   │   ├── proposal.service.ts
│   │   ├── knowledge.service.ts
│   │   ├── agent.service.ts
│   │   ├── activity.service.ts
│   │   └── mcp.service.ts
│   │
│   ├── mcp/                    # MCP Server 实现
│   │   ├── server.ts           # MCP Server 初始化
│   │   ├── tools/
│   │   │   ├── index.ts
│   │   │   ├── personal/       # Personal Agent 工具
│   │   │   │   ├── get-project.ts
│   │   │   │   ├── query-knowledge.ts
│   │   │   │   ├── get-documents.ts
│   │   │   │   ├── get-document.ts
│   │   │   │   ├── get-task.ts
│   │   │   │   ├── list-tasks.ts
│   │   │   │   ├── update-task.ts
│   │   │   │   ├── add-comment.ts
│   │   │   │   ├── report-work.ts
│   │   │   │   ├── get-activity.ts
│   │   │   │   └── checkin.ts
│   │   │   └── pm/             # PM Agent 工具
│   │   │       ├── get-ideas.ts
│   │   │       ├── create-proposal.ts
│   │   │       ├── get-proposals.ts
│   │   │       ├── analyze-progress.ts
│   │   │       └── identify-risks.ts
│   │   └── middleware.ts       # MCP 认证中间件
│   │
│   └── types/                  # TypeScript 类型定义
│       ├── api.ts
│       ├── mcp.ts
│       └── index.ts
│
├── skill/                      # Agent Skill 文件
│   ├── pm/
│   │   ├── SKILL.md
│   │   └── HEARTBEAT.md
│   └── personal/
│       ├── SKILL.md
│       └── HEARTBEAT.md
│
└── tests/
    ├── unit/
    └── e2e/
```

---

## 4. 数据模型

### 4.0 数据库设计原则：无外键约束

**设计决策**：Chorus 采用 **Prisma 关系模式（relationMode = "prisma"）**，不在数据库层面创建外键约束，所有关系由 Prisma Client 在应用层管理。

**配置方式**：

```prisma
// prisma/schema.prisma
datasource db {
  provider     = "postgresql"
  url          = env("DATABASE_URL")
  relationMode = "prisma"  // 关系由 Prisma 管理，不创建数据库 FK
}
```

**为什么这样设计**：

| 优势 | 说明 |
|-----|------|
| **迁移灵活性** | 无 FK 约束意味着可以更自由地修改表结构，无需处理级联删除顺序 |
| **数据库兼容性** | 支持不原生支持 FK 的数据库（如 PlanetScale），便于未来迁移 |
| **性能优化** | 避免数据库层面的 FK 检查开销，批量操作更高效 |
| **应用层控制** | 引用完整性在 Prisma Client 层面维护，逻辑更清晰 |

**关系定义示例**：

```prisma
model Project {
  id        Int      @id @default(autoincrement())
  companyId Int
  company   Company  @relation(fields: [companyId], references: [id])
  tasks     Task[]
  // 关系在 Prisma 层面定义，数据库不创建 FK 约束
}

model Task {
  id        Int      @id @default(autoincrement())
  projectId Int
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  // onDelete: Cascade 由 Prisma Client 模拟执行，非数据库级联
}
```

**注意事项**：

1. **引用完整性**：Prisma Client 会在查询时模拟 FK 行为，确保关系完整性
2. **级联操作**：`onDelete: Cascade` 等操作由 Prisma 在应用层执行，需要额外数据库查询
3. **原始 SQL**：使用 `$queryRaw` 时不受 Prisma 关系管理，需自行确保数据一致性
4. **索引建议**：虽然无 FK，仍建议在关系字段上创建索引以优化查询性能

```prisma
model Task {
  projectId Int
  project   Project @relation(fields: [projectId], references: [id])

  @@index([projectId])  // 手动添加索引
}
```

### 4.1 ER 图

**ID 设计原则**：所有实体使用双 ID 模式
- `id`: 数字自增主键（内部 FK 引用）
- `uuid`: UUID 字符串（外部 API 暴露）

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   Company   │───┬───│    User     │       │   Agent     │
│             │   │   │             │───────│             │
│  id (Int)   │   │   │  id (Int)   │       │  id (Int)   │
│  uuid       │   │   │  uuid       │       │  uuid       │
│  name       │   │   │  companyId  │       │  companyId  │
│  createdAt  │   │   │  oidcSub    │       │  name       │
└─────────────┘   │   │  email      │       │  role       │
       │          │   │  name       │       │  ownerId    │
       │          │   └─────────────┘       └─────────────┘
       │          │                                │
       │          │   ┌─────────────┐              │
       │          └───│   ApiKey    │──────────────┘
       │              │             │
       │              │  id (Int)   │
       │              │  uuid       │
       │              │  companyId  │
       │              │  agentId    │
       │              │  key        │
       │              │  lastUsed   │
       │              │  expiresAt  │
       │              │  revokedAt  │
       │              └─────────────┘
       │
       ├──────────────────────────────────────────────────────┐
       │                                                      │
┌──────▼──────┐                                        ┌──────▼──────┐
│   Project   │                                        │  Proposal   │
│             │                                        │             │
│  id (Int)   │                                        │  id (Int)   │
│  uuid       │       ┌─────────────┐                  │  uuid       │
│  companyId  │───────│    Idea     │                  │  companyId  │
│  name       │       │             │                  │  projectId  │
│  description│       │  id (Int)   │                  │  title      │
│  createdAt  │       │  uuid       │                  │  inputType  │
└─────────────┘       │  companyId  │──────────────────│  inputIds   │
       │              │  projectId  │                  │  outputType │
       │              │  content    │                  │  outputData │
       │              │  attachments│                  │  status     │
       │              │  createdBy  │                  │  createdBy  │
       │              └─────────────┘                  │  reviewedBy │
       │                                               └─────────────┘
       │              ┌─────────────┐                         │
       │              │  Document   │◄────────────────────────┘
       │              │             │     (outputType=document)
       │              │  id (Int)   │
       │              │  uuid       │
       │              │  companyId  │
       │              │  projectId  │
       │              │  type       │  (prd | tech_design | adr)
       │              │  title      │
       │              │  content    │
       │              │  version    │
       │              │  proposalId │
       │              └─────────────┘
       │
       │              ┌─────────────┐
       ├──────────────│    Task     │◄────────────────────────┐
       │              │             │     (outputType=task)   │
       │              │  id (Int)   │                         │
       │              │  uuid       │                         │
       │              │  companyId  │                         │
       │              │  projectId  │                         │
       │              │  title      │                         │
       │              │  description│                         │
       │              │  status     │                         │
       │              │  assigneeType                         │
       │              │  assigneeId │                         │
       │              │  proposalId │─────────────────────────┘
       │              └─────────────┘
       │                     │
       │              ┌──────▼──────┐
       └──────────────│  Activity   │
                      │             │
                      │  id (Int)   │
                      │  uuid       │
                      │  companyId  │
                      │  projectId  │
                      │  ideaId     │
                      │  documentId │
                      │  proposalId │
                      │  taskId     │
                      │  actorType  │
                      │  actorId    │
                      │  action     │
                      │  payload    │
                      └─────────────┘
```

### 4.2 核心实体说明

**通用字段**：
- `id`: 数字自增主键（`Int @id @default(autoincrement())`）
- `uuid`: UUID 字符串（`String @unique @default(uuid())`）
- 内部 FK 使用数字 `id`，外部 API 暴露 `uuid`

#### Company（租户）
- 多租户隔离的根实体
- 所有数据通过 companyId 关联

#### User（用户）
- 人类用户，通过 OIDC 登录
- `oidcSub` 存储 OIDC Provider 的 subject

#### Agent（代理）
- AI Agent 实体（Claude Code 等）
- `role`: `pm` | `personal`
- 一个 Agent 可以有多个 API Key

#### ApiKey（API 密钥）
- 独立管理，支持轮换和撤销
- `key`: 实际的 API 密钥（哈希存储）
- `expiresAt`: 可选的过期时间
- `revokedAt`: 撤销时间

#### Project（项目）
- 项目容器，所有业务数据的父级
- 包含 Ideas、Documents、Tasks、Proposals、Activities

#### Idea（想法）
- 人类原始输入，可被 PM Agent 认领处理
- `title`: 标题
- `content`: 文本内容
- `attachments`: 附件列表（图片、文件等）
- `status`: `open` | `assigned` | `in_progress` | `pending_review` | `completed` | `closed`
- `assigneeType`: `user` | `agent`
- `assigneeId`: 认领者 ID
- `assignedAt`: 认领时间
- `assignedBy`: 分配者 User ID（人类分配时记录）
- `createdBy`: 创建者 User ID
- 作为 Proposal 的输入源

#### Document（文档）
- Proposal 的产物（PRD、技术设计等）
- `type`: `prd` | `tech_design` | `adr` | ...
- `content`: Markdown 格式内容
- `version`: 版本号
- `proposalId`: 来源 Proposal（可追溯）

#### Task（任务）
- Proposal 的产物或人工创建，可被 Agent/人类认领执行
- `status`: `open` | `assigned` | `in_progress` | `to_verify` | `done` | `closed`
- `priority`: `low` | `medium` | `high`
- `assigneeType`: `user` | `agent`
- `assigneeId`: 认领者 ID
- `assignedAt`: 认领时间
- `assignedBy`: 分配者 User ID（人类分配时记录）
- `proposalId`: 来源 Proposal（可追溯，可选）
- `createdBy`: 创建者 User ID 或 Agent ID

#### Proposal（提议）
- PM Agent 创建，人类审批，连接输入和输出
- **输入**：
  - `inputType`: `idea` | `document`
  - `inputIds`: 关联的输入 ID 列表（数字 ID 数组）
- **输出**：
  - `outputType`: `document` | `task`
  - `outputData`: 提议的内容（Document 草稿或 Task 列表）
- `status`: `pending` | `approved` | `rejected` | `revised`
- 批准后根据 outputType 自动创建 Document 或 Tasks

#### Activity（活动）
- 项目级活动日志
- `actorType`: `user` | `agent`
- `action`: `idea_created` | `proposal_created` | `proposal_approved` | `document_created` | `task_created` | ...
- 可关联 ideaId、documentId、proposalId、taskId 用于追溯

---

## 5. API 设计

### 5.1 REST API

#### 认证
- **Human**: OIDC + Session Cookie
- **Agent**: `Authorization: Bearer {api_key}`

#### 端点概览

**注意**：URL 中的 `:id` 参数使用 `uuid`，内部存储使用数字 `id`。

| 方法 | 路径 | 描述 | 权限 |
|-----|------|------|------|
| **Projects** |
| GET | /api/projects | 项目列表 | User, Agent |
| POST | /api/projects | 创建项目 | User |
| GET | /api/projects/:uuid | 项目详情 | User, Agent |
| PATCH | /api/projects/:uuid | 更新项目 | User |
| DELETE | /api/projects/:uuid | 删除项目 | User |
| **Ideas** |
| GET | /api/projects/:uuid/ideas | 项目 Ideas 列表 | User, PM Agent |
| POST | /api/projects/:uuid/ideas | 创建 Idea | User |
| GET | /api/ideas/:uuid | Idea 详情 | User, PM Agent |
| PATCH | /api/ideas/:uuid | 更新 Idea（包括状态） | User, PM Agent |
| POST | /api/ideas/:uuid/claim | 认领 Idea | PM Agent |
| POST | /api/ideas/:uuid/release | 放弃认领 Idea | PM Agent |
| DELETE | /api/ideas/:uuid | 删除 Idea | User |
| **Documents** |
| GET | /api/projects/:uuid/documents | 项目 Documents 列表 | User, Agent |
| GET | /api/documents/:uuid | Document 详情 | User, Agent |
| PATCH | /api/documents/:uuid | 更新 Document | User |
| **Tasks** |
| GET | /api/projects/:uuid/tasks | 项目任务列表 | User, Agent |
| POST | /api/projects/:uuid/tasks | 创建任务（手动） | User |
| GET | /api/tasks/:uuid | 任务详情 | User, Agent |
| PATCH | /api/tasks/:uuid | 更新任务（包括状态） | User, Agent（认领者） |
| POST | /api/tasks/:uuid/claim | 认领 Task | Developer Agent |
| POST | /api/tasks/:uuid/release | 放弃认领 Task | Developer Agent |
| POST | /api/tasks/:uuid/comments | 添加评论 | User, Agent |
| **Proposals** |
| GET | /api/projects/:uuid/proposals | 项目提议列表 | User, PM Agent |
| POST | /api/projects/:uuid/proposals | 创建提议 | PM Agent |
| GET | /api/proposals/:uuid | 提议详情 | User, PM Agent |
| POST | /api/proposals/:uuid/approve | 批准提议 | User |
| POST | /api/proposals/:uuid/reject | 拒绝提议 | User |
| **Knowledge** |
| GET | /api/projects/:uuid/knowledge | 统一查询知识库 | User, Agent |
| **Agents** |
| GET | /api/agents | Agent 列表 | User |
| POST | /api/agents | 创建 Agent | User |
| GET | /api/agents/:uuid | Agent 详情 | User |
| POST | /api/agents/:uuid/keys | 创建 API Key | User |
| DELETE | /api/agents/:uuid/keys/:keyUuid | 撤销 API Key | User |
| **Activities** |
| GET | /api/projects/:uuid/activities | 项目活动列表 | User, Agent |
| **Agent 自助** |
| GET | /api/me/assignments | 获取自己认领的 Ideas + Tasks | Agent |
| GET | /api/projects/:uuid/available | 获取可认领的 Ideas + Tasks | Agent |

### 5.2 MCP API

#### 端点
```
POST /api/mcp
```

#### Transport
Streamable HTTP Transport（支持 SSE）

#### 认证
```
Header: Authorization: Bearer {api_key}
```

根据 API Key 关联的 Agent role，返回不同的工具集。

#### 公共工具（All Agents）

| 工具 | 描述 |
|-----|------|
| `chorus_get_project` | 获取项目详情和上下文 |
| `chorus_query_knowledge` | 统一查询知识库（Ideas/Docs/Tasks） |
| `chorus_get_documents` | 获取项目 Documents 列表 |
| `chorus_get_document` | 获取单个 Document 详情 |
| `chorus_get_task` | 获取任务详情 |
| `chorus_list_tasks` | 列出任务 |
| `chorus_get_activity` | 获取项目活动流 |
| `chorus_add_comment` | 添加评论（Idea/Task/Proposal/Document） |
| `chorus_checkin` | 心跳签到 |
| **自助查询** | |
| `chorus_get_my_assignments` | 获取自己认领的所有 Ideas + Tasks |
| `chorus_get_available_ideas` | 获取可认领的 Ideas（status=open） |
| `chorus_get_available_tasks` | 获取可认领的 Tasks（status=open） |

#### Developer Agent 工具

| 工具 | 描述 |
|-----|------|
| `chorus_claim_task` | 认领 Task（open → assigned） |
| `chorus_release_task` | 放弃认领 Task（assigned → open） |
| `chorus_update_task` | 更新任务状态（仅认领者可操作） |
| `chorus_submit_for_verify` | 提交任务等待人类验证 |
| `chorus_report_work` | 报告工作完成 |

#### PM Agent 工具

| 工具 | 描述 |
|-----|------|
| `chorus_pm_get_ideas` | 获取项目 Ideas 列表（人类输入） |
| `chorus_claim_idea` | 认领 Idea（open → assigned） |
| `chorus_release_idea` | 放弃认领 Idea（assigned → open） |
| `chorus_update_idea_status` | 更新 Idea 状态（仅认领者可操作） |
| `chorus_pm_create_proposal` | 创建提议（PRD/任务拆分等） |
| `chorus_pm_get_proposals` | 获取提议列表和状态 |
| `chorus_pm_analyze_progress` | 分析项目进度 |
| `chorus_pm_identify_risks` | 识别风险和阻塞 |

PM Agent 同时拥有 Developer Agent 的所有工具（全能角色）。

#### Proposal 输入/输出说明

| 场景 | inputType | inputIds | outputType | outputData |
|-----|-----------|----------|------------|------------|
| Ideas → PRD | `idea` | Idea IDs | `document` | PRD 草稿 |
| PRD → Tasks | `document` | Document ID | `task` | Task 列表 |
| PRD → Tech Design | `document` | Document ID | `document` | 技术设计草稿 |

---

## 6. 认证与授权

### 6.1 人类认证（OIDC + PKCE）

```
┌──────────┐     ┌──────────┐     ┌──────────────┐
│  Browser │     │  Chorus  │     │    OIDC      │
│          │     │  Server  │     │   Provider   │
└────┬─────┘     └────┬─────┘     └──────┬───────┘
     │                │                   │
     │  1. Login      │                   │
     │ ──────────────>│                   │
     │                │                   │
     │  2. Redirect   │                   │
     │ <──────────────│                   │
     │                │                   │
     │  3. Auth Request (PKCE)            │
     │ ──────────────────────────────────>│
     │                │                   │
     │  4. User Login │                   │
     │ <──────────────────────────────────│
     │                │                   │
     │  5. Callback with code             │
     │ ──────────────>│                   │
     │                │                   │
     │                │  6. Exchange code │
     │                │ ─────────────────>│
     │                │                   │
     │                │  7. Tokens        │
     │                │ <─────────────────│
     │                │                   │
     │  8. Set Session Cookie             │
     │ <──────────────│                   │
```

### 6.2 Agent 认证（API Key）

```
┌──────────┐     ┌──────────┐     ┌──────────────┐
│  Claude  │     │  Chorus  │     │   Database   │
│   Code   │     │  Server  │     │              │
└────┬─────┘     └────┬─────┘     └──────┬───────┘
     │                │                   │
     │  MCP Request   │                   │
     │  + API Key     │                   │
     │ ──────────────>│                   │
     │                │                   │
     │                │  Validate Key     │
     │                │ ─────────────────>│
     │                │                   │
     │                │  Agent + Role     │
     │                │ <─────────────────│
     │                │                   │
     │                │  Check Role       │
     │                │  Return Tools     │
     │                │                   │
     │  MCP Response  │                   │
     │ <──────────────│                   │
```

### 6.3 权限模型

| 操作 | User | PM Agent | Personal Agent |
|-----|------|----------|----------------|
| 创建项目 | ✓ | ✗ | ✗ |
| 查看项目 | ✓ | ✓ | ✓ |
| 创建任务 | ✓ | ✓ | ✗ |
| 更新任务 | ✓ | ✓ | ✓（仅分配给自己的） |
| 创建提议 | ✗ | ✓ | ✗ |
| 审批提议 | ✓ | ✗ | ✗ |
| 管理 Agent | ✓ | ✗ | ✗ |

---

## 7. 核心流程

### 7.1 Reversed Conversation 工作流（Idea → Proposal → Document/Task）

```
┌─────────────────────────────────────────────────────────────────┐
│  1. 人类创建 Ideas                                               │
│     - 文本："我想实现用户认证功能，支持 OAuth 和邮箱密码登录"        │
│     - 附件：竞品截图、设计草图等                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. PM Agent 创建 PRD Proposal                                   │
│     - 获取 Ideas (chorus_pm_get_ideas)                          │
│     - 读取项目知识库 (chorus_query_knowledge)                    │
│     - 创建提议 (chorus_pm_create_proposal)                       │
│       inputType: idea, inputIds: [idea1, idea2]                 │
│       outputType: document, outputData: { PRD 草稿 }             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. 人类审批 PRD Proposal (Web UI)                               │
│     - 查看 PRD 草稿                                              │
│     - 批准 → 创建 Document(PRD)                                  │
│     - 修改 → 返回修改                                            │
│     - 拒绝 → 标记拒绝                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. PM Agent 创建 Task Breakdown Proposal                        │
│     - 读取 Document(PRD)                                         │
│     - 创建提议 (chorus_pm_create_proposal)                       │
│       inputType: document, inputIds: [prd_id]                   │
│       outputType: task, outputData: { Task 列表 }                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. 人类审批 Task Breakdown Proposal (Web UI)                    │
│     - 查看任务列表                                               │
│     - 批准 → 创建 Tasks (status: todo)                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. Personal Agent 执行任务                                       │
│     - 获取任务 (chorus_get_task)                                 │
│     - 获取相关文档 (chorus_get_document)                         │
│     - 执行开发工作                                               │
│     - 报告完成 (chorus_report_work)                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  7. PM Agent 持续追踪                                            │
│     - 分析进度 (chorus_pm_analyze_progress)                      │
│     - 识别风险 (chorus_pm_identify_risks)                        │
│     - 必要时创建新 Proposal 调整计划                              │
└─────────────────────────────────────────────────────────────────┘
```

**完整追溯链**：
```
Ideas → Proposal → Document(PRD) → Proposal → Tasks
                       ↓
               Proposal → Document(Tech Design)
```

每个 Task/Document 都可以追溯到源头 Proposal 和 Ideas。

### 7.2 任务状态流转

```
                    ┌──────────────┐
                    │   created    │
                    │  (from UI    │
                    │  or proposal)│
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
         ┌─────────│     open     │←─────────────────┐
         │         │  (待认领)     │                  │
         │         └──────┬───────┘                  │
         │                │                          │
         │                │ Agent/User 认领           │ 放弃认领
         │                ▼                          │
         │         ┌──────────────┐                  │
         │         │   assigned   │──────────────────┘
         │         │  (已认领)     │
         │         └──────┬───────┘
         │                │
         │                │ 开始工作
         │                ▼
         │         ┌──────────────┐
         │         │ in_progress  │
         │         │  (执行中)     │
         │         └──────┬───────┘
         │                │
         │                │ 完成执行
         │                ▼
         │         ┌──────────────┐
         │         │  to_verify   │
         │         │  (待人类验证) │
         │         └──────┬───────┘
         │                │
         │                │ 人类验证通过
         │                ▼
         │         ┌──────────────┐
         │         │     done     │
         │         │   (完成)     │
         │         └──────────────┘
         │
         │         ┌──────────────┐
         └────────→│    closed    │  (任何阶段可关闭)
                   │   (关闭)     │
                   └──────────────┘
```

**认领规则**：
- 只有 `open` 状态的任务可被认领
- 只有认领者（assignee）可以更新状态
- 人类可以强制重新分配任何状态的任务
- 所有人都可以评论任何状态的任务

### 7.3 Idea 状态流转

```
                    ┌──────────────┐
                    │   created    │
                    │  (人类创建)   │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
         ┌─────────│     open     │←─────────────────┐
         │         │  (待认领)     │                  │
         │         └──────┬───────┘                  │
         │                │                          │
         │                │ PM Agent 认领             │ 放弃认领
         │                ▼                          │
         │         ┌──────────────┐                  │
         │         │   assigned   │──────────────────┘
         │         │  (已认领)     │
         │         └──────┬───────┘
         │                │
         │                │ 开始处理
         │                ▼
         │         ┌──────────────┐
         │         │ in_progress  │
         │         │ (产出 Proposal)│
         │         └──────┬───────┘
         │                │
         │                │ 提交 Proposal
         │                ▼
         │         ┌──────────────┐
         │         │pending_review│
         │         │ (待人类审批)  │
         │         └──────┬───────┘
         │                │
         │                │ Proposal 审批通过
         │                ▼
         │         ┌──────────────┐
         │         │  completed   │
         │         │   (完成)     │
         │         └──────────────┘
         │
         │         ┌──────────────┐
         └────────→│    closed    │  (任何阶段可关闭)
                   │   (关闭)     │
                   └──────────────┘
```

**认领规则**：
- 只有 `open` 状态的 Idea 可被认领
- 只有认领者（assignee）可以更新状态
- 人类可以强制重新分配任何状态的 Idea
- 所有人都可以评论任何状态的 Idea

### 7.4 提议审批流程

```
                           ┌──────────────────────────────────────┐
                           │           outputType 决定            │
                           │                                      │
┌──────────────┐     ┌─────▼──────┐     ┌──────────────────────┐  │
│   pending    │────>│  approved  │────>│  outputType=document │──┼──> 创建 Document
└──────────────┘     └────────────┘     └──────────────────────┘  │
       │                                ┌──────────────────────┐  │
       │                                │  outputType=task     │──┼──> 创建 Tasks
       │                                └──────────────────────┘  │
       │                                                          │
       ▼                                                          │
┌──────────────┐                                                  │
│   rejected   │                                                  │
└──────────────┘                                                  │
       │                                                          │
       ▼                                                          │
┌──────────────┐                                                  │
│   revised    │─────────────────────────────────────────────────>┘
└──────────────┘    (修改后重新提交)
```

**审批结果**：
- `approved` + `outputType=document` → 创建 Document，记录 proposalId
- `approved` + `outputType=task` → 批量创建 Tasks，记录 proposalId
- `rejected` → 结束，可重新提议
- `revised` → 修改后重新审批

---

## 8. 部署架构

### 8.1 本地开发

```yaml
# docker-compose.yml
version: '3.8'

services:
  chorus:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgres://chorus:chorus@db:5432/chorus
      - NEXTAUTH_URL=http://localhost:3000
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - OIDC_ISSUER=${OIDC_ISSUER}
      - OIDC_CLIENT_ID=${OIDC_CLIENT_ID}
      - OIDC_CLIENT_SECRET=${OIDC_CLIENT_SECRET}
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - ./src:/app/src
      - ./prisma:/app/prisma

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=chorus
      - POSTGRES_PASSWORD=chorus
      - POSTGRES_DB=chorus
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U chorus"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

### 8.2 生产部署（未来）

```
┌─────────────────────────────────────────────────────────────────┐
│                         Load Balancer                           │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       ┌──────────┐    ┌──────────┐    ┌──────────┐
       │  Chorus  │    │  Chorus  │    │  Chorus  │
       │ Instance │    │ Instance │    │ Instance │
       └──────────┘    └──────────┘    └──────────┘
              │               │               │
              └───────────────┼───────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   PostgreSQL      │
                    │   (Primary)       │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │   PostgreSQL      │
                    │   (Replica)       │
                    └───────────────────┘
```

---

## 9. 安全考虑

### 9.1 API Key 安全

- API Key 使用 SHA-256 哈希存储
- 只在创建时返回明文，之后无法恢复
- 支持过期时间和手动撤销
- 记录最后使用时间

### 9.2 数据隔离

- 所有查询都包含 companyId 过滤
- Prisma 中间件强制多租户隔离

### 9.3 输入验证

- 使用 Zod 进行请求体验证
- 防止 SQL 注入（Prisma 参数化查询）
- 防止 XSS（React 自动转义）

### 9.4 速率限制

- API 请求限流
- 防止暴力破解 API Key

---

## 10. 扩展性考虑

### 10.1 未来功能

| 功能 | 描述 | 优先级 |
|-----|------|-------|
| Git 集成 | 关联 commit 和 PR | P1 |
| 实时通知 | WebSocket 推送 | P1 |
| 复杂依赖 | 任务 DAG | P2 |
| 语义搜索 | pgvector 知识库搜索 | P2 |
| 多 PM Agent | 协作规划 | P2 |
| 移动端 | PWA 或原生 App | P3 |

### 10.2 技术储备

- **pgvector**: PostgreSQL 已原生支持，后续可无缝添加
- **WebSocket**: Next.js 支持，可用于实时通知
- **Redis**: 如需缓存或消息队列，可后续引入

---

## 附录

### A. 环境变量

```bash
# Database
DATABASE_URL=postgres://chorus:chorus@localhost:5432/chorus

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key

# OIDC Provider
OIDC_ISSUER=https://your-oidc-provider.com
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
```

### B. 参考文档

- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [NextAuth.js Documentation](https://next-auth.js.org/)
- [shadcn/ui](https://ui.shadcn.com/)
