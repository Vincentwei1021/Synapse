# Synapse — AI Research Lifecycle Platform

> Fork of [Chorus](https://github.com/Chorus-AIDLC/Chorus) · Adapted for AI-driven research workflows
> Created: 2026-03-20

---

## 1. Vision

**Chorus is the collaboration platform for AI-driven software development. Synapse is the collaboration platform for AI-driven research.**

Existing research tools fall into two extremes:
- **Too shallow**: Paper search / summarization tools that don't touch the actual research process
- **Too autonomous**: End-to-end "AI scientist" systems that run as black boxes

Synapse occupies the critical middle ground: **human-in-the-loop research project management**, where AI agents execute experiments and humans make strategic decisions.

### Core Principle: Reversed Conversation for Research

```
AI proposes hypothesis → Human evaluates direction →
AI designs experiment → Human approves methodology →
AI executes experiment → Metrics auto-evaluate →
Human decides: pivot, iterate, or publish
```

---

## 2. Concept Mapping: Software Dev → Research

| Chorus (Software) | Synapse (Research) | Notes |
|---|---|---|
| Idea | **Research Question** | Free-form question + optional hypothesis statement |
| Elaboration | **Hypothesis Formulation** | Structured Q&A to refine question → testable hypothesis |
| Proposal (PRD/Tech Design) | **Experiment Design** | Methodology, baseline, metrics, acceptance criteria |
| Proposal (Task Breakdown) | **Experiment Plan** | Parallel experiment runs with dependencies |
| Task | **Experiment Run** | Data prep, training, evaluation — atomic unit of work |
| Task `in_progress` | **Running** | Agent executing experiment |
| Task `to_verify` | **Awaiting Evaluation** | Results ready for review |
| Acceptance Criteria | **Go/No-Go Criteria** | Quantitative: metric ≥ threshold, p-value < α |
| Task `done` | **Hypothesis Accepted** | Criteria met |
| Task `closed` | **Hypothesis Rejected / Pivoted** | Criteria not met, move on |
| Document (PRD) | **Literature Review / Research Brief** | Background, related work, motivation |
| Document (Tech Design) | **Methodology Specification** | Detailed experimental methodology |
| Document (ADR) | **Research Decision Record (RDR)** | Why we chose approach X over Y |
| storyPoints (Agent Hours) | **Compute Budget** | GPU hours, API costs, estimated wall time |
| Project | **Research Project** | Container for a line of inquiry |
| Project Group | **Research Program** | Multiple related research projects |

---

## 3. Research Lifecycle Phases

### Phase 1: Inception — "What to investigate?"

```
Research Question (open)
    │
    ▼  PM Agent claims
Hypothesis Formulation (elaborating)
    │  Structured Q&A:
    │  - What is the core claim?
    │  - What would disprove it? (null hypothesis)
    │  - What prior work exists?
    │  - What resources are needed?
    │  - What is the success metric?
    ▼
Experiment Design (proposal_created)
    │  Proposal contains:
    │  - Literature Review (document draft, type: literature_review)
    │  - Methodology Spec (document draft, type: methodology)
    │  - Experiment Plan (task drafts with DAG)
    │  - Go/No-Go Criteria (acceptance criteria on tasks)
    ▼
Human Review → Approve / Reject / Revise
```

**Key difference from Chorus**: The elaboration phase MUST produce a **falsifiable hypothesis** with **quantitative acceptance criteria**. This is enforced by the PM Agent's elaboration questions.

### Phase 2: Construction — "Run the experiments"

```
Experiment Plan (approved)
    │
    ├── Experiment Run A: "Baseline reproduction"
    │       status: open → assigned → in_progress → to_verify → done
    │
    ├── Experiment Run B: "Method X" (depends on A for baseline)
    │       status: open → [blocked by A] → in_progress → to_verify → done/closed
    │
    ├── Experiment Run C: "Method Y" (depends on A, parallel with B)
    │       status: open → [blocked by A] → in_progress → to_verify → done/closed
    │
    └── Experiment Run D: "Ablation study" (depends on B or C, whichever wins)
            status: open → [blocked by B,C] → ...
```

**Key mechanisms:**

#### Auto-Evaluation (new)
When an Experiment Run reaches `to_verify`, the system can auto-check Go/No-Go Criteria:
- Agent reports structured results (metrics JSON in `report_work`)
- Criteria defined as: `metric_name >= threshold` or `p_value < alpha`
- If all criteria pass → auto-suggest `done`
- If any required criterion fails → flag for human decision: pivot or iterate?

#### Parallel Exploration (existing DAG)
Multiple hypotheses can be tested in parallel using the existing Task DAG. The DAG naturally supports:
- Shared baseline dependency (Run A)
- Independent parallel branches (Run B, C)
- Convergent analysis (Run D depends on best result)

#### Early Stopping / "行不行拉倒" (new)
- Each Experiment Run has a **kill condition** (optional acceptance criterion marked as `early_stop`)
- If intermediate results clearly won't meet the threshold → agent can self-close
- This is the formalization of "行不行拉倒": define "行" upfront as a quantitative criterion

### Phase 3: Analysis — "What did we learn?"

```
All Experiment Runs complete
    │
    ▼
Results Synthesis
    │  PM Agent creates:
    │  - Comparison table (all runs vs baseline)
    │  - Research Decision Record (why we accept/reject)
    │  - Next steps recommendation
    ▼
Human Review
    │
    ├── Accept → Research Question marked "completed"
    │            Knowledge captured in documents
    │
    ├── Iterate → New Experiment Design proposal
    │             (refine hypothesis, try new approach)
    │
    └── Pivot → New Research Question created
               (feedback loop: completed → new Idea)
```

### Phase 4: Operations — "Reproduce and deploy" (future)

- Experiment reproducibility verification
- Model deployment pipeline
- Production monitoring → new Research Questions (feedback loop)

---

## 4. Data Model Changes

### 4.1 Modified Entities

#### Research Question (was: Idea)
New fields:
```prisma
model Idea {
  // ... existing fields ...

  // Research-specific
  hypothesisStatement  String?   // "We hypothesize that X will improve Y by Z%"
  nullHypothesis       String?   // "X has no significant effect on Y"
  priorWork            String?   // References to related research
  researchType         String?   // "exploratory" | "confirmatory" | "replication"
}
```

#### Experiment Run (was: Task)
New fields:
```prisma
model Task {
  // ... existing fields ...

  // Research-specific
  experimentConfig     Json?     // Hyperparameters, environment, seed
  experimentResults    Json?     // Structured metrics output
  baselineRunUuid      String?   // Reference to baseline experiment
  computeBudgetHours   Float?    // GPU/compute budget allocated
  computeUsedHours     Float?    // Actual compute consumed
  outcome              String?   // "accepted" | "rejected" | "inconclusive"
}
```

#### Experiment Design (was: Proposal)
New document types:
```typescript
// Extend DocumentType enum
type DocumentType =
  | 'prd'              // kept for compatibility
  | 'tech_design'      // kept for compatibility
  | 'adr'              // kept for compatibility
  | 'literature_review' // NEW: background & related work
  | 'methodology'       // NEW: experimental methodology
  | 'rdr'              // NEW: Research Decision Record
  | 'results_report'   // NEW: experiment results synthesis
```

#### Go/No-Go Criteria (extends: AcceptanceCriteria)
New fields:
```prisma
model AcceptanceCriterion {
  // ... existing fields ...

  // Research-specific
  metricName       String?   // e.g., "accuracy", "f1_score", "p_value"
  operator         String?   // ">=" | "<=" | "<" | ">" | "=="
  threshold        Float?    // e.g., 0.85, 0.05
  isEarlyStop      Boolean   @default(false)  // Kill condition
  actualValue      Float?    // Filled by agent after experiment
}
```

### 4.2 New Entities

#### ExperimentRegistry (new)
```prisma
model ExperimentRegistry {
  id              Int      @id @default(autoincrement())
  uuid            String   @unique @default(uuid())
  companyUuid     String
  projectUuid     String
  taskUuid        String   // Links to Experiment Run
  config          Json     // Full experiment configuration
  environment     Json     // Software versions, hardware specs
  seed            Int?     // Random seed for reproducibility
  startedAt       DateTime
  completedAt     DateTime?
  metrics         Json?    // Final metrics
  artifacts       Json?    // Model checkpoints, output files
  reproducible    Boolean  @default(false) // Verified reproducible?
  createdAt       DateTime @default(now())

  @@index([companyUuid])
  @@index([projectUuid])
  @@index([taskUuid])
}
```

#### Baseline (new)
```prisma
model Baseline {
  id              Int      @id @default(autoincrement())
  uuid            String   @unique @default(uuid())
  companyUuid     String
  projectUuid     String
  name            String   // e.g., "GPT-4 zero-shot baseline"
  metrics         Json     // { "accuracy": 0.72, "f1": 0.68, ... }
  experimentUuid  String?  // Source experiment run
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([companyUuid])
  @@index([projectUuid])
}
```

---

## 5. Agent Role Adaptations

| Chorus Role | Synapse Role | Responsibilities |
|---|---|---|
| PM Agent | **Research Lead** | Formulate hypotheses, design experiments, synthesize results, recommend next steps |
| Developer Agent | **Research Agent** | Execute experiments, collect data, run evaluations, report metrics |
| Admin Agent | **Principal Investigator (PI)** | Approve experiment designs, verify results, make strategic decisions |

### Research Lead Workflow
1. Claim Research Question
2. Conduct Hypothesis Formulation (elaboration with research-specific questions)
3. Create Experiment Design (proposal with methodology + experiment plan)
4. After experiments complete: synthesize results, create RDR, recommend next steps

### Research Agent Workflow
1. Claim Experiment Run
2. Set up environment (record in ExperimentRegistry)
3. Execute experiment (report progress with intermediate metrics)
4. Report final results (structured metrics JSON)
5. Self-check Go/No-Go criteria
6. Submit for evaluation

---

## 6. New MCP Tools

### Research-Specific Tools (Research Lead)

| Tool | Description |
|---|---|
| `synapse_create_baseline` | Register a baseline result for comparison |
| `synapse_list_baselines` | List baselines for a project |
| `synapse_compare_results` | Compare experiment run results against baseline |
| `synapse_create_rdr` | Create Research Decision Record |

### Research-Specific Tools (Research Agent)

| Tool | Description |
|---|---|
| `synapse_register_experiment` | Register experiment config + environment |
| `synapse_report_metrics` | Report structured metrics (extends report_work) |
| `synapse_check_criteria` | Auto-evaluate Go/No-Go criteria against reported metrics |
| `synapse_request_early_stop` | Request early termination with justification |

### Research-Specific Tools (PI / Admin)

| Tool | Description |
|---|---|
| `synapse_verify_reproducibility` | Mark experiment as reproducibility-verified |
| `synapse_set_active_baseline` | Set which baseline is current |

---

## 7. UI Adaptations

### Research Dashboard (replaces Project Overview)
- **Hypothesis Board**: Visual map of research questions → experiment branches → outcomes
- **Metrics Comparison Table**: Side-by-side comparison of all experiment runs vs baseline
- **Compute Budget Tracker**: GPU hours used vs allocated
- **Research Timeline**: Gantt-like view of experiment runs with dependencies

### Experiment Detail (extends Task Detail)
- **Configuration Panel**: Hyperparameters, environment, seed
- **Metrics History**: Charts showing training curves, intermediate results
- **Go/No-Go Status**: Visual indicator for each criterion (pass/fail/pending)
- **Reproducibility Badge**: Whether the experiment has been independently verified

---

## 8. Implementation Roadmap

### Phase 0: Foundation (Week 1-2)
- [ ] Rename all Chorus references → Synapse in codebase
- [ ] Add research-specific fields to Prisma schema
- [ ] Create database migrations
- [ ] Add new document types (literature_review, methodology, rdr, results_report)
- [ ] Update i18n strings

### Phase 1: Core Research Flow (Week 3-4)
- [ ] Implement ExperimentRegistry entity + CRUD
- [ ] Implement Baseline entity + CRUD
- [ ] Add Go/No-Go criteria fields to AcceptanceCriteria
- [ ] Implement auto-evaluation logic (metrics vs criteria)
- [ ] Add new MCP tools (synapse_* tools)
- [ ] Update Research Lead elaboration question templates

### Phase 2: Research UI (Week 5-6)
- [ ] Metrics Comparison Table component
- [ ] Experiment Configuration Panel
- [ ] Go/No-Go visual indicators
- [ ] Compute Budget Tracker
- [ ] Research Decision Record viewer

### Phase 3: Advanced Features (Week 7-8)
- [ ] Hypothesis Board visualization (DAG with experiment outcomes)
- [ ] Early stopping mechanism
- [ ] Experiment reproducibility verification flow
- [ ] Results export (for paper writing)

### Phase 4: Integration (Week 9+)
- [ ] Integration with compute platforms (SageMaker, EC2, Lambda)
- [ ] Automated paper section generation from RDRs
- [ ] Citation management
- [ ] Collaboration features (multi-PI review)

---

## 9. What We Keep from Chorus (No Changes)

- ✅ UUID-first architecture
- ✅ Multi-tenant isolation (companyUuid)
- ✅ MCP protocol + role-based tooling
- ✅ Task DAG + dependency management + cycle detection
- ✅ Elaboration Q&A system (with research-specific question templates)
- ✅ Proposal → Approval workflow
- ✅ Activity stream + Notification system (SSE + Redis)
- ✅ Session management + observability
- ✅ OIDC authentication + API key auth
- ✅ Next.js 15 + Prisma + PostgreSQL tech stack
- ✅ CDK deployment infrastructure

---

## 10. Key Design Decisions

### Why fork Chorus, not build from scratch?
1. **80% of the infrastructure is identical**: task management, DAG, proposals, MCP, auth, multi-tenant
2. **AIDLC methodology applies**: "AI proposes, human verifies" is even MORE natural for research
3. **Time to value**: Research-specific features can be built on top of a working platform in weeks, not months
4. **Upstream sync**: Can pull improvements from Chorus (bugfixes, UI polish, new MCP features)

### Why not just use Chorus as-is?
1. **Research is non-linear**: Software dev has a relatively linear flow; research has parallel exploration, pivots, and dead ends
2. **Verification is different**: Software verification is subjective ("does it meet requirements?"); research verification is objective ("does it beat baseline by X%?")
3. **Outputs are different**: Software produces code; research produces knowledge (hypotheses, evidence, decisions)
4. **Metrics are first-class**: In software, metrics are nice-to-have; in research, metrics ARE the result

### "行不行拉倒" formalized
The informal Chinese expression "行不行拉倒" (try it, if it doesn't work, move on) is formalized as:
- **Go/No-Go Criteria**: Quantitative thresholds defined upfront
- **Early Stop Conditions**: Intermediate checkpoints that can terminate bad experiments early
- **Automatic Outcome Classification**: `accepted` / `rejected` / `inconclusive` based on criteria
- **Pivot Mechanism**: Rejected experiments auto-generate "what next?" suggestions

This transforms gut-feel research decisions into **structured, auditable, reproducible decision-making**.
