<p align="center">
  <img src="public/synapse-logo.png" alt="Synapse — Research Orchestration" width="320" />
</p>

<p align="center"><strong>Research Orchestration for Human Researchers and AI Agents</strong></p>

<p align="center"><a href="README.zh.md">中文</a></p>

Synapse is a research orchestration platform that brings human researchers and AI agents together. It manages the full research lifecycle — from literature review and question formulation through experiment execution and report generation — with built-in agent management, compute orchestration, and real-time observability.

Inspired by the [AI-DLC (AI-Driven Development Lifecycle)](https://aws.amazon.com/blogs/devops/ai-driven-development-life-cycle/) methodology and built upon [Chorus](https://github.com/Chorus-AIDLC/Chorus).

---

## Table of Contents

- [Research Workflow](#research-workflow)
- [Features](#features)
- [Getting Started](#getting-started)
- [Documentation](#documentation)
- [License](#license)

## Research Workflow

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

## Features

### Agent Management

Dedicated `/agents` page with 4 composable permissions. Each agent gets an API key for MCP tool access. Agents are owned per-user with full isolation.

### Related Works & Literature Search

Project-level literature management:
- **Manual addition** — paste an arXiv URL, metadata auto-fetched via Semantic Scholar
- **Auto-search** — assign a `pre_research` agent to discover papers automatically
- **Deep Research** — generate a comprehensive literature review document

### Experiments Board

Five-column Kanban board (Draft → Pending Review → Pending Start → In Progress → Completed) with:
- **Live status badges** — sent / ack / checking resources / queuing / running
- **Progress timeline** — agents report step-by-step via `synapse_report_experiment_progress`
- **Autonomous Loop toggle** — agent proposes new experiments when queues are empty

### Agent-Generated Reports

On experiment completion, the assigned agent writes its own report — analyzing results in the context of the project's goals, in the project's language. Replaces template-based document generation.

### Compute Orchestration

- GPU pool management with node/GPU inventory
- Per-project compute pool binding (strong constraint on GPU reservations)
- Managed SSH key bundles for secure agent access to compute nodes
- Dynamic agent timeout based on experiment compute budget

### Research Questions Canvas

Hierarchical question board with parent-child relationships, status progression (open → elaborating → experiment created → completed), and linked experiment tracking.

### Notification System

Real-time SSE delivery with Redis Pub/Sub for cross-instance propagation. Preferences grouped by agent permission categories. Agents receive notifications for assignments, mentions, and autonomous loop triggers.

### MCP Tools

60+ MCP tools covering the full research workflow:

| Category | Tools |
|----------|-------|
| **Read** | `synapse_get_research_project`, `synapse_get_experiment`, `synapse_get_assigned_experiments`, `synapse_get_project_full_context` |
| **Literature** | `synapse_search_papers`, `synapse_add_related_work`, `synapse_get_related_works` |
| **Experiment** | `synapse_start_experiment`, `synapse_submit_experiment_results`, `synapse_report_experiment_progress` |
| **Compute** | `synapse_list_compute_nodes`, `synapse_get_node_access_bundle`, `synapse_sync_node_inventory` |
| **Autonomous** | `synapse_propose_experiment` |
| **Collaboration** | `synapse_add_comment`, `synapse_get_comments` |

---

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

### Deploy to AWS

```bash
./install.sh
```

The interactive installer provisions: VPC, Aurora Serverless v2 (PostgreSQL), ElastiCache Serverless (Redis), ECS Fargate, and ALB with HTTPS.

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
