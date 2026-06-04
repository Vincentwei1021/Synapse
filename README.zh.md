<p align="center">
  <img src="public/synapse-logo.png" alt="Synapse — 研究编排" width="320" />
</p>

<p align="center"><strong>面向人类研究者与 AI Agent 的研究编排平台</strong></p>

<p align="center"><a href="README.md">English</a></p>

Synapse 是一个研究编排平台，让人类研究者与 AI Agent 协同工作。它管理完整的研究生命周期，从文献综述、问题制定到实验执行与报告生成，内置 Agent 管理、算力编排和实时可观测性。

<p align="center">
  <img src="assets/architecture-zh.png" alt="Synapse 架构" width="100%" />
</p>

灵感来源于 [AI-DLC（AI 驱动开发生命周期）](https://aws.amazon.com/blogs/devops/ai-driven-development-life-cycle/) 方法论，构建于 [Chorus](https://github.com/Chorus-AIDLC/Chorus) 之上。

> **Milestone：** 我们已经在 Synapse 平台上复现了 Karpathy 的 auto-research 任务与效果。与直接设计单个 agent 的 `program.md` 行为模式不同，Synapse 将自主实验作为平台的原生能力。研究项目、实验生命周期、算力分配和上下文积累均由平台通过结构化的 MCP 工具统一管理，形成 **dynamic contexting**。所有研究记忆都持久化在平台中，作为工具化状态提供给 agent 按当前状态随时调用、获取与展开，而不是依赖 agent 的上下文窗口一次性强制全部读取。

<p align="center">
  <img src="assets/autoresearch-progress.png" alt="Synapse autoresearch 进展图" width="100%" />
</p>

---

## 最新动态

**v0.8.0** — 子 Agent 观测、Auto Loop 流光动画 & 插件严重 Bug 修复 (2026-05-22) &nbsp; 🔴 `New`
- **重要修复 — 插件不再误删 `~/.synapse/`**：当 Claude Code 在 `$HOME` 下启动时，SessionEnd hook 旧版的 `rm -rf $STATE_DIR` 会把用户的 PGlite 数据库一并清掉。新版只清理自己创建的产物，并对父目录使用 `rmdir`，兄弟目录如 `data/` 完全保留。**强烈建议升级。**
- **子 Agent 实验 checkin**：新增 `SessionExperimentCheckin` 表与 `synapse_checkin_experiments` MCP 工具，主会话可以把实验上下文交接给子 Agent，子 Agent 退出时（SubagentStop）自动 close session，避免硬退出后 1 小时心跳超时才被回收。
- **Auto Loop pill 动画**：自主循环开启时，Experiments 看板顶部状态 pill 现在是流动的 mesh gradient（WebGL）—— Human Review 模式 emerald/cyan，Full Auto 模式 emerald/cyan/violet。尊重 `prefers-reduced-motion`，WebGL 失败时回退到原静态色。
- **插件 hook 收紧**：`on-session-start` 将内嵌工具清单替换为 stage-skill 路由（每次会话节省约 5k token），`on-subagent-stop` 改异步并把自动 check-out 的实验绑定写入 hook 输出，多个 hook 的 prompt 把 "MUST" 软化为 "Suggested next step"，允许 Agent 在边缘场景下显式说明后偏离。
- **Claude Code 插件**升级到 **0.9.0**，npm `@synapse-research/synapse` 升级到 **0.3.0**，Docker 镜像 `vincentwei1021/synapse:v0.8.0`（`:latest` 同步）。

<details>
<summary><strong>v0.7.0</strong> — PGlite 本地模式 & Server Action 修复 (2026-04-20)</summary>

- **一键本地安装**：`npm install -g @synapse-research/synapse && synapse` — 零依赖 PGlite 模式，无需 PostgreSQL 或 Redis
- 修复研究问题创建在 standalone 模式下静默失败的严重 bug（Server Actions 替换为 REST API）
- 修复全局安装后缓存目录权限不足的问题
- 完成通知弹窗改为勾号图标，替代原来的圆点
- 健康检查不再将 Redis 懒加载未初始化误报为 degraded

</details>

<details>
<summary><strong>v0.6.1</strong> — 实验看板界面打磨 (2026-04-15)</summary>

- 项目概览页展开描述时会保留原有空行，让结构化项目说明更易读
- 实验计划侧栏现在会正确显示在详情栏遮罩之上，底色与其它面板统一，并支持正常选中文本
- “开启自动实验”按钮改为更醒目的蓝色样式，并使用黄色闪电图标，便于快速识别
- 大屏下实验右侧详情栏加宽，实验计划、结果摘要和进度日志都有更充足的展示空间

</details>

<details>
<summary><strong>v0.6.0</strong> — Agent 类型与 Research Copilot (2026-04-12)</summary>

- Agent 新增 `type` 字段（`OpenClaw` 或 `Claude Code`），内部映射通知传输能力 — Web UI 派发功能仅显示支持实时通知的 Agent
- Claude Code Research Copilot：会话启动时展示项目列表及进度摘要，引导用户完成研究全流程（论文搜索 → 深度研究 → 研究问题 → 实验 → 结果分析）
- `synapse_checkin` 返回已分配实验和项目进度，支持智能工作流建议
- Agent 管理页新增类型选择器和类型标签

</details>

<details>
<summary><strong>v0.5.1</strong> — <a href="https://github.com/DeepXiv/deepxiv_sdk">DeepXiv</a> 集成 (2026-04-10)</summary>

- 论文搜索改用 [DeepXiv](https://github.com/DeepXiv/deepxiv_sdk) 混合检索（BM25 + 向量），arXiv API 作为 fallback。移除 Semantic Scholar 和 OpenAlex
- Agent 可通过渐进式阅读工具读取论文全文：`synapse_read_paper_brief`、`synapse_read_paper_head`、`synapse_read_paper_section`、`synapse_read_paper_full`
- 深度研究文献综述现在基于论文实际内容，而非仅靠摘要
- DeepXiv 令牌可在设置 > 集成服务中配置

</details>

<details>
<summary><strong>v0.5.0</strong> — 自主循环与相关文献 (2026-03-29)</summary>

- 自主实验循环：Agent 提议 → 人类审核 → Agent 执行
- 相关文献页面：自动搜索、手动添加 arXiv URL、深度研究报告
- 实验实时状态追踪（sent/ack/checking/queuing/running）
- 按项目绑定算力池

</details>

---

## 目录

- [Vibe Research](#vibe-research)
- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [进展](#进展)
- [文档](#文档)
- [许可证](#许可证)

## Vibe Research

### 什么是 Vibe Research？

Vibe Coding 证明了人可以描述意图，让 AI 负责执行。**Vibe Research** 则把这种范式延伸到研究生命周期：

> **人类设定方向。Agent 执行、汇报、提议并迭代。人类审核、纠偏并做最终决策。**

### 研究中 Agent 自主性的阶段

<p align="center">
  <img src="assets/3stages.png" alt="研究中 Agent 自主性的三个阶段" width="100%" />
</p>

Synapse 的愿景，是有节奏地推动研究团队穿越这些阶段。

- **把 Stage 1 做顺**：让实验执行、算力调度、结果沉淀和报告生成变成默认工作流，而不是一串手工交接。
- **让 Stage 2 变可靠**：把上下文、论文、实验、进度和评审放在同一个系统里，让 Agent 可以在明确边界内独立推进，而不轻易跑偏。
- **让 Stage 3 可实现**：提前搭好项目级委派所需的控制平面，包括结构化上下文、可观测性、编排能力、权限体系，以及关键节点上的人工 steering。

---

## 功能特性

### 项目工作空间

<p align="center">
  <img src="assets/12-project2-dashboard.png" alt="Synapse 项目仪表盘" width="100%" />
</p>

Synapse 为每个研究项目提供统一的操作空间，承载项目简介、数据集、评估方法、研究问题、实验、报告和滚动综合分析。人类和 Agent 不再在文档、脚本、表格和聊天工具之间来回切换，而是在同一份上下文上协作。

### 相关文献与深度研究

<p align="center">
  <img src="assets/05-related-works.png" alt="Synapse 相关文献页面" width="100%" />
</p>

- **手动添加**：粘贴 arXiv 链接，自动获取论文元数据
- **自动搜索**：分配 `pre_research` Agent 持续搜索 Semantic Scholar
- **深度研究**：直接在项目内生成文献综述文档

### 研究问题画布

<p align="center">
  <img src="assets/research_question_canvas.jpg" alt="Synapse 研究问题画布" width="100%" />
</p>

- 以画布式层级结构组织研究问题与子问题
- 从探索、细化到创建实验与完成问题，持续追踪问题进度
- 让研究问题与对应实验、报告保持上下文连接

### 实验执行看板

<p align="center">
  <img src="assets/experiment_board.jpg" alt="Synapse 实验看板" width="100%" />
</p>

- 五列实验流水线：`draft` → `pending_review` → `pending_start` → `in_progress` → `completed`
- Agent 执行实时状态：`sent`、`ack`、`checking_resources`、`queuing`、`running`
- 通过 `synapse_report_experiment_progress` 回传进度
- 当队列为空时支持 autonomous loop，由 Agent 提出下一批实验

### Agent 管理

<p align="center">
  <img src="assets/agent_management.jpg" alt="Synapse Agent 管理" width="100%" />
</p>

- 基于 API Key 的 Agent MCP 访问方式
- 用户级 Agent 所有权、密钥管理和 Session 可观测性

五种 Agent 权限角色（可组合）：

| 权限 | 职责 |
|------|------|
| **预研** | 文献检索，通过 Semantic Scholar 发现相关论文 |
| **研究** | 提出研究问题，假设构建 |
| **实验** | 执行实验，分配算力，上报进度 |
| **报告** | 生成实验报告、文献综述、综合分析文档 |
| **管理** | 创建/删除项目、管理分组、审核研究问题 |

### 算力编排

<p align="center">
  <img src="assets/10-compute.png" alt="Synapse 算力管理" width="100%" />
</p>

- 算力池、节点盘点、GPU 预留，以及项目级算力池绑定
- 通过托管访问包让 Agent 安全连接计算节点
- 让 Agent 在实验前、实验中和实验间都能基于可用资源运行

### 报告、综合分析与 MCP 能力

- Agent 在项目语境里自动撰写实验报告，而不是套固定模板
- Synapse 会持续维护项目级综合分析文档
- 70+ MCP 工具覆盖项目上下文、文献检索、实验执行、算力访问与协作

## 快速开始

### 一键安装（无外部依赖）

```bash
npm install -g @synapse-research/synapse
synapse
```

打开 [http://localhost:13000](http://localhost:13000)，使用 `admin@synapse.local` / `synapse` 登录。

内置 PGlite 嵌入式数据库，无需安装 PostgreSQL 或 Redis。数据存储在 `~/.synapse/data`。

选项：`synapse --port 3000 --data-dir /path/to/data --help`

### Docker

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

`.env.example` 中已包含内置登录账户：

| 字段 | 值 |
|------|-----|
| 邮箱 | `dev@synapse.local` |
| 密码 | `synapse123` |

可在 `.env` 中修改 `DEFAULT_USER` 和 `DEFAULT_PASSWORD`。当两个变量均已设置时，Synapse 启用简单的邮箱/密码登录，无需配置 OIDC。

### 连接 AI Agent

#### 方式一：OpenClaw（推荐）

```bash
openclaw plugins install @vincentwei1021/synapse-openclaw-plugin
```

然后在 OpenClaw 设置中配置 `synapseUrl` 和 `apiKey`。

> **提示：** 如果遇到 `Request timed out before a response was generated`，请在 OpenClaw 配置中增大空闲超时：将 `agents.defaults.llm.idleTimeoutSeconds` 设为 `300`。

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

#### 方式三：Codex 插件

Codex 当前仅支持**论文搜索**阶段。在 Synapse 中创建 `codex` 类型的 Agent;`codex` 类型被限定为 `pre_research` 角色(Agent 对话框会强制此限制)。更广阶段(实验、报告)尚未接入 Codex。

MCP 服务器**不随插件打包**(Codex 不会展开插件 `.mcp.json` 中的 `${VAR}`),因此需自行配置一次。CLI 与桌面 App 的步骤略有不同。

**Codex CLI**

```bash
codex plugin marketplace add Vincentwei1021/Synapse
codex plugin add synapse@synapse-plugins

export SYNAPSE_URL="http://localhost:3000"
export SYNAPSE_API_KEY="syn_your_api_key"
codex mcp add synapse --url "$SYNAPSE_URL/api/mcp" --bearer-token-env-var SYNAPSE_API_KEY
```

请在启动 Codex **之前**运行 `codex mcp add`(它写入 `~/.codex/config.toml`,启动时读取)。

**Codex App(桌面版)**

1. **添加插件市场。** 打开 **Plugins → Built by OpenAI → Add more**,来源填写 `https://github.com/Vincentwei1021/Synapse.git`,然后将市场选择器切换到 **synapse-plugins**。
2. **安装插件。** 在 **Productivity → Synapse** 下点击 **+** 安装,然后打开该插件进行配置。
3. **配置 MCP 服务器。** 在插件配置中**添加服务器**:
   - 名称:`synapse`
   - 传输方式:**流式 HTTP**
   - URL:`http://localhost:3000/api/mcp`
   - Bearer 令牌:直接粘贴你的 `syn_...` API key(App 在此处接受令牌值,无需环境变量)。
4. **精简技能。** 仅保留 **Research** 技能,取消勾选其他技能(它们面向 Codex 尚不支持的阶段)。

> App 允许直接粘贴令牌值,因此 —— 不同于 CLI 的 `--bearer-token-env-var` 流程 —— 你**无需** export `SYNAPSE_API_KEY` 或使用 `launchctl setenv`。

#### 方式四：手动 MCP 配置

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

## 进展

### 已实现

- [x] 以研究项目为中心的工作空间，统一承载简介、数据集、评估方法、实验、文档和滚动综合分析
- [x] 研究问题层级与画布式问题管理
- [x] 带实时执行状态和进度回传的五阶段实验看板
- [x] Agent 自动生成实验报告与项目级综合分析文档
- [x] 基于 Semantic Scholar 的相关文献搜索、论文入库和深度研究报告
- [x] `pre_research`、`research`、`experiment`、`report`、`admin` 五种可组合 Agent 权限
- [x] 用户级 Agent 所有权、API Key 和 Agent Session 可观测性
- [x] 算力池、节点盘点、GPU 预留和项目级池绑定
- [x] 用于安全访问算力节点的托管访问包
- [x] 在实验队列空转时继续推进研究的 autonomous experiment proposal loop
- [x] 评论、提及、通知以及基于 SSE 的实时更新
- [x] 覆盖上下文读取、文献、实验、算力和协作的 70+ MCP 工具

### 计划中

- [ ] 在 `in_progress` 实验过程中直接 steer 正在运行的 Agent
- [ ] 将底层实验日志与高层进度分离，并实时回传到面板
- [ ] 通过隔离的 git tree / worktree 并行运行实验
- [ ] 用一等能力支持 baseline 与 accept/reject criteria
- [ ] 追踪代码版本、配置、产物和环境等可复现信息

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
