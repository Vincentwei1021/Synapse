# Chorus 执行计划

## 总览

基于 PRD v0.14，分 6 个里程碑完成 MVP 开发。

**参考文档**：
- PRD: `docs/PRD_Chorus.md`
- 技术架构: `docs/ARCHITECTURE.md`
- UI 设计: `docs/design.pen`

---

## 开发环境

### 启动方式

```bash
# 仅启动数据库（推荐开发模式）
pnpm docker:db

# 本地启动 Next.js（需要 Node 22）
nvm use 22
pnpm dev

# 完整容器启动（包含 app）
pnpm docker:up

# 停止所有容器
pnpm docker:down
```

### 数据库连接

| 环境 | DATABASE_URL |
|-----|-------------|
| 本地开发 | `postgresql://chorus:chorus@localhost:5433/chorus` |
| Docker 内部 | `postgresql://chorus:chorus@db:5432/chorus` |

### 常用命令

```bash
# Prisma 迁移
DATABASE_URL="postgresql://chorus:chorus@localhost:5433/chorus" pnpm db:migrate:dev --name <name>

# Prisma Studio
DATABASE_URL="postgresql://chorus:chorus@localhost:5433/chorus" pnpm db:studio

# 生成 Prisma Client
pnpm db:generate
```

---

## M0: 项目骨架 (Week 1)

### 目标
搭建完整的项目基础设施，确保开发环境可用。

> **架构参考**: `ARCHITECTURE.md` §2 技术栈, §3 系统架构

### 任务清单

#### M0.1 项目初始化 ✅
> 架构参考: `ARCHITECTURE.md` §2.1 核心技术选型

- [x] 创建 Next.js 15 项目 (App Router)
- [x] 配置 TypeScript
- [x] 配置 ESLint + Prettier
- [x] 配置路径别名 (@/)

#### M0.2 数据库层 ✅
> 架构参考: `ARCHITECTURE.md` §4.0 数据库设计原则, §4.1 ER 图, §4.2 核心实体说明

- [x] 安装 Prisma 7.0.0 + @prisma/adapter-pg
- [x] 创建 schema.prisma（完整数据模型：11 个表）
  > 架构参考: `ARCHITECTURE.md` §4.0 无外键约束设计（relationMode = "prisma"）
- [x] 配置 PostgreSQL 连接（pg pool）
- [x] 生成 Prisma Client
- [x] 运行初始迁移

#### M0.3 容器化 ✅
> 架构参考: `ARCHITECTURE.md` §8 部署架构

- [x] 创建 Dockerfile（多阶段构建，Node 22）
- [x] 创建 docker-compose.yml
  - db 服务：默认启动
  - app 服务：需要 `--profile full` 启动
- [x] 配置环境变量 (.env.example)
- [x] 使用 pnpm 包管理器

#### M0.4 UI 基础 ✅
> 架构参考: `ARCHITECTURE.md` §2.1 核心技术选型 - UI 组件

- [x] 安装 Tailwind CSS v4
- [x] 安装 shadcn/ui 依赖
- [x] 创建 Button、Card 组件
- [x] 创建 Chorus 欢迎页面

#### M0.5 验证 ✅
- [x] docker compose up -d db 启动成功
- [x] 访问 http://localhost:3000 显示首页
- [x] Prisma migrate 成功
- [x] 数据库连接正常（/api/health 返回 ok）

### 交付物
- 可运行的 Next.js 项目
- 完整的 Prisma Schema
- Docker Compose 一键启动

---

## M1: 后端 API (Week 2)

### 目标
实现所有核心实体的 CRUD API。

> **PRD 参考**: `PRD_Chorus.md` §5.4 MCP Server 实现, §7.3 数据模型
> **架构参考**: `ARCHITECTURE.md` §4 数据模型, §5 API 设计

### 任务清单

#### M1.1 基础设施
> 架构参考: `ARCHITECTURE.md` §3.1 整体架构 - Service Layer

