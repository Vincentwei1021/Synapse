# Research Workflow

This guide covers the pre-experiment research phase: understanding project context, working with research questions, and managing literature / deep research outputs.

---

## Research Questions

Research questions are the starting point of every project. They define what the project investigates.

### Viewing Questions

```text
synapse_get_research_questions({ researchProjectUuid: "..." })
synapse_get_research_question({ researchQuestionUuid: "..." })
```

### Claiming And Working On Questions

```text
# Find open questions
synapse_get_available_research_questions({ researchProjectUuid: "..." })

# Claim one
synapse_claim_research_question({ researchQuestionUuid: "..." })

# Update status as you progress
synapse_update_research_question_status({ researchQuestionUuid: "...", status: "elaborating" })
```

### Status Flow

```text
open --> elaborating --> proposal_created --> completed
  \                                            /
   \--> closed <------------------------------/
```

- `open`: available for agents to claim
- `elaborating`: agent is investigating and formulating next steps
- `proposal_created`: follow-up experiments were created from this question
- `completed`: the question has been answered well enough for the current project scope

---

## Literature And Related Works

Use literature search to ground research questions in existing work. These tools usually require a `pre_research`-capable agent.

### Search Papers

```text
synapse_search_papers({ query: "transformer attention mechanisms", limit: 10 })
```

Uses DeepXiv hybrid search over arXiv with API fallback. Results include title, authors, abstract, URLs, and other metadata.

### Progressive Paper Reading

Read papers at different levels of detail to manage token budget:

```text
# Quick summary
synapse_read_paper_brief({ arxivId: "2401.12345" })

# Paper structure with section TLDRs
synapse_read_paper_head({ arxivId: "2401.12345" })

# One section in full
synapse_read_paper_section({ arxivId: "2401.12345", sectionName: "Experiments" })

# Complete paper markdown
synapse_read_paper_full({ arxivId: "2401.12345" })
```

### Add Related Work To A Project

```text
synapse_add_related_work({
  researchProjectUuid: "...",
  title: "Attention Is All You Need",
  url: "https://arxiv.org/abs/1706.03762",
  authors: "Vaswani et al.",
  arxivId: "1706.03762"
})
```

### View Project Related Works

```text
synapse_get_related_works({ researchProjectUuid: "..." })
```

---

## Deep Research Reports

Generate or retrieve literature-review documents for a project:

```text
# Get existing report
synapse_get_deep_research_report({ researchProjectUuid: "..." })

# Save or update report (auto-increments version)
synapse_save_deep_research_report({
  researchProjectUuid: "...",
  title: "Literature Review: Transformer Efficiency",
  content: "# Literature Review\n\n..."
})
```

If the work was triggered by Synapse's Deep Research or Auto Search UI, finish by clearing the active task:

```text
synapse_complete_task({ researchProjectUuid: "...", taskType: "deep_research" })
```

---

## Typical Research Flow

1. `synapse_checkin()` to see assignments and available projects
2. `synapse_get_research_project()` or `synapse_get_project_full_context()` to understand the project
3. `synapse_claim_research_question()` if you are taking ownership of a question
4. `synapse_search_papers()` to find relevant prior work
5. `synapse_read_paper_brief()` / `head()` / `section()` to inspect papers progressively
6. `synapse_add_related_work()` for papers worth keeping in project context
7. `synapse_save_deep_research_report()` to synthesize findings into a durable document
8. `synapse_update_research_question_status()` to reflect progress
9. `synapse_add_comment({ targetType: "research_question", ... })` to document reasoning
10. `synapse_complete_task()` if this was a Synapse-triggered deep research / auto-search task
11. Move on to experiment planning or execution

---

## Documents

Projects accumulate documents as research progresses:

```text
synapse_get_documents({ researchProjectUuid: "...", type: "project_synthesis" })
synapse_get_document({ documentUuid: "..." })
```

Document types include experiment result docs (soft-linked to experiments) and project synthesis docs (rolling summaries updated automatically as experiments complete).
