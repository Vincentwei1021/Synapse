<p align="center">
  <img src="public/synapse-logo.png" alt="Synapse — Research Orchestration" width="320" />
</p>

<p align="center"><strong>Research Orchestration for Human Researchers and AI Agents</strong></p>

<p align="center"><a href="README.zh.md">中文</a></p>

Synapse is a research orchestration platform that brings human researchers and AI agents together. It manages the full research lifecycle — from literature review and question formulation through experiment execution and report generation — with built-in agent management, compute orchestration, and real-time observability.

Inspired by the [AI-DLC (AI-Driven Development Lifecycle)](https://aws.amazon.com/blogs/devops/ai-driven-development-life-cycle/) methodology and built upon [Chorus](https://github.com/Chorus-AIDLC/Chorus).

---

## Table of Contents

- [Stages of Agent Autonomy in Research](#stages-of-agent-autonomy-in-research)
- [Features](#features)
- [Getting Started](#getting-started)
- [Progress](#progress)
- [Research Workflow](#research-workflow)
- [Documentation](#documentation)
- [License](#license)

## Stages of Agent Autonomy in Research

<p align="center">
  <img src="assets/3stages.png" alt="Stages of Agent Autonomy in Research" width="100%" />
</p>

Research autonomy is not a binary switch. It advances in stages:

- **Stage 1: Agent as Intern** — the human defines the problem and the experiment, while the agent executes reliably.
- **Stage 2: Agent as Researcher** — the agent can own a single research question end-to-end, proposing experiments, running them, interpreting results, and iterating within a clear boundary.
- **Stage 3: Agent as Research Lead** — the agent can drive a full project, coordinate across questions, and continuously shape the research direction under human oversight.

Synapse is built to move teams through those stages deliberately.

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

### Experiment Execution Board

<p align="center">
  <img src="assets/experiment_board.jpg" alt="Synapse experiment board" width="100%" />
</p>

- Five-column experiment pipeline: `draft` → `pending_review` → `pending_start` → `in_progress` → `completed`
- Live status badges for agent execution: `sent`, `ack`, `checking_resources`, `queuing`, `running`
- Progress reporting through `synapse_report_experiment_progress`
- Autonomous loop support, so agents can propose the next experiments when queues are empty

### Compute and Agent Operations

<p align="center">
  <img src="assets/10-compute.png" alt="Synapse compute management" width="100%" />
</p>

- Dedicated `/agents` page with four composable permissions: `pre_research`, `research`, `experiment`, `report`
- API-key based agent access to Synapse MCP tools
- Compute pools, node inventory, GPU reservations, and per-project pool binding
- Managed SSH access bundles for secure compute access from agent environments

### Reports, Synthesis, and MCP Surface

- Agents write experiment reports in the context of the project instead of filling rigid templates
- Synapse maintains project-level synthesis documents as research evolves
- 60+ MCP tools cover project context, literature search, experiment execution, compute access, and collaboration

## Getting Started

<p align="center">
  <img src="assets/02-project-dashboard.png" alt="Synapse dashboard overview" width="100%" />
</p>

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

### Connect AI Agents

#### Option 1: OpenClaw (Recommended)

```bash
openclaw plugins install @vincentwei1021/synapse-openclaw-plugin
```

Then configure in OpenClaw settings: set `synapseUrl` and `apiKey`.

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

<p align="center">
  <img src="assets/07-insights.png" alt="Synapse insights and synthesis" width="100%" />
</p>

### Implemented

- Project-centric research workspace with experiments, documents, related works, and rolling synthesis
- Composable agent permissions with user-scoped ownership, API keys, and agent session observability
- Experiment board with live execution state, agent progress reporting, and result document updates
- Related works pipeline with Semantic Scholar search, project paper collection, and deep research report generation
- Compute orchestration with compute pools, GPU inventory, pool binding, reservations, and managed access bundles
- Autonomous experiment proposal loop for keeping research momentum when queues run dry
- MCP tool surface for project context, literature, experiments, compute, comments, and collaboration

### Planned

- **Steer running agents**: intervene during an `in_progress` experiment to correct direction, refine instructions, or recover quickly from mistakes without restarting the whole run
- **Stream real experiment logs**: capture execution logs from running jobs and pipe them back to the experiment panel in real time, separate from higher-level progress updates
- **Git-tree parallel execution**: adopt a Karpathy-style `autoresearch` workflow where experiments can fan out across isolated git trees or worktrees for parallel runs and cleaner comparison
- **Stronger evaluation loops**: make baselines, metrics, and accept/reject criteria first-class so agents can compare outcomes more rigorously before proposing the next step
- **Artifact and reproducibility tracking**: attach code revisions, configs, outputs, and environment details to each experiment so results are easier to audit and replay
- **Better long-running control**: improve retries, resume semantics, and supervision for experiments that span multiple machines, GPUs, or extended time windows

## Research Workflow

<p align="center">
  <img src="assets/research-lifecycle.svg" alt="Synapse research workflow" width="100%" />
</p>

```
Research Project ──> Research Questions ──> Experiments ──> Reports
       ^                   ^                    ^              ^
    Human              Human or            AI Agent         AI Agent
    creates            AI Agent            executes &       writes
    project            proposes            reports          analysis
                                           progress
```

Four agent permission roles (composable):

| Permission | Responsibility |
|-----------|---------------|
| **Pre-research** | Literature search, related works discovery via Semantic Scholar |
| **Research** | Propose research questions, hypothesis formulation |
| **Experiment** | Execute experiments, allocate compute, report progress |
| **Report** | Generate experiment reports, literature reviews, synthesis documents |

The **Autonomous Loop** enables a self-sustaining research cycle: when all experiment queues are empty, the assigned agent analyzes the full project context and proposes new experiments for human review.

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
