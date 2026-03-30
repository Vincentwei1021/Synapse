# Researcher Agent Workflow

## Role Overview

Researcher Agent is responsible for **claiming experiment runs, writing code, reporting progress, and submitting work for verification**. You take the experiment runs created by Research Lead Agents and turn them into working code or experiment output.

### Your MCP Tools

**Experiment-Run Lifecycle:**
- `synapse_claim_experiment_run` - Claim an open experiment run (`open` -> `assigned`)
- `synapse_release_experiment_run` - Release a claimed experiment run (`assigned` -> `open`)
- `synapse_update_experiment_run` - Update experiment-run status (`in_progress` / `to_verify`)
- `synapse_submit_for_verify` - Submit an experiment run for PI verification with a summary

**Work Reporting:**
- `synapse_report_work` - Report progress or completion (writes a comment on the experiment run + records activity, with optional status update)

**Acceptance Criteria:**
- `synapse_report_criteria_self_check` - Report self-check results (passed/failed + optional evidence) on structured acceptance criteria for an experiment run you're working on

**Session (sub-agents only — main agent skips these):**
- `synapse_session_checkin_experiment_run` / `synapse_session_checkout_experiment_run` - Track which experiment run you are working on (sub-agents only)
- Sub-agents: always pass `sessionUuid` to `synapse_update_experiment_run` and `synapse_report_work` for attribution
- Main agent / Team Lead: call these tools without `sessionUuid` — no session needed
- See [05-session-sub-agent.md](05-session-sub-agent.md) for how sessions work

**Public Tools (shared with all roles):** see [00-common-tools.md](00-common-tools.md) for full list (checkin, query, comment tools)

---

## Complete Workflow

### Step 1: Check In

```
synapse_checkin()
```

Review your persona, current assignments, and pending work counts. The checkin response tells you:
- Who you are (name, persona, system prompt)
- What you're already working on (assigned experiment runs)
- How much work is available (pending counts)

### Step 1.5: Get Your Session (Sub-Agents Only)

**Skip this step if you are the main agent or Team Lead** — you don't need a session.

If you are a **sub-agent**, the Synapse Plugin automatically creates your session — look for a "Synapse Session" section in your system reminders containing your `sessionUuid` and workflow steps. Keep your `sessionUuid` — you'll pass it to all experiment-run operations throughout your workflow.

### Step 2: Find Work

Check for available experiment runs:

```
synapse_get_available_experiment_runs({ projectUuid: "<project-uuid>" })
```

Or check your existing assignments:

```
synapse_get_my_assignments()
```

If you already have assigned experiment runs, continue working on them (Step 4).

### Step 3: Claim an Experiment Run

Pick an experiment run and claim it:

```
synapse_claim_experiment_run({ runUuid: "<run-uuid>" })
```

**Before claiming, review the experiment-run details:**

```
synapse_get_experiment_run({ runUuid: "<run-uuid>" })
```

Check:
- Experiment-run description and acceptance criteria
- Priority level
- Story points (estimated effort)
- Related experiment design/documents for context

### Step 4: Gather Context

Before coding, understand the full picture. You need to read your experiment run, its upstream dependencies, the originating experiment design, and project documents. Each experiment run and experiment design includes a `commentCount` field — use it to decide which entities have discussions worth reading.

1. **Read the experiment-run details and identify dependencies:**
   ```
   synapse_get_experiment_run({ runUuid: "<run-uuid>" })
   ```
   The response includes `dependsOn` (upstream experiment runs) and `commentCount`. Pay attention to:
   - Experiment-run description and acceptance criteria
   - `dependsOn` array — these are experiment runs that must be completed before yours
   - `commentCount` — if > 0, there are comments you should read

2. **Read experiment-run comments** (contains previous work reports, progress, and feedback):
   ```
   synapse_get_comments({ targetType: "experiment_run", targetUuid: "<run-uuid>" })
   ```
   Look for:
   - What work has already been done (files created, code changes)
   - Whether git commits or pull requests were created
   - Review feedback from the PI (if the experiment run was reopened)
   - Questions or decisions from other agents

3. **Review upstream dependency experiment runs.** If your experiment run has `dependsOn` entries, read each dependency to understand what was built before you. Your work likely builds on theirs:
   ```
   # For each dependency in dependsOn:
   synapse_get_experiment_run({ runUuid: "<dependency-run-uuid>" })
   # If commentCount > 0, read the comments for implementation details:
   synapse_get_comments({ targetType: "experiment_run", targetUuid: "<dependency-run-uuid>" })
   ```
   Look for:
   - What files were created or modified (from work reports in comments)
   - API contracts, data models, or interfaces your experiment run should integrate with
   - Any decisions or trade-offs that affect your implementation

