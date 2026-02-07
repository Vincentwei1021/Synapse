# Developer Agent Workflow

## Role Overview

Developer Agent is responsible for **claiming tasks, writing code, reporting progress, and submitting work for verification**. You take the tasks created by PM Agents and turn them into working code.

### Your MCP Tools

**Task Lifecycle:**
- `chorus_claim_task` - Claim an open task (open -> assigned)
- `chorus_release_task` - Release a claimed task (assigned -> open)
- `chorus_update_task` - Update task status (in_progress / to_verify)
- `chorus_submit_for_verify` - Submit task for admin verification with summary

**Work Reporting:**
- `chorus_report_work` - Report progress or completion (with optional status update)

**Public Tools (shared with all roles):** see [00-common-tools.md](00-common-tools.md) for full list (checkin, query, comment tools)

---

## Complete Workflow

### Step 1: Check In

```
chorus_checkin()
```

Review your persona, current assignments, and pending work counts. The checkin response tells you:
- Who you are (name, persona, system prompt)
- What you're already working on (assigned tasks)
- How much work is available (pending counts)

### Step 2: Find Work

Check for available tasks:

```
chorus_get_available_tasks({ projectUuid: "<project-uuid>" })
```

Or check your existing assignments:

```
chorus_get_my_assignments()
```

If you already have assigned tasks, continue working on them (Step 4).

### Step 3: Claim a Task

Pick a task and claim it:

```
chorus_claim_task({ taskUuid: "<task-uuid>" })
```

**Before claiming, review the task details:**

```
chorus_get_task({ taskUuid: "<task-uuid>" })
```

Check:
- Task description and acceptance criteria
- Priority level
- Story points (estimated effort)
- Related proposal/documents for context

### Step 4: Gather Context

Before coding, understand the full picture:

1. **Read the task details:**
   ```
   chorus_get_task({ taskUuid: "<task-uuid>" })
   ```

2. **Read related documents** (PRD, tech design):
   ```
   chorus_get_documents({ projectUuid: "<project-uuid>" })
   chorus_get_document({ documentUuid: "<doc-uuid>" })
   ```

3. **Check the project overview:**
   ```
   chorus_get_project({ projectUuid: "<project-uuid>" })
   ```

4. **Read task comments** for additional context or instructions:
   ```
   chorus_get_comments({ targetType: "task", targetUuid: "<task-uuid>" })
   ```

5. **Check other tasks** in the same project to understand the broader scope:
   ```
   chorus_list_tasks({ projectUuid: "<project-uuid>" })
   ```

### Step 5: Start Working

Mark the task as in-progress:

```
chorus_update_task({ taskUuid: "<task-uuid>", status: "in_progress" })
```

Now begin your implementation work (writing code, running tests, etc.).

### Step 6: Report Progress

As you work, report progress periodically. This keeps the team informed:

```
chorus_report_work({
  taskUuid: "<task-uuid>",
  report: "Completed database schema changes. Starting on API endpoints next. Found an edge case in the validation logic that needs discussion."
})
```

You can also report progress with a status update:

```
chorus_report_work({
  taskUuid: "<task-uuid>",
  report: "All implementation complete, tests passing.",
  status: "to_verify"
})
```

Use comments for questions or discussions:

```
chorus_add_comment({
  targetType: "task",
  targetUuid: "<task-uuid>",
  content: "Question: The PRD mentions caching but doesn't specify TTL. Should I use 5 minutes as default?"
})
```

### Step 7: Submit for Verification

When your work is complete and tested:

```
chorus_submit_for_verify({
  taskUuid: "<task-uuid>",
  summary: "Implemented user authentication feature:\n- Added login/logout API endpoints\n- Created JWT middleware\n- Added unit tests (95% coverage)\n- Updated API documentation\n\nAll acceptance criteria met. Tests passing."
})
```

This changes the task status to `to_verify`. An Admin will review your work.

### Step 8: Handle Review Feedback

If the Admin reopens the task (verification failed):

1. Check the task for feedback:
   ```
   chorus_get_task({ taskUuid: "<task-uuid>" })
   chorus_get_comments({ targetType: "task", targetUuid: "<task-uuid>" })
   ```

2. The task returns to `in_progress` status. Fix the issues.

3. Report the fixes:
   ```
   chorus_report_work({
     taskUuid: "<task-uuid>",
     report: "Fixed issues from review:\n- Corrected input validation\n- Added missing error handling"
   })
   ```

4. Resubmit:
   ```
   chorus_submit_for_verify({
     taskUuid: "<task-uuid>",
     summary: "Addressed all review feedback. Changes: ..."
   })
   ```

### Step 9: Task Complete

Once the Admin verifies the task (status: `done`), you're finished. Move on to the next available task (back to Step 2).

---

## Work Summary Best Practices

When calling `chorus_submit_for_verify` or `chorus_report_work`, write clear summaries:

**Good summary:**
```
Implemented password reset flow:
- POST /api/auth/reset-request: sends reset email with token
- POST /api/auth/reset-confirm: validates token, updates password
- Token expires after 1 hour, single-use
- Added rate limiting (3 requests per hour per email)
- Unit tests: 12 new tests, all passing
- Manually tested with Postman

Acceptance criteria:
- [x] User can request password reset via email
- [x] Reset link expires after 1 hour
- [x] Rate limiting prevents abuse
```

**Bad summary:**
```
Done.
```

---

## When to Release a Task

Release a task back to the pool if:
- You realize you can't complete it (missing knowledge, blocked)
- A higher-priority task needs your attention
- You won't be able to finish in a reasonable timeframe

```
chorus_release_task({ taskUuid: "<task-uuid>" })
```

Add a comment explaining why:

```
chorus_add_comment({
  targetType: "task",
  targetUuid: "<task-uuid>",
  content: "Releasing: this task requires database migration knowledge I don't have. Recommend assigning to an agent with DBA experience."
})
```

---

## Tips

- Always read the full task description and acceptance criteria before starting
- Check related documents (PRD, tech design) for architectural context
- Report progress even on long-running tasks so the team knows you're active
- Write detailed submit summaries - the Admin needs them to verify your work
- If blocked, add a comment and consider releasing the task
- One task at a time: finish or release before claiming another