- [ ] 创建 API 响应格式标准
  > 架构参考: `ARCHITECTURE.md` §5.1 REST API
- [ ] 创建错误处理中间件
- [ ] 创建 Prisma client 单例
  > 代码位置: `src/lib/prisma.ts`
  > 架构参考: `ARCHITECTURE.md` §4.0 数据库设计原则

#### M1.2 认证 API
> 架构参考: `ARCHITECTURE.md` §6 认证与授权

- [ ] OIDC 配置和回调
  > PRD 参考: `PRD_Chorus.md` §7.4 认证流程
  > 架构参考: `ARCHITECTURE.md` §6.1 人类认证（OIDC + PKCE）
- [ ] API Key 验证中间件
  > 架构参考: `ARCHITECTURE.md` §6.2 Agent 认证（API Key）
- [ ] 获取当前用户/Agent

#### M1.3 Projects API
> 架构参考: `ARCHITECTURE.md` §4.2 核心实体说明 - Project
> 设计参考: `design.pen` - "Chorus - Projects", "Chorus - New Project", "Chorus - Project Overview"

- [ ] GET /api/projects - 项目列表
- [ ] POST /api/projects - 创建项目
- [ ] GET /api/projects/[id] - 项目详情
- [ ] PATCH /api/projects/[id] - 更新项目
- [ ] DELETE /api/projects/[id] - 删除项目

#### M1.4 Ideas API
> PRD 参考: `PRD_Chorus.md` §4.1 F5 Idea→Proposal→Document/Task 工作流
> 架构参考: `ARCHITECTURE.md` §4.2 核心实体说明 - Idea, §7.3 Idea 状态流转
> 设计参考: `design.pen` - "Chorus - Project Ideas", "Modal - Claim Assignment"

- [ ] GET /api/projects/[id]/ideas - Ideas 列表
- [ ] POST /api/projects/[id]/ideas - 创建 Idea
- [ ] GET /api/ideas/[ideaId] - Idea 详情
- [ ] PATCH /api/ideas/[ideaId] - 更新 Idea
- [ ] POST /api/ideas/[ideaId]/claim - 认领 Idea
  > PRD 参考: `PRD_Chorus.md` §4.1 F5 认领规则、认领方式
  > 架构参考: `ARCHITECTURE.md` §7.3 Idea 状态流转
- [ ] POST /api/ideas/[ideaId]/release - 放弃认领 Idea
- [ ] DELETE /api/ideas/[ideaId] - 删除 Idea

#### M1.5 Documents API
> 架构参考: `ARCHITECTURE.md` §4.2 核心实体说明 - Document
> 设计参考: `design.pen` - "Chorus - Documents List", "Chorus - Document Preview"

- [ ] GET /api/projects/[id]/documents - Documents 列表
- [ ] POST /api/projects/[id]/documents - 创建 Document
- [ ] GET /api/documents/[docId] - Document 详情
- [ ] PATCH /api/documents/[docId] - 更新 Document
- [ ] DELETE /api/documents/[docId] - 删除 Document

#### M1.6 Tasks API
> PRD 参考: `PRD_Chorus.md` §3.3.1 任务系统（六阶段工作流、认领规则）
> 架构参考: `ARCHITECTURE.md` §4.2 核心实体说明 - Task, §7.2 任务状态流转
> 设计参考: `design.pen` - "Chorus - Project Tasks (Kanban)", "Task Detail Panel", "Modal - Claim Task"

- [ ] GET /api/projects/[id]/tasks - Tasks 列表
- [ ] POST /api/projects/[id]/tasks - 创建 Task
- [ ] GET /api/tasks/[taskId] - Task 详情
- [ ] PATCH /api/tasks/[taskId] - 更新 Task（状态、分配）
  > PRD 参考: Task 状态流转 open→assigned→in_progress→to_verify→done→closed
  > 架构参考: `ARCHITECTURE.md` §7.2 任务状态流转图
