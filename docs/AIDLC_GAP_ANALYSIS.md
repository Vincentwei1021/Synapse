# AI-DLC Gap Analysis — Synapse vs Standard AI-DLC

> Generated: 2026-02-18 | Updated: 2026-02-24
> Scope: All three phases (Inception, Construction, Operations)

## Background

AI-DLC (AI-Driven Development Lifecycle) is a methodology framework proposed and open-sourced by AWS in 2025 ([awslabs/aidlc-workflows](https://github.com/awslabs/aidlc-workflows)). It reimagines software development to treat AI Agents as central collaborators rather than peripheral tools. The methodology shifts from "AI-assisted" to "AI-native" development.

### Four Core Values

1. **Human-AI Collaboration** over Isolated Solutions
2. **Collective Intelligence** over Individual Brilliance
3. **Rapid Informed Decisions** over Analysis Paralysis
4. **Business Impact** over Development Velocity

### Core Mental Model

At its core, AI-DLC operates on a repeating loop for every SDLC activity:

```
AI creates plan → Humans review/challenge → AI clarifies → Humans approve → AI executes → Humans verify
```

AWS calls this the **"Reversed Conversation"** — AI proposes, humans decide. This loop repeats rapidly at every stage, not just at a project-level gate.

### Three Phases

| Phase | Purpose | Core Activities |
|-------|---------|-----------------|
| **Inception** | Determine WHAT and WHY | Requirements analysis, user stories, application design, Units of Work decomposition, risk assessment |
| **Construction** | Determine HOW | Component design, code generation, testing strategies, quality assurance, build configuration |
| **Operations** | Deploy and monitor | Deployment automation, infrastructure setup, monitoring/observability, production readiness validation |

Each phase provides richer context for the next. The workflow evaluates the depth at which each phase should execute, adapting to problem complexity rather than forcing a fixed process.

### Seven Practices

1. **Never Single-Shot a Multi-Step Problem** — Decompose complex problems into verifiable steps; AI and humans iterate on each step before moving on
2. **Mob Elaboration** — Real-time team verification of AI-proposed plans; stakeholders assemble, review, and validate before execution begins
3. **Mob Construction** — Real-time team verification of AI-produced artifacts; approved plans are executed, then stakeholders review and validate outputs
4. **Context Continuity** — AI saves and maintains persistent context (plans, requirements, design artifacts) across phases and sessions, ensuring seamless continuation of work
5. **Agent Hours** — New work measurement unit replacing person-days; measures AI effort in hours to enable ROI evaluation and capacity planning
6. **Bolt Cycles** — Short, intense iterations measured in hours or days (replacing week-level Sprints); Epics are replaced by "Units of Work"
7. **Refactor with Surgical Precision** — Precise, behavior-preserving changes to legacy systems; AI maps existing behavior before making modifications

### Key Terminology

| AI-DLC Term | Replaces | Description |
|-------------|----------|-------------|
| Unit of Work | Epic | A decomposed, parallelizable chunk of development work |
| Bolt | Sprint | An hour/day-level iteration cycle |
| Agent Hours | Person-days | Time measurement for AI agent effort |
| Mob Elaboration | Sprint Planning | Real-time collaborative review of AI proposals |
| Mob Construction | Code Review | Real-time collaborative verification of AI outputs |

### References

- [AWS Blog: AI-Driven Development Life Cycle](https://aws.amazon.com/blogs/devops/ai-driven-development-life-cycle/)
- [AWS Blog: Open-Sourcing Adaptive Workflows for AI-DLC](https://aws.amazon.com/blogs/devops/open-sourcing-adaptive-workflows-for-ai-driven-development-life-cycle-ai-dlc/)
- [The Seven Practices of AI-DLC](https://builder.aws.com/content/35b5OaMGqCxMm3y3yOTjUSnMaj3/the-answer-to-ai-development-chaos-systematic-ai-dlc-practices)
- [GitHub: awslabs/aidlc-workflows](https://github.com/awslabs/aidlc-workflows)
- [Critical Analysis (Peter Tilsen)](https://medium.com/data-science-collective/the-ai-driven-development-lifecycle-ai-dlc-a-critical-yet-hopeful-view-edc966173f2f)

---

## Inception Phase Deep Dive

Source: [awslabs/aidlc-workflows](https://github.com/awslabs/aidlc-workflows) — `aidlc-rules/aws-aidlc-rule-details/inception/`

### Stage Sequence

The Inception phase consists of 7 stages. 3 always execute; 4 are conditional based on project characteristics.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        INCEPTION PHASE                              │
│                                                                     │
│  [1] Workspace Detection ──── always ────┐                          │
│                                          ▼                          │
│  [2] Reverse Engineering ── brownfield ──┤ (skip if greenfield)     │
│                                          ▼                          │
│  [3] Requirements Analysis ── always ────┤                          │
│                                          ▼                          │
│  [4] User Stories ────────── conditional ┤ (multi-persona/UX)       │
│                                          ▼                          │
│  [5] Application Design ──── conditional ┤ (new components/svc)     │
│                                          ▼                          │
│  [6] Units Generation ────── conditional ┤ (multi-service decomp)   │
│                                          ▼                          │
│  [7] Workflow Planning ────── always ────┘                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Stage Details

#### Stage 1: Workspace Detection (always runs, auto-advances)

**Purpose**: Detect project state to determine the workflow path.

**Process**:
1. Check for existing `aidlc-docs/aidlc-state.md` — if present, resume from last saved phase
2. Scan for source files (.java, .py, .js, .ts, etc.) and build configs (pom.xml, package.json, etc.)
3. Classify as **greenfield** (no existing code) or **brownfield** (existing codebase)
4. Write initial state file with project type, timestamp, workspace location

**Artifacts**: `aidlc-state.md` (initial)

**Human gate**: None — auto-advances to Reverse Engineering (brownfield) or Requirements Analysis (greenfield).

#### Stage 2: Reverse Engineering (conditional — brownfield only)

**Purpose**: Understand the existing codebase before making changes.

**Process**: 12 sequential steps scanning the entire workspace.

**Artifacts** (7 documents in `aidlc-docs/inception/reverse-engineering/`):

| # | Artifact | Content |
|---|----------|---------|
| 1 | `business-overview.md` | Business context, transactions, domain dictionary |
| 2 | `architecture.md` | System design, components, data flows, infrastructure |
| 3 | `code-structure.md` | Build systems, classes/modules, patterns, dependencies |
| 4 | `api-documentation.md` | REST APIs, internal interfaces, data models |
| 5 | `component-inventory.md` | All packages enumerated by type with totals |
| 6 | `technology-stack.md` | Languages, frameworks, tools, versions |
| 7 | `dependencies.md` | Internal and external dependency graph |

Plus: code quality assessment (test coverage, linting, documentation, tech debt).

**Human gate**: **MANDATORY** — "Do not proceed until user explicitly approves."

#### Stage 3: Requirements Analysis (always runs)

**Purpose**: Transform a vague intent into structured, validated requirements.

**Process** (9 steps):
1. Load existing system docs (brownfield)
2. Analyze request across 3 dimensions: **clarity** (clear/vague/incomplete), **type** (new feature/bug fix/refactoring/migration/etc.), **scope and complexity**
3. Determine requirements **depth** — Minimal, Standard, or Comprehensive — based on complexity
4. Assess current requirements completeness across: functional reqs, non-functional reqs, user scenarios, business context, technical context, quality attributes
5. Conduct completeness analysis
6. **Generate verification questions** in a dedicated markdown file (see Clarification Process below)
7. **GATE**: Wait for all answers, validate for contradictions/ambiguities
8. Generate final requirements document incorporating answers
9. Present for user approval

**Artifacts**:
- `requirements-questions.md` — verification questions with multiple-choice options
- `requirements.md` — final validated requirements

**Human gate**: Explicit approval required before advancing.

#### Stage 4: User Stories (conditional)

**When executed**: New features, UX changes, multi-persona systems, customer-facing APIs. Skipped for: pure refactoring, isolated bug fixes, infrastructure-only changes.

**Process** (two-phase, 23 steps):

*Planning Phase (steps 1-14)*:
1. Validate whether user stories add value (3 priority tiers)
2. Create story generation plan with methodology
3. Generate context-appropriate clarification questions
4. **GATE**: Require explicit user approval of plan before proceeding

*Generation Phase (steps 15-23)*:
1. Execute approved plan systematically
2. Generate stories compliant with **INVEST criteria** (Independent, Negotiable, Valuable, Estimable, Small, Testable)
3. Generate persona definitions
4. **GATE**: Final stakeholder approval

**Artifacts**:
- `user-stories-questions.md` — clarification questions
- `stories.md` — user stories with acceptance criteria
- `personas.md` — user personas

**Human gate**: Two gates — plan approval + final artifacts approval.

#### Stage 5: Application Design (conditional)

**When executed**: New components or services need to be defined. Skipped when only modifying existing components.

**Process** (15 steps):
1. Analyze requirements documentation
2. Identify main functional components and responsibilities
3. Define component interfaces
4. Design orchestration layers
5-7. Generate clarification questions
8-9. **Validate answers** — check for vague language, contradictions, undefined criteria; mandatory follow-up if issues found
10-15. Generate design artifacts

**Artifacts** (4 documents):
- `components.md` — component definitions and high-level responsibilities
- `component-methods.md` — method signatures (business logic deferred to Construction)
- `services.md` — service definitions and interaction patterns
- `component-dependency.md` — relationship matrices and data flows

**Human gate**: Explicit approval with full audit trail.

#### Stage 6: Units Generation (conditional)

**When executed**: Multi-service decomposition required. This is the AI-DLC equivalent of Sprint/Epic planning.

**Process** (two-phase, 19 steps):

*Planning Phase (steps 1-11)*:
1. Create decomposition plan with context-relevant questions
2. Collect and analyze user answers for ambiguities
3. Resolve unclear responses with follow-up questions
4. **GATE**: Obtain explicit approval before proceeding

*Generation Phase (steps 12-19)*:
1. Execute approved plan step-by-step
2. Distinguish "services" (independently deployable, microservices) vs "modules" (logical units, monolith)
3. Generate dependency matrix
4. Map user stories to units
5. **GATE**: User approval of generated units

**Artifacts** (3 documents):
- `unit-of-work.md` — unit definitions
- `unit-of-work-dependency.md` — dependency matrix between units
- `unit-of-work-story-map.md` — story-to-unit mappings

**Human gate**: Two gates — plan approval + final artifacts approval.

#### Stage 7: Workflow Planning (always runs)

**Purpose**: Determine which Construction sub-phases to execute and create an implementation strategy.

**Process**:
1. Load all inception artifacts (reverse engineering, requirements, user stories)
2. Analyze transformation scope, impact areas, component relationships
3. Determine which Construction stages to activate:
   - Functional Design — execute for data models, APIs, complex logic
   - NFR Requirements/Design — execute for performance/security requirements
   - Infrastructure Design — execute for infrastructure changes
4. Risk assessment: Low (isolated) → Medium (multi-component) → High (system-wide) → Critical (production-critical)
5. Generate execution plan with Mermaid workflow visualization

**Artifacts**:
- `execution-plan.md` — transformation scope, impact assessment, component relationships, phase sequence
- Mermaid workflow diagram

**Human gate**: Explicit approval of execution plan before entering Construction.

### The Clarification Process (反问机制)

The clarification process is **central** to AI-DLC's Inception phase. It is NOT optional — it is a mandatory gate at every stage.

**Core rules** (from `common/question-format-guide.md`):

1. **Questions are NEVER asked in chat** — always placed in dedicated markdown files (`{phase-name}-questions.md`)
2. **Mandatory structure** per question:
   - Clear, specific question text
   - 2-5 meaningful multiple-choice options (mutually exclusive, realistic, specific)
   - "Other" as the final option for custom responses
   - `[Answer]:` tag for user responses
3. **After users respond**, AI must:
   - Read the question file
   - Extract answers from `[Answer]:` tags
   - Validate all questions are answered
   - **Check for contradictions and ambiguities**
4. **If issues detected** → create `{phase-name}-clarification-questions.md` for follow-up
5. **NEVER proceed** with unanswered, invalid, or contradictory responses

**Typical question flow per stage**:
```
AI generates questions → User answers → AI validates →
  ├─ All clear → Proceed to artifact generation
  └─ Issues found → Generate clarification questions → User answers → AI re-validates → ...
```

This loop repeats until all ambiguities are resolved. It embodies AI-DLC Practice 1 ("Never Single-Shot a Multi-Step Problem") and Practice 2 ("Mob Elaboration").

### Adaptive Depth

AI-DLC does not have a fixed level of rigor. Each stage adapts its depth based on:

| Factor | Example |
|--------|---------|
| Request clarity | A detailed spec gets Minimal depth; a vague idea gets Comprehensive |
| Problem complexity | Bug fix → Minimal; system migration → Comprehensive |
| Project scope | Single file → Minimal; system-wide → Comprehensive |
| Risk level | Low-risk → Minimal; production-critical → Comprehensive |
| Available context | Rich existing docs → less depth needed |

All depth levels produce the **same artifact types** — the difference is thoroughness. A bug fix gets concise requirements with few questions; a system migration gets comprehensive coverage with many clarifying rounds.

### Full Inception Artifact Inventory

When all stages execute (worst case — brownfield project with new multi-service architecture):

| Stage | Artifacts | Count |
|-------|-----------|-------|
| Workspace Detection | `aidlc-state.md` | 1 |
| Reverse Engineering | business-overview, architecture, code-structure, api-docs, component-inventory, tech-stack, dependencies | 7 |
| Requirements Analysis | questions file, `requirements.md` | 2 |
| User Stories | questions file, `stories.md`, `personas.md` | 3 |
| Application Design | `components.md`, `component-methods.md`, `services.md`, `component-dependency.md` | 4 |
| Units Generation | `unit-of-work.md`, `unit-of-work-dependency.md`, `unit-of-work-story-map.md` | 3 |
| Workflow Planning | `execution-plan.md` + Mermaid diagram | 1-2 |
| Cross-cutting | `audit.md` (all user inputs logged with ISO 8601 timestamps) | 1 |
| **Total** | | **~22 artifacts** |

For a simple greenfield bug fix (Minimal depth), this shrinks to ~4-5 artifacts (state, requirements questions, requirements, execution plan, audit).

### Synapse vs AI-DLC Inception: Detailed Mapping

| AI-DLC Inception Concept | Synapse Equivalent | Gap |
|--------------------------|-------------------|-----|
| Workspace Detection | N/A (Synapse is a platform, not an IDE plugin) | Not applicable — different architecture |
| Reverse Engineering | N/A (agents do this in their own IDE context) | Not applicable |
| Requirements Analysis | **Idea** entity — human or AI creates Idea with title + content | ⚠️ No structured clarification process; Idea content is free-form |
| Clarification Questions | **Comments** on Ideas | ⚠️ Unstructured; no multiple-choice format, no validation, no contradiction detection |
| Requirements Document | **Proposal documentDrafts** (type: `prd`, `spec`) | ✅ Supported via Proposal flow |
| User Stories | Not a first-class entity; can be included in documentDrafts | ⚠️ No INVEST validation, no persona entity |
| Application Design | **Proposal documentDrafts** (type: `tech_design`) | ✅ Supported via Proposal flow |
| Units of Work | **Proposal taskDrafts** with dependencies | ✅ Well-mapped — taskDrafts materialize into Tasks with DAG |
| Unit Dependency Matrix | **TaskDependency** model | ✅ Modeled with cycle detection |
| Workflow Planning / Execution Plan | Not a first-class entity | ⚠️ PM Agent does this implicitly; no structured execution plan artifact |
| Adaptive Depth | Not implemented | ❌ All Ideas/Proposals treated with same depth |
| Audit Trail | **Activity stream** | ⚠️ Logs actions but not raw user inputs with timestamps for requirements traceability |
| Human Approval Gates | **Proposal approve/reject** | ⚠️ Single gate at Proposal level; AI-DLC has gates at every stage |

**Key insight**: Synapse maps the Inception phase **outputs** well (requirements → documents, units → tasks with DAG), but largely skips the Inception phase **process** (structured clarification, multi-stage gates, adaptive depth, audit trail). The AI-DLC Inception is as much about the *how* (disciplined question-answer loops) as the *what* (final artifacts).

---

## What Synapse Does Well

Synapse implements the AI-DLC pipeline: Idea → Proposal → Document + Task → Execute → Verify → Done.

| AI-DLC Concept | Synapse Implementation | Strength |
|----------------|----------------------|----------|
| Reversed Conversation | Proposal approval flow — PM Agent proposes, Admin/Human verifies | Strong |
| Inception Phase | Idea → Proposal → Document + Task decomposition with DAG dependencies | Strong |
| Construction Phase | Task claim → in_progress → to_verify → done with session tracking | Moderate (has skeleton, lacks scheduling/metrics) |
| Context Continuity | Synapse Plugin auto-injects checkin context at CC session start via hooks | Moderate (functional but not dense enough) |
| Task DAG | TaskDependency modeling with cycle detection, rendered with @xyflow/react + dagre | Strong |
| Parallel Execution | Swarm mode with per-sub-agent sessions, checkin/checkout tracking | Strong |
| Session Observability | AgentSession + SessionTaskCheckin + Activity stream with session attribution | Moderate (lacks auto-expiry) |
| Feedback Loop | Admin-role Agents can create Ideas, closing the ops→inception loop | Present |
| Role-based Tooling | 50+ MCP tools across Public/Session/Developer/PM/Admin scopes | Strong |
| Multi-tenant Architecture | UUID-first, companyUuid isolation, production-grade engineering | Strong |

---

## Gap Analysis

### P0 — Critical for "Management Tool" Status

These gaps determine whether Synapse is a "record-keeper" or an "orchestrator."

#### 1. Notification & Event Push

**Current state**: ✅ Largely implemented. Synapse has a production-ready in-app notification system (see `src/app/api/notifications/README.md`):

**What's implemented**:
- **Event Bus** with local EventEmitter + optional Redis Pub/Sub for multi-instance (ElastiCache Serverless)
- **NotificationListener** that maps Activity events → resolves recipients → creates Notification records
- **SSE real-time delivery** to browser UI (NotificationProvider + EventSource)
- **MCP tools** for agents: `synapse_get_notifications`, `synapse_mark_notification_read`
- **Per-user/agent notification preferences** with 9 toggleable notification types
- **Frontend**: Bell icon with unread badge, popup with Unread/All tabs, deep linking to entities
- **10 notification types**: task_assigned, task_status_changed, task_verified, task_reopened, task_submitted_for_verify, proposal_submitted, proposal_approved, proposal_rejected, idea_claimed, comment_added

**Still missing**:
- Task dependency unblocked → push to assigned Agent (not yet a notification type)
- Session inactive/expired → push to Team Lead
- Comment @mention parsing → push to mentioned role (currently pushes to entity assignee only)
- Webhook delivery channel (for external integrations like Slack, email)
- True push to MCP-connected agents (agents must poll via `synapse_get_notifications`; no server-initiated push)

**AI-DLC alignment**: The core infrastructure is solid. The main gap is **expanding notification types** (especially task-unblocked and elaboration events) and adding a **webhook channel** for external delivery. Mob Elaboration is now feasible via the existing SSE + MCP notification polling pattern.

**Implementation scope**: Add new notification types to `notification-listener.ts`. Webhook delivery is a future enhancement.

#### 2. Task Auto-Scheduling (DAG Scheduler)

**Current state**: ⚠️ Partially addressed. `synapse_get_unblocked_tasks` MCP tool provides on-demand discovery of tasks whose dependencies are all resolved. The Synapse Plugin's SubagentStop hook automatically calls this tool when a sub-agent finishes, surfacing newly unblocked tasks to the Team Lead.

**What's implemented**:
- `getUnblockedTasks()` service method: queries tasks with status open/assigned where all dependencies are done/to_verify
- `synapse_get_unblocked_tasks` public MCP tool: available to all agents for on-demand scheduling queries
- Plugin SubagentStop hook integration: when a sub-agent exits, the hook fetches unblocked tasks and includes them in the Team Lead's context

**Still missing**:
- Automatic status transition (auto-assign unblocked tasks to available agents)
- Event-driven push: proactive notification when a task becomes unblocked (currently requires poll or SubagentStop trigger)
- Real-time WebSocket/SSE notification to UI dashboard

**Impact**: Team Lead no longer needs to manually cross-reference `list_tasks` with the dependency graph. The SubagentStop trigger provides just-in-time scheduling information. However, fully autonomous scheduling (no human in the loop) still requires event-driven push.

**Implementation scope**: Next step — add event listener on task status change to proactively notify agents. Depends on Notification system (Gap #1).

### P1 — Important for AI-DLC Alignment

#### 3. Structured Inception Process (Clarification Loops + Multi-Stage Gates)

**Current state**: ✅ Largely implemented. Synapse now has a full Requirements Elaboration system:

**What's implemented**:
- **Structured Q&A on Ideas**: PM Agents create multiple-choice questions categorized by type (functional, scope, technical, etc.). Stored in dedicated `ElaborationRound` + `ElaborationQuestion` tables.
- **Iterative clarification rounds**: PM validates answers, detects contradictions/ambiguities, and creates follow-up rounds. Up to 5 rounds per Idea.
- **Elaboration gate**: Proposals cannot be submitted until all input Ideas have `elaborationStatus = 'resolved'` (via Q&A or explicit skip with reason).
- **Simplified Idea lifecycle**: `open → elaborating → proposal_created → completed → closed`. Claim auto-transitions to `elaborating`. Proposal submit/approve auto-transitions Idea status.
- **Dual-channel answering**: CC terminal (AskUserQuestion) + Web UI (radio buttons on Idea detail page)
- **Adaptive depth**: minimal / standard / comprehensive, determined by PM Agent
- **Activity + Notification**: All elaboration events logged and pushed via SSE

**Still missing**:
- Multi-stage gates within Proposal creation (requirements → design → task breakdown as separate checkpoints)
- INVEST-compliant user story validation
- Automated contradiction detection (PM validates manually)

#### 4. Execution Metrics (Agent Hours)

**Current state**: `storyPoints` field exists but unused. `report_work` logs text, not duration. Sessions have `createdAt`/`lastActiveAt` but no aggregation.

**AI-DLC alignment**: Agent Hours (Practice 5) is a core measurement unit. Without metrics, teams cannot evaluate AI ROI, do capacity planning, or compare AI provider efficiency.

**Missing data**:
- Per-task execution wall time (in_progress → to_verify timestamp delta)
- Per-session active duration (cumulative heartbeat intervals)
- Project-level velocity (tasks/storyPoints completed per time unit)
- Agent-level efficiency comparison

**Implementation scope**: Add timestamps to task status transitions + aggregation queries + dashboard visualization.

#### 5. Proposal Granular Review

**Current state**: Binary approve/reject for entire Proposal.

**AI-DLC alignment**: Mob Elaboration (Practice 2) and Mob Construction (Practice 3) require iterative, fine-grained feedback — not all-or-nothing gates.

**Missing behavior**:
- Partial approval: "Approve tasks 1-3, revise task 4"
- Conditional approval: "Approved, but add this acceptance criterion"
- Per-draft review: Document drafts and task drafts reviewed separately
- Revision diff: Show what changed between revision rounds

**Impact**: Binary approval forces Admin to accept flawed plans or reject entirely. PM Agent cannot efficiently iterate on specific issues.

**Implementation scope**: Per-draft status + review comment threading on individual drafts.

#### 6. Session Auto-Expiry

**Current state**: Schema has `expiresAt` field. CLAUDE.md documents "30 min expiry / 1h inactive". No background job implements this.

**Missing behavior**:
- Periodic scan: active sessions with `lastActiveAt` > 1h → mark `inactive`
- Longer threshold → auto-close + checkout all active checkins
- Associated tasks still `in_progress` → flag for reassignment

**Impact**: Zombie sessions accumulate. Kanban shows false "active worker" badges. Humans make decisions based on stale observability data.

**Implementation scope**: Cron job or Next.js API route with scheduled invocation.

### P2 — Nice to Have

#### 7. Checkin Context Density

**Current state**: `synapse_checkin` returns persona + assignments + pending count. Plugin injects this at session start.

**AI-DLC alignment**: Context Continuity (Practice 4) calls for zero-cost context injection. The current checkin response requires agents to make multiple follow-up tool calls to build a full picture.

**Missing context** (would reduce Agent startup tool calls):
- Project status summary ("8 tasks: 5 done, 2 in_progress, 1 blocked")
- Recent key decisions ("Admin rejected Proposal X yesterday, reason: Y")
- Current blockers ("Task 3 blocked by Task 1, Task 1 assignee inactive 2h")
- Actionable suggestions ("You have 1 assigned task to start, 2 available to claim")

**Implementation scope**: Enrich `checkin` response with aggregated project state.

#### 8. Proposal State Machine Validation

**Current state**: Idea and Task have `isValidStatusTransition()`. Proposal does not.

**Impact**: API allows illegal state transitions (e.g., `approved` → `draft`).

**Implementation scope**: Add `PROPOSAL_STATUS_TRANSITIONS` constant + validation in service layer. Small change.

#### 9. Operations Phase

**Current state**: Entirely absent. Synapse covers Inception and Construction only.

**AI-DLC alignment**: The Operations phase (Phase 3) covers deployment automation, infrastructure setup, monitoring/observability, and production readiness validation. This is a full domain requiring integration with CI/CD pipelines, cloud providers, and observability toolchains.

**What would be needed**:
- Deployment pipeline integration (trigger deploys from Task completion)
- Environment management (staging, production)
- Health check / smoke test results fed back into Synapse
- Incident → Idea feedback loop (production issues auto-generate Ideas)

**Impact**: Without Operations, Synapse covers only the planning and building phases. The feedback loop from production back to Inception (a key AI-DLC principle) relies on manual Idea creation rather than automated signals.

**Implementation scope**: Large. Would likely require webhook/plugin integrations with external CI/CD and monitoring tools rather than building these capabilities natively.

#### 10. Cross-Session Learning and Memory

**Current state**: Each agent session starts with `synapse_checkin` context injection. No mechanism for aggregating lessons learned, recurring patterns, or decision history across sessions.

**AI-DLC alignment**: Context Continuity (Practice 4) envisions persistent context across all phases. However, even the official AI-DLC methodology is vague here — [critics note](https://medium.com/data-science-collective/the-ai-driven-development-lifecycle-ai-dlc-a-critical-yet-hopeful-view-edc966173f2f) that "the promise of context memory that AI-DLC models would reference across the lifecycle sounds powerful, but the implementation details remain opaque."

**What would be needed**:
- Decision log: key choices and their rationale, queryable by agents
- Pattern library: recurring solutions/approaches discovered during execution
- Agent performance history: which approaches worked, which were rejected and why

**Impact**: Low urgency — Synapse is at parity with the AI-DLC standard here, as neither has solved cross-session learning well. This is a frontier problem for the entire industry.

**Implementation scope**: Research-level. Could start with a structured decision log (lightweight) and evolve toward richer memory systems as the industry matures.

---

## Feature Inventory

| Feature | AI-DLC Standard | Synapse Status | Gap |
|---------|----------------|---------------|-----|
| **Values & Principles** | | | |
| Reversed Conversation | AI proposes, human verifies | ✅ Proposal approval flow | — |
| Human-AI Collaboration | Structured, repeatable collaboration | ✅ Role-based workflow (PM/Dev/Admin) | — |
| Collective Intelligence | Multi-stakeholder input | ✅ Elaboration Q&A + SSE notifications | — |
| **Inception Phase** | | | |
| Structured Clarification | Multi-choice questions, contradiction detection, iterative loops | ✅ ElaborationRound + ElaborationQuestion tables | — |
| Requirements Analysis | AI-led requirement gathering with adaptive depth | ✅ Elaboration gate + adaptive depth (minimal/standard/comprehensive) | — |
| User Stories + Personas | INVEST-compliant stories with persona definitions | ❌ No first-class entity | P2 |
| Application Design | Components, methods, services, dependency matrix | ✅ Proposal documentDrafts (tech_design) | — |
| Units of Work Decomposition | Parallelizable task breakdown with dependency matrix | ✅ Proposal taskDrafts with DAG | — |
| Workflow / Execution Plan | Structured execution plan with Mermaid diagram | ❌ No explicit execution plan artifact | P2 |
| Multi-Stage Approval Gates | Human gate at every inception stage | ⚠️ Elaboration gate + Proposal gate (2 gates) | P2 (more gates possible) |
| Adaptive Depth | Minimal/Standard/Comprehensive based on complexity | ✅ PM determines depth per Idea | — |
| Audit Trail | All raw user inputs logged with ISO 8601 timestamps | ✅ ElaborationQuestion stores all Q&A with timestamps | — |
| Risk Assessment | Complexity evaluation (Low→Critical) | ❌ No risk/complexity scoring | P2 |
| **Construction Phase** | | | |
| Task DAG | Dependency graph | ✅ Modeled + rendered | — |
| Task Auto-Scheduling | Event-driven dispatch | ⚠️ Query + plugin hook | Needs event push (P0) |
| Parallel Execution | Multi-agent concurrent | ✅ Swarm mode + Plugin | ⚠️ Auto-dispatch partial |
| Mob Elaboration | Real-time team verification of plans | ✅ Elaboration Q&A + SSE + dual-channel | — |
| Mob Construction | Real-time verification of outputs | ⚠️ to_verify flow + notifications exist | Needs expanded notification types |
| Agent Hours | Core measurement unit | ❌ Only storyPoints field (unused) | P1 |
| Bolt Cycles | Hour/day iterations | ❌ No iteration concept | P2 (see notes below) |
| Granular Review | Partial approval of proposals | ❌ Binary approve/reject | P1 |
| **Operations Phase** | | | |
| Deployment Automation | CI/CD integration | ❌ Not in scope | P2 |
| Monitoring & Observability | Production health tracking | ❌ Not in scope | P2 |
| Incident → Idea Loop | Automated feedback from ops | ⚠️ Manual Idea creation only | P2 |
| **Cross-Cutting Concerns** | | | |
| Context Continuity | Zero-cost context injection | ✅ Plugin + checkin | Could be denser (P2) |
| Session Observability | Track active workers | ✅ Sessions + checkins | Needs auto-expiry (P1) |
| Notifications | Push on state change | ✅ SSE + EventBus + Redis Pub/Sub | ⚠️ Missing some types (P1) |
| Metrics/Reporting | Velocity, Agent Hours | ❌ No aggregation | P1 |
| Cross-Session Memory | Persistent learning across sessions | ❌ No memory system | P2 (industry-wide gap) |
| Feedback Loop | Ops → new Ideas | ✅ AI can create Ideas | — |

---

## Completion Score

```
Phase / Area         Coverage    Score    Notes
─────────────────────────────────────────────────────────
Inception (outputs)  █████████░  9/10     Idea→Elaboration→Proposal→Task with DAG
Inception (process)  ████████░░  8/10     Structured Q&A, elaboration gate, adaptive depth,
                                          audit trail via ElaborationQuestion table
Construction Phase   ██████░░░░  6/10     Flow + notifications exist; lacks scheduling, metrics
Operations Phase     ░░░░░░░░░░  0/10     Not in current scope
Core Mechanisms      ████████░░  8/10     Reversed Conversation + Mob Elaboration + notifications
─────────────────────────────────────────────────────────
Overall (excl. Ops)              ~7.5/10
Overall (incl. Ops)              ~5.5/10
```

**Summary**: Synapse now covers AI-DLC Inception phase well — structured Q&A elaboration with iterative rounds, elaboration gate enforcing clarification before Proposal creation, adaptive depth, and a simplified Idea lifecycle (`open → elaborating → proposal_created → completed`). The remaining critical gap is **task auto-scheduling** (P0) for the Construction phase. Addressing this would raise the score to ~8.5 (excluding Operations).

---

## Notes on Bolt Cycles

Bolt Cycles (short iterations replacing Sprints) are an AI-DLC concept, but Synapse currently has no iteration/milestone grouping. However:

- Bolt Cycles are more of a **process practice** than a **platform feature**
- Teams can practice Bolt-style short iterations using Projects as iteration containers
- The critical enabler for Bolt Cycles is **speed** (fast scheduling + fast feedback) — which maps to P0 items (scheduler + notifications)
- An explicit Bolt/Milestone entity could be added later as a P2 enhancement if teams need formal iteration tracking

Implementing P0 (scheduler + notifications) effectively enables Bolt-style velocity without requiring a dedicated Bolt entity.

## Recommended Implementation Order

1. **Task auto-scheduling** (P0) — Most impactful remaining feature. Transforms Synapse from record-keeper to orchestrator. Add `task_unblocked` notification type; event-driven push when task dependencies resolve.
2. ~~**Structured inception process** (P1)~~ — ✅ **DONE**. Requirements Elaboration implemented with structured Q&A, elaboration gate, simplified Idea lifecycle, dual-channel answering.
3. ~~**Expand notification types** (P1)~~ — ✅ **DONE**. Elaboration notification types added (`elaboration_started`, `elaboration_answered`, `elaboration_followup`, `elaboration_resolved`). Remaining: `task_unblocked`, `session_expired`.
4. **Session auto-expiry** (P1) — Quick win. Cron job + status update. Add `session_expired` notification type.
5. **Proposal state validation** (P2) — Quick win. Mirror Idea/Task pattern. Small engineering effort.
6. **Execution metrics** (P1) — Add timestamps to status transitions, build aggregation later. Enables Agent Hours measurement.
7. **Proposal granular review** (P1) — Larger scope, design carefully. Multi-stage gates within Proposal creation.
8. **Checkin context density** (P2) — Incremental enrichment of checkin response. Improves Context Continuity.
9. **Webhook delivery channel** (P2) — Add webhook as an additional notification delivery channel alongside SSE. Enables Slack, email, and external tool integrations.
10. **Operations phase integration** (P2) — Long-term. Webhook-based integration with external CI/CD and monitoring tools.
11. **Cross-session memory** (P2) — Research-level. Start with structured decision log, evolve as industry matures.