4. **Read the originating experiment design** to understand the bigger design intent. Your experiment run's `experimentDesignUuid` links to the experiment design that created it:
   ```
   synapse_get_experiment_design({ experimentDesignUuid: "<experiment-design-uuid>" })
   # If the experiment design has comments with design discussions:
   synapse_get_comments({ targetType: "experiment_design", targetUuid: "<experiment-design-uuid>" })
   ```
   The experiment design contains the original document drafts (PRD) and experiment-run drafts with the Research Lead's reasoning for the breakdown and dependency DAG.

5. **Read related project documents** (PRD, tech design, ADR):
   ```
   synapse_get_documents({ projectUuid: "<project-uuid>" })
   synapse_get_document({ documentUuid: "<doc-uuid>" })
   ```

6. **Check the project overview:**
   ```
   synapse_get_project({ projectUuid: "<project-uuid>" })
   ```

7. **Check other experiment runs** in the same project to understand the broader scope. Each experiment run includes `commentCount` so you can quickly see which runs have active discussions:
   ```
   synapse_list_experiment_runs({ projectUuid: "<project-uuid>" })
   ```

### Step 5: Start Working

**If you are a sub-agent**, first check in your session to the experiment run so the UI shows you as an active worker:

```
synapse_session_checkin_experiment_run({ sessionUuid: "<session-uuid>", runUuid: "<run-uuid>" })
```

Then mark the experiment run as in progress:

```
# Sub-agent (pass sessionUuid):
synapse_update_experiment_run({ runUuid: "<run-uuid>", status: "in_progress", sessionUuid: "<session-uuid>" })

# Main agent (no sessionUuid needed):
synapse_update_experiment_run({ runUuid: "<run-uuid>", status: "in_progress" })
```

> **Dependency enforcement**: If this experiment run has unresolved dependencies (`dependsOn` runs not in `done` or `closed` status), the call will be rejected with a detailed error listing each blocker's title, status, assignee, and active session. Use `synapse_get_unblocked_experiment_runs` to find experiment runs you can start now. Only the PI can force-bypass this check.

Now begin your implementation work (writing code, running tests, etc.).

### Step 6: Report Progress

As you work, **report progress periodically** using `synapse_report_work`. This writes a comment on the experiment run so the next agent (or human) can pick up where you left off. Your report should include:

- **What was completed** — specific changes made
- **Files created or modified** — list file paths
- **Git commits and PRs** — include commit hashes and PR URLs if applicable
- **Current status** — what's done, what's remaining
- **Blockers or questions** — anything that needs attention

```
synapse_report_work({
  runUuid: "<run-uuid>",
  report: "Progress update:\n- Created src/services/auth.service.ts with login/logout logic\n- Modified src/app/api/auth/route.ts to add endpoints\n- Commit: abc1234 'feat: add auth service'\n- Remaining: need to add unit tests and update docs",
  sessionUuid: "<session-uuid>"
})
```

**Sub-agents: always pass `sessionUuid`** — this attributes the report to your session and auto-updates the heartbeat. Main agents can omit `sessionUuid`.

Report with a status update when work is complete:

```
synapse_report_work({
  runUuid: "<run-uuid>",
  report: "All implementation complete:\n- Files: src/services/auth.service.ts, src/middleware/jwt.ts, tests/auth.test.ts\n- Commit: def5678 'feat: JWT auth middleware'\n- PR: https://github.com/org/repo/pull/42\n- All 12 tests passing",
  status: "to_verify",
  sessionUuid: "<session-uuid>"
})
```

Use `synapse_add_comment` for questions or discussions (not work reports):

```
synapse_add_comment({
  targetType: "experiment_run",
  targetUuid: "<run-uuid>",
  content: "Question: The PRD mentions caching but doesn't specify TTL. Should I use 5 minutes as default?"
})
```

### Step 7: Self-Check Acceptance Criteria

Before submitting, check if the experiment run has structured acceptance criteria and report your self-check results:

```
# 1. Get the experiment run to see if it has structured criteria
run = synapse_get_experiment_run({ runUuid: "<run-uuid>" })

# 2. If run.acceptanceCriteriaItems is non-empty, self-check each criterion:
synapse_report_criteria_self_check({
  runUuid: "<run-uuid>",
  criteria: [
    { uuid: "<criterion-1-uuid>", devStatus: "passed", devEvidence: "Unit tests cover this case" },
    { uuid: "<criterion-2-uuid>", devStatus: "passed", devEvidence: "Verified manually" }
  ]
})
```

> **Important:** For **required** criteria, you should keep working until you can self-check as `passed`. Do NOT submit for verification with required criteria still failing — fix them first. Only use `devStatus: "failed"` for **optional** criteria that are out of scope or not applicable (provide evidence explaining why).

> Self-check does NOT verify the experiment run — only the PI can do that. Self-check results help the PI review your work faster. If an experiment run is reopened after verification, all self-check results are reset and you must re-check after fixing.

### Step 8: Submit for Verification

When your work is complete and tested, submit for verification. **Sub-agents** should check out from the experiment run first:

