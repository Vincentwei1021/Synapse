<p align="center">
  <img src="public/synapse-logo.png" alt="Synapse — 研究编排" width="320" />
</p>

<p align="center"><strong>面向人类研究者与 AI Agent 的研究编排平台</strong></p>

<p align="center"><a href="README.md">English</a></p>

Synapse 是一个研究编排平台，让人类研究者与 AI Agent 协同工作。它管理完整的研究生命周期——从文献综述、问题制定到实验执行与报告生成——内置 Agent 管理、算力编排和实时可观测性。

灵感来源于 [AI-DLC（AI 驱动开发生命周期）](https://aws.amazon.com/blogs/devops/ai-driven-development-life-cycle/) 方法论，构建于 [Chorus](https://github.com/Chorus-AIDLC/Chorus) 之上。

---

## 目录

- [研究工作流](#研究工作流)
- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [文档](#文档)
- [许可证](#许可证)

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

30+ MCP 工具覆盖完整研究工作流：

| 类别 | 工具 |
|------|------|
| **读取** | `synapse_get_research_project`, `synapse_get_experiment`, `synapse_get_assigned_experiments`, `synapse_get_project_full_context` |
| **文献** | `synapse_search_papers`, `synapse_add_related_work`, `synapse_get_related_works` |
| **实验** | `synapse_start_experiment`, `synapse_submit_experiment_results`, `synapse_report_experiment_progress` |
| **算力** | `synapse_list_compute_nodes`, `synapse_get_node_access_bundle`, `synapse_sync_node_inventory` |
| **自主** | `synapse_propose_experiment` |
| **协作** | `synapse_add_comment`, `synapse_get_comments` |

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

#### 方式一：OpenClaw 插件（推荐）

```bash
export SYNAPSE_URL="http://localhost:3000"
export SYNAPSE_API_KEY="syn_your_api_key"

claude
/plugin marketplace add Synapse-AIDLC/synapse
/plugin install synapse@synapse-plugins
```

#### 方式二：手动 MCP 配置

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

### 部署到 AWS

```bash
./install.sh
```

交互式安装器配置：VPC、Aurora Serverless v2（PostgreSQL）、ElastiCache Serverless（Redis）、ECS Fargate、HTTPS ALB。

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
