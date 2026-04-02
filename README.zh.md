<p align="center">
  <img src="public/synapse-logo.png" alt="Synapse — 研究编排" width="320" />
</p>

<p align="center"><strong>面向人类研究者与 AI Agent 的研究编排平台</strong></p>

<p align="center"><a href="README.md">English</a></p>

Synapse 是一个研究编排平台，让人类研究者与 AI Agent 协同工作。它管理完整的研究生命周期——从文献综述、问题制定到实验执行与报告生成——内置 Agent 管理、算力编排和实时可观测性。

灵感来源于 [AI-DLC（AI 驱动开发生命周期）](https://aws.amazon.com/blogs/devops/ai-driven-development-life-cycle/) 方法论，构建于 [Chorus](https://github.com/Chorus-AIDLC/Chorus) 之上。

---

## 目录

- [Vibe Research](#vibe-research)
- [快速开始](#快速开始)
- [研究工作流](#研究工作流)
- [功能特性](#功能特性)
- [文档](#文档)
- [许可证](#许可证)

## Vibe Research

### 当前研究现状

AI 时代的研究能力很强，但工作流是割裂的：

- **上下文分散** — 论文在 Zotero，代码在 GitHub，结果在 Excel，笔记在 Slack。每个协作者都得从头看一遍。
- **手动交接** — 在工具之间复制粘贴，向每个新参与者重新解释上下文，阶段之间丢失连续性。
- **空闲等待** — 等 GPU、等审核、等人跑下一个实验。研究循环在人工交接之间反复停滞。
- **只能线性执行** — 大多数 AI Agent 工具只能按顺序执行计划（步骤 1 → 步骤 2 → 步骤 3）。真实研究是分支并行探索、循环迭代的，而不是一条直线。

瓶颈不再是算力或模型 — 而是**协调**。

### 什么是 Vibe Research？

Vibe Coding 证明了开发者可以描述意图，让 AI 来写代码。**Vibe Research** 将同样的理念应用到研究生命周期：

> **人类定方向。AI Agent 执行、汇报、提议。人类审核、把控。**

更多详情请参考 [awesome-vibe-research](https://github.com/Vincentwei1021/awesome-vibe-research) 仓库。

### 为什么需要 Vibe Research？

| 传统研究 | Vibe Research |
|---------|---------------|
| 人工跑每个实验 | Agent 执行，人类审核结果 |
| 线性计划：做完 A 再做 B | 并行问题 + 迭代循环 |
| 上下文散落在 5+ 个工具 | 一个平台覆盖全生命周期 |
| GPU 在手动步骤间空闲 | 自主闭环保持实验持续运转 |
| 事后才写报告 | Agent 完成实验即时生成报告 |

Synapse 就是让 Vibe Research 成为现实的平台。

---

## 快速开始

### Docker 快速启动

```bash
git clone https://github.com/Vincentwei1021/Synapse.git
cd Synapse

export DEFAULT_USER=admin@example.com
export DEFAULT_PASSWORD=changeme
docker compose up -d
```

打开 [http://localhost:3000](http://localhost:3000) 登录。

### 本地开发

前提：Node.js 22+, pnpm 9+, PostgreSQL

```bash
cp .env.example .env
# 编辑 .env 配置 DATABASE_URL

pnpm install
pnpm db:push
pnpm dev

open http://localhost:3000
```

### 连接 AI Agent

#### 方式一：OpenClaw（推荐）

```bash
openclaw plugins install @vincentwei1021/synapse-openclaw-plugin
```

在 OpenClaw 设置中配置 `synapseUrl` 和 `apiKey`。

#### 方式二：Claude Code 插件

```bash
claude
/plugin marketplace add Vincentwei1021/Synapse
/plugin install synapse@synapse-plugins
```

设置环境变量：
```bash
export SYNAPSE_URL="http://localhost:3000"
export SYNAPSE_API_KEY="syn_your_api_key"
```

#### 方式三：手动 MCP 配置

在项目根目录创建 `.mcp.json`：

```json
{
  "mcpServers": {
    "synapse": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp",
      "headers": {
        "Authorization": "Bearer syn_your_api_key"
      }
    }
  }
}
```

---

## 研究工作流

```
研究项目 ──> 研究问题 ──> 实验 ──> 报告
   ^            ^          ^        ^
  人类       人类或       AI Agent  AI Agent
  创建       AI Agent     执行并    撰写
  项目       提出         上报进度  分析报告
```

四种 Agent 权限角色（可组合）：

| 权限 | 职责 |
|------|------|
| **预研** | 文献检索，通过 Semantic Scholar 发现相关论文 |
| **研究** | 提出研究问题，假设构建 |
| **实验** | 执行实验，分配算力，上报进度 |
| **报告** | 生成实验报告、文献综述、综合分析文档 |

**自主闭环**：当所有实验队列为空时，指定的 Agent 自动分析项目全局上下文并提出新实验供人类审核。

---

## 功能特性

### 智能体管理

独立的 `/agents` 页面，支持 4 种可组合权限。每个 Agent 获取 API Key 以访问 MCP 工具。Agent 按用户隔离。

### 相关文献与文献检索

项目级文献管理：
- **手动添加** — 粘贴 arXiv 链接，自动通过 Semantic Scholar 获取元数据
- **自动搜索** — 分配预研 Agent 自动发现论文
- **深度研究** — 生成综合文献综述文档

### 实验看板

五列看板（草稿 → 待审核 → 待启动 → 进行中 → 已完成）：
- **实时状态徽章** — 已发送 / 已接收 / 检查资源 / 排队中 / 运行中
- **进度时间线** — Agent 通过 `synapse_report_experiment_progress` 逐步上报
- **自主闭环开关** — 队列为空时 Agent 自动提出新实验

### Agent 自动生成报告

实验完成后，执行实验的 Agent 自动撰写报告——结合项目目标分析实验结果，使用项目的语言。替代了模板生成方式。

### 算力编排

- GPU 资源池管理（节点/GPU 资产盘点）
- 项目级算力池绑定（GPU 预留强约束）
- 托管 SSH 密钥包（Agent 安全访问计算节点）
- 根据实验算力预算动态设置 Agent 超时

### 研究问题画布

层级化问题看板，支持父子关系、状态流转（待处理 → 分析中 → 实验已创建 → 已完成）、关联实验追踪。

### 通知系统

实时 SSE 推送 + Redis Pub/Sub 跨实例传播。通知偏好按 Agent 权限分组。Agent 接收分配、提及和自主闭环触发的通知。

### MCP 工具

60+ MCP 工具覆盖完整研究工作流：

| 类别 | 工具 |
|------|------|
| **读取** | `synapse_get_research_project`, `synapse_get_experiment`, `synapse_get_assigned_experiments`, `synapse_get_project_full_context` |
| **文献** | `synapse_search_papers`, `synapse_add_related_work`, `synapse_get_related_works` |
| **实验** | `synapse_start_experiment`, `synapse_submit_experiment_results`, `synapse_report_experiment_progress` |
| **算力** | `synapse_list_compute_nodes`, `synapse_get_node_access_bundle`, `synapse_sync_node_inventory` |
| **自主** | `synapse_propose_experiment` |
| **协作** | `synapse_add_comment`, `synapse_get_comments` |

---

## 文档

| 文档 | 说明 |
|------|------|
| [CLAUDE.md](CLAUDE.md) | 开发指南与编码规范 |
| [Architecture](docs/ARCHITECTURE.md) | 技术架构 |
| [MCP Tools](docs/MCP_TOOLS.md) | MCP 工具参考 |
| [OpenClaw Plugin](docs/synapse-plugin.md) | 插件设计与 Hooks |
| [Docker](docs/DOCKER.md) | Docker 部署指南 |

---

## 许可证

AGPL-3.0 — 见 [LICENSE.txt](LICENSE.txt)
