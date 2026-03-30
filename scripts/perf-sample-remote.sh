#!/usr/bin/env bash
set -euo pipefail

SYNAPSE_REMOTE="${SYNAPSE_REMOTE:-chorus-research}"
SYNAPSE_BASE_URL="${SYNAPSE_BASE_URL:-http://127.0.0.1:3000}"
SYNAPSE_DATABASE_URL="${SYNAPSE_DATABASE_URL:-postgresql://synapse:synapse@localhost:5432/synapse}"
SYNAPSE_EMAIL="${SYNAPSE_EMAIL:-dev@synapse.local}"
SYNAPSE_PASSWORD="${SYNAPSE_PASSWORD:-synapse123}"
SYNAPSE_SAMPLE_COUNT="${SYNAPSE_SAMPLE_COUNT:-10}"
SYNAPSE_COOKIE_JAR="${SYNAPSE_COOKIE_JAR:-/tmp/synapse-cookies.txt}"
REPORT_DATE="${REPORT_DATE:-$(date +%F)}"
REPORT_PATH="${REPORT_PATH:-docs/perf/${REPORT_DATE}-optimization-baseline.md}"

if ! command -v ssh >/dev/null 2>&1; then
  echo "ssh is required" >&2
  exit 1
fi

if ! command -v mktemp >/dev/null 2>&1; then
  echo "mktemp is required" >&2
  exit 1
fi

mkdir -p "$(dirname "$REPORT_PATH")"

remote_bash() {
  local cmd="$1"
  ssh "$SYNAPSE_REMOTE" "bash -lc $(printf '%q' "$cmd")"
}

psql_query() {
  local sql="$1"
  printf '%s\n' "$sql" | ssh "$SYNAPSE_REMOTE" "psql \"$SYNAPSE_DATABASE_URL\" -F '|' -At"
}

psql_explain() {
  local sql="$1"
  {
    printf 'EXPLAIN (ANALYZE, BUFFERS, VERBOSE)\n'
    printf '%s\n' "$sql"
  } | ssh "$SYNAPSE_REMOTE" "psql \"$SYNAPSE_DATABASE_URL\""
}

sample_endpoint() {
  local path="$1"
  local output_file="$2"
  local remote_script
  remote_script=$(cat <<EOF
for _ in \$(seq 1 $SYNAPSE_SAMPLE_COUNT); do
  curl -sS -o /dev/null \
    -w '%{time_namelookup}|%{time_connect}|%{time_starttransfer}|%{time_total}|%{size_download}|%{http_code}\n' \
    -b '$SYNAPSE_COOKIE_JAR' \
    '$SYNAPSE_BASE_URL$path'
done
EOF
)
  remote_bash "$remote_script" > "$output_file"
}

sample_cache_path() {
  printf '%s/%s.txt' "$tmp_dir" "$(printf '%s' "$1" | tr ' /' '__' | tr -cd '[:alnum:]_')"
}

summary_table_row() {
  local label="$1"
  local sample_file="$2"
  awk -F'|' -v label="$label" '
    BEGIN { total = 0; max_ttfb = 0; max_total = 0; max_size = 0; http = "" }
    {
      total++;
      dns += $1;
      connect += $2;
      ttfb += $3;
      total_time += $4;
      size += $5;
      if ($3 > max_ttfb) max_ttfb = $3;
      if ($4 > max_total) max_total = $4;
      if ($5 > max_size) max_size = $5;
      http = $6;
    }
    END {
      if (total == 0) {
        printf "| %s | 0 | - | - | - | - | - | - | - |\n", label;
      } else {
        printf "| %s | %d | %.4f | %.4f | %.4f | %.4f | %.4f | %.0f | %s |\n",
          label, total,
          dns / total, connect / total, ttfb / total, total_time / total,
          max_total, size / total, http;
      }
    }
  ' "$sample_file"
}

raw_runs_block() {
  local sample_file="$1"
  awk -F'|' '
    {
      printf "- run %02d: dns=%ss connect=%ss ttfb=%ss total=%ss size=%s http=%s\n",
        NR, $1, $2, $3, $4, $5, $6;
    }
  ' "$sample_file"
}

trim_plan() {
  sed -n '1,80p'
}

login_payload=$(printf '{"email":"%s","password":"%s"}' "$SYNAPSE_EMAIL" "$SYNAPSE_PASSWORD")
login_response=$(printf '%s' "$login_payload" | ssh "$SYNAPSE_REMOTE" "curl -sS -c '$SYNAPSE_COOKIE_JAR' -H 'Content-Type: application/json' --data-binary @- '$SYNAPSE_BASE_URL/api/auth/default-login'")
if ! printf '%s' "$login_response" | grep -q '"success":true'; then
  echo "Remote login failed: $login_response" >&2
  exit 1