- [ ] POST /api/tasks/[taskId]/claim - 认领 Task
  > PRD 参考: `PRD_Chorus.md` §3.3.1 认领方式（Agent 自己认领 / Human Assign）
- [ ] POST /api/tasks/[taskId]/release - 放弃认领 Task
- [ ] DELETE /api/tasks/[taskId] - 删除 Task

#### M1.7 Proposals API
> PRD 参考: `PRD_Chorus.md` §4.1 F5 Proposal 的本质（输入→输出模型）
> 架构参考: `ARCHITECTURE.md` §4.2 核心实体说明 - Proposal, §7.4 提议审批流程
> 设计参考: `design.pen` - "Chorus - Project Proposals", "Chorus - Proposal Output (PRD)", "Chorus - Proposal Output (Tasks)", "Chorus - Proposal Output (Document Diff)"

- [ ] GET /api/projects/[id]/proposals - Proposals 列表
- [ ] POST /api/projects/[id]/proposals - 创建 Proposal（PM 专属）
- [ ] GET /api/proposals/[propId] - Proposal 详情
- [ ] POST /api/proposals/[propId]/approve - 审批通过 Proposal（Human 专属）
  > 架构参考: `ARCHITECTURE.md` §7.4 提议审批流程
- [ ] POST /api/proposals/[propId]/reject - 拒绝 Proposal（Human 专属）

#### M1.8 Comments API
> 架构参考: `ARCHITECTURE.md` §4.2 核心实体说明 - Comment（多态关联）

- [ ] GET /api/comments?targetType=&targetId= - 获取评论
- [ ] POST /api/comments - 添加评论

#### M1.9 Activity API
> PRD 参考: `PRD_Chorus.md` §3.3.3 通知与协调
> 架构参考: `ARCHITECTURE.md` §4.2 核心实体说明 - Activity

- [ ] GET /api/projects/[id]/activity - 项目活动流
- [ ] POST /api/activity - 记录活动（内部）

#### M1.10 Agents API
> PRD 参考: `PRD_Chorus.md` §4.1 F5.5 Agent 管理页面
> 架构参考: `ARCHITECTURE.md` §4.2 核心实体说明 - Agent
> 设计参考: `design.pen` - "Chorus - All Agents"

- [ ] GET /api/agents - Agent 列表
- [ ] POST /api/agents - 创建 Agent（Human 专属）
- [ ] GET /api/agents/[id] - Agent 详情
- [ ] PATCH /api/agents/[id] - 更新 Agent
- [ ] DELETE /api/agents/[id] - 删除 Agent

#### M1.11 API Keys API
> PRD 参考: `PRD_Chorus.md` §4.1 F5.6 API Key 管理
> 架构参考: `ARCHITECTURE.md` §4.2 核心实体说明 - ApiKey, §9.1 API Key 安全
> 设计参考: `design.pen` - "Chorus - Settings", "Modal - Create API Key"

- [ ] GET /api/api-keys - API Key 列表
- [ ] POST /api/api-keys - 创建 API Key（Human 专属）
  > 架构参考: `ARCHITECTURE.md` §9.1 API Key 安全 - SHA-256 哈希存储
- [ ] DELETE /api/api-keys/[id] - 撤销 API Key

#### M1.12 Agent 自助 API
> PRD 参考: `PRD_Chorus.md` §5.4 MCP 工具列表（chorus_get_my_assignments 查询逻辑）
> 架构参考: `ARCHITECTURE.md` §5.1 REST API - Agent 自助

- [ ] GET /api/me/assignments - 获取自己认领的 Ideas + Tasks
  > 查询逻辑: assigneeId=当前Agent **或** assigneeId=当前Agent的Owner（人类分配给自己时）
- [ ] GET /api/projects/[id]/available - 获取可认领的 Ideas + Tasks（status=open）