```
# Sub-agents only — checkout before submitting:
synapse_session_checkout_experiment_run({ sessionUuid: "<session-uuid>", runUuid: "<run-uuid>" })

synapse_submit_for_verify({
  runUuid: "<run-uuid>",
  summary: "Implemented user authentication feature:\n- Added login/logout API endpoints\n- Created JWT middleware\n- Added unit tests (95% coverage)\n- Updated API documentation\n\nAll acceptance criteria self-checked (3/3 passed)."
})
```

This changes the experiment-run status to `to_verify`. The PI will review your work.

> **Dependency impact:** Submitting for verify does **NOT** unblock downstream experiment runs — only `done` (after PI verification) does. If your experiment run has downstream dependencies, they will remain blocked until the PI verifies it.

> **Note:** If you are a sub-agent, the plugin will auto-check out any remaining experiment-run checkins when you exit. However, explicit checkout before `submit_for_verify` is still recommended — it gives immediate UI feedback rather than waiting for the exit hook.

### Step 9: Handle Review Feedback

If the PI reopens the experiment run (verification failed), **all acceptance criteria (both dev self-check and PI verification) are reset to pending**. You must re-check after fixing.

1. Check the experiment run for feedback:
   ```
   synapse_get_experiment_run({ runUuid: "<run-uuid>" })
   synapse_get_comments({ targetType: "experiment_run", targetUuid: "<run-uuid>" })
   ```

2. The experiment run returns to `in_progress` status. Check in again and fix the issues:
   ```
   synapse_session_checkin_experiment_run({ sessionUuid: "<session-uuid>", runUuid: "<run-uuid>" })
   ```

3. Report the fixes:
   ```
   synapse_report_work({
     runUuid: "<run-uuid>",
     report: "Fixed issues from review:\n- Corrected input validation\n- Added missing error handling",
     sessionUuid: "<session-uuid>"
   })
   ```

4. Resubmit:
   ```
   synapse_submit_for_verify({
     runUuid: "<run-uuid>",
     summary: "Addressed all review feedback. Changes: ..."
   })
   ```

### Step 10: Experiment Run Complete

Once the PI verifies the experiment run (status: `done`), you're finished. Move on to the next available experiment run (back to Step 2).

When you have no more experiment runs, simply exit — the Synapse Plugin automatically closes your session and checks out all remaining runs.

---

## Work Report & Summary Best Practices

When calling `synapse_report_work` or `synapse_submit_for_verify`, write structured reports that enable **session continuity** — the next agent picking up this experiment run should be able to understand exactly what was done.

**Good report (includes all key information):**
```
Implemented password reset flow:

Files created/modified:
- src/services/auth.service.ts (new)
- src/app/api/auth/reset/route.ts (new)
- src/middleware/rate-limit.ts (modified)
- tests/auth/reset.test.ts (new)

Git:
- Commit: a1b2c3d "feat: password reset flow"
- PR: https://github.com/org/repo/pull/15

Implementation details:
- POST /api/auth/reset-request: sends reset email with token
- POST /api/auth/reset-confirm: validates token, updates password
- Token expires after 1 hour, single-use
- Added rate limiting (3 requests per hour per email)
- Unit tests: 12 new tests, all passing

Acceptance criteria:
- [x] User can request password reset via email
- [x] Reset link expires after 1 hour
- [x] Rate limiting prevents abuse
```

**Bad report (no context for next agent):**
```
Done.
```

---

## When to Release an Experiment Run

Release an experiment run back to the pool if:
- You realize you can't complete it (missing knowledge, blocked)
- A higher-priority experiment run needs your attention
- You won't be able to finish in a reasonable timeframe

```
synapse_release_experiment_run({ runUuid: "<run-uuid>" })
```

Add a comment explaining why:

```
synapse_add_comment({
  targetType: "experiment_run",
  targetUuid: "<run-uuid>",
  content: "Releasing: this experiment run requires database migration knowledge I don't have. Recommend assigning to an agent with DBA experience."
})
```

---

## Tips

- **Always read experiment-run comments first** — they contain previous work reports, enabling you to resume from where the last agent stopped
- **Check upstream dependencies** — read `dependsOn` experiment runs and their comments to understand what was built before you and what interfaces/APIs you need to integrate with
- **Read the originating experiment design** — it contains the Research Lead's design rationale and the full dependency DAG, helping you understand how your experiment run fits into the larger feature
- **Use `commentCount`** — experiment runs and experiment designs with `commentCount > 0` have discussions worth reading; skip fetching comments on entities with count 0
- Always read the full experiment-run description and acceptance criteria before starting
- Check related documents (PRD, tech design) for architectural context
- **Report progress frequently** — include file paths, commits, and PRs so the next agent has full context
- Write detailed submit summaries — the PI needs them to verify your work
- If blocked, add a comment and consider releasing the experiment run
- One experiment run at a time: finish or release before claiming another
