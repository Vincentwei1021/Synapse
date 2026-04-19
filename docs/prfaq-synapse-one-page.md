# Synapse PRFAQ (AWS-Style, One Page)

## Press Release

**Synapse Launches a Research Orchestration Platform for Human Researchers and AI Agents**

**Synapse gives research teams a single operational system for project context, literature review, experiment execution, compute access, and rolling synthesis**

Shanghai, China — April 17, 2026 — Synapse today announced a research orchestration platform designed for teams that want AI agents to participate in real research work, not just generate disconnected ideas or drafts. Synapse gives human researchers and AI agents a shared control plane for research projects, related papers, experiments, compute resources, progress reporting, and project synthesis.

Today, many research teams still coordinate work across documents, chats, scripts, spreadsheets, and ad hoc agent prompts. As a result, agents often lack the right context, humans lose visibility into what is running, and experiment outputs become hard to trace back to project goals. Synapse addresses this by treating research operations as a structured workflow rather than a sequence of one-off prompts.

With Synapse, a team can create a research project with its brief, datasets, evaluation methods, and research questions; collect related papers into a shared workspace; assign experiments to agents; let those agents inspect project context through MCP tools; allocate compute from managed pools; report live progress during execution; and submit results back into the project record. Synapse then updates experiment result documents and rolling project synthesis so the full research state remains visible and persistent.

Synapse is built around the idea that research memory should live in the platform, not only in the context window of a single model session. Instead of forcing an agent to load everything up front, Synapse exposes project state, experiment state, literature context, and compute availability through structured tools that can be fetched on demand. This gives teams a more reliable way to run long-lived, multi-step research workflows with AI.

"We built Synapse for the gap between chat-based AI assistance and real research execution," said Vincent Wei, creator of Synapse. "Teams do not need another place to brainstorm. They need a system where humans and agents can coordinate around the same project state, the same experiments, the same papers, and the same compute, while staying observable and reviewable."

Synapse includes a project workspace, a Related Works surface for paper collection and deep research, an experiment execution board with live status badges and progress logs, agent management with composable permissions, compute pool binding and GPU reservation flows, and an autonomous loop that allows agents to propose the next experiment when queues are empty. The platform is built with Next.js, TypeScript, Prisma, PostgreSQL, Redis-backed pub/sub, and MCP-based tool access for agents.

Synapse is available now for teams building AI-native research workflows in applied research, ML engineering, and autonomous experimentation.

## FAQ

**1. What problem does Synapse solve?**  
Synapse solves the operational gap between research planning and research execution. Most teams can ask an AI model to suggest ideas, but they still struggle to keep project context, paper review, experiment execution, compute access, status tracking, and report generation connected in one system. Synapse gives them a shared operational layer for that work.

**2. Who is Synapse for?**  
Synapse is for research leads, applied AI teams, ML platform teams, and technical organizations that want humans and AI agents to collaborate on ongoing research programs rather than isolated prompt sessions. It is especially useful when multiple experiments, papers, and compute resources need to stay coordinated over time.

**3. How is Synapse different from a general-purpose AI agent framework?**  
General-purpose agent frameworks usually focus on tool calling inside a single session. Synapse adds the missing research-native control plane: project briefs, research questions, experiment records, result documents, related works, compute pools, agent sessions, live execution status, and rolling synthesis. The key difference is persistent, structured research state.

**4. How does Synapse keep agents aligned with the project?**  
Agents do not rely only on a large initial prompt. They use Synapse MCP tools to retrieve the exact project, experiment, literature, and compute context they need at each step. This "dynamic contexting" model reduces drift, improves observability, and makes long-running or delegated work easier to audit.

**5. What makes Synapse credible for autonomous research workflows?**  
Synapse already supports project-scoped experiment execution, live progress reporting, paper search and progressive paper reading, compute node inspection, secure access bundles, project synthesis updates, and autonomous experiment proposal loops. In practice, that means the platform is not just generating ideas; it is managing the operational loop around research work.
