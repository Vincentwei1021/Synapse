# Building an OpenClaw Plugin for Synapse: SSE + MCP for Autonomous Research Agents

Have you ever watched an AI agent sit idle while your research experiment queue overflows? The agent has the skills to run experiments, analyze results, and propose follow-ups, but it cannot sense when there is work waiting. It does not know it was assigned an experiment three minutes ago. It cannot see that someone @mentioned it asking for a progress update. It is a perfectly capable researcher locked in a soundproof room.

This article shares three patterns you can take away directly: **dual-channel architecture** (SSE for awareness, MCP for execution), **prompt-driven behavior** (message templates guiding autonomous decisions instead of hardcoded state machines), and **declarative tool bridging** (a uniform `createPassthroughTool` pattern to expose 45 MCP tools as native agent tools). Using the [Synapse](https://github.com/Vincentwei1021/Synapse) x [OpenClaw](https://openclaw.ai) integration as a real-world example.

---

## TL;DR

1. **SSE + MCP as a natural pair** -- Synapse pushes real-time notifications over SSE (the same stream that powers the human Web UI) and exposes 45 MCP tools for agent operations. The plugin connects to both: SSE tells the agent *when* to act, MCP tells it *how* to act.
2. **`/hooks/agent` wake mechanism** -- When an event arrives, the plugin calls OpenClaw's `/hooks/agent` endpoint, which creates an isolated agent turn with the Synapse assignment as the primary prompt. The agent sees a focused task, not a side-channel interruption.
3. **Declarative `createPassthroughTool` bridging** -- 45 Synapse MCP tools are registered through a uniform pattern: define the name, JSON Schema parameters, and target MCP tool name. The registry handles serialization, error formatting, and `toolCallId` convention automatically.

---

## 1. Background: Why This Plugin Exists

[Synapse](https://github.com/Vincentwei1021/Synapse) is a research orchestration platform where human researchers and AI agents collaborate on the full research lifecycle:

```
Research Project → Research Questions → Experiments → Reports
       ^                  ^                  ^            ^
    Human PI        Human or Agent       AI Agent     AI Agent
```

Agents have four composable permissions: `pre_research` (literature search, context reading), `research` (question CRUD, hypothesis formulation), `experiment` (start, progress, submit, compute tools), and `report` (documents, synthesis). An agent can hold any combination of these.

[OpenClaw](https://openclaw.ai) is an AI Agent runtime with a plugin system. The goal: **assign an experiment on Synapse's board, and have the OpenClaw agent automatically detect it, claim compute resources, run it, report progress in real time, submit results, and write a report.**

Without the plugin:

```
Human assigns experiment → manually tells agent → agent runs → human copies results back
```

With the plugin:

```
Human assigns experiment on Synapse UI
        |
SSE pushes task_assigned notification
        |
Plugin fetches experiment + project context via MCP
        |
/hooks/agent creates isolated agent turn
        |
Agent starts experiment, reports progress, submits results
        |
Agent writes experiment report, @mentions the assigner
```

One click on the Web UI. Everything else is automated.

---

## 2. SSE + MCP: Dual-Channel Architecture

Synapse provides two interfaces that were originally built for two different audiences:

- **SSE event stream** -- Real-time notifications pushed to the Web UI over a long-lived connection at `/api/events/notifications`. Covers experiment assignments, @mentions, autonomous loop triggers, and more.
- **MCP tools** -- The agent-facing API. 45 tools covering the full research workflow: inspect projects, claim questions, start experiments, report progress, search papers, manage compute. Authenticated via API key (`syn_` prefix) over HTTP streamable transport.

For an agent runtime like OpenClaw, where agents "work like humans," these two channels combine naturally: **SSE provides situational awareness (know when to act), MCP provides operational capability (know how to act).**

```
Synapse Server
  |
  |--- SSE ------> Plugin SSE listener -----> "Experiment assigned to you"
  |                                                    |
  |                                                    v
  |                                            Event Router
  |                                                    |
  |                                                    v
  |                                         /hooks/agent (wake)
  |                                                    |
  |                                                    v
  |                                              Agent turn
  |                                                    |
  +--- MCP <------- Agent calls tools <------ synapse_start_experiment
  |                                            synapse_report_experiment_progress
  +--- MCP <------- Agent calls tools <------ synapse_submit_experiment_results
```

No custom API development needed. No modifications to Synapse's server code. When Synapse adds a new MCP tool, the plugin adds one `createPassthroughTool` definition and it just works.

### Reconnection and Backfill

SSE connections drop -- network hiccups, server restarts, load balancer timeouts. The plugin implements exponential backoff reconnection:

```
1s -> 2s -> 4s -> 8s -> 16s -> 30s (max)
```

After a successful reconnect, the plugin calls `synapse_get_notifications` with `status: "unread"` to backfill any notifications that arrived while disconnected. This ensures zero event loss across connection interruptions.

```typescript
onReconnect: async () => {
  const result = await mcpClient.callTool("synapse_get_notifications", {
    status: "unread",
    autoMarkRead: false,
  });
  const count = result?.notifications?.length ?? 0;
  if (count > 0) {
    logger.info(`SSE reconnect: ${count} unread notifications to process`);
  }
},
```

---

## 3. OpenClaw Plugin Primitives

OpenClaw's plugin API offers three core primitives. The entire plugin is built from these three building blocks:

| Primitive | Purpose | Role in This Plugin |
|-----------|---------|---------------------|
| `registerService` | Background long-lived process with start/stop lifecycle | **Maintain SSE connection** -- starts on plugin load, continuously listens for Synapse notifications |
| `registerTool` | Expose callable tools to the agent | **Bridge 45 Synapse MCP tools** -- agent calls them like native tools |
| `registerCommand` | Register `/command` shortcuts (bypass LLM) | **`/synapse status`**, **`/synapse experiments`**, **`/synapse questions`** |

Here is the entire plugin skeleton, showing how these three primitives wire together:

```typescript
register(api) {
  // 1. Background service: SSE long-lived connection
  api.registerService({
    id: "synapse-sse",
    async start() {
      // Establish SSE connection to /api/events/notifications
      // Events flow through EventRouter -> /hooks/agent
    },
    async stop() {
      // Disconnect SSE and MCP client
    },
  });

  // 2. Tools: 45 Synapse MCP tools exposed to the agent
  registerCommonTools(api, mcpClient);

  // 3. Commands: /synapse status, /synapse experiments, /synapse questions
  registerSynapseCommands(api, mcpClient, getStatus);
}
```

### registerService: The SSE Heart

`registerService` runs a background process independent of the agent's conversation loop. The plugin uses it to maintain the SSE connection to Synapse:

- `start()` is called on plugin load -- establishes the SSE connection to `/api/events/notifications`
- Automatic reconnection on disconnect (exponential backoff, 1s to 30s max)
- Events are dispatched through the `SynapseEventRouter`
- `stop()` is called on plugin unload -- graceful disconnect of both SSE and MCP

The SSE stream pushes minimal notification envelopes:

```json
{"type": "new_notification", "notificationUuid": "550e8400-..."}
```

The event router fetches full notification details via MCP, checks the project UUID filter, then routes to the appropriate handler.

### The Event Router: 8 Notification Types

The `SynapseEventRouter` maps notification actions to agent behaviors:

| Notification Action | Agent Behavior |
|---------------------|---------------|
| `task_assigned` / `run_assigned` | Fetch experiment + project context, wake agent to start execution |
| `autonomous_loop_triggered` | Agent analyzes full project context, proposes new experiments |
| `deep_research_requested` | Agent reads related works, produces literature review document |
| `experiment_report_requested` | Agent writes detailed report for a completed experiment |
| `mentioned` | Agent reads comment thread, responds to @mention |
| `hypothesis_formulation_requested` | Agent reviews formulation questions for a research question |
| `hypothesis_formulation_answered` | Agent validates answers, optionally starts follow-up round |
| `research_question_claimed` / `idea_claimed` | Agent receives and reviews a claimed research question |

Each handler constructs a prompt string containing the full context the agent needs, then calls `triggerAgent()` to wake the agent via `/hooks/agent`.

---

## 4. Waking the Agent: `/hooks/agent`

When the event router determines the agent should act, it needs to wake an idle agent immediately. OpenClaw provides a Hooks system for exactly this. The critical endpoint is **`/hooks/agent`**, which creates an isolated agent turn:

```typescript
async function wakeAgent(
  gatewayUrl: string,
  hooksToken: string,
  text: string,
  logger: { info: (msg: string) => void; warn: (msg: string) => void },
  timeoutSeconds?: number,
) {
  const res = await fetch(`${gatewayUrl}/hooks/agent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${hooksToken}`,
    },
    body: JSON.stringify({
      message: text,
      name: "Synapse",
      wakeMode: "now",
      deliver: false,
      timeoutSeconds: timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS,
    }),
  });
}
```

This does three important things:

1. **Creates an isolated agent turn** -- The `message` becomes the agent's primary prompt. This is not a side-channel notification that the agent might ignore; it is the task itself.
2. **Sets a configurable timeout** -- Derived from the experiment's `computeBudgetHours`. If the experiment has a 4-hour compute budget, the agent turn gets a 4-hour timeout. If the budget is unlimited (`null`), the default is 24 hours.
3. **Triggers immediate execution** -- `wakeMode: "now"` means the agent starts working immediately, no polling delay.

### Why `/hooks/agent` and Not `/hooks/wake`

Earlier versions of this plugin used `/hooks/wake`, which injected text as a side-channel event into the agent's existing conversation. The problem: if the agent was mid-task, the wake event would compete with whatever the agent was already doing.

`/hooks/agent` creates a completely separate agent turn. The Synapse assignment prompt becomes the primary message. This is what enables reliable end-to-end automatic experiment execution -- the agent focuses entirely on the assigned work without context contamination from other tasks.

### Timeout from Compute Budget

The timeout is not hardcoded. It adapts to the experiment:

```typescript
// Compute timeout: use experiment's computeBudgetHours, or 24h if unlimited
const budgetHours = experiment?.computeBudgetHours;
const timeoutSeconds = budgetHours != null
  ? Math.ceil(budgetHours * 3600)
  : 24 * 3600; // 24 hours for unlimited budget

this.triggerAgent(prompt, {
  notificationUuid: n.uuid,
  action: "task_assigned",
  entityType: n.entityType,
  entityUuid: n.entityUuid,
  projectUuid,
  timeoutSeconds,
});
```

A quick 30-minute GPU benchmark gets a 30-minute timeout. A multi-day training run gets 24 hours. The agent is never cut short, and never left hanging indefinitely.

---

## 5. Message Templates: Prompt-Driven Behavior

The event router's final output is a text string injected into the agent's context via `/hooks/agent`. This string is the **message template** -- it determines what the agent does after waking up.

This is an interesting pattern in OpenClaw plugin design: **the plugin does not control agent behavior with code; it guides the agent's autonomous decision-making through carefully crafted prompts.**

### Experiment Assignment Template

When an experiment is assigned, the prompt is rich with context:

```
[Synapse] Experiment assigned: Train LoRA adapter on domain corpus.
Experiment UUID: 550e8400-..., Project UUID: 8a2b9c10-...
Research project: Efficient Domain Adaptation
Project brief: Investigate parameter-efficient fine-tuning...
Datasets: domain_corpus_v2.jsonl; validation_set.jsonl
Evaluation methods: Perplexity on held-out set; downstream task accuracy
Experiment description: Train a LoRA adapter with rank 16...
Linked research question: Does LoRA rank affect domain transfer quality?
Compute budget (hours): 4
If a selected compute node exposes managedKeyAvailable=true, call
synapse_get_node_access_bundle with the experimentUuid and nodeUuid.
Write the returned privateKeyPemBase64 to a local PEM file with
chmod 600 before using ssh.
Use synapse_get_assigned_experiments to inspect your current queue.
Execute the highest-priority item first; experiments with priority
'immediate' must jump to the front of the queue.
Then use synapse_get_experiment to inspect full details,
use synapse_list_compute_nodes to inspect available machines and GPUs,
call synapse_start_experiment when you begin execution.
During execution, call synapse_report_experiment_progress at each
major step (e.g. data download, training start, evaluation).
When finished, call synapse_submit_experiment_results to complete.
After completing your work, post a comment on this experiment
using synapse_add_comment with @mention:
Use this exact mention format: @[Alice](user:9f8e7d6c-...)
```

Notice the structure. Every message template contains:

1. **Entity context** -- Which experiment, which project, relevant UUIDs, linked research question
2. **Project context** -- Datasets, evaluation methods, compute budget, prior experiment results
3. **Tool guidance** -- Which specific `registerTool`-registered tools to call, in what order
4. **Compute access pattern** -- How to handle managed SSH keys (never assume local paths)
5. **Priority instructions** -- How to handle the experiment queue (priority first, then FIFO)
6. **Social behavior** -- Who to @mention afterward, in what format

### Autonomous Loop Template

When the experiment queue empties and the autonomous loop is enabled:

```
[Synapse] Autonomous research loop triggered for project "Efficient Domain Adaptation"
(projectUuid: 8a2b9c10-...).

The experiment queue is empty. Your task:
1. Use synapse_get_project_full_context to review all project details,
   research questions, and experiment results
2. Analyze: What questions remain unanswered? What experiments could
   yield new insights? Are there gaps in the research?
3. If you identify valuable next steps, use synapse_propose_experiment
   to create draft experiments for human review
4. If the research objectives appear to be met, you may choose not
   to propose any new experiments

Proposed experiments will enter "draft" status and require human
approval before execution.
```

The agent receives full autonomy to analyze and decide, but with a human-in-the-loop gate: proposed experiments land in `draft` status and must be approved before execution. This creates a self-sustaining research cycle: execute, analyze, propose, review, execute.

### Deep Research Template

When a human requests a literature review:

```
[Synapse] Deep research literature review requested for project
(projectUuid: 8a2b9c10-...).

1. Use synapse_get_related_works to read all collected papers
2. Use synapse_get_project_full_context to understand research objectives
3. Analyze how each paper relates to the project's goals
4. Create a comprehensive literature review document
```

### Why Prompts, Not State Machines

We initially tried hardcoding a state machine to enforce agent behavior -- "must wait for human confirmation before validating," "must check GPU availability before starting." This was over-engineering. **The agent has sufficient judgment on its own. The plugin just needs to provide the right context and tools, then guide direction through prompts.** If a compute node is offline, the agent will notice and pick a different one. If results look anomalous, the agent will flag it in the comment thread. Prompts set the direction; the agent navigates.

---

## 6. The `registerTool` Bridging Pattern

`registerTool` is OpenClaw's primitive for exposing callable tools to the agent. Every Synapse MCP tool is bridged through a uniform pattern using the plugin's `createPassthroughTool` helper.

### The Registry Layer

The plugin uses a declarative tool definition pattern. Instead of hand-writing 45 `api.registerTool()` calls, tools are defined in a typed array and registered in bulk:

```typescript
// tool-registry.ts
export function createPassthroughTool<TArgs>(definition: {
  name: string;
  description: string;
  parameters: OpenClawObjectSchema;
  targetToolName: string;
  mapArgs?: (args: TArgs) => Record<string, unknown>;
}): OpenClawToolDefinition {
  return {
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters,
    async execute(mcpClient, args) {
      return mcpClient.callTool(
        definition.targetToolName,
        definition.mapArgs ? definition.mapArgs(args as TArgs) : args
      );
    },
  };
}

export function registerOpenClawTools(
  api: OpenClawToolApi,
  mcpClient: SynapseMcpClient,
  definitions: readonly OpenClawToolDefinition[]
) {
  definitions.forEach((definition) => {
    api.registerTool({
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters,
      async execute(_id: string, args: Record<string, unknown>) {
        const result = await definition.execute(mcpClient, args);
        return JSON.stringify(result, null, 2);
      },
    });
  });
}
```

### Defining a Tool

Each tool is a single `createPassthroughTool` call:

```typescript
createPassthroughTool<{ experimentUuid: string }>({
  name: "synapse_start_experiment",
  description: "Start an assigned experiment and optionally reserve GPUs.",
  parameters: {
    type: "object",
    properties: {
      experimentUuid: { type: "string", description: "Experiment UUID" },
      gpuUuids: {
        type: "array",
        items: { type: "string" },
        description: "Optional GPU UUIDs to reserve",
      },
      workingNotes: {
        type: "string",
        description: "Optional notes or execution plan",
      },
    },
    required: ["experimentUuid"],
    additionalProperties: false,
  },
  targetToolName: "synapse_start_experiment",
  mapArgs: ({ experimentUuid, gpuUuids, workingNotes }) => ({
    experimentUuid,
    gpuUuids: gpuUuids ?? [],
    workingNotes,
  }),
}),
```

Two OpenClaw-specific conventions to note:

- **`parameters` must be full JSON Schema** (`type: "object"` + `properties` + `required`), no shorthand -- because OpenClaw interfaces with model providers like Bedrock that enforce strict schema validation.
- **`execute`'s first argument is `toolCallId`** (the `_id` parameter), not the tool parameters. The second argument contains the actual args. This is OpenClaw's tool-use protocol convention.

The optional `mapArgs` function handles default values and argument normalization. For example, ensuring `gpuUuids` defaults to `[]` instead of `undefined`, or coercing `onlyAvailable` to `false` when not provided.

### 45 Tools at a Glance

| Category | Count | Tools |
|----------|-------|-------|
| **Agent Identity** | 2 | `synapse_checkin`, `synapse_get_my_assignments` |
| **Research Projects** | 4 | `synapse_list_research_projects`, `synapse_get_research_project`, `synapse_get_project_full_context`, `synapse_get_activity` |
| **Research Questions** | 6 | `synapse_get_research_questions`, `synapse_get_research_question`, `synapse_get_available_research_questions`, `synapse_claim_research_question`, `synapse_release_research_question`, `synapse_update_research_question_status` |
| **Experiments** | 6 | `synapse_get_experiment`, `synapse_get_assigned_experiments`, `synapse_start_experiment`, `synapse_submit_experiment_results`, `synapse_report_experiment_progress`, `synapse_propose_experiment` |
| **Compute** | 4 | `synapse_list_compute_nodes`, `synapse_get_node_access_bundle`, `synapse_sync_node_inventory`, `synapse_report_gpu_status` |
| **Documents** | 2 | `synapse_get_documents`, `synapse_get_document` |
| **Comments** | 2 | `synapse_add_comment`, `synapse_get_comments` |
| **Notifications** | 2 | `synapse_get_notifications`, `synapse_mark_notification_read` |
| **Mentions** | 1 | `synapse_search_mentionables` |
| **Hypothesis Formulation** | 2 | `synapse_answer_hypothesis_formulation`, `synapse_get_hypothesis_formulation` |
| **Project Groups** | 3 | `synapse_get_project_groups`, `synapse_get_project_group`, `synapse_get_group_dashboard` |
| **Literature** | 3 | `synapse_search_papers`, `synapse_add_related_work`, `synapse_get_related_works` |
| **Sessions** | 6 | `synapse_create_session`, `synapse_list_sessions`, `synapse_get_session`, `synapse_close_session`, `synapse_reopen_session`, `synapse_session_heartbeat` |

All 45 tools are available to all agents. Synapse's MCP server handles role-based access control internally based on the agent's composable permissions.

---

## 7. MCP Client: Lazy Connection and Session Recovery

The plugin wraps `@modelcontextprotocol/sdk` in a `SynapseMcpClient` that handles the realities of long-running connections:

**Lazy connection** -- The MCP client does not connect on plugin load. It connects on the first `callTool` invocation. This avoids connection failures during startup when the Synapse server might not be ready yet.

**Session expiry recovery** -- MCP sessions can expire (server restart, session timeout). When a tool call returns a 404, the client automatically reconnects and retries:

```typescript
async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (!this.client || this._status !== "connected") {
    await this.connect();
  }

  try {
    return await this._doCallTool(name, args);
  } catch (err) {
    if (this.isSessionExpiredError(err)) {
      this.opts.logger.warn("MCP session expired, reconnecting...");
      this._status = "reconnecting";
      await this.cleanupConnection();
      await this.connect();
      return await this._doCallTool(name, args);
    }
    throw err;
  }
}
```

**JSON auto-parsing** -- MCP tool responses come as content blocks. The client extracts the first `text` content block and parses it as JSON, falling back to raw text if parsing fails. This means tool handlers in the event router get typed objects, not raw MCP response envelopes.

---

## 8. Project UUID Filtering

In multi-project environments, a single agent might be assigned to multiple research projects but only some of them should be handled by the OpenClaw plugin (others might be handled by a different agent runtime, or manually).

The plugin config accepts an optional `projectUuids` array:

```json
{
  "config": {
    "synapseUrl": "https://synapse.example.com",
    "apiKey": "syn_your_api_key",
    "projectUuids": ["550e8400-...", "8a2b9c10-..."]
  }
}
```

When configured, the event router checks every notification against this set:

```typescript
private readonly projectFilter: Set<string>;

constructor(opts: SynapseEventRouterOptions) {
  this.projectFilter = new Set(opts.config.projectUuids ?? []);
}

// In fetchAndRoute:
const projectUuid = notification.projectUuid ?? notification.researchProjectUuid ?? "";
if (this.projectFilter.size > 0 && !this.projectFilter.has(projectUuid)) {
  this.logger.info(`Notification for project ${projectUuid} filtered out`);
  return;
}
```

An empty array (the default) means "monitor all projects." This is a simple but essential feature for production deployments where one agent instance cannot and should not handle everything.

---

## 9. Gotchas

### Gotcha 1: npm Scoped Package Name vs OpenClaw Plugin ID

The npm package name includes a scope: `@vincentwei1021/synapse-openclaw-plugin`. But the OpenClaw plugin ID **must not include the scope prefix**.

Three places, three different naming rules:

| Location | Value | Notes |
|----------|-------|-------|
| `package.json` -> `name` | `@vincentwei1021/synapse-openclaw-plugin` | npm package name with scope |
| `openclaw.plugin.json` -> `id` | `synapse-openclaw-plugin` | OpenClaw plugin ID, **no scope** |
| `src/index.ts` -> `id` | `synapse-openclaw-plugin` | Must match the manifest |

When configuring `openclaw.json`, use the plugin ID (without scope) as the key:

```json
{
  "plugins": {
    "entries": {
      "synapse-openclaw-plugin": {
        "enabled": true,
        "config": { ... }
      }
    }
  }
}
```

If you use the full npm package name (`@vincentwei1021/...`) as the key, OpenClaw will report `plugin not found` or `plugin id mismatch`.

### Gotcha 2: `hooks.token` Must Differ from `gateway.auth.token`

OpenClaw's hooks auth token and gateway auth token must be different values. Using the same value triggers a security error. This is an intentional design decision to prevent plugins and the gateway from sharing credentials.

### Gotcha 3: Config Fields May Be `undefined` Despite Zod Defaults

OpenClaw may pass plugin config without running it through Zod validation. Even if your schema has `.default([])`, the actual `projectUuids` may be `undefined` at runtime.

The fix: defend all config fields with explicit fallbacks:

```typescript
const config: SynapsePluginConfig = {
  synapseUrl: rawConfig.synapseUrl || undefined,
  apiKey: rawConfig.apiKey || undefined,
  projectUuids: rawConfig.projectUuids ?? [],
  autoStart: rawConfig.autoStart ?? true,
};
```

Never trust that Zod defaults will survive OpenClaw's config pipeline.

### Gotcha 4: The `/hooks/agent` Endpoint, Not `/hooks/wake`

If you are reading older documentation or blog posts about OpenClaw plugins, you may see references to `/hooks/wake`. The Synapse plugin uses **`/hooks/agent`**, which creates an isolated agent turn. This is critical: `/hooks/agent` makes the Synapse assignment the primary message, while `/hooks/wake` would inject it as a side-channel event that might be lost if the agent is busy.

### Gotcha 5: SSH Key Paths Are Not Local

When an experiment involves remote compute, agents must use `synapse_get_node_access_bundle` to obtain SSH credentials. The returned `privateKeyPemBase64` must be written to a local file and `chmod 600`. Never assume a path like `/home/ubuntu/.synapse/keys/...` exists on the agent machine. The event router's experiment assignment template includes this guidance explicitly.

---

## 10. Project Structure

```
packages/openclaw-plugin/
|-- package.json               # @vincentwei1021/synapse-openclaw-plugin v0.5.0
|-- openclaw.plugin.json       # OpenClaw plugin manifest (id: synapse-openclaw-plugin)
|-- tsconfig.json
|-- README.md
|-- src/
    |-- index.ts               # Plugin entry: wires SSE + MCP + tools + commands
    |-- config.ts              # Zod config schema + validation
    |-- mcp-client.ts          # MCP Client (lazy connect, 404 auto-reconnect)
    |-- sse-listener.ts        # SSE connection + exponential backoff reconnect
    |-- event-router.ts        # Notification -> agent action mapping (8 handlers)
    |-- event-router.test.ts   # Event router unit tests
    |-- mcp-client.test.ts     # MCP client unit tests
    |-- sse-listener.test.ts   # SSE listener unit tests
    |-- commands.ts            # /synapse slash commands
    |-- tools/
        |-- tool-registry.ts           # createPassthroughTool + registerOpenClawTools
        |-- common-tool-definitions.ts # 45 tool definitions (declarative)
        |-- common-tools.ts            # Registration entry point
```

### Installation

```bash
openclaw plugins install @vincentwei1021/synapse-openclaw-plugin
```

Configure `~/.openclaw/openclaw.json`:

```json
{
  "hooks": {
    "enabled": true,
    "token": "your-hooks-token-must-differ-from-auth-token"
  },
  "plugins": {
    "enabled": true,
    "entries": {
      "synapse-openclaw-plugin": {
        "enabled": true,
        "config": {
          "synapseUrl": "https://synapse.example.com",
          "apiKey": "syn_your_api_key",
          "projectUuids": [],
          "autoStart": true
        }
      }
    }
  }
}
```

Configuration fields:

| Field | Required | Description |
|-------|----------|-------------|
| `synapseUrl` | Yes | Synapse server URL |
| `apiKey` | Yes | Agent API key (`syn_` prefix) |
| `projectUuids` | No | UUIDs to monitor (empty = all projects) |
| `autoStart` | No | Auto-start on assignment events (default: `true`) |

---

## 11. Closing Thoughts

The core idea behind this plugin is one sentence: **make the AI agent a first-class participant in the research workflow, not a passive tool that waits for terminal input.**

Through SSE for real-time event awareness, MCP for structured operations, `/hooks/agent` for isolated task execution, and prompt templates for behavioral guidance, the agent participates like a real team member: receiving assignments, checking compute resources, running experiments, reporting progress step by step, submitting results, writing reports, and @mentioning the assigner when done.

Three design decisions made the biggest difference:

1. **Dual-channel over single-channel.** SSE and MCP serve different purposes. Trying to do everything through MCP (polling for new assignments) or everything through SSE (encoding tool calls in events) would have been worse than using each channel for what it does best.

2. **Prompts over state machines.** The agent is smart enough to handle branching logic, error recovery, and social etiquette. The plugin provides context and guidance, not rigid control flow. When we removed our hardcoded state machine and replaced it with well-structured prompts, the agent actually handled edge cases *better* -- because it could reason about them instead of hitting unhandled states.

3. **Declarative tool bridging over hand-wired calls.** With 45 tools and counting, the `createPassthroughTool` pattern keeps the codebase manageable. Adding a new tool is a single definition object, not a new file with boilerplate.

If your platform also serves both human users and AI agents, this "event push + tool protocol" dual-channel architecture is worth considering. The infrastructure you already built for human users (notifications, real-time updates, API endpoints) is most of what agents need too.

Project links:
- **Synapse**: [github.com/Vincentwei1021/Synapse](https://github.com/Vincentwei1021/Synapse)
- **OpenClaw Plugin**: [npm @vincentwei1021/synapse-openclaw-plugin](https://www.npmjs.com/package/@vincentwei1021/synapse-openclaw-plugin)
