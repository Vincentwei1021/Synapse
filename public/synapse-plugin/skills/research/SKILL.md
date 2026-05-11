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
- creating or progressing research questions
- searching papers and reading them progressively
- curating `RelatedWork`
- writing or updating a deep research report

Hand off to:
- **[experiments](../experiments/SKILL.md)** once the work becomes experiment planning or execution
- **[autonomy](../autonomy/SKILL.md)** to drive the CC-client autonomous loop when you are choosing the next experiment yourself

## Empty-Project Onboarding

If `synapse_get_research_questions` and `synapse_get_related_works` both return empty for the active project, do not guess a direction. Ask the user:

1. **List existing literature** — does the user already have related works elsewhere that should be imported first?
2. **Search new literature** — run `synapse_search_papers` against an initial topic phrase supplied by the user, and curate results with `synapse_add_related_work`.
3. **Draft a research question** — create the first `ResearchQuestion` with `synapse_create_research_question` so later experiments have a framing to attach to.
4. **Generate a deep research report** — once some related works exist, run the progressive-read flow below and save the synthesis with `synapse_save_deep_research_report`.

Offer example invocations (with the project UUID filled in) so the user can pick one. Do not skip ahead to experiment planning from this skill.

## Typical Flow

1. `synapse_checkin()`
2. `synapse_get_research_project()` or `synapse_get_project_full_context()`
3. `synapse_get_research_questions()` or create/claim a question
4. `synapse_search_papers()` and inspect papers with `brief` / `head` / `section` / `full`
5. `synapse_add_related_work()` for durable project memory
6. `synapse_save_deep_research_report()` when synthesizing findings (organize thematically, not paper-by-paper; cite specific methods/results; match the project description's language)
7. `synapse_add_comment()` on the research question or project artifacts when reasoning should be durable
8. If the task originated from a Synapse-triggered deep research or auto search, finish with `synapse_complete_task({ taskType: "deep_research" | "auto_search" })`

## Core Rule

Do not drift into experiment execution from this skill. Once you are drafting a runnable experiment plan, switch to **[experiments](../experiments/SKILL.md)**.

## Reference

- **[Research workflow reference](../synapse/references/02-research-workflow.md)**
- **[Common tools](../synapse/references/00-common-tools.md)**