### 交付物
- 完整的 REST API
- API 文档（OpenAPI）
- 单元测试

---

## M2: MCP Server (Week 3)

### 目标
实现 MCP HTTP 端点，让 Claude Code 可以调用 Chorus API。

> **PRD 参考**: `PRD_Chorus.md` §5.4 MCP Server 实现
> **架构参考**: `ARCHITECTURE.md` §5.2 MCP API

### 任务清单

#### M2.1 MCP 基础
> 架构参考: `ARCHITECTURE.md` §3.2 目录结构 - src/mcp/

- [ ] 安装 @modelcontextprotocol/sdk
- [ ] 创建 MCP Server 实例
  > 代码位置: `src/mcp/server.ts`
- [ ] 配置 HTTP Streamable Transport
- [ ] 创建 /api/mcp 端点
  > 代码位置: `src/app/api/mcp/route.ts`

#### M2.2 公开工具（All Agents）
> PRD 参考: `PRD_Chorus.md` §5.4 MCP 工具列表 - 读取（公开）
> 架构参考: `ARCHITECTURE.md` §5.2 MCP API - 公共工具

- [ ] chorus_get_project - 获取项目背景信息
- [ ] chorus_query_knowledge - 统一查询知识库
- [ ] chorus_get_ideas - 获取 Ideas 列表
- [ ] chorus_get_documents - 获取 Documents 列表
- [ ] chorus_get_document - 获取单个 Document 详情
- [ ] chorus_get_proposals - 获取提议列表和状态
- [ ] chorus_get_task - 获取任务详情和上下文
- [ ] chorus_list_tasks - 列出任务
- [ ] chorus_get_activity - 获取项目活动流
- [ ] chorus_add_comment - 评论 Idea/Proposal/Task/Document
- [ ] chorus_checkin - 心跳签到

#### M2.3 自助查询工具（All Agents）
> PRD 参考: `PRD_Chorus.md` §5.4 MCP 工具列表 - 自助查询
> 架构参考: `ARCHITECTURE.md` §5.2 MCP API - 公共工具

- [ ] chorus_get_my_assignments - 获取自己可操作的 Ideas + Tasks
  > 查询逻辑: 返回 assigneeType=agent AND assigneeId=当前AgentId **加上** assigneeType=user AND assigneeId=当前Agent的OwnerId
- [ ] chorus_get_available_ideas - 获取可认领的 Ideas（status=open）
- [ ] chorus_get_available_tasks - 获取可认领的 Tasks（status=open）

#### M2.4 PM Agent 专属工具
> PRD 参考: `PRD_Chorus.md` §5.4 MCP 工具列表 - PM 专属
> 架构参考: `ARCHITECTURE.md` §5.2 MCP API - PM Agent 工具

- [ ] chorus_pm_create_proposal - 创建提议（PRD/任务拆分/技术方案）
- [ ] chorus_claim_idea - 认领 Idea（open → assigned）
- [ ] chorus_release_idea - 放弃认领 Idea（assigned → open）
- [ ] chorus_update_idea_status - 更新 Idea 状态（仅认领者）

#### M2.5 Developer Agent 专属工具
> PRD 参考: `PRD_Chorus.md` §5.4 MCP 工具列表 - Developer 专属
> 架构参考: `ARCHITECTURE.md` §5.2 MCP API - Developer Agent 工具

- [ ] chorus_claim_task - 认领 Task（open → assigned）
- [ ] chorus_release_task - 放弃认领 Task（assigned → open）
- [ ] chorus_update_task - 更新任务状态（仅认领者）
- [ ] chorus_submit_for_verify - 提交任务等待人类验证
- [ ] chorus_report_work - 报告工作完成

#### M2.6 权限验证
> 架构参考: `ARCHITECTURE.md` §6.3 权限模型

- [ ] API Key 解析
- [ ] 角色验证（PM/Developer）
- [ ] 权限检查中间件
  > 代码位置: `src/mcp/middleware.ts`

