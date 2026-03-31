# Session and Agent Observability

## Overview

Synapse sessions track which agent is currently working on which task. Session data powers UI features: active worker indicators, activity attribution, and the Settings page session list.

Sessions are primarily useful in multi-agent setups where sub-agents work in parallel.

---

## Session Lifecycle

```
active --(no heartbeat 1h)--> inactive --(heartbeat)--> active
  \                              \
   \-- (close) -->                \-- (close) --> closed --(reopen)--> active
```

| Status | Meaning |
|--------|---------|
| `active` | Agent is working (green indicator) |
| `inactive` | No heartbeat for over 1 hour (yellow indicator) |
| `closed` | Session ended (gray indicator) |

---

## Session Tools

| Tool | Purpose |
|------|---------|
| `synapse_create_session` | Create a named session |
| `synapse_list_sessions` | List sessions for current agent |
| `synapse_get_session` | Get session details |
| `synapse_close_session` | Close a session |
| `synapse_session_heartbeat` | Send heartbeat to keep session active |

---

## Single Agent vs Multi-Agent

**Single agent (no sub-agents):** Sessions are optional. You can call Synapse tools directly without creating a session.

**Multi-agent / sub-agents:** Each sub-agent should create its own session for observability. The Synapse Plugin automates this:

| Event | Plugin Hook | What Happens |
|-------|------------|--------------|
| Sub-agent spawned | `SubagentStart` | Creates or reuses a session, injects session UUID into context |
| Sub-agent idle | `TeammateIdle` | Sends `synapse_session_heartbeat` |
| Sub-agent exits | `SubagentStop` | Closes the session |

---

## MCP Connection Sessions

The MCP transport also has its own connection-level session:
- Expires after 30 minutes of inactivity (sliding window)
- Each MCP request automatically renews the session
- Server restart clears all connection sessions (plugin auto-reconnects)

This is separate from Synapse agent sessions described above.

---

## Tips

- **Use descriptive session names** -- e.g., `training-worker`, `eval-worker` rather than generic names
- **Session reuse is automatic** -- if a sub-agent with the same name is respawned, the plugin reuses the existing session
- **Heartbeats are automatic** -- the plugin sends heartbeats via the `TeammateIdle` hook; no manual heartbeats needed in normal operation
