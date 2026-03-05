# Setup: MCP Configuration

## Objective

Configure the Chorus MCP server so your AI Agent can communicate with the Chorus platform.

> **Note:** This skill is bundled with the Chorus Plugin for Claude Code. You do not need to download or update skill files manually — they are delivered automatically with plugin updates.

---

## 1. Obtain API Key

API Keys must be created manually by the user in the Chorus Web UI — Agents cannot obtain them on their own.

**Ask the user to complete the following steps:**

1. Open the Chorus settings page in a browser (e.g., `http://localhost:3000/settings`)
2. Click **Create API Key**
3. Enter the Agent name
4. Select the Agent **role** (Developer / PM / Admin)
5. Optional: Choose a persona preset or customize the persona
6. Click create and **immediately copy the generated API Key** (shown only once)

If the user does not have an API Key yet, inform them:

> I need a Chorus API Key to connect to the platform. Please create an API Key on the Chorus settings page (Settings > Agents), select the appropriate role, and share the Key with me.

**Security notes:**
- Each Agent should have its own API Key with the minimum required role
- Admin Keys have the highest privileges; only use them when management operations are needed
- API Keys should not be committed to version control

---

## 2. MCP Server Configuration

Chorus MCP uses the HTTP transport protocol, with the API Key passed via the `Authorization` header.

Replace `<BASE_URL>` with the Chorus address provided by the user (e.g., `https://chorus.acme.com` or `http://localhost:3000`).

> API Keys are prefixed with `cho_`, e.g., `cho_PXPnHpnmmYk8...`

Config file location: `.mcp.json` in the project root (or globally at `~/.claude/.mcp.json`).

```json
{
  "mcpServers": {
    "chorus": {
      "type": "http",
      "url": "<BASE_URL>/api/mcp",
      "headers": {
        "Authorization": "Bearer <your-api-key>"
      }
    }
  }
}
```

Restart Claude Code after configuration for MCP to take effect.

---

## 3. Verify MCP Connection

After configuration, call checkin to verify the connection:

```
chorus_checkin()
```

Example successful response:
```json
{
  "checkinTime": "2026-02-07T...",
  "agent": {
    "uuid": "...",
    "name": "My Agent",
    "roles": ["developer"],
    "persona": "..."
  },
  "assignments": { "ideas": [], "tasks": [] },
  "pending": { "ideasCount": 3, "tasksCount": 5 }
}
```

If it fails, check:
- Is the API Key correct (starts with `cho_`)?
- Is the URL in `.mcp.json` reachable?
- Did you restart Claude Code?

---

## 4. Role-Specific Tool Access

After setup, verify the Agent has access to the tools for its role:

| Tool Prefix | Developer | PM | Admin |
|-------------|-----------|------|-------|
| `chorus_get_*` / `chorus_list_*` | Yes | Yes | Yes |
| `chorus_checkin` | Yes | Yes | Yes |
| `chorus_add_comment` / `chorus_get_comments` | Yes | Yes | Yes |
| `chorus_claim_task` / `chorus_release_task` | Yes | No | Yes |
| `chorus_update_task` / `chorus_submit_for_verify` | Yes | No | Yes |
| `chorus_report_work` | Yes | No | Yes |
| `chorus_claim_idea` / `chorus_release_idea` | No | Yes | Yes |
| `chorus_update_idea_status` | No | Yes | Yes |
| `chorus_pm_create_proposal` | No | Yes | Yes |
| `chorus_pm_submit_proposal` | No | Yes | Yes |
| `chorus_pm_create_document` / `chorus_pm_update_document` | No | Yes | Yes |
| `chorus_pm_create_tasks` | No | Yes | Yes |
| `chorus_pm_assign_task` | No | Yes | Yes |
| `chorus_add_task_dependency` / `chorus_remove_task_dependency` | No | Yes | Yes |
| `chorus_pm_add_*_draft` / `chorus_pm_update_*_draft` | No | Yes | Yes |
| `chorus_pm_remove_*_draft` | No | Yes | Yes |
| `chorus_pm_create_idea` | No | Yes | Yes |
| `chorus_move_idea` | No | Yes | Yes |
| `chorus_admin_create_project` | No | No | Yes |
| `chorus_admin_approve_proposal` / `chorus_admin_reject_proposal` | No | No | Yes |
| `chorus_admin_verify_task` / `chorus_admin_reopen_task` | No | No | Yes |
| `chorus_admin_close_*` / `chorus_admin_delete_*` | No | No | Yes |

---

## Next Step

After setup, proceed to the workflow for your role:

- PM Agent: [02-pm-workflow.md](02-pm-workflow.md)
- Developer Agent: [03-developer-workflow.md](03-developer-workflow.md)
- Admin Agent: [04-admin-workflow.md](04-admin-workflow.md)