### 交付物
- 可用的 MCP Server
- Claude Code 配置示例
- 工具测试脚本

---

## M3: Web UI (Week 4)

### 目标
实现核心页面的 Web 界面。

> **架构参考**: `ARCHITECTURE.md` §3.2 目录结构 - src/app/, src/components/
> **设计参考**: `docs/design.pen` 包含所有页面设计稿

### 任务清单

#### M3.1 布局和导航
> 架构参考: `ARCHITECTURE.md` §3.2 目录结构 - src/components/layout/
> 设计参考: `design.pen` 所有页面的 Sidebar 组件

- [ ] 全局布局（侧边栏 + 主内容）
- [ ] 项目切换器
- [ ] 用户菜单

#### M3.2 Dashboard
> 架构参考: `ARCHITECTURE.md` §3.2 目录结构 - src/app/page.tsx

- [ ] 跨项目统计卡片
- [ ] 最近活动
- [ ] 快捷入口

#### M3.3 Projects
> 架构参考: `ARCHITECTURE.md` §3.2 目录结构 - src/app/projects/
> 设计参考: `design.pen` - "Chorus - Projects", "Chorus - New Project", "Chorus - Project Overview"

- [ ] 项目列表页
- [ ] 项目创建表单
- [ ] Project Overview 页

#### M3.4 Ideas
> PRD 参考: `PRD_Chorus.md` §4.1 F5 Idea 六阶段状态、认领方式
> 架构参考: `ARCHITECTURE.md` §7.3 Idea 状态流转
> 设计参考: `design.pen` - "Chorus - Project Ideas", "Modal - Claim Assignment"

- [ ] Ideas 列表页
  - 显示 Open/Assigned/In Progress/Pending Review/Completed/Closed 状态标签
  - Open 状态显示 "Claim" 按钮
- [ ] Idea 创建表单（文本 + 附件上传）
- [ ] Claim 模态框
  - Radio: "Assign to myself"（所有我的 Agent 都能处理）
  - Radio: "Assign to [Agent Name]"（下拉选择特定 Agent）
- [ ] Idea 详情视图

#### M3.5 Knowledge
> 架构参考: `ARCHITECTURE.md` §3.2 目录结构 - src/app/projects/[id]/knowledge/

- [ ] 统一搜索界面
- [ ] 搜索结果展示

#### M3.6 Documents
> 架构参考: `ARCHITECTURE.md` §3.2 目录结构 - src/components/document/
> 设计参考: `design.pen` - "Chorus - Documents List", "Chorus - Document Preview"

- [ ] Documents 列表页
- [ ] Document 详情/预览页
- [ ] Document 编辑（Markdown）

#### M3.7 Proposals
> PRD 参考: `PRD_Chorus.md` §4.1 F5 Proposal 输入输出模型
> 架构参考: `ARCHITECTURE.md` §7.4 提议审批流程, §3.2 目录结构 - src/components/proposal/
> 设计参考: `design.pen` - "Chorus - Project Proposals", "Chorus - Proposal Output (PRD)", "Chorus - Proposal Output (Tasks)", "Chorus - Proposal Output (Document Diff)"

- [ ] Proposals 列表页
- [ ] Proposal 详情页
  - 显示输入来源（Ideas 或 Document）
  - 显示输出预览（Document 草稿或 Task 列表）
- [ ] 审批界面（批准/拒绝/修改）

#### M3.8 Tasks (Kanban)
> PRD 参考: `PRD_Chorus.md` §3.3.1 任务系统（六阶段工作流、认领规则）
> 架构参考: `ARCHITECTURE.md` §7.2 任务状态流转, §3.2 目录结构 - src/components/kanban/
> 设计参考: `design.pen` - "Chorus - Project Tasks (Kanban)", "Task Detail Panel", "Modal - Claim Task"

