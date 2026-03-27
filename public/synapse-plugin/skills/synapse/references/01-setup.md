# Setup: MCP Configuration

## Objective

Configure the Synapse MCP server so your AI Agent can communicate with the Synapse platform.

> **Note:** This skill is bundled with the Synapse Plugin for Claude Code. You do not need to download or update skill files manually — they are delivered automatically with plugin updates.

---

## 1. Obtain API Key

API Keys must be created manually by the user in the Synapse Web UI — Agents cannot obtain them on their own.

**Ask the user to complete the following steps:**

1. Open the Synapse settings page in a browser (e.g., `http://localhost:3000/settings`)
2. Click **Create API Key**
3. Enter the Agent name
4. Select the Agent **role** (Researcher / Research Lead / PI)
5. Optional: Choose a persona preset or customize the persona
6. Click create and **immediately copy the generated API Key** (shown only once)

If the user does not have an API Key yet, inform them:

> I need a Synapse API Key to connect to the platform. Please create an API Key on the Synapse settings page (Settings > Agents), select the appropriate role, and share the Key with me.

**Security notes:**
- Each Agent should have its own API Key with the minimum required role
- PI Keys have the highest privileges; only use them when management operations are needed
- API Keys should not be committed to version control

---

## 2. MCP Server Configuration

Synapse MCP uses the HTTP transport protocol, with the API Key passed via the `Authorization` header.

Replace `<BASE_URL>` with the Synapse address provided by the user (e.g., `https://synapse.acme.com` or `http://localhost:3000`).

> API Keys are prefixed with `syn_`, e.g., `syn_PXPnHpnmmYk8...`

Config file location: `.mcp.json` in the project root (or globally at `~/.claude/.mcp.json`).

```json
{
  "mcpServers": {
    "synapse": {
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
synapse_checkin()
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
  "assignments": { "researchQuestions": [], "experimentRuns": [] },
  "pending": { "researchQuestionsCount": 3, "experimentRunsCount": 5 }
}
```

If it fails, check:
- Is the API Key correct (starts with `syn_`)?
- Is the URL in `.mcp.json` reachable?
- Did you restart Claude Code?

---

## 4. Role-Specific Tool Access

After setup, verify the Agent has access to the tools for its role:

| Tool Prefix | Researcher | Research Lead | PI |
|-------------|-----------|------|-------|
| `synapse_get_*` / `synapse_list_*` | Yes | Yes | Yes |
| `synapse_checkin` | Yes | Yes | Yes |
| `synapse_add_comment` / `synapse_get_comments` | Yes | Yes | Yes |
| `synapse_claim_experiment_run` / `synapse_release_experiment_run` | Yes | No | Yes |
| `synapse_update_experiment_run` / `synapse_submit_for_verify` | Yes | No | Yes |
| `synapse_report_work` | Yes | No | Yes |
| `synapse_claim_research_question` / `synapse_release_research_question` | No | Yes | Yes |
| `synapse_update_research_question_status` | No | Yes | Yes |
| `synapse_research_lead_create_experiment_design` | No | Yes | Yes |
| `synapse_research_lead_submit_experiment_design` | No | Yes | Yes |
| `synapse_research_lead_create_document` / `synapse_research_lead_update_document` | No | Yes | Yes |
| `synapse_research_lead_create_experiment_runs` | No | Yes | Yes |
| `synapse_research_lead_assign_experiment_run` | No | Yes | Yes |
| `synapse_research_lead_add_run_dependency` / `synapse_research_lead_remove_run_dependency` | No | Yes | Yes |
| `synapse_research_lead_add_*_draft` / `synapse_research_lead_update_*_draft` | No | Yes | Yes |
| `synapse_research_lead_remove_*_draft` | No | Yes | Yes |
| `synapse_research_lead_create_research_question` | No | Yes | Yes |
| `synapse_move_research_question` | No | Yes | Yes |
| `synapse_pi_create_research_project` | No | No | Yes |
| `synapse_pi_approve_experiment_design` / `synapse_pi_reject_experiment_design` | No | No | Yes |
| `synapse_pi_verify_experiment_run` / `synapse_pi_reopen_experiment_run` | No | No | Yes |
| `synapse_pi_close_*` / `synapse_pi_delete_*` | No | No | Yes |

---

## Next Step

After setup, proceed to the workflow for your role:

- Research Lead Agent: [02-pm-workflow.md](02-pm-workflow.md)
- Researcher Agent: [03-developer-workflow.md](03-developer-workflow.md)
- PI Agent: [04-admin-workflow.md](04-admin-workflow.md)
