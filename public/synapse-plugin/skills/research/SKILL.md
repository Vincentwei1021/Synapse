---
name: research
description: Work on Synapse pre-experiment research: project context, research questions, literature search, related works, and deep research reports.
license: AGPL-3.0
metadata:
  author: Vincentwei1021
  version: "0.6.1"
  category: research
  mcp_server: synapse
---

# Research Skill

Use this skill for the pre-experiment stage: understanding project context, developing research questions, grounding work in literature, and producing deep research outputs.

## Prompt Boundary

Stay inside this skill when the work is about:
- reading project context and framing the problem
- claiming or progressing research questions
- searching papers and reading them progressively
- curating `RelatedWork`
- writing or updating a deep research report

Hand off to:
- **[experiments](../experiments/SKILL.md)** once the work becomes experiment planning or execution
- **[autonomy](../autonomy/SKILL.md)** when you are choosing the next experiment yourself because the queue is empty

## Typical Flow

1. `synapse_checkin()`
2. `synapse_get_research_project()` or `synapse_get_project_full_context()`
3. `synapse_get_research_questions()` or claim an open question
4. `synapse_search_papers()` and inspect papers with `brief/head/section/full`
5. `synapse_add_related_work()` for durable project memory
6. `synapse_save_deep_research_report()` when synthesizing findings
7. `synapse_add_comment()` on the research question or project artifacts when reasoning should be durable

## Core Rule

Do not drift into experiment execution from this skill. Once you are drafting a runnable experiment plan, switch to **[experiments](../experiments/SKILL.md)**.

## Reference

- **[Research workflow reference](../synapse/references/02-research-workflow.md)**
- **[Common tools](../synapse/references/00-common-tools.md)**