- [ ] 四列看板（Todo/In Progress/To Verify/Done）
  - Todo 列包含 Open + Assigned 状态
  - Open 状态卡片显示 "Claim" 按钮
- [ ] 拖拽移动
- [ ] 任务卡片
  - 显示状态标签（Open/Assigned/In Progress 等）
  - 显示 Assigned to 信息
- [ ] 任务详情侧边栏
- [ ] Claim 模态框
  - Radio: "Assign to myself"（所有我的 Developer Agent 都能处理）
  - Radio: "Assign to [Agent Name]"（下拉选择特定 Agent）
- [ ] 验证按钮（To Verify → Done，Human 专属）

#### M3.9 Activity
> 架构参考: `ARCHITECTURE.md` §3.2 目录结构 - src/components/activity/

- [ ] 活动流列表
- [ ] 活动筛选

#### M3.10 Agents
> PRD 参考: `PRD_Chorus.md` §4.1 F5.5 Agent 管理页面
> 架构参考: `ARCHITECTURE.md` §3.2 目录结构 - src/app/agents/
> 设计参考: `design.pen` - "Chorus - All Agents"

- [ ] Agent 列表页
- [ ] Agent 创建表单
- [ ] 角色标签展示（PM Agent / Developer Agent，可多选）

#### M3.11 Settings
> PRD 参考: `PRD_Chorus.md` §4.1 F5.6 API Key 管理
> 架构参考: `ARCHITECTURE.md` §9.1 API Key 安全
> 设计参考: `design.pen` - "Chorus - Settings", "Modal - Create API Key"

- [ ] API Key 列表
- [ ] 创建 API Key 模态框
- [ ] 角色选择（可多选：PM Agent / Developer Agent）
- [ ] Key 复制/撤销

### 交付物
- 完整的 Web UI
- 响应式设计
- 组件库

---

## M4: Skill 文件 (Week 5)

### 目标
编写 Agent 使用平台的指导文件。

> **PRD 参考**: `PRD_Chorus.md` §3.4 Claude Code 集成方案
> **架构参考**: `ARCHITECTURE.md` §3.2 目录结构 - skill/

### 任务清单

#### M4.1 PM Agent Skill
> PRD 参考: `PRD_Chorus.md` §3.3.4 PM Agent 支持
> 架构参考: `ARCHITECTURE.md` §5.2 MCP API - PM Agent 工具

- [ ] skill/pm/SKILL.md - API 使用说明
  - 描述所有 PM 专属 MCP 工具
  - 描述 Idea 认领流程
  - 描述 Proposal 创建最佳实践
- [ ] skill/pm/HEARTBEAT.md - 定期检查清单
  - 检查新的 Open Ideas
  - 检查 Proposal 审批状态
  - 分析项目进度
- [ ] 提议创建最佳实践

#### M4.2 Developer Agent Skill
> PRD 参考: `PRD_Chorus.md` §3.3.4 Developer Agent 专属工具
> 架构参考: `ARCHITECTURE.md` §5.2 MCP API - Developer Agent 工具

- [ ] skill/developer/SKILL.md - API 使用说明
  - 描述所有 Developer 专属 MCP 工具
  - 描述 Task 认领流程
  - 描述任务执行和报告流程
- [ ] skill/developer/HEARTBEAT.md - 定期检查清单
  - 检查分配给自己的任务
  - 检查 Open 任务（可认领）
  - 报告工作进度
- [ ] 任务执行最佳实践

#### M4.3 CLAUDE.md 模板
- [ ] 项目级配置模板
- [ ] 心跳触发说明
  > PRD 参考: `PRD_Chorus.md` §3.4 心跳实现思路

### 交付物
- 完整的 Skill 文件
- CLAUDE.md 模板
- 使用文档

---

## M5: 联调测试 (Week 6)

### 目标
端到端验证，确保所有功能可用。

> **架构参考**: `ARCHITECTURE.md` §7 核心流程