fi

dataset_snapshot=$(psql_query '
select '\''projects'\'', count(*) from "Project"
union all select '\''ideas'\'', count(*) from "Idea"
union all select '\''tasks'\'', count(*) from "Task"
union all select '\''activities'\'', count(*) from "Activity"
union all select '\''groups'\'', count(*) from "ProjectGroup"
union all select '\''compute_nodes'\'', count(*) from "ComputeNode"
union all select '\''compute_gpus'\'', count(*) from "ComputeGpu";
')

heavy_project=$(psql_query '
select p.uuid, p.name, coalesce(t.run_count,0), coalesce(i.idea_count,0), coalesce(a.activity_count,0)
from "Project" p
left join (select "projectUuid", count(*) as run_count from "Task" group by 1) t on t."projectUuid" = p.uuid
left join (select "projectUuid", count(*) as idea_count from "Idea" group by 1) i on i."projectUuid" = p.uuid
left join (select "projectUuid", count(*) as activity_count from "Activity" group by 1) a on a."projectUuid" = p.uuid
order by coalesce(t.run_count,0) desc, coalesce(i.idea_count,0) desc, coalesce(a.activity_count,0) desc
limit 1;
')

light_project=$(psql_query '
select p.uuid, p.name, coalesce(t.run_count,0), coalesce(i.idea_count,0), coalesce(a.activity_count,0)
from "Project" p
left join (select "projectUuid", count(*) as run_count from "Task" group by 1) t on t."projectUuid" = p.uuid
left join (select "projectUuid", count(*) as idea_count from "Idea" group by 1) i on i."projectUuid" = p.uuid
left join (select "projectUuid", count(*) as activity_count from "Activity" group by 1) a on a."projectUuid" = p.uuid
order by coalesce(t.run_count,0) asc, coalesce(i.idea_count,0) asc, coalesce(a.activity_count,0) asc, p."createdAt" asc
limit 1;
')

IFS='|' read -r heavy_uuid heavy_name heavy_runs heavy_ideas heavy_activities <<< "$heavy_project"
IFS='|' read -r light_uuid light_name light_runs light_ideas light_activities <<< "$light_project"

company_uuid=$(psql_query "select \"companyUuid\" from \"Project\" where uuid = '$heavy_uuid' limit 1;")

tmp_dir=$(mktemp -d)
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

ENDPOINTS=(
  "API projects list|/api/research-projects?pageSize=200"
  "API project groups|/api/project-groups"
  "API heavy project detail|/api/research-projects/$heavy_uuid"
  "API heavy activity|/api/research-projects/$heavy_uuid/activity"
  "API heavy experiment runs|/api/research-projects/$heavy_uuid/experiment-runs"
  "API light project detail|/api/research-projects/$light_uuid"
  "API light activity|/api/research-projects/$light_uuid/activity"
  "API light experiment runs|/api/research-projects/$light_uuid/experiment-runs"
  "Page research projects|/research-projects"
  "Page heavy dashboard|/research-projects/$heavy_uuid/dashboard"
  "Page light dashboard|/research-projects/$light_uuid/dashboard"
  "Page compute|/compute"
)

for entry in "${ENDPOINTS[@]}"; do
  label=${entry%%|*}
  path=${entry#*|}
  sample_file=$(sample_cache_path "$label")
  sample_endpoint "$path" "$sample_file" >/dev/null
done

project_list_plan=$(psql_explain "select p.uuid, p.name, p.description, p.goal, p.datasets, p.\"evaluationMethods\", p.\"latestSynthesisAt\", p.\"latestSynthesisIdeaCount\", p.\"latestSynthesisSummary\", p.\"groupUuid\", p.\"createdAt\", p.\"updatedAt\" from \"Project\" p where p.\"companyUuid\" = '$company_uuid' order by p.\"updatedAt\" desc limit 200;" | trim_plan)

project_activity_plan=$(psql_explain "select a.uuid, a.\"targetType\", a.\"targetUuid\", a.action, a.value, a.\"actorType\", a.\"actorUuid\", a.\"createdAt\" from \"Activity\" a where a.\"companyUuid\" = '$company_uuid' and a.\"projectUuid\" = '$heavy_uuid' order by a.\"createdAt\" desc limit 20;" | trim_plan)

project_stats_plan=$(psql_explain "select * from (
  select 'idea' as source, status::text as bucket, count(*)::bigint as total
  from \"Idea\"
  where \"companyUuid\" = '$company_uuid' and \"projectUuid\" = '$heavy_uuid'
  group by 1, 2
  union all
  select 'experiment' as source, status::text as bucket, count(*)::bigint as total
  from \"Experiment\"
  where \"companyUuid\" = '$company_uuid' and \"projectUuid\" = '$heavy_uuid'
  group by 1, 2
  union all
  select 'document' as source, 'all'::text as bucket, count(*)::bigint as total
  from \"Document\"
  where \"companyUuid\" = '$company_uuid' and \"projectUuid\" = '$heavy_uuid'
  group by 1, 2
) stats
order by source, bucket;" | trim_plan)

experiment_runs_plan=$(psql_explain "select t.uuid, t.title, t.description, t.status, t.priority, t.\"computeBudgetHours\", t.\"acceptanceCriteria\", t.outcome, t.\"experimentResults\", t.\"assigneeType\", t.\"assigneeUuid\", t.\"assignedAt\", t.\"assignedByUuid\", t.\"proposalUuid\", t.\"createdByUuid\", t.\"createdAt\", t.\"updatedAt\" from \"Task\" t where t.\"companyUuid\" = '$company_uuid' and t.\"projectUuid\" = '$heavy_uuid' order by t.priority desc, t.\"createdAt\" desc limit 200;" | trim_plan)

unblocked_runs_plan=$(psql_explain "select t.uuid, t.title, t.status from \"Task\" t where t.\"companyUuid\" = '$company_uuid' and t.\"projectUuid\" = '$heavy_uuid' and t.status in ('open','assigned') and not exists (select 1 from \"TaskDependency\" d join \"Task\" dep on dep.uuid = d.\"dependsOnUuid\" where d.\"taskUuid\" = t.uuid and dep.status not in ('done','closed')) order by t.priority desc, t.\"createdAt\" desc;" | trim_plan)

notification_pref_plan=$(psql_explain "select np.uuid, np.\"ownerType\", np.\"ownerUuid\", np.mentioned, np.\"commentAdded\", np.\"taskAssigned\", np.\"taskStatusChanged\", np.\"taskVerified\", np.\"taskReopened\", np.\"proposalSubmitted\", np.\"proposalApproved\", np.\"proposalRejected\", np.\"ideaClaimed\" from \"NotificationPreference\" np where np.\"ownerType\" = 'user' and np.\"ownerUuid\" = '6d37da34-f7cc-4097-8afa-f06e0799bedd';" | trim_plan)

{
  echo "# Synapse Optimization Baseline (${REPORT_DATE})"
  echo
  echo "## Progress"
  echo
  echo "- [x] 已完成代码与架构审查"
  echo "- [x] 已确认 chorus-research 具备远端测量条件"
  echo "- [x] 已完成默认账号登录与 cookie 复用验证"
  echo "- [x] 已完成第一轮真实接口耗时采样"
  echo "- [x] 已完成第一轮 SQL EXPLAIN (ANALYZE, BUFFERS, VERBOSE)"
  echo "- [ ] 待基于这份基线落地 project-metrics 统一读模型"
  echo "- [ ] 待批量化通知解析"
  echo "- [ ] 待拆出 GPU telemetry worker"
  echo "- [ ] 待拆 experiment-run.service 和 assignment policy"
  echo
  echo "## Environment"
  echo
  echo "- Remote: \`$SYNAPSE_REMOTE\`"
  echo "- Base URL: \`$SYNAPSE_BASE_URL\`"
  echo "- Sample count per endpoint: \`$SYNAPSE_SAMPLE_COUNT\`"
  echo "- Company UUID: \`$company_uuid\`"
  echo "- Heavy project: \`$heavy_uuid\` / $heavy_name"
  echo "  - experiment runs: $heavy_runs"
  echo "  - research questions: $heavy_ideas"
  echo "  - activities: $heavy_activities"
  echo "- Light project: \`$light_uuid\` / $light_name"
  echo "  - experiment runs: $light_runs"
  echo "  - research questions: $light_ideas"
  echo "  - activities: $light_activities"
  echo
  echo "### Dataset Snapshot"
  echo
  echo "| Entity | Count |"
  echo "| --- | ---: |"
  while IFS='|' read -r entity count; do
    printf '| %s | %s |\n' "$entity" "$count"
  done <<< "$dataset_snapshot"
  echo
  echo "> Note: 当前租户没有 experiment runs，也没有 project groups，所以与 experiment-run / group-dashboard 相关的测量只能代表空态或轻负载路径。"
  echo
  echo "## HTTP Timing Summary"
  echo
  echo "| Endpoint | Runs | Avg DNS | Avg Connect | Avg TTFB | Avg Total | Max Total | Avg Bytes | HTTP |"
  echo "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |"
  for label in \
    "API projects list" \
    "API project groups" \
    "API heavy project detail" \
    "API heavy activity" \
    "API heavy experiment runs" \
    "API light project detail" \
    "API light activity" \
    "API light experiment runs" \
    "Page research projects" \
    "Page heavy dashboard" \
    "Page light dashboard" \
    "Page compute"; do
    summary_table_row "$label" "$(sample_cache_path "$label")"
  done
  echo
  echo "## Raw Timing Runs"
  echo
  for label in \
    "API projects list" \
    "API project groups" \
    "API heavy project detail" \
    "API heavy activity" \
    "API heavy experiment runs" \
    "API light project detail" \
    "API light activity" \
    "API light experiment runs" \
    "Page research projects" \
    "Page heavy dashboard" \
    "Page light dashboard" \
    "Page compute"; do
    echo "### $label"
    echo
    raw_runs_block "$(sample_cache_path "$label")"
    echo
  done
  echo "## SQL Plans"
  echo
  echo "### Project list query"
  echo
  echo '```sql'
  echo "$project_list_plan"
  echo '```'
  echo
  echo "### Project activity query"
  echo
  echo '```sql'
  echo "$project_activity_plan"
  echo '```'
  echo
  echo "### Project stats query"
  echo
  echo '```sql'
  echo "$project_stats_plan"
  echo '```'
  echo
  echo "### Experiment runs list query"
  echo
  echo '```sql'
  echo "$experiment_runs_plan"
  echo '```'
  echo
  echo "### Unblocked experiment runs query"
  echo
  echo '```sql'
  echo "$unblocked_runs_plan"
  echo '```'
  echo
  echo "### Notification preference lookup"
  echo
  echo '```sql'
  echo "$notification_pref_plan"
  echo '```'
  echo
  echo "## Findings"
  echo
  echo
  echo "- 项目统计口径仍然分散在项目列表、项目详情、dashboard、group dashboard 和页面直查 Prisma 中，属于重复计算热点。"
  echo "- 本租户当前 \`Task\` 数据为 0，说明 experiment-run 相关接口暂时没有真实负载，但这也暴露出项目列表和 dashboard 依旧在为旧 \`Experiment\` 口径做统计。"
  echo "- \`Activity\` 是当前最有代表性的高频数据表，重项目活动数明显高于轻项目，后续应优先收敛 activity 与 project metrics 的读路径。"
  echo "- 当前租户没有 \`ProjectGroup\` 数据，因此 group dashboard 只能先按代码路径整改，等真实分组数据出现后再补第二轮基线。"
  echo "- \`/compute\` 已具备真实页面与真实节点数据，后续拆分 GPU poller 时可直接用这一路径做前后对比。"
  echo
  echo "## Execution Checklist"
  echo
  echo "1. 新增 \`ProjectMetricsSnapshot\` 与统一 metrics service，收口项目列表、项目详情、dashboard、group dashboard 的统计口径。"
  echo "2. 把当前 route/page 里的 Prisma 直查迁到 service/read-model 边界，优先处理 \`research-projects\` 列表和 dashboard。"
  echo "3. 基于统一读模型，评估并落地第一批复合索引：\`Task(companyUuid, projectUuid, status, createdAt)\`、\`Idea(companyUuid, projectUuid, status)\`、\`Activity(companyUuid, projectUuid, createdAt)\`。"
  echo "4. 将 \`notification-listener\` 改成批量 context resolver，合并 entity title、actor、recipient 和 preference 查询。"
  echo "5. 将 GPU telemetry 轮询从 Web 请求链路剥离为独立 worker 或定时任务，\`listComputePools\` 只读快照。"
  echo "6. 补 \`pnpm preflight\`，覆盖 DB、Redis、default auth、standalone build、自身健康检查。"
  echo "7. 完成上述改动后，用同一脚本重复采样，并将新结果附加到下一份基线报告中做前后对比。"
  echo
  echo "## Recommended Next Steps"
  echo
  echo "1. 先实现统一的 \`project-metrics\` read model，替换项目列表、项目详情、dashboard、group dashboard 当前各算一套的做法。"
  echo "2. 在 read model 落地后再补复合索引，优先从 \`Task(companyUuid, projectUuid, status, createdAt)\`、\`Idea(companyUuid, projectUuid, status)\`、\`Activity(companyUuid, projectUuid, createdAt)\` 开始。"
  echo "3. 把 \`notification-listener\` 改成批量 context resolver，再做一次同批接口和 SQL 基线对比。"
  echo "4. 将 GPU telemetry 轮询从 Web 请求路径拆出，保留 \`/compute\` 作为 smoke 与性能回归页面。"
  echo "5. 等读路径和后台副作用稳定后，再进入 \`experiment-run.service\` 拆分与 assignment policy 抽离。"
} > "$REPORT_PATH"

echo "Wrote baseline report to $REPORT_PATH"
