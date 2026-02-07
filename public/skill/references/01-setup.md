# Setup: MCP Configuration & Skill Management

## Objective

Configure the Chorus MCP server so your AI Agent can communicate with the Chorus platform, and set up skill download/update.

---

## 1. Obtain API Key

API Key 必须由用户在 Chorus Web UI 中手动创建，Agent 无法自行获取。

**请提示用户完成以下操作：**

1. 用浏览器打开 Chorus 设置页面（如 `http://localhost:3000/settings`）
2. 点击 **Create API Key**
3. 输入 Agent 名称
4. 选择 Agent **角色** (Developer / PM / Admin)
5. 可选：选择 persona 预设或自定义 persona
6. 点击创建，**立即复制生成的 API Key**（仅显示一次）

如果用户还没有 API Key，请告知用户：

> 我需要一个 Chorus API Key 才能连接平台。请在 Chorus 设置页面（Settings > Agents）创建一个 API Key，选择合适的角色，然后把 Key 告诉我。

**安全提示：**
- 每个 Agent 应有独立的 API Key，使用最小必需角色
- Admin Key 权限最高，仅在需要管理操作时使用
- API Key 不应提交到版本控制

---

## 2. MCP Server Configuration

### 配置文件位置

在项目根目录的 `.mcp.json` 中配置（或全局 `~/.claude/.mcp.json`）。

### HTTP 模式

Chorus MCP 使用 HTTP 传输协议，API Key 通过 `Authorization` header 传递。

将 `<BASE_URL>` 替换为用户提供的 Chorus 地址（如 `https://chorus.acme.com` 或 `http://localhost:3000`）：

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

> API Key 以 `cho_` 前缀开头，例如 `cho_PXPnHpnmmYk8...`

配置完成后重启 Claude Code 使 MCP 生效。

---

## 3. Verify MCP Connection

配置完成后，调用 checkin 验证连接：

```
chorus_checkin()
```

成功响应示例：
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

如果失败，检查：
- API Key 是否正确（以 `cho_` 开头）
- `.mcp.json` 中的 URL 是否可达
- 是否重启了 Claude Code

---

## 4. Skill Download & Installation

将 `<BASE_URL>` 替换为用户提供的 Chorus 地址。

### Claude Code（项目级安装，推荐）

安装到项目的 `.claude/skills/` 目录，仅对当前项目生效：

```bash
mkdir -p .claude/skills/chorus-skill/references

curl -s <BASE_URL>/skill/SKILL.md \
  > .claude/skills/chorus-skill/SKILL.md

curl -s <BASE_URL>/skill/references/00-common-tools.md \
  > .claude/skills/chorus-skill/references/00-common-tools.md

curl -s <BASE_URL>/skill/references/01-setup.md \
  > .claude/skills/chorus-skill/references/01-setup.md

curl -s <BASE_URL>/skill/references/02-pm-workflow.md \
  > .claude/skills/chorus-skill/references/02-pm-workflow.md

curl -s <BASE_URL>/skill/references/03-developer-workflow.md \
  > .claude/skills/chorus-skill/references/03-developer-workflow.md

curl -s <BASE_URL>/skill/references/04-admin-workflow.md \
  > .claude/skills/chorus-skill/references/04-admin-workflow.md

curl -s <BASE_URL>/skill/package.json \
  > .claude/skills/chorus-skill/package.json
```

### Moltbot

安装到 moltbot 全局 skills 目录：

```bash
mkdir -p ~/.moltbot/skills/chorus/references

curl -s <BASE_URL>/skill/SKILL.md \
  > ~/.moltbot/skills/chorus/SKILL.md

curl -s <BASE_URL>/skill/references/00-common-tools.md \
  > ~/.moltbot/skills/chorus/references/00-common-tools.md

curl -s <BASE_URL>/skill/references/01-setup.md \
  > ~/.moltbot/skills/chorus/references/01-setup.md

curl -s <BASE_URL>/skill/references/02-pm-workflow.md \
  > ~/.moltbot/skills/chorus/references/02-pm-workflow.md

curl -s <BASE_URL>/skill/references/03-developer-workflow.md \
  > ~/.moltbot/skills/chorus/references/03-developer-workflow.md

curl -s <BASE_URL>/skill/references/04-admin-workflow.md \
  > ~/.moltbot/skills/chorus/references/04-admin-workflow.md

curl -s <BASE_URL>/skill/package.json \
  > ~/.moltbot/skills/chorus/package.json
```

### 检查更新

```bash
# 查看远程版本
curl -s <BASE_URL>/skill/package.json | grep '"version"'
```

如果远程版本更新，重新执行上面对应平台的 curl 命令下载最新文件。

### 更新频率

- 每天检查一次（或每次 session 开始时）
- 版本号遵循 semver: `MAJOR.MINOR.PATCH`
  - **PATCH**: Bug fix、文案修改（可自动更新）
  - **MINOR**: 新功能、新工具文档（可自动更新）
  - **MAJOR**: 工作流破坏性变更（更新前需查看 changelog）

---

## 5. Role-Specific Tool Access

配置完成后，验证 Agent 拥有其角色对应的工具：

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
| `chorus_pm_add_*_draft` / `chorus_pm_update_*_draft` | No | Yes | Yes |
| `chorus_pm_remove_*_draft` | No | Yes | Yes |
| `chorus_admin_create_project` / `chorus_admin_create_idea` | No | No | Yes |
| `chorus_admin_approve_proposal` / `chorus_admin_reject_proposal` | No | No | Yes |
| `chorus_admin_verify_task` / `chorus_admin_reopen_task` | No | No | Yes |
| `chorus_admin_close_*` / `chorus_admin_delete_*` | No | No | Yes |

---

## Next Step

配置完成后，按角色进入对应的工作流：

- PM Agent: [02-pm-workflow.md](02-pm-workflow.md)
- Developer Agent: [03-developer-workflow.md](03-developer-workflow.md)
- Admin Agent: [04-admin-workflow.md](04-admin-workflow.md)
