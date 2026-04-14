<p align="center">
  <img src="public/synapse-logo.png" alt="Synapse — Research Orchestration" width="320" />
</p>

<p align="center"><strong>Research Orchestration for Human Researchers and AI Agents</strong></p>

<p align="center"><a href="README.zh.md">中文</a></p>

Synapse is a research orchestration platform that brings human researchers and AI agents together. It manages the full research lifecycle — from literature review and question formulation through experiment execution and report generation — with built-in agent management, compute orchestration, and real-time observability.

<p align="center">
  <img src="assets/research-lifecycle.svg" alt="Synapse research lifecycle" width="100%" />
</p>

Inspired by the [AI-DLC (AI-Driven Development Lifecycle)](https://aws.amazon.com/blogs/devops/ai-driven-development-life-cycle/) methodology and built upon [Chorus](https://github.com/Chorus-AIDLC/Chorus).

---

## What's New

**v0.6.0** — Agent Types & Research Copilot (2026-04-12) &nbsp; 🔴 `New`
- Agents now have a `type` field (`OpenClaw` or `Claude Code`) with internal transport mapping — Web UI dispatch features only show realtime-capable agents
- Claude Code Research Copilot: SessionStart presents projects with progress summaries and guides users through the research lifecycle (paper search → deep research → questions → experiments → analysis)
- `synapse_checkin` returns assigned experiments and project progress for intelligent workflow suggestions
- Agent management UI gains a type selector and badge display

**v0.5.1** — [DeepXiv](https://github.com/DeepXiv/deepxiv_sdk) Integration (2026-04-10)
- Paper search now uses [DeepXiv](https://github.com/DeepXiv/deepxiv_sdk) hybrid search (BM25 + vector) over arXiv, with arXiv API as fallback. Removed Semantic Scholar and OpenAlex.
- Agents can read full paper content via progressive reading tools: `synapse_read_paper_brief`, `synapse_read_paper_head`, `synapse_read_paper_section`, `synapse_read_paper_full`
- Deep research literature reviews are now based on actual paper content, not just abstracts
- DeepXiv token configurable from Settings > Integrations

**v0.5.0** — Autonomous Loop & Related Works (2026-03-29)
- Autonomous experiment loop: agents propose → humans review → agents execute
- Related Works page with auto-search, manual arXiv URL addition, and deep research reports
- Experiment live status tracking (sent/ack/checking/queuing/running)
- Compute pool binding per project

---

## Table of Contents

- [Vibe Research](#vibe-research)
- [Features](#features)
- [Getting Started](#getting-started)
- [Progress](#progress)
- [Documentation](#documentation)
- [License](#license)

## Vibe Research

Vibe Coding showed that people can describe intent and let AI handle execution. **Vibe Research** applies that same shift to the research lifecycle:

> **Humans set direction. Agents execute, report, propose, and iterate. Humans review, steer, and decide.**

### Stages of Agent Autonomy in Research

<p align="center">
  <img src="assets/3stages.png" alt="Stages of Agent Autonomy in Research" width="100%" />
</p>

Synapse is built to move research teams through these stages deliberately.

- **Streamline Stage 1** by making experiment execution, compute access, result capture, and reporting a default operational loop instead of a pile of manual handoffs.
- **Make Stage 2 reliable** by keeping context, papers, experiments, progress, and review in one system, so agents can act independently without drifting off-task.
- **Make Stage 3 feasible** by building the control plane for project-level delegation: structured context, observability, orchestration, permissions, and human steering when it matters most.

---

## Features

### Project Workspace

<p align="center">
  <img src="assets/12-project2-dashboard.png" alt="Synapse project dashboard" width="100%" />
</p>

Synapse gives each research project a shared operational home for briefs, datasets, evaluation methods, research questions, experiments, reports, and rolling synthesis. Instead of bouncing across docs, scripts, spreadsheets, and chat threads, humans and agents work from the same source of truth.

### Related Works and Deep Research

<p align="center">
  <img src="assets/05-related-works.png" alt="Synapse related works page" width="100%" />
</p>

- Paste an arXiv URL to add a paper with metadata fetched automatically
- Assign a `pre_research` agent to search Semantic Scholar and build a project paper set
- Generate literature review documents directly inside the project workspace

### Research Question Canvas

<p align="center">
  <img src="assets/research_question_canvas.jpg" alt="Synapse research question canvas" width="100%" />
</p>

- Organize research questions in a canvas-style hierarchy with parent-child structure
- Track question progress from exploration to experiment creation and completion
- Keep question context connected to the experiments and reports it produces

### Experiment Execution Board

<p align="center">
  <img src="assets/experiment_board.jpg" alt="Synapse experiment board" width="100%" />
</p>

- Five-column experiment pipeline: `draft` → `pending_review` → `pending_start` → `in_progress` → `completed`
- Live status badges for agent execution: `sent`, `ack`, `checking_resources`, `queuing`, `running`
- Progress reporting through `synapse_report_experiment_progress`
- Autonomous loop support, so agents can propose the next experiments when queues are empty

### Agent Management

<p align="center">
  <img src="assets/agent_management.jpg" alt="Synapse agent management" width="100%" />
</p>

- API-key based agent access to Synapse MCP tools
- User-scoped agent ownership, key management, and session observability

Five agent permission roles (composable):

| Permission | Responsibility |
|-----------|---------------|
| **Pre-research** | Literature search, related works discovery via Semantic Scholar |
| **Research** | Propose research questions, hypothesis formulation |
| **Experiment** | Execute experiments, allocate compute, report progress |
| **Report** | Generate experiment reports, literature reviews, synthesis documents |
| **Admin** | Create/delete projects, manage groups, review research questions |

### Compute Orchestration

<p align="center">
  <img src="assets/10-compute.png" alt="Synapse compute management" width="100%" />
</p>

- Compute pools, node inventory, GPU reservations, and per-project pool binding
- Managed SSH access bundles for secure compute access from agent environments
- Keep agents aligned with available resources before, during, and between runs

### Reports, Synthesis, and MCP Surface

- Agents write experiment reports in the context of the project instead of filling rigid templates
- Synapse maintains project-level synthesis documents as research evolves
- 70+ MCP tools cover project context, literature search, experiment execution, compute access, and collaboration

## Getting Started

### Quick Start with Docker

```bash
git clone https://github.com/Vincentwei1021/Synapse.git
cd Synapse

export DEFAULT_USER=admin@example.com
export DEFAULT_PASSWORD=changeme
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000) and log in.

### Local Development

Prerequisites: Node.js 22+, pnpm 9+, PostgreSQL

```bash
cp .env.example .env
# Edit .env to configure DATABASE_URL

pnpm install
pnpm db:push
pnpm dev

open http://localhost:3000
```

The default `.env.example` includes a built-in login account:

| Field | Value |
|-------|-------|
| Email | `dev@synapse.local` |
| Password | `synapse123` |

You can change these by editing `DEFAULT_USER` and `DEFAULT_PASSWORD` in your `.env` file. When both variables are set, Synapse enables a simple email/password login without requiring OIDC configuration.

### Connect AI Agents

#### Option 1: OpenClaw (Recommended)

```bash
openclaw plugins install @vincentwei1021/synapse-openclaw-plugin
```

Then configure in OpenClaw settings: set `synapseUrl` and `apiKey`.

> **Tip:** If you encounter `Request timed out before a response was generated`, increase the idle timeout in your OpenClaw config: set `agents.defaults.llm.idleTimeoutSeconds` to `300`.

#### Option 2: Claude Code Plugin

```bash
claude
/plugin marketplace add Vincentwei1021/Synapse
/plugin install synapse@synapse-plugins
```

Set environment variables:

```bash
export SYNAPSE_URL="http://localhost:3000"
export SYNAPSE_API_KEY="syn_your_api_key"
```

#### Option 3: Manual MCP Configuration

Create `.mcp.json` in your project root:

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

## Progress

### Implemented

- [x] Research-project workspace with briefs, datasets, evaluation methods, experiments, documents, and rolling synthesis
- [x] Research-question hierarchy and canvas-style question management
- [x] Five-stage experiment board with live execution status and progress updates
- [x] Agent-generated experiment reports and project-level synthesis documents
- [x] Related works workflow with Semantic Scholar search, paper collection, and deep research reports
- [x] Composable agent permissions: `pre_research`, `research`, `experiment`, `report`, `admin`
- [x] User-scoped agent ownership, API keys, and agent session observability
- [x] Compute pools, node inventory, GPU reservations, and project-level pool binding
- [x] Managed node access bundles for secure agent access to compute
- [x] Autonomous experiment proposal loop for keeping project momentum when queues empty out
- [x] Comments, mentions, notifications, and real-time SSE updates
- [x] 70+ MCP tools covering context retrieval, literature, experiments, compute, and collaboration

### Planned

- [ ] Steer running agents during an `in_progress` experiment
- [ ] Stream raw experiment logs back into the panel in real time
- [ ] Run experiments in parallel via isolated git trees / worktrees
- [ ] Strengthen evaluation loops with first-class baselines and accept/reject criteria
- [ ] Track reproducibility artifacts: code revision, config, outputs, and environment

---

## Documentation

| Document | Description |
|----------|------------|
| [CLAUDE.md](CLAUDE.md) | Development guide and coding conventions |
| [Architecture](docs/ARCHITECTURE.md) | Technical architecture |
| [MCP Tools](docs/MCP_TOOLS.md) | MCP tools reference |
| [OpenClaw Plugin](docs/synapse-plugin.md) | Plugin design and hooks |
| [Docker](docs/DOCKER.md) | Docker deployment guide |

---

## License

AGPL-3.0 — see [LICENSE.txt](LICENSE.txt)