### 任务清单

#### M5.1 集成测试
> 架构参考: `ARCHITECTURE.md` §6.3 权限模型

- [ ] API 集成测试
- [ ] MCP 工具测试
- [ ] 权限测试
  - 测试 PM 专属工具权限
  - 测试 Developer 专属工具权限
  - 测试认领者权限（只有认领者可更新状态）

#### M5.2 端到端测试
> PRD 参考: `PRD_Chorus.md` §4.1 F5 详细工作流
> 架构参考: `ARCHITECTURE.md` §7.1 Reversed Conversation 工作流, §7.2 任务状态流转, §7.3 Idea 状态流转

- [ ] PM Agent 工作流测试
  - Idea 认领 → Proposal 创建 → 等待审批
- [ ] Developer Agent 工作流测试
  - Task 认领 → 执行 → 提交验证 → 报告完成
- [ ] Human 审批工作流测试
  - Proposal 审批 → Document/Task 自动创建
  - Task 验证 → Done
- [ ] 认领分配测试
  - Human "Assign to myself" → 所有 Agent 可见
  - Human "Assign to specific Agent" → 仅该 Agent 可见

#### M5.3 Demo 准备
- [ ] 演示数据种子
- [ ] 演示脚本
- [ ] 录屏/截图

#### M5.4 文档完善
- [ ] README 更新
- [ ] 部署文档
  > 架构参考: `ARCHITECTURE.md` §8 部署架构
- [ ] API 文档

### 交付物
- 通过所有测试
- Demo 演示
- 完整文档

---

## 依赖关系

```
M0 (项目骨架)
 ↓
M1 (后端 API) ←─────────────┐
 ↓                          │
M2 (MCP Server) ───────────→│
 ↓                          │
M3 (Web UI) ←───────────────┘
 ↓
M4 (Skill 文件)
 ↓
M5 (联调测试)
```

---

## 设计稿索引

| 页面名称 | 设计稿节点 | 对应功能 |
|---------|-----------|---------|
| Chorus - Projects | f2Faj | 项目列表 |
| Chorus - New Project | MsJV4 | 创建项目表单 |
| Chorus - Project Overview | QQV0z | 项目概览 |
| Chorus - Project Ideas | rNq1h | Ideas 列表 + Claim 功能 |
| Chorus - Project Proposals | XlN0Q | Proposals 列表 |
| Chorus - Proposal Output (PRD) | dF5OI | PRD 类型 Proposal 详情 |
| Chorus - Proposal Output (Tasks) | mlAGV | Tasks 类型 Proposal 详情 |
| Chorus - Proposal Output (Document Diff) | aop75 | 文档 Diff 视图 |
| Chorus - Project Tasks (Kanban) | 511Kf | Kanban 看板 + Claim 功能 |
| Task Detail Panel | 1wqLo | 任务详情侧边栏 |
| Chorus - Documents List | q2i2n | 文档列表 |
| Chorus - Document Preview | B1x5H | 文档预览 |
| Chorus - All Agents | 3xsuC | Agent 管理 |
| Chorus - Settings | WU9KX | 设置页面（API Key） |
| Modal - Create API Key | BjBrG | 创建 API Key 模态框 |
| Modal - Claim Assignment | VobiB | Ideas Claim 模态框 |
| Modal - Claim Task | QAR54 | Tasks Claim 模态框 |

---

## 风险和缓解

| 风险 | 概率 | 缓解 |
|-----|------|------|
| Prisma schema 变更频繁 | 高 | 先完成数据模型设计评审 |
| MCP SDK 不熟悉 | 中 | 提前研究文档和示例 |
| UI 工作量大 | 高 | 使用 shadcn/ui 加速 |
| 认证复杂度 | 中 | MVP 先用简化方案 |
| 认领逻辑复杂 | 中 | 先实现 Agent 自己认领，再实现 Human 分配 |
